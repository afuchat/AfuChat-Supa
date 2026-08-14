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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorization = req.headers.get("Authorization") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Push delivery is not configured." }, 500);
  }

  const body = await req.json().catch(() => null);
  const isServiceRequest = Boolean(serviceRoleKey && authorization === `Bearer ${serviceRoleKey}`);
  let senderId: string | null = null;

  // The trusted server path can target any user. Client calls must use a
  // normal Supabase session and are restricted to members of the chat.
  if (!isServiceRequest) {
    if (!anonKey || !authorization.startsWith("Bearer ")) {
      return json({ error: "Authenticated sender required" }, 401);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);
    senderId = userData.user.id;
  }

  const userId = isServiceRequest
    ? (typeof body?.userId === "string" ? body.userId : "")
    : (typeof body?.recipientUserId === "string" ? body.recipientUserId : "");
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const messageBody = typeof body?.body === "string" ? body.body.trim() : "";
  const data = body?.data && typeof body.data === "object" ? body.data : {};

  if (!userId || !title || !messageBody) {
    return json({ error: "userId, title, and body are required." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  if (!isServiceRequest) {
    const chatId = typeof body?.chatId === "string" ? body.chatId : "";
    if (!chatId || !senderId || userId === senderId) {
      return json({ error: "A valid chat recipient is required." }, 400);
    }

    const { data: members, error: memberError } = await admin
      .from("chat_members")
      .select("user_id")
      .eq("chat_id", chatId)
      .in("user_id", [senderId, userId]);

    if (memberError) return json({ error: "Could not verify chat membership." }, 500);
    const memberIds = new Set((members ?? []).map((member) => member.user_id));
    if (!memberIds.has(senderId) || !memberIds.has(userId)) {
      return json({ error: "Sender and recipient must belong to the chat." }, 403);
    }
  }

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