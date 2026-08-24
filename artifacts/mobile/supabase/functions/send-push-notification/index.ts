import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

function encode(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(serviceAccount: any) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = encode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const keyData = serviceAccount.private_key.replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(keyData), (char) => char.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claim}.${encode(new Uint8Array(signature))}`,
  });
  const data = await response.json();
  if (!response.ok || typeof data.access_token !== "string") throw new Error("FCM access token request failed");
  return data.access_token as string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authorization required" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const firebaseJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";
  if (!url || !anonKey || !serviceRoleKey || !firebaseJson) return json({ error: "FCM is not configured" }, 503);

  const auth = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await auth.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid session" }, 401);
  const body = await request.json().catch(() => null);
  const recipientIds = Array.isArray(body?.recipientUserIds)
    ? [...new Set(body.recipientUserIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0))]
    : [];
  if (!recipientIds.length) return json({ ok: true, sent: 0 });

  const admin = createClient(url, serviceRoleKey);
  const { data: devices, error: deviceError } = await admin
    .from("push_devices")
    .select("id, token")
    .in("user_id", recipientIds)
    .eq("enabled", true);
  if (deviceError) return json({ error: "Could not load push devices" }, 500);

  const serviceAccount = JSON.parse(firebaseJson);
  const bearer = await accessToken(serviceAccount);
  const data = Object.fromEntries(Object.entries({
    ...(body.data ?? {}),
    categoryId: body.categoryId ?? "message",
    chatId: body.chatId ?? "",
    messageId: body.messageId ?? "",
    senderName: body.senderName ?? "",
  }).map(([key, value]) => [key, String(value ?? "")]));
  let sent = 0;
  for (const device of devices ?? []) {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: device.token,
          notification: { title: body.senderName || "AfuChat", body: body.body || "New message" },
          data,
          android: {
            priority: "HIGH",
            notification: {
              channel_id: "messages_v2",
              sound: "default",
              // Expo Notifications reads categoryId from the FCM data
              // payload and applies the registered Reply/Mark as read/Open
              // actions to the system notification.
              click_action: "open",
            },
          },
        },
      }),
    });
    if (response.ok) sent += 1;
    else if ([404, 410].includes(response.status)) await admin.from("push_devices").update({ enabled: false }).eq("id", device.id);
  }
  return json({ ok: true, sent, attempted: devices?.length ?? 0 });
});