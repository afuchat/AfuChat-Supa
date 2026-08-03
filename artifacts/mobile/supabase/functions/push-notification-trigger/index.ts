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
};

async function sendFCM(
  fcmToken: string,
  opts: FCMOptions,
  projectId: string,
  accessToken: string,
): Promise<"ok" | "stale" | "error"> {
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
        icon: "ic_notification",
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

  if (res.status === 404) return "stale"; // Token not registered
  if (!res.ok) {
    console.error(`[FCM] send failed ${res.status}:`, await res.text());
    return "error";
  }
  return "ok";
}

// ── Expo Push fallback (for dev/Expo Go tokens) ───────────────────────────────

async function sendExpoPush(token: string, opts: FCMOptions): Promise<void> {
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
  if (!res.ok) console.error(`[ExpoPush] send failed ${res.status}:`, await res.text());
}

async function dispatchToToken(token: string, opts: FCMOptions, projectId: string, accessToken: string): Promise<void> {
  if (token.startsWith("ExponentPushToken[")) {
    await sendExpoPush(token, opts);
  } else {
    const result = await sendFCM(token, opts, projectId, accessToken);
    if (result === "stale") {
      console.log(`[FCM] stale token, skipping`);
    }
  }
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

// ═════════════════════════════════════════════════════════════════════════════
// Event handlers
// ═════════════════════════════════════════════════════════════════════════════

async function handleMessage(
  record: Record<string, any>,
  db: ReturnType<typeof createClient>,
  projectId: string,
  accessToken: string,
): Promise<void> {
  const { id: messageId, chat_id, sender_id, content, message_type } = record;

  if (!chat_id || !sender_id) return;

  // Get chat members (excluding sender)
  const { data: members } = await db
    .from("chat_members")
    .select("user_id")
    .eq("chat_id", chat_id)
    .neq("user_id", sender_id);

  if (!members?.length) return;

  const recipientIds = members.map((m: any) => m.user_id);

  // Get sender profile
  const { data: sender } = await db
    .from("profiles")
    .select("full_name, handle")
    .eq("id", sender_id)
    .single();

  // Get chat info (group name)
  const { data: chat } = await db
    .from("chats")
    .select("name, type")
    .eq("id", chat_id)
    .single();

  const isGroup = chat?.type === "group";
  const senderName = sender?.full_name ?? sender?.handle ?? "Someone";
  const title = isGroup ? `${senderName} in ${chat?.name ?? "Group"}` : senderName;
  const body = _messagePreview(content, message_type);

  // Get FCM tokens for all recipients + check notification preferences
  const { data: profiles } = await db
    .from("profiles")
    .select("id, fcm_token")
    .in("id", recipientIds)
    .not("fcm_token", "is", null);

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
  };

  await Promise.all(
    profiles
      .filter((p: any) => p.fcm_token)
      .map((p: any) => dispatchToToken(p.fcm_token, opts, projectId, accessToken))
  );
}

async function handleCall(
  record: Record<string, any>,
  db: ReturnType<typeof createClient>,
  projectId: string,
  accessToken: string,
): Promise<void> {
  const { id: callId, caller_id, receiver_id, call_type } = record;

  if (!caller_id || !receiver_id) return;

  // Get caller profile
  const { data: caller } = await db
    .from("profiles")
    .select("full_name, handle")
    .eq("id", caller_id)
    .single();

  // Get receiver FCM token
  const { data: receiver } = await db
    .from("profiles")
    .select("fcm_token")
    .eq("id", receiver_id)
    .single();

  if (!receiver?.fcm_token) return;

  const callerName = caller?.full_name ?? caller?.handle ?? "Someone";
  const typeLabel = call_type === "video" ? "Video call" : "Voice call";

  await dispatchToToken(receiver.fcm_token, {
    title: callerName,
    body: `${typeLabel} incoming`,
    data: {
      type: "call",
      callId: callId ?? "",
      callerId: caller_id,
      callerName,
      callType: call_type ?? "voice",
    },
    channelId: "calls",
    collapseKey: `call_${callId}`,
  }, projectId, accessToken);
}

