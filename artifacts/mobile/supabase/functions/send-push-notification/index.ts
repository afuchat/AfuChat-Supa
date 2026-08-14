import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
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

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorization = req.headers.get("Authorization") ?? "";
  if (!serviceRoleKey || authorization !== `Bearer ${serviceRoleKey}`) {
    return json({ error: "Server authorization required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!supabaseUrl) return json({ error: "Push delivery is not configured." }, 500);

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const messageBody = typeof body?.body === "string" ? body.body.trim() : "";
  const data = body?.data && typeof body.data === "object" ? body.data : {};

  if (!userId || !title || !messageBody) {
    return json({ error: "userId, title, and body are required." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: devices, error: deviceError } = await admin
    .from("push_devices")
    .select("id, token")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (deviceError) return json({ error: "Could not load push devices." }, 500);
  if (!devices?.length) return json({ ok: true, sent: 0 });

  const messages = devices.map((device) => ({
    to: device.token,
    title,
    body: messageBody,
    data,
    channelId: "messages",
    sound: "default",
  }));

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) return json({ error: "Push provider rejected the request." }, 502);

  const tickets = Array.isArray(payload?.data) ? payload.data : [];
  const staleIds = tickets
    .map((ticket: any, index: number) =>
      ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered"
        ? devices[index]?.id
        : null,
    )
    .filter(Boolean);

  if (staleIds.length) {
    await admin.from("push_devices").update({ enabled: false }).in("id", staleIds);
  }

  return json({
    ok: true,
    sent: tickets.filter((ticket: any) => ticket?.status === "ok").length,
    stale: staleIds.length,
  });
});