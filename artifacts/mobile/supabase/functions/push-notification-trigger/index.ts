/**
 * push-notification-trigger
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase Edge Function called by PostgreSQL triggers (via pg_net) on INSERT
 * into: messages, calls, notifications, orders
 *
 * Required Supabase secrets:
 *   FIREBASE_PROJECT_ID           — Firebase project ID
 *   FIREBASE_SERVICE_ACCOUNT_KEY  — Full service-account JSON string
 *
 * Notification routing:
 *   messages      → send to all chat members except sender
 *   calls         → send to receiver
 *   notifications → send to user_id (covers likes, follows, comments, mentions, payments)
 *   orders        → send to buyer_id or seller_id on status change
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── FCM HTTP v1 helper ────────────────────────────────────────────────────────

function b64url(data: Uint8Array | string): string {
  const str = typeof data === "string" ? data : String.fromCharCode(...(data as Uint8Array));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getFCMToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const sigInput = `${header}.${payload}`;
  const pem = (sa.private_key as string).replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)).buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(sigInput));
  const jwt = `${sigInput}.${b64url(new Uint8Array(sig))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("[FCM] OAuth2 failed: " + JSON.stringify(d));
  return d.access_token as string;
}

type FCMOptions = {
  title: string;
  body: string;
  data?: Record<string, string>;
  channelId?: string;
  collapseKey?: string;
  categoryIdentifier?: string;
  audit?: {
    table: string;
    eventType: string;
    eventId?: string;
    notificationType?: string;
  };
};

type ProviderResult = {
  status: "ok" | "stale" | "error";
  errorCode?: string;
  errorMessage?: string;
};

async function sendFCM(
  fcmToken: string,
  opts: FCMOptions,
  projectId: string,
  accessToken: string,
): Promise<ProviderResult> {
  const data = Object.fromEntries(
    Object.entries(opts.data ?? {}).map(([k, v]) => [k, String(v)])
  );

  const message: Record<string, unknown> = {
    token: fcmToken,
    notification: { title: opts.title, body: opts.body },
    android: {
      priority: "high",
      ttl: "604800s",
      ...(opts.collapseKey && { collapse_key: opts.collapseKey }),
      notification: {
        channel_id: opts.channelId ?? "default",
        sound: "default",
        notification_priority: "PRIORITY_HIGH",
        default_sound: true,
        default_vibrate_timings: true,
        default_light_settings: true,
        color: "#1f95ff",
        // expo-notifications generates this resource from app.json's
        // notification icon configuration.
        icon: "notification_icon",
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 604800),
        ...(opts.collapseKey && { "apns-collapse-id": opts.collapseKey }),
      },
      payload: {
        aps: {
          alert: { title: opts.title, body: opts.body },
          sound: "default",
          badge: 1,
          ...(opts.categoryIdentifier && { category: opts.categoryIdentifier }),
          ...(opts.collapseKey && { "thread-id": opts.collapseKey }),
        },
      },
    },
    data,
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ message }),
    },
  );

  const responseText = res.ok ? "" : await res.text();
  if (
    res.status === 404 ||
    responseText.includes("UNREGISTERED") ||
    responseText.includes("registration-token-not-registered")
  ) return { status: "stale", errorCode: "UNREGISTERED", errorMessage: responseText.slice(0, 500) };
  if (!res.ok) {
    console.error(`[FCM] send failed ${res.status}:`, responseText);
    return { status: "error", errorCode: `HTTP_${res.status}`, errorMessage: responseText.slice(0, 500) };
  }
  return { status: "ok" };
}

// ── Expo Push fallback (for dev/Expo Go tokens) ───────────────────────────────

async function sendExpoPush(token: string, opts: FCMOptions): Promise<ProviderResult> {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify({
      to: token,
      title: opts.title,
      body: opts.body,
      data: opts.data ?? {},
      sound: "default",
      priority: "high",
      channelId: opts.channelId ?? "default",
      ttl: 604800,
      ...(opts.collapseKey && { collapseId: opts.collapseKey }),
      ...(opts.categoryIdentifier && { categoryId: opts.categoryIdentifier }),
    }),
  });
  const payload = await res.json().catch(() => null);
  const details = payload?.data?.details;
  if (!res.ok || payload?.data?.status === "error" || details?.error) {
    console.error(`[ExpoPush] send failed ${res.status}:`, JSON.stringify(payload));
    const errorCode = details?.error ?? `HTTP_${res.status}`;
    return {
      status: errorCode === "DeviceNotRegistered" ? "stale" : "error",
      errorCode,
      errorMessage: JSON.stringify(payload).slice(0, 500),
    };
  }

  // Expo's send endpoint only acknowledges that a ticket was created. The
  // receipt is the first provider-level confirmation that Expo accepted the
  // token for delivery, and it also reports stale/invalid device tokens.
  const ticketId = typeof payload?.data?.id === "string" ? payload.data.id : null;
  if (!ticketId) {
    return {
      status: "error",
      errorCode: "EXPO_TICKET_MISSING",
      errorMessage: "Expo accepted the request but returned no ticket id",
    };
  }

  let lastReceipt: any = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 750));

    const receiptRes = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ids: [ticketId] }),
    });
    const receiptPayload = await receiptRes.json().catch(() => null);
    const receipt = receiptPayload?.data?.[ticketId];
    lastReceipt = receipt ?? receiptPayload;

    if (!receipt) continue;
    if (receipt.status === "ok") return { status: "ok" };

    const errorCode = receipt.details?.error ?? "EXPO_RECEIPT_ERROR";
    return {
      status: errorCode === "DeviceNotRegistered" ? "stale" : "error",
      errorCode,
      errorMessage: JSON.stringify(receipt).slice(0, 500),
    };
  }

  return {
    status: "error",
    errorCode: "EXPO_RECEIPT_PENDING",
    errorMessage: JSON.stringify(lastReceipt ?? { ticketId }).slice(0, 500),
  };
}

async function recordDeliveryAttempt(
  db: ReturnType<typeof createClient> | undefined,
  profileId: string | undefined,
  provider: string,
  result: ProviderResult,
  audit: FCMOptions["audit"],
): Promise<void> {
  if (!db || !audit || !profileId) return;
  const { error } = await db.from("push_delivery_attempts").insert({
    event_table: audit.table,
    event_type: audit.eventType,
    event_id: audit.eventId ?? null,
    notification_type: audit.notificationType ?? audit.table,
    recipient_user_id: profileId,
    provider,
    status: result.status,
    error_code: result.errorCode ?? null,
    error_message: result.errorMessage ?? null,
  });
  if (error) console.warn("[push] delivery audit insert failed:", error.message);
}

async function dispatchToProfile(
  profile: {
    id?: string;
    fcm_token?: string | null;
    expo_push_token?: string | null;
    push_token_platform?: string | null;
  },
  opts: FCMOptions,
  projectId: string | null,
  accessToken: string | null,
  db?: ReturnType<typeof createClient>,
): Promise<"fcm" | "expo" | "failed" | "none"> {
  const legacyExpoToken = profile.fcm_token?.startsWith("ExponentPushToken[")
    ? profile.fcm_token
    : null;
  const expoToken = profile.expo_push_token ?? legacyExpoToken;
  const isIosNativeToken =
    (profile.push_token_platform === "ios" ||
      isLikelyApnsDeviceToken(profile.fcm_token)) &&
    !!profile.fcm_token &&
    !legacyExpoToken;

  if (profile.fcm_token && !legacyExpoToken && !isIosNativeToken && projectId && accessToken) {
    let result: ProviderResult;
    try {
      result = await sendFCM(profile.fcm_token, opts, projectId, accessToken);
    } catch (err) {
      // A transport error must not abort this recipient before the Expo
      // fallback gets a chance. This is especially important during an FCM
      // outage or when a token is being rotated by Android.
      console.error(`[FCM] send exception for ${profile.id ?? "profile"}:`, err);
      result = {
        status: "error",
        errorCode: "EXCEPTION",
        errorMessage: "FCM provider request failed before a response was received",
      };
    }
    await recordDeliveryAttempt(db, profile.id, "fcm", result, opts.audit);
    if (result.status === "ok") return "fcm";
    if (result.status === "stale" && db && profile.id) {
      await db.from("profiles").update({ fcm_token: null }).eq("id", profile.id).eq("fcm_token", profile.fcm_token);
    }
    if (
      result.status === "error" &&
      result.errorCode === "HTTP_403" &&
      result.errorMessage?.includes("SENDER_ID_MISMATCH") &&
      db &&
      profile.id
    ) {
      // A token created by a previous Firebase sender cannot ever be repaired
      // by retrying. Remove only this exact token so the next app launch can
      // register a token belonging to the current google-services.json project.
      await db
        .from("profiles")
        .update({ fcm_token: null })
        .eq("id", profile.id)
        .eq("fcm_token", profile.fcm_token);
    }
    console.warn(`[push] FCM failed for ${profile.id ?? "profile"} (${result.status}); trying Expo fallback`);
  }

  if (expoToken) {
    try {
      const result = await sendExpoPush(expoToken, opts);
      await recordDeliveryAttempt(db, profile.id, "expo", result, opts.audit);
      if (result.status === "ok") return "expo";
      if (result.status === "stale" && db && profile.id) {
        await db.from("profiles").update({ expo_push_token: null }).eq("id", profile.id).eq("expo_push_token", expoToken);
      }
    } catch (err) {
      console.error(`[ExpoPush] send failed for ${profile.id ?? "profile"}:`, err);
      await recordDeliveryAttempt(db, profile.id, "expo", {
        status: "error",
        errorCode: "EXCEPTION",
        errorMessage: String(err).slice(0, 500),
      }, opts.audit);
    }
  }

  await recordDeliveryAttempt(db, profile.id, "none", {
    status: "error",
    errorCode: "ALL_PROVIDERS_FAILED",
    errorMessage: "No push provider accepted the delivery",
  }, opts.audit);
  return profile.fcm_token || profile.expo_push_token ? "failed" : "none";
}

// ── Channel ID helper ─────────────────────────────────────────────────────────

function notifChannel(type: string): string {
  if (type === "message") return "messages";
  if (type === "call") return "calls";
  if (["like", "follow", "comment", "reply", "mention"].includes(type)) return "social";
  if (["order", "payment", "escrow"].includes(type)) return "marketplace";
  return "default";
}

// ── Category identifier helper ────────────────────────────────────────────────

function notifCategory(type: string): string | undefined {
  if (type === "message") return "afuchat_message_reply";
  if (["order", "escrow"].includes(type)) return "afuchat_order_update";
  if (["like", "comment", "reply", "mention"].includes(type)) return "afuchat_post_interact";
  return undefined;
}

function isLikelyApnsDeviceToken(token: string | null | undefined): boolean {
  // Legacy iOS registrations may have no platform metadata. APNs device
  // tokens are commonly 32-byte hex strings; never submit those to FCM.
  return !!token && /^[0-9a-f]{64}$/i.test(token);
}

// ═════════════════════════════════════════════════════════════════════════════
// Event handlers
// ═════════════════════════════════════════════════════════════════════════════

async function handleMessage(
  record: Record<string, any>,
  db: ReturnType<typeof createClient>,
  projectId: string | null,
  accessToken: string | null,
): Promise<void> {
  // messages table uses encrypted_content (no plain `content` or `message_type` columns)
  const { id: messageId, chat_id, sender_id, encrypted_content, attachment_url, attachment_type, audio_url } = record;

  if (!chat_id || !sender_id) return;

  // Get chat info + members together
  const [{ data: chatRow }, { data: members }] = await Promise.all([
    db.from("chats").select("name, is_group, created_by, user_id").eq("id", chat_id).single(),
    db.from("chat_members").select("user_id").eq("chat_id", chat_id).neq("user_id", sender_id),
  ]);

  // Fallback: when chat_members is empty (old DM chats created without members),
  // derive recipients from chats.created_by / chats.user_id.
  let recipientIds: string[] = (members ?? []).map((m: any) => m.user_id);
  if (recipientIds.length === 0 && chatRow && !chatRow.is_group) {
    const candidates = [chatRow.created_by, chatRow.user_id].filter(
      (uid): uid is string => !!uid && uid !== sender_id,
    );
    recipientIds = candidates;
  }

  if (recipientIds.length === 0) return;

  const { data: messagePrefs } = await db
    .from("notification_preferences")
    .select("push_enabled, push_messages")
    .eq("user_id", recipientIds[0])
    .maybeSingle();
  // For group chats, apply the preference independently per recipient below.
  // The single-recipient fast path avoids an extra query in the common case.
  if (recipientIds.length === 1 && messagePrefs &&
      (messagePrefs.push_enabled === false || messagePrefs.push_messages === false)) {
    return;
  }

  // Get sender profile
  const { data: sender } = await db
    .from("profiles")
    .select("display_name, handle")
    .eq("id", sender_id)
    .single();

  const isGroup = !!chatRow?.is_group;
  const senderName = sender?.display_name ?? sender?.handle ?? "Someone";
  const title = isGroup ? `${senderName} in ${chatRow?.name ?? "Group"}` : senderName;

  // Derive attachment type from columns (no message_type column on messages table)
  const derivedType = audio_url ? "audio" : attachment_type ?? null;
  const body = _messagePreview(encrypted_content ?? null, derivedType);

  // Get both delivery channels for all recipients.
  const { data: profiles } = await db
    .from("profiles")
    .select("id, fcm_token, expo_push_token, push_token_platform")
    .in("id", recipientIds)
    .or("fcm_token.not.is.null,expo_push_token.not.is.null");

  if (!profiles?.length) return;

  const opts: FCMOptions = {
    title,
    body,
    data: {
      type: "message",
      chatId: chat_id,
      messageId: messageId ?? "",
      senderId: sender_id,
    },
    channelId: "messages",
    collapseKey: `chat_${chat_id}`,
    categoryIdentifier: "afuchat_message_reply",
    audit: { table: "messages", eventType: "INSERT", eventId: messageId, notificationType: "message" },
  };

  await Promise.all(
    profiles
      .map(async (p: any) => {
        if (recipientIds.length > 1) {
          const { data: prefs } = await db
            .from("notification_preferences")
            .select("push_enabled, push_messages")
            .eq("user_id", p.id)
            .maybeSingle();
          if (prefs && (prefs.push_enabled === false || prefs.push_messages === false)) return;
        }
        return dispatchToProfile(p, opts, projectId, accessToken, db);
      })
  );
}

async function handleCall(
  record: Record<string, any>,
  db: ReturnType<typeof createClient>,
  projectId: string | null,
  accessToken: string | null,
): Promise<void> {
  // Column is callee_id (not receiver_id) — matches callEngine.ts INSERT
  const { id: callId, caller_id, callee_id, call_type, chat_id } = record;

  if (!caller_id || !callee_id) return;

  // Get caller profile + both callee delivery channels in parallel.
  const [{ data: caller }, { data: receiver }] = await Promise.all([
    db.from("profiles").select("display_name, handle, avatar_url").eq("id", caller_id).single(),
    db.from("profiles").select("id, fcm_token, expo_push_token, push_token_platform").eq("id", callee_id).single(),
  ]);

  if (!receiver?.fcm_token && !receiver?.expo_push_token) return;

  const callerName   = caller?.display_name ?? caller?.handle ?? "Someone";
  const callerAvatar = caller?.avatar_url   ?? "";
  const typeLabel    = call_type === "video" ? "Video call" : "Voice call";

  const { data: callPrefs } = await db
    .from("notification_preferences")
    .select("push_enabled")
    .eq("user_id", callee_id)
    .maybeSingle();
  if (callPrefs?.push_enabled === false) return;

  await dispatchToProfile(receiver, {
    title: callerName,
    body: `${typeLabel} incoming`,
    data: {
      type: "call",
      callId:       callId       ?? "",
      callerId:     caller_id,
      callerName,
      callerAvatar,
      chatId:       chat_id      ?? "",
      callType:     call_type    ?? "voice",
    },
    channelId: "calls",
    collapseKey: `call_${callId}`,
    audit: { table: "calls", eventType: "INSERT", eventId: callId, notificationType: "call" },
  }, projectId, accessToken, db);
}

async function handleNotification(
  record: Record<string, any>,
  db: ReturnType<typeof createClient>,
  projectId: string | null,
  accessToken: string | null,
): Promise<void> {
  const {
    user_id, type, title, body,
    actor_id, actor_name, actor_handle,
    entity_id, entity_type, data: extraData,
  } = record;

  if (!user_id || !type) return;

  // Get both recipient delivery channels.
  const { data: profile } = await db
    .from("profiles")
    .select("id, fcm_token, expo_push_token, push_token_platform")
    .eq("id", user_id)
    .single();

  if (!profile?.fcm_token && !profile?.expo_push_token) return;

  // Check notification preferences
  const { data: prefs } = await db
    .from("notification_preferences")
    .select("push_enabled, push_likes, push_follows, push_replies, push_comments, push_mentions, push_messages, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone")
    .eq("user_id", user_id)
    .single();

  if (prefs) {
    if (!prefs.push_enabled) return;
    if (type === "like"    && prefs.push_likes   === false) return;
    if (type === "follow"  && prefs.push_follows  === false) return;
    if (type === "comment" && (prefs.push_comments === false || prefs.push_replies === false)) return;
    if (type === "reply"   && (prefs.push_replies  === false || prefs.push_comments === false)) return;
    if (type === "mention" && prefs.push_mentions === false) return;
    if (type === "gift" && prefs.push_gifts === false) return;

    // Quiet hours check
    if (prefs.quiet_hours_enabled) {
      const tz = prefs.quiet_hours_timezone ?? "UTC";
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: false,
        timeZone: tz,
      });
      const [hourStr, minStr] = formatter.format(now).split(":");
      const currentMins = parseInt(hourStr) * 60 + parseInt(minStr);
      const [sh, sm] = (prefs.quiet_hours_start ?? "22:00").split(":").map(Number);
      const [eh, em] = (prefs.quiet_hours_end ?? "08:00").split(":").map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      const inQuiet = startMins <= endMins
        ? currentMins >= startMins && currentMins < endMins
        : currentMins >= startMins || currentMins < endMins;
      if (inQuiet) return;
    }
  }

  const notifTitle = title ?? _defaultTitle(type, actor_name ?? actor_handle ?? "Someone");
  const notifBody  = body ?? _defaultBody(type);

  const data: Record<string, string> = {
    type: type ?? "notification",
    ...(actor_id && { actorId: actor_id }),
    ...(actor_handle && { actorHandle: actor_handle }),
    ...(entity_id && entity_type === "post" && { postId: entity_id }),
    ...(entity_id && entity_type === "chat" && { chatId: entity_id }),
    ...(entity_id && entity_type === "order" && { orderId: entity_id }),
    ...(extraData && typeof extraData === "object" ? extraData : {}),
  };

  await dispatchToProfile(profile, {
    title: notifTitle,
    body: notifBody,
    data,
    channelId: notifChannel(type),
    collapseKey: `notif_${type}_${user_id}`,
    categoryIdentifier: notifCategory(type),
    audit: { table: "notifications", eventType: "INSERT", eventId: record.id, notificationType: type },
  }, projectId, accessToken, db);
}

// ── Text helpers ──────────────────────────────────────────────────────────────

function _messagePreview(content: string | null, type: string | null): string {
  if (!content) {
    if (type === "image") return "\uD83D\uDCF8 Photo";
    if (type === "video") return "\uD83C\uDFA5 Video";
    if (type === "audio") return "\uD83C\uDFA4 Voice message";
    if (type === "file")  return "\uD83D\uDCCE File";
    return "Sent an attachment";
  }
  return content.length > 120 ? content.slice(0, 117) + "\u2026" : content;
}

function _defaultTitle(type: string, actorName: string): string {
  switch (type) {
    case "follow":  return actorName;
    case "like":    return actorName;
    case "comment": return actorName;
    case "reply":   return actorName;
    case "mention": return actorName;
    case "payment": return "Payment received";
    case "order":   return "Order update";
    default: return "AfuChat";
  }
}

function _defaultBody(type: string): string {
  switch (type) {
    case "follow":  return "Started following you";
    case "like":    return "Liked your post";
    case "comment": return "Commented on your post";
    case "reply":   return "Replied to your comment";
    case "mention": return "Mentioned you";
    case "payment": return "You received a payment";
    case "order":   return "Your order has been updated";
    default: return "";
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Order handlers
// ═════════════════════════════════════════════════════════════════════════════

function _shopOrderStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending:    "Order placed — awaiting confirmation",
    processing: "Your order is being prepared",
    shipped:    "Your order has been shipped",
    delivered:  "Order marked as delivered",
    completed:  "Order completed",
    cancelled:  "Order cancelled",
    disputed:   "A dispute has been opened",
  };
  return map[status] ?? `Order status: ${status}`;
}

function _freelanceOrderStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending:   "New order received",
    active:    "Order is now active",
    delivered: "Delivery submitted — review it",
    revision:  "Revision requested",
    completed: "Order completed",
    cancelled: "Order cancelled",
    disputed:  "A dispute has been opened",
  };
  return map[status] ?? `Order status: ${status}`;
}

function _merchantOrderStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending:    "Order placed — awaiting confirmation",
    confirmed:  "Order confirmed",
    processing: "Order is being processed",
    shipped:    "Order shipped",
    delivered:  "Order delivered",
    cancelled:  "Order cancelled",
  };
  return map[status] ?? `Order status: ${status}`;
}

async function handleShopOrder(
  record: Record<string, any>,
  eventType: string,
  oldRecord: Record<string, any> | null,
  db: ReturnType<typeof createClient>,
  projectId: string | null,
  accessToken: string | null,
): Promise<void> {
  const { id, buyer_id, seller_id, status, total_acoin } = record;
  if (!buyer_id || !seller_id || !status) return;

  // Only fire on INSERT or when status actually changed
  if (eventType === "UPDATE" && oldRecord?.status === status) return;

  const isNew = eventType === "INSERT";
  const orderId = id ?? "";
  const amount = total_acoin ? ` · ${total_acoin} ACoin` : "";

  const targets: Array<{ userId: string; title: string; body: string }> = [];

  if (isNew) {
    // Notify seller of new order
    targets.push({ userId: seller_id, title: "New Order 🛍️", body: `You have a new shop order${amount}` });
  } else {
    // Status change → notify buyer
    targets.push({ userId: buyer_id, title: "Order Update", body: _shopOrderStatusLabel(status) });
    // On completion/delivery — also notify seller
    if (["completed", "disputed"].includes(status)) {
      targets.push({ userId: seller_id, title: "Order Update", body: _shopOrderStatusLabel(status) });
    }
  }

  const { data: profiles } = await db.from("profiles").select("id, fcm_token, expo_push_token, push_token_platform").in("id", targets.map(t => t.userId)).or("fcm_token.not.is.null,expo_push_token.not.is.null");
  if (!profiles?.length) return;

  const tokenMap = Object.fromEntries((profiles as any[]).map((p: any) => [p.id, p]));

  await Promise.all(
    targets
      .filter(t => tokenMap[t.userId])
      .map(t => dispatchToProfile(tokenMap[t.userId], {
        title: t.title,
        body: t.body,
        data: { type: "order", orderId, orderType: "shop" },
        channelId: "marketplace",
        collapseKey: `shop_order_${orderId}`,
        categoryIdentifier: "afuchat_order_update",
        audit: { table: "shop_orders", eventType, eventId: orderId, notificationType: "order" },
      }, projectId, accessToken, db))
  );
}

async function handleMerchantOrder(
  record: Record<string, any>,
  eventType: string,
  oldRecord: Record<string, any> | null,
  db: ReturnType<typeof createClient>,
  projectId: string | null,
  accessToken: string | null,
): Promise<void> {
  const { id, buyer_id, merchant_id, status } = record;
  if (!buyer_id || !merchant_id || !status) return;

  if (eventType === "UPDATE" && oldRecord?.status === status) return;

  const isNew = eventType === "INSERT";
  const orderId = id ?? "";

  const targets: Array<{ userId: string; title: string; body: string }> = [];

  if (isNew) {
    targets.push({ userId: merchant_id, title: "New Order 🛍️", body: "You have a new merchant order" });
  } else {
    targets.push({ userId: buyer_id, title: "Order Update", body: _merchantOrderStatusLabel(status) });
    if (["delivered", "cancelled"].includes(status)) {
      targets.push({ userId: merchant_id, title: "Order Update", body: _merchantOrderStatusLabel(status) });
    }
  }

  const { data: profiles } = await db.from("profiles").select("id, fcm_token, expo_push_token, push_token_platform").in("id", targets.map(t => t.userId)).or("fcm_token.not.is.null,expo_push_token.not.is.null");
  if (!profiles?.length) return;

  const tokenMap = Object.fromEntries((profiles as any[]).map((p: any) => [p.id, p]));

  await Promise.all(
    targets
      .filter(t => tokenMap[t.userId])
      .map(t => dispatchToProfile(tokenMap[t.userId], {
        title: t.title,
        body: t.body,
        data: { type: "order", orderId, orderType: "merchant" },
        channelId: "marketplace",
        collapseKey: `merchant_order_${orderId}`,
        categoryIdentifier: "afuchat_order_update",
        audit: { table: "merchant_orders", eventType, eventId: orderId, notificationType: "order" },
      }, projectId, accessToken, db))
  );
}

async function handleFreelanceOrder(
  record: Record<string, any>,
  eventType: string,
  oldRecord: Record<string, any> | null,
  db: ReturnType<typeof createClient>,
  projectId: string | null,
  accessToken: string | null,
): Promise<void> {
  const { id, buyer_id, seller_id, status } = record;
  if (!buyer_id || !seller_id || !status) return;

  if (eventType === "UPDATE" && oldRecord?.status === status) return;

  const isNew = eventType === "INSERT";
  const orderId = id ?? "";

  const targets: Array<{ userId: string; title: string; body: string }> = [];

  if (isNew) {
    // New freelance order → notify seller
    targets.push({ userId: seller_id, title: "New Order 💼", body: "You have a new freelance order" });
  } else {
    const label = _freelanceOrderStatusLabel(status);
    // Buyer-facing statuses (seller took action)
    if (["active", "delivered", "completed", "cancelled", "disputed"].includes(status)) {
      targets.push({ userId: buyer_id, title: "Freelance Order Update", body: label });
    }
    // Seller-facing statuses (buyer took action)
    if (["revision", "completed", "cancelled", "disputed"].includes(status)) {
      targets.push({ userId: seller_id, title: "Freelance Order Update", body: label });
    }
  }

  const { data: profiles } = await db.from("profiles").select("id, fcm_token, expo_push_token, push_token_platform").in("id", targets.map(t => t.userId)).or("fcm_token.not.is.null,expo_push_token.not.is.null");
  if (!profiles?.length) return;

  const tokenMap = Object.fromEntries((profiles as any[]).map((p: any) => [p.id, p]));

  await Promise.all(
    targets
      .filter(t => tokenMap[t.userId])
      .map(t => dispatchToProfile(tokenMap[t.userId], {
        title: t.title,
        body: t.body,
        data: { type: "order", orderId, orderType: "freelance" },
        channelId: "marketplace",
        collapseKey: `freelance_order_${orderId}`,
        categoryIdentifier: "afuchat_order_update",
        audit: { table: "freelance_orders", eventType, eventId: orderId, notificationType: "order" },
      }, projectId, accessToken, db))
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Main server
// ═════════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const projectId = Deno.env.get("FIREBASE_PROJECT_ID") || null;
    const saKey     = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY") || null;

    const body = await req.json();
    if (body?.healthcheck === true) {
      let serviceAccountProject: string | null = null;
      let serviceAccountJsonValid = false;
      try {
        const parsed = JSON.parse(saKey ?? "{}") as { project_id?: string };
        serviceAccountProject = parsed.project_id ?? null;
        serviceAccountJsonValid = !!parsed.client_email && !!parsed.private_key;
      } catch {
        serviceAccountJsonValid = false;
      }

      return new Response(JSON.stringify({
        ok: true,
        fcmProjectConfigured: !!projectId,
        serviceAccountConfigured: !!saKey,
        serviceAccountJsonValid,
        senderProjectMatchesServiceAccount:
          !!projectId && !!serviceAccountProject && projectId === serviceAccountProject,
        senderProjectMatchesExpected:
          typeof body.expectedFirebaseProjectId === "string" &&
          body.expectedFirebaseProjectId.length > 0 &&
          projectId === body.expectedFirebaseProjectId &&
          serviceAccountProject === body.expectedFirebaseProjectId,
        expoFallbackAvailable: true,
      }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { type: eventType, table, record } = body as {
      type: string;
      table: string;
      record: Record<string, any>;
    };

    if (eventType !== "INSERT" && eventType !== "UPDATE") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // FCM is preferred when configured. Expo Push can still deliver when
    // Firebase credentials are temporarily unavailable.
    let accessToken: string | null = null;
    if (projectId && saKey) {
      try {
        const serviceAccount = JSON.parse(saKey) as { project_id?: string };
        if (serviceAccount.project_id && serviceAccount.project_id !== projectId) {
          throw new Error("Firebase project ID does not match the service-account project");
        }
        accessToken = await getFCMToken(saKey);
      } catch (err) {
        // Keep processing the event with Expo tokens when Firebase credentials
        // are malformed, expired, or temporarily unavailable. A credential
        // failure must never suppress another valid delivery route.
        console.error("[push-trigger] FCM credential initialization failed:", err);
      }
    }
    if (!projectId || !saKey) {
      console.warn("[push-trigger] FCM credentials missing; using Expo Push tokens only");
    }

    switch (table) {
      case "messages":
        await handleMessage(record, db, projectId, accessToken);
        break;
      case "calls":
        if (eventType === "INSERT") {
          await handleCall(record, db, projectId, accessToken);
        }
        break;
      case "notifications":
        await handleNotification(record, db, projectId, accessToken);
        break;
      case "shop_orders":
        await handleShopOrder(record, eventType, body.old_record ?? null, db, projectId, accessToken);
        break;
      case "merchant_orders":
        await handleMerchantOrder(record, eventType, body.old_record ?? null, db, projectId, accessToken);
        break;
      case "freelance_orders":
        await handleFreelanceOrder(record, eventType, body.old_record ?? null, db, projectId, accessToken);
        break;
      default:
        console.log(`[push-trigger] unhandled table: ${table}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[push-trigger] unhandled error:", err);
    // Return 200 to prevent pg_net retries on permanent errors
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