async function handleNotification(
  record: Record<string, any>,
  db: ReturnType<typeof createClient>,
  projectId: string,
  accessToken: string,
): Promise<void> {
  const {
    user_id, type, title, body,
    actor_id, actor_name, actor_handle,
    entity_id, entity_type, data: extraData,
  } = record;

  if (!user_id || !type) return;

  // Get recipient FCM token
  const { data: profile } = await db
    .from("profiles")
    .select("fcm_token")
    .eq("id", user_id)
    .single();

  if (!profile?.fcm_token) return;

  // Check notification preferences
  const { data: prefs } = await db
    .from("notification_preferences")
    .select("push_enabled, push_likes, push_follows, push_comments, push_mentions, push_messages, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone")
    .eq("user_id", user_id)
    .single();

  if (prefs) {
    if (!prefs.push_enabled) return;
    if (type === "like" && prefs.push_likes === false) return;
    if (type === "follow" && prefs.push_follows === false) return;
    if ((type === "comment" || type === "reply") && prefs.push_comments === false) return;
    if (type === "mention" && prefs.push_mentions === false) return;

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

  await dispatchToToken(profile.fcm_token, {
    title: notifTitle,
    body: notifBody,
    data,
    channelId: notifChannel(type),
    collapseKey: `notif_${type}_${user_id}`,
    categoryIdentifier: notifCategory(type),
  }, projectId, accessToken);
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
  projectId: string,
  accessToken: string,
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

  const { data: profiles } = await db.from("profiles").select("id, fcm_token").in("id", targets.map(t => t.userId)).not("fcm_token", "is", null);
  if (!profiles?.length) return;

  const tokenMap = Object.fromEntries((profiles as any[]).map((p: any) => [p.id, p.fcm_token]));

  await Promise.all(
    targets
      .filter(t => tokenMap[t.userId])
      .map(t => dispatchToToken(tokenMap[t.userId], {
        title: t.title,
        body: t.body,
        data: { type: "order", orderId, orderType: "shop" },
        channelId: "marketplace",
        collapseKey: `shop_order_${orderId}`,
        categoryIdentifier: "afuchat_order_update",
      }, projectId, accessToken))
  );
}

async function handleMerchantOrder(
  record: Record<string, any>,
  eventType: string,
  oldRecord: Record<string, any> | null,
  db: ReturnType<typeof createClient>,
  projectId: string,
  accessToken: string,
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

  const { data: profiles } = await db.from("profiles").select("id, fcm_token").in("id", targets.map(t => t.userId)).not("fcm_token", "is", null);
  if (!profiles?.length) return;

  const tokenMap = Object.fromEntries((profiles as any[]).map((p: any) => [p.id, p.fcm_token]));

  await Promise.all(
    targets
      .filter(t => tokenMap[t.userId])
      .map(t => dispatchToToken(tokenMap[t.userId], {
        title: t.title,
        body: t.body,
        data: { type: "order", orderId, orderType: "merchant" },
        channelId: "marketplace",
        collapseKey: `merchant_order_${orderId}`,
        categoryIdentifier: "afuchat_order_update",
      }, projectId, accessToken))
  );
}

async function handleFreelanceOrder(
  record: Record<string, any>,
  eventType: string,
  oldRecord: Record<string, any> | null,
  db: ReturnType<typeof createClient>,
  projectId: string,
  accessToken: string,
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

  const { data: profiles } = await db.from("profiles").select("id, fcm_token").in("id", targets.map(t => t.userId)).not("fcm_token", "is", null);
  if (!profiles?.length) return;

  const tokenMap = Object.fromEntries((profiles as any[]).map((p: any) => [p.id, p.fcm_token]));

  await Promise.all(
    targets
      .filter(t => tokenMap[t.userId])
      .map(t => dispatchToToken(tokenMap[t.userId], {
        title: t.title,
        body: t.body,
        data: { type: "order", orderId, orderType: "freelance" },
        channelId: "marketplace",
        collapseKey: `freelance_order_${orderId}`,
        categoryIdentifier: "afuchat_order_update",
      }, projectId, accessToken))
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
    const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
    const saKey     = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY");

    if (!projectId || !saKey) {
      console.error("[push-trigger] FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_KEY not set");
      // Return 200 to prevent pg_net from retrying indefinitely
      return new Response(JSON.stringify({ ok: false, reason: "missing_credentials" }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
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

    // Obtain FCM access token once (valid for 1h)
    const accessToken = await getFCMToken(saKey);

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
