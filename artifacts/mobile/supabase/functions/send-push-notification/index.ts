import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// FCM HTTP v1 — inlined (no relative _shared import needed for direct API deploy)

function base64url(data: Uint8Array | string): string {
  const str = typeof data === "string" ? data : String.fromCharCode(...(data as Uint8Array));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getFCMAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const si = `${header}.${payload}`;
  const pem = (sa.private_key as string).replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)).buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(si));
  const jwt = `${si}.${base64url(new Uint8Array(sig))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("[FCM] OAuth2 failed: " + JSON.stringify(d));
  return d.access_token as string;
}

type FCMSendOptions = {
  title: string; body: string; data?: Record<string, string>;
  channelId?: string; highPriority?: boolean; collapseKey?: string; ttl?: number;
};

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

async function sendFCMToUser(fcmToken: string, opts: FCMSendOptions): Promise<void> {
  const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
  const saKey     = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY");
  if (!projectId || !saKey) { console.error("[FCM] missing FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_KEY"); return; }
  const ttl = opts.ttl ?? 604800;
  const accessToken = await getFCMAccessToken(saKey);
  const message: Record<string, unknown> = {
    token: fcmToken,
    notification: { title: opts.title, body: opts.body },
    android: {
      priority: opts.highPriority ? "high" : "normal",
      ttl: `${ttl}s`,
      ...(opts.collapseKey && { collapse_key: opts.collapseKey }),
      notification: { channel_id: opts.channelId ?? "default", sound: "default", notification_priority: "PRIORITY_HIGH", default_sound: true, default_vibrate_timings: true, default_light_settings: true },
    },
    apns: {
      headers: { "apns-priority": "10", "apns-expiration": String(Math.floor(Date.now() / 1000) + ttl), ...(opts.collapseKey && { "apns-collapse-id": opts.collapseKey }) },
      payload: { aps: { alert: { title: opts.title, body: opts.body }, sound: "default", badge: 1, ...(opts.collapseKey && { "thread-id": opts.collapseKey }) } },
    },
    data: Object.fromEntries(Object.entries(opts.data ?? {}).map(([k, v]) => [k, String(v)])),
  };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ message }),
  });
  if (!res.ok && res.status !== 404) console.error(`[FCM] send failed ${res.status}:`, await res.text());
}

const CORS = {
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);
    const { userId, title, body, data = {}, categoryIdentifier } = await req.json();
    if (!userId || !title || !body) {
      return new Response(JSON.stringify({ error: "userId, title, and body are required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const { data: profile, error: profileErr } = await supabase.from("profiles").select("fcm_token").eq("id", userId).single();
    if (profileErr || !profile?.fcm_token) {
      return new Response(JSON.stringify({ error: "No FCM token found for user" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const type = (data as Record<string,string>)?.type;
    await sendToUser(profile.fcm_token, {
      title, body,
      data: { recipientUserId: userId, ...data },
      channelId: channelId(type),
      highPriority: type === "call",
      collapseKey: type === "message" && data.chatId ? `chat_${data.chatId}` : type === "call" ? `call_${data.callId ?? userId}` : undefined,
      ttl: type === "call" ? 30 : 604800,
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[send-push] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
