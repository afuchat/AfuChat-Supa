import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authorization required" }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anonKey) return json({ error: "Push registration is not configured" }, 500);

  const auth = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await auth.auth.getUser();
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const platform = body?.platform === "android" || body?.platform === "ios" ? body.platform : null;
  if (
    token.length < 20 ||
    token.length > 4096 ||
    !platform ||
    body?.provider !== "fcm" ||
    /^(Expo|Exponent)PushToken\[/.test(token)
  ) {
    return json({ error: "A valid native FCM token and platform are required" }, 400);
  }

  // Use the authenticated client for registration. RLS then permits updates
  // only to a row already owned by this user, so a stolen token cannot be
  // reassigned to another account through an admin upsert.
  const { error } = await auth.from("push_devices").upsert({
    user_id: authData.user.id,
    token,
    platform,
    enabled: body?.enabled !== false,
    notification_preferences: body?.preferences ?? {},
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "token" });
  if (error) {
    console.error("[register-push-token]", error.message);
    return json({ error: "Could not save push token" }, 500);
  }
  return json({ ok: true });
});