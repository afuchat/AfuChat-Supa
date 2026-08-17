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

function isExpoPushToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:Expo|Exponent)PushToken\[[^\]]+\]$/.test(value.trim())
  );
}

async function writeRegistrationAudit(
  admin: any,
  row: {
    request_id: string;
    operation: "registration";
    status: "registered" | "failed";
    stage: string;
    recipient_user_id: string;
    platform?: "android" | "ios" | null;
    error_code?: string | null;
    error_message?: string | null;
  },
): Promise<void> {
  const { error } = await admin.from("push_delivery_logs").insert(row);
  if (error) console.error("[push-audit] Could not write registration log:", error.message);
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

  const requestId = crypto.randomUUID();
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const platform = body?.platform === "ios" ? "ios" : body?.platform === "android" ? "android" : null;
  const enabled = body?.enabled !== false;

  if (!isExpoPushToken(token) || token.length > 4096 || !platform) {
    await writeRegistrationAudit(admin, {
      request_id: requestId,
      operation: "registration",
      status: "failed",
      stage: "token_validation",
      recipient_user_id: userData.user.id,
      platform,
      error_code: "INVALID_EXPO_TOKEN",
      error_message: "Client submitted a token that is not an Expo push token.",
    });
    return json({ error: "A valid token and platform are required." }, 400);
  }

  const update = {
    user_id: userData.user.id,
    token,
    platform,
    enabled,
    last_seen_at: new Date().toISOString(),
  };

  const { data: existingDevice, error: existingDeviceError } = await admin
    .from("push_devices")
    .select("id, user_id, platform, enabled, last_seen_at")
    .eq("token", token)
    .maybeSingle();
  if (existingDeviceError) {
    console.error("[register-push-token] lookup failed:", existingDeviceError.message);
    return json({ error: "Could not verify existing push token." }, 500);
  }

  const lastSeenMs = existingDevice?.last_seen_at
    ? Date.parse(existingDevice.last_seen_at)
    : Number.NaN;
  const isRecentDuplicate =
    existingDevice &&
    existingDevice.user_id === userData.user.id &&
    existingDevice.platform === platform &&
    existingDevice.enabled === enabled &&
    Number.isFinite(lastSeenMs) &&
    Date.now() - lastSeenMs < 60_000;

  if (isRecentDuplicate) {
    return json({ ok: true, deduplicated: true });
  }

  const { error } = await admin
    .from("push_devices")
    .upsert(update, { onConflict: "token" });

  if (error) {
    console.error("[register-push-token]", error.message);
    await writeRegistrationAudit(admin, {
      request_id: requestId,
      operation: "registration",
      status: "failed",
      stage: "registry_write",
      recipient_user_id: userData.user.id,
      platform,
      error_code: "REGISTRY_WRITE_FAILED",
      error_message: error.message.slice(0, 1000),
    });
    return json({ error: "Could not save push token." }, 500);
  }

  await writeRegistrationAudit(admin, {
    request_id: requestId,
    operation: "registration",
    status: "registered",
    stage: "registry_write",
    recipient_user_id: userData.user.id,
    platform,
  });

  return json({ ok: true, requestId });
});