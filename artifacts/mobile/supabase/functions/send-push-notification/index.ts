import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_TIMEOUT_MS = 12_000;
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

function validRemoteUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function isImageAttachment(type: string, url: string): boolean {
  if (type === "image" || type === "gif") return true;
  if (type) return false;
  return /\.(?:png|jpe?g|gif|webp)(?:$|[?#])/i.test(url);
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

  const requestedRecipientIds = Array.isArray(body?.recipientUserIds)
    ? body.recipientUserIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
    : typeof body?.recipientUserId === "string"
      ? [body.recipientUserId]
      : [];
  const recipientUserIds = [...new Set(
    isServiceRequest
      ? (typeof body?.userId === "string" ? [body.userId] : requestedRecipientIds)
      : requestedRecipientIds,
  )].slice(0, 100);
  const data = body?.data && typeof body.data === "object" ? body.data : {};
  const suppliedSenderId =
    typeof body?.senderId === "string"
      ? body.senderId
      : typeof data.senderId === "string"
        ? data.senderId
        : "";
  const suppliedTitle = typeof body?.title === "string" ? body.title.trim() : "";
  const suppliedSenderName =
    typeof body?.senderName === "string" && body.senderName.trim()
      ? body.senderName.trim()
      : typeof body?.sender_display_name === "string" && body.sender_display_name.trim()
        ? body.sender_display_name.trim()
        : typeof data.senderName === "string" && data.senderName.trim()
          ? data.senderName.trim()
          : typeof data.sender_display_name === "string" && data.sender_display_name.trim()
            ? data.sender_display_name.trim()
            : "";
  const suppliedSenderAvatarUrl =
    typeof body?.senderAvatarUrl === "string" && body.senderAvatarUrl.trim()
      ? body.senderAvatarUrl.trim()
      : typeof data.senderAvatarUrl === "string" && data.senderAvatarUrl.trim()
        ? data.senderAvatarUrl.trim()
        : "";
  const messageBody =
    typeof body?.body === "string"
      ? body.body.trim()
      : typeof body?.messageBody === "string"
        ? body.messageBody.trim()
        : typeof data.messageBody === "string"
          ? data.messageBody.trim()
          : "";
  const attachmentUrl =
    typeof body?.attachmentUrl === "string" && body.attachmentUrl.trim()
      ? body.attachmentUrl.trim()
      : typeof data.attachmentUrl === "string" && data.attachmentUrl.trim()
        ? data.attachmentUrl.trim()
        : "";
  const attachmentType =
    typeof body?.attachmentType === "string"
      ? body.attachmentType
      : typeof data.attachmentType === "string"
        ? data.attachmentType
        : "";
  const categoryId =
    typeof body?.categoryId === "string"
      ? body.categoryId
      : typeof data.categoryId === "string"
        ? data.categoryId
        : typeof data.category_id === "string"
          ? data.category_id
          : "message";
  const chatId = typeof body?.chatId === "string" ? body.chatId : "";
  const messageId = typeof body?.messageId === "string" ? body.messageId : "";
  const resolvedSenderId = senderId || suppliedSenderId;
  const safeSenderAvatarUrl = validRemoteUrl(senderAvatarUrl);
  const safeAttachmentUrl = validRemoteUrl(attachmentUrl);
  const notificationData = {
    ...data,
    ...(resolvedSenderId ? { senderId: resolvedSenderId } : {}),
    ...(safeSenderAvatarUrl ? { senderAvatarUrl: safeSenderAvatarUrl } : {}),
    ...(safeAttachmentUrl ? { attachmentUrl: safeAttachmentUrl } : {}),
    ...(attachmentType ? { attachmentType } : {}),
    ...(chatId ? { chatId } : {}),
    ...(messageId ? { messageId } : {}),
  };

  const admin = createClient(supabaseUrl, serviceRoleKey);
  let senderName = suppliedSenderName;
  let senderAvatarUrl = suppliedSenderAvatarUrl;
  if (resolvedSenderId) {
    const { data: senderProfile } = await admin
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", resolvedSenderId)
      .maybeSingle();
    senderName = senderProfile?.display_name?.trim() || senderName;
    senderAvatarUrl = senderProfile?.avatar_url?.trim() || senderAvatarUrl;
  }
  const title = senderName || suppliedTitle;
  const finalSenderAvatarUrl = validRemoteUrl(senderAvatarUrl);
  const finalAttachmentUrl = validRemoteUrl(attachmentUrl);
  const richImage = isImageAttachment(attachmentType, finalAttachmentUrl)
    ? finalAttachmentUrl
    : finalSenderAvatarUrl;
  const finalNotificationData = {
    ...notificationData,
    ...(senderName ? { senderName } : {}),
    ...(finalSenderAvatarUrl ? { senderAvatarUrl: finalSenderAvatarUrl } : {}),
    ...(finalAttachmentUrl ? { attachmentUrl: finalAttachmentUrl } : {}),
  };
  if (recipientUserIds.length === 0 || (!title && !suppliedSenderName) || !messageBody) {
    return json({ error: "recipient, sender name/title, and body are required." }, 400);
  }
  if (!isServiceRequest) {
    const chatId = typeof body?.chatId === "string" ? body.chatId : "";
    if (!chatId || !senderId || recipientUserIds.includes(senderId)) {
      return json({ error: "A valid chat recipient is required." }, 400);
    }

    const { data: members, error: memberError } = await admin
      .from("chat_members")
      .select("user_id")
      .eq("chat_id", chatId)
      .in("user_id", [senderId, ...recipientUserIds]);

    if (memberError) return json({ error: "Could not verify chat membership." }, 500);
    const memberIds = new Set((members ?? []).map((member) => member.user_id));
    if (!memberIds.has(senderId) || recipientUserIds.some((recipientId) => !memberIds.has(recipientId))) {
      return json({ error: "Sender and recipient must belong to the chat." }, 403);
    }
  }

  const { data: devices, error: deviceError } = await admin
    .from("push_devices")
    .select("id, token")
    .in("user_id", recipientUserIds)
    .eq("enabled", true);

  if (deviceError) return json({ error: "Could not load push devices." }, 500);
  if (!devices?.length) return json({ ok: true, sent: 0 });

  const messages = devices.map((device) => ({
    to: device.token,
    title,
    body: messageBody,
    data: finalNotificationData,
    categoryId,
    channelId: "messages",
    sound: "default",
    ...(richImage
      ? { mutableContent: true, richContent: { image: richImage } }
      : {}),
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXPO_PUSH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
      signal: controller.signal,
    });
  } catch {
    return json({ error: "Push provider timed out or was unreachable." }, 504);
  } finally {
    clearTimeout(timeout);
  }
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