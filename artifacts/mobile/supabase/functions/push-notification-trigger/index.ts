// push-notification-trigger — FCM HTTP v1 (inlined, no _shared import)
// Triggered by Supabase Database Webhooks on INSERT into: messages, calls, notifications
// Required secrets: FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── FCM helper ─────────────────────────────────────────────────────────────
function base64url(data: Uint8Array | string): string {
  const str = typeof data === "string" ? data : String.fromCharCode(...(data as Uint8Array));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
async function getFCMAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const si = `${header}.${payload}`;
  const pem = (sa.private_key as string).replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)).buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(si));
  const jwt = `${si}.${base64url(new Uint8Array(sig))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString() });
  const d = await r.json();
  if (!d.access_token) throw new Error("[FCM] OAuth2 failed: " + JSON.stringify(d));
  return d.access_token as string;
}
type FCMSendOptions = { title: string; body: string; data?: Record<string, string>; channelId?: string; highPriority?: boolean; collapseKey?: string; ttl?: number };
async function sendFCMToUser(fcmToken: string, opts: FCMSendOptions): Promise<void> {
  const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
  const saKey     = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY");
  if (!projectId || !saKey) { console.error("[FCM] missing credentials"); return; }
  const ttl = opts.ttl ?? 604800;
  const accessToken = await getFCMAccessToken(saKey);
  const message: Record<string, unknown> = {
    token: fcmToken,
    notification: { title: opts.title, body: opts.body },
    android: { priority: opts.highPriority ? "high" : "normal", ttl: `${ttl}s`, ...(opts.collapseKey && { collapse_key: opts.collapseKey }), notification: { channel_id: opts.channelId ?? "default", sound: "default", notification_priority: "PRIORITY_HIGH", default_sound: true, default_vibrate_timings: true, default_light_settings: true } },
    apns: { headers: { "apns-priority": "10", "apns-expiration": String(Math.floor(Date.now() / 1000) + ttl), ...(opts.collapseKey && { "apns-collapse-id": opts.collapseKey }) }, payload: { aps: { alert: { title: opts.title, body: opts.body }, sound: "default", badge: 1, ...(opts.collapseKey && { "thread-id": opts.collapseKey }) } } },
    data: Object.fromEntries(Object.entries(opts.data ?? {}).map(([k, v]) => [k, String(v)])),
  };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ message }) });
  if (!res.ok && res.status !== 404) console.error(`[FCM] send failed ${res.status}:`, await res.text());
}
// ────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function channelId(type?: string): string {
  switch (type) {
    case "message":  return "messages";
    case "call":     return "calls";
    case "follow": case "like": case "reply": case "mention": return "social";
    case "order": case "escrow": case "payment": return "marketplace";
    default: return "default";
  }
}

// ── Expo Push Notification Service (for Expo Go / dev builds) ────────────────
async function sendExpoNotification(token: string, opts: FCMSendOptions): Promise<void> {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate" },
    body: JSON.stringify({
      to: token,
      title: opts.title,
      body: opts.body,
      data: opts.data ?? {},
      sound: "default",
      priority: opts.highPriority ? "high" : "normal",
      channelId: opts.channelId ?? "default",
      ttl: opts.ttl ?? 604800,
      ...(opts.collapseKey && { collapseId: opts.collapseKey }),
    }),
  });
  if (!res.ok) console.error(`[Expo Push] send failed ${res.status}:`, await res.text());
}

// ── Dispatch to FCM or Expo depending on token format ────────────────────────
async function sendToUser(token: string, opts: FCMSendOptions): Promise<void> {
  if (token.startsWith("ExponentPushToken[")) {
    return sendExpoNotification(token, opts);
  }
  return sendFCMToUser(token, opts);
}

async function pushToUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  push: { title: string; body: string; data?: Record<string, string>; type?: string; collapseKey?: string },
): Promise<void> {
  const { data: profile } = await supabase.from("profiles").select("fcm_token").eq("id", userId).single();
  if (!profile?.fcm_token) return;
  const type = push.type ?? (push.data?.type as string | undefined);
  await sendToUser(profile.fcm_token, {
    title: push.title, body: push.body,
    data: { recipientUserId: userId, ...(push.data ?? {}) },
    channelId: channelId(type),
    highPriority: type === "call",
    collapseKey: push.collapseKey,
    ttl: type === "call" ? 30 : 604800,
  });
}

async function handleMessage(supabase: ReturnType<typeof createClient>, record: Record<string, unknown>): Promise<void> {
  const chatId   = record["chat_id"]   as string | undefined;
  const senderId = record["sender_id"] as string | undefined;
  const content  = (record["content"]  as string | undefined) ?? "Sent an attachment";
  if (!chatId || !senderId) return;
  const { data: chat } = await supabase.from("chats").select("id, is_group, name, chat_participants(user_id)").eq("id", chatId).single();
  if (!chat) return;
  const { data: sender } = await supabase.from("profiles").select("display_name, username").eq("id", senderId).single();
  const senderName = (sender?.display_name || sender?.username || "Someone") as string;
  const title = (chat.is_group && chat.name) ? `${senderName} in ${chat.name}` : senderName;
  const body  = content.length > 100 ? content.substring(0, 97) + "..." : content;
  const participants = (chat.chat_participants as { user_id: string }[] | null) ?? [];
  await Promise.allSettled(
    participants.filter(p => p.user_id !== senderId).map(p =>
      pushToUser(supabase, p.user_id, { title, body, type: "message", data: { type: "message", chatId, actorId: senderId, notifType: "new_message" }, collapseKey: `chat_${chatId}` }),
    ),
  );
}

async function handleCall(supabase: ReturnType<typeof createClient>, record: Record<string, unknown>): Promise<void> {
  const calleeId = record["callee_id"] as string | undefined;
  const callerId = record["caller_id"] as string | undefined;
  const callId   = record["id"]        as string | undefined;
  const callType = (record["call_type"] as string | undefined) ?? "voice";
  if (!calleeId || !callerId || !callId) return;
  const { data: caller } = await supabase.from("profiles").select("display_name, username").eq("id", callerId).single();
  const callerName = (caller?.display_name || caller?.username || "Someone") as string;
  await pushToUser(supabase, calleeId, { title: `Incoming ${callType === "video" ? "Video" : "Voice"} Call`, body: `${callerName} is calling you`, type: "call", data: { type: "call", callId, callType, actorId: callerId, notifType: "call", url: `/call/${callId}` }, collapseKey: `call_${callId}` });
}

const TYPE_MAP: Record<string, (record: Record<string, unknown>, actorName: string) => { title: string; body: string; pushType: string; url?: string }> = {
  new_follower:    (_r, n) => ({ title: "New Follower",              body: `${n} started following you`,  pushType: "follow" }),
  new_like:        (r,  n) => ({ title: "Post Liked",                body: `${n} liked your post`,        pushType: "like",    url: r["post_id"] ? `/p/${r["post_id"]}` : undefined }),
  new_reply:       (r,  n) => ({ title: n,                           body: "Replied to your post",        pushType: "reply",   url: r["post_id"] ? `/p/${r["post_id"]}` : undefined }),
  new_mention:     (r,  n) => ({ title: `${n} mentioned you`,        body: "Tap to see the post",         pushType: "mention", url: r["post_id"] ? `/p/${r["post_id"]}` : undefined }),
  gift:            (_r, n) => ({ title: "Gift Received! 🎁",         body: `${n} sent you a gift`,        pushType: "gift" }),
  order_placed:    (r,  n) => ({ title: "New Order Received! 🛍️",   body: `${n} placed an order`,        pushType: "order",   url: r["reference_id"] ? `/shop/order/${r["reference_id"]}` : undefined }),
  order_shipped:   (r,  n) => ({ title: "Your Order Has Shipped! 📦",body: `${n} has shipped your order`,pushType: "order",   url: r["reference_id"] ? `/shop/order/${r["reference_id"]}` : undefined }),
  escrow_released: (r,  n) => ({ title: "Payment Released! 💰",      body: `${n} confirmed delivery`,    pushType: "escrow",  url: r["reference_id"] ? `/shop/order/${r["reference_id"]}` : undefined }),
  dispute_raised:  (r,  n) => ({ title: "Order Dispute Opened ⚠️",   body: `${n} raised a dispute`,      pushType: "order",   url: r["reference_id"] ? `/shop/order/${r["reference_id"]}` : undefined }),
  refund_issued:   (r,  _) => ({ title: "Refund Issued ✅",           body: "Your refund has been returned to your wallet", pushType: "payment", url: r["reference_id"] ? `/shop/order/${r["reference_id"]}` : undefined }),
  acoin_received:  (_r, _) => ({ title: "AC Received 💰",             body: "You received AfuCoins",       pushType: "payment", url: "/me" }),
  system:          (_r, _) => ({ title: "AfuChat",                   body: "You have a new notification", pushType: "system",  url: "/" }),
  channel_post:    (r,  n) => ({ title: n,                           body: "Posted in your channel",      pushType: "channel", url: r["reference_id"] ? `/channel/${r["reference_id"]}` : undefined }),
  live_started:    (r,  n) => ({ title: `${n} is live! 🔴`,          body: "Tap to join the stream",      pushType: "live",    url: r["reference_id"] ? `/channel/${r["reference_id"]}` : undefined }),
  new_message:     (r,  n) => ({ title: n,                           body: "Sent you a message",          pushType: "message", url: r["reference_id"] ? `/chat/${r["reference_id"]}` : undefined }),
  call:            (r,  n) => ({ title: "Incoming Call",             body: `${n} is calling you`,        pushType: "call",    url: r["reference_id"] ? `/call/${r["reference_id"]}` : undefined }),
};

async function handleNotification(supabase: ReturnType<typeof createClient>, record: Record<string, unknown>): Promise<void> {
  const userId  = record["user_id"]  as string | undefined;
  const actorId = record["actor_id"] as string | undefined;
  const type    = record["type"]     as string | undefined;
  if (!userId || !type) return;
  const mapper = TYPE_MAP[type];
  if (!mapper) { console.warn(`[push-trigger] No mapping for type: ${type}`); return; }
  let actorName = "Someone";
  if (actorId) {
    const { data: actor } = await supabase.from("profiles").select("display_name, username").eq("id", actorId).single();
    actorName = (actor?.display_name || actor?.username || "Someone") as string;
  }
  const mapped = mapper(record, actorName);
  await pushToUser(supabase, userId, {
    title: mapped.title, body: mapped.body, type: mapped.pushType,
    data: { type: mapped.pushType, actorId: actorId ?? "", notifType: type, postId: (record["post_id"] as string | undefined) ?? "", referenceId: (record["reference_id"] as string | undefined) ?? "", url: mapped.url ?? "" },
  });
}

type WebhookPayload = { type: "INSERT" | "UPDATE" | "DELETE"; table: string; schema: string; record: Record<string, unknown>; old_record: Record<string, unknown> | null };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);
    const webhook = (await req.json()) as WebhookPayload;
    if (webhook.type !== "INSERT") return new Response(JSON.stringify({ ok: true, skipped: "not an INSERT" }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    switch (webhook.table) {
      case "messages":      await handleMessage(supabase, webhook.record);      break;
      case "calls":         await handleCall(supabase, webhook.record);         break;
      case "notifications": await handleNotification(supabase, webhook.record); break;
      default: console.warn(`[push-trigger] Unhandled table: ${webhook.table}`);
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[push-trigger] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
});
