import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Authorization required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Push registration is not configured." }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const platform = body?.platform === "ios" ? "ios" : body?.platform === "android" ? "android" : null;
  const enabled = body?.enabled !== false;

  if (!token || token.length > 4096 || !platform) {
    return json({ error: "A valid token and platform are required." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const update = {
    user_id: userData.user.id,
    token,
    platform,
    enabled,
    last_seen_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("push_devices")
    .upsert(update, { onConflict: "token" });

  if (error) {
    console.error("[register-push-token]", error.message);
    return json({ error: "Could not save push token." }, 500);
  }

  return json({ ok: true });
});