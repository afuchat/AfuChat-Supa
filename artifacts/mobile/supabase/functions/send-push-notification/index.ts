import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FCM_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_TIMEOUT_MS = 12_000;
const ANDROID_CHANNEL_ID = "messages_v2";
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

function isExpoPushToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:Expo|Exponent)PushToken\[[^\]]+\]$/.test(value.trim())
  );
}

function isDevicePushToken(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 20 && value.length <= 4096;
}

function isDirectFcmToken(value: unknown): value is string {
  return isDevicePushToken(value) && !isExpoPushToken(value);
}

type FcmServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type FcmSendResult = {
  ok: boolean;
  httpStatus: number;
  providerStatus: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  messageName: string | null;
};

const EXPECTED_FCM_PROJECT_ID = "afuchat-c3630";

let fcmConfigPromise: Promise<FcmServiceAccount | null> | null = null;
let fcmAccessToken: { value: string; expiresAt: number } | null = null;

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

function parseServiceAccount(value: unknown): FcmServiceAccount | null {
  if (!value) return null;
  let parsed: any = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (
    typeof parsed?.project_id !== "string" ||
    typeof parsed?.client_email !== "string" ||
    typeof parsed?.private_key !== "string"
  ) {
    return null;
  }
  return {
    project_id: parsed.project_id.trim(),
    client_email: parsed.client_email.trim(),
    private_key: normalizePrivateKey(parsed.private_key),
  };
}

async function loadFcmConfig(admin: any): Promise<FcmServiceAccount | null> {
  if (fcmConfigPromise) return fcmConfigPromise;
  fcmConfigPromise = (async () => {
    // Keep the send target independent from a copied service-account JSON's
    // project_id. The Android client gets its sender ID from
    // google-services.json, so the server must use this same Firebase project.
    const configuredProjectId =
      Deno.env.get("FCM_PROJECT_ID") ??
      Deno.env.get("FIREBASE_PROJECT_ID") ??
      EXPECTED_FCM_PROJECT_ID;
    const envKeys = [
      "FCM_SERVICE_ACCOUNT_JSON",
      "FIREBASE_SERVICE_ACCOUNT_JSON",
      "FIREBASE_SERVICE_ACCOUNT_KEY",
      "GOOGLE_APPLICATION_CREDENTIALS_JSON",
    ];
    for (const key of envKeys) {
      const config = parseServiceAccount(Deno.env.get(key));
      if (config) return { ...config, project_id: configuredProjectId };
    }

    // Some deployments keep server-only settings in the existing app_settings
    // table instead of function environment variables. Never log these values.
    const { data } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "FCM_SERVICE_ACCOUNT_JSON",
        "FIREBASE_SERVICE_ACCOUNT_JSON",
        "firebase_service_account",
        "fcm_service_account",
      ]);
    for (const row of data ?? []) {
      const config = parseServiceAccount(row?.value);
      if (config) return { ...config, project_id: configuredProjectId };
    }

    const projectId = configuredProjectId;
    const clientEmail =
      Deno.env.get("FCM_CLIENT_EMAIL") ??
      Deno.env.get("FIREBASE_CLIENT_EMAIL");
    const privateKey =
      Deno.env.get("FCM_PRIVATE_KEY") ??
      Deno.env.get("FIREBASE_PRIVATE_KEY");
    if (projectId && clientEmail && privateKey) {
      return parseServiceAccount({
        project_id: projectId,
        client_email: clientEmail,
        private_key: privateKey,
      });
    }
    return null;
  })();
  try {
    return await fcmConfigPromise;
  } catch (error) {
    console.error("[send-push-notification] Could not load FCM configuration:", error);
    fcmConfigPromise = null;
    return null;
  }
}

function base64UrlEncode(value: string | Uint8Array): string {
  const binary =
    typeof value === "string"
      ? value
      : Array.from(value, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePem(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function getFcmAccessToken(config: FcmServiceAccount): Promise<string> {
  if (fcmAccessToken && fcmAccessToken.expiresAt > Date.now() + 60_000) {
    return fcmAccessToken.value;
  }

  const key = await crypto.subtle.importKey(
    "pkcs8",
    decodePem(config.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const issuedAt = Math.floor(Date.now() / 1000);
  const assertionHeader = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const assertionClaims = base64UrlEncode(JSON.stringify({
    iss: config.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: FCM_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsignedAssertion = `${assertionHeader}.${assertionClaims}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedAssertion),
  );
  const assertion = `${unsignedAssertion}.${base64UrlEncode(new Uint8Array(signature))}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FCM_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(FCM_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.access_token !== "string") {
    throw new Error(`FCM OAuth token request failed (${response.status}).`);
  }
  fcmAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
  };
  return payload.access_token;
}

function fcmData(data: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === "string" ? value : value == null ? "" : JSON.stringify(value),
    ]),
  );
}

function getFcmError(payload: any): { code: string | null; message: string | null } {
  const detail = Array.isArray(payload?.error?.details)
    ? payload.error.details.find((item: any) => typeof item?.errorCode === "string")
    : null;
  return {
    code: detail?.errorCode ?? payload?.error?.status ?? null,
    message: typeof payload?.error?.message === "string" ? payload.error.message : null,
  };
}

async function sendFcmMessage(
  config: FcmServiceAccount,
  message: Record<string, unknown>,
): Promise<FcmSendResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const accessToken = await getFcmAccessToken(config);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FCM_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.project_id)}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }
    const payload = await response.json().catch(() => null);
    if (response.status === 401 && attempt === 0) {
      fcmAccessToken = null;
      continue;
    }
    const error = getFcmError(payload);
    return {
      ok: response.ok && typeof payload?.name === "string",
      httpStatus: response.status,
      providerStatus: typeof payload?.error?.status === "string" ? payload.error.status : null,
      errorCode: error.code,
      errorMessage: error.message,
      messageName: typeof payload?.name === "string" ? payload.name : null,
    };
  }
  return {
    ok: false,
    httpStatus: 401,
    providerStatus: "UNAUTHENTICATED",
    errorCode: "UNAUTHENTICATED",
    errorMessage: "FCM authentication failed.",
    messageName: null,
  };
}

type PushAuditRow = {
  request_id: string;
  operation: "delivery";
  status: "sent" | "failed" | "skipped";
  stage: string;
  sender_id: string | null;
  recipient_user_id: string | null;
  device_id?: string | null;
  message_id: string | null;
  chat_id: string | null;
  platform?: "android" | "ios" | null;
  provider_http_status?: number | null;
  provider_status?: string | null;
  provider_ticket_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  details?: Record<string, unknown>;
};

function auditText(value: unknown, maxLength = 1000): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.slice(0, maxLength);
}

async function writePushAudit(admin: any, rows: PushAuditRow[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await admin.from("push_delivery_logs").insert(rows);
  if (error) {
    // Diagnostics must never turn a valid push into a failed delivery.
    console.error("[push-audit] Could not write delivery logs:", error.message);
  }
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
  const requestId = crypto.randomUUID();
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
  const safeSenderAvatarUrl = validRemoteUrl(suppliedSenderAvatarUrl);
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
    categoryId,
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

  const auditContext = {
    request_id: requestId,
    operation: "delivery" as const,
    sender_id: resolvedSenderId || null,
    message_id: messageId || null,
    chat_id: chatId || null,
  };
  const { data: devices, error: deviceError } = await admin
    .from("push_devices")
    .select("id, user_id, token, platform")
    .in("user_id", recipientUserIds)
    .eq("enabled", true);

  if (deviceError) {
    await writePushAudit(admin, [{
      ...auditContext,
      status: "failed",
      stage: "device_lookup",
      error_code: "DEVICE_LOOKUP_FAILED",
      error_message: auditText(deviceError.message),
    }]);
    return json({ error: "Could not load push devices.", requestId }, 500);
  }
  if (!devices?.length) {
    await writePushAudit(admin, recipientUserIds.map((recipientUserId) => ({
      ...auditContext,
      status: "skipped" as const,
      stage: "device_lookup",
      recipient_user_id: recipientUserId,
      error_code: "NO_ENABLED_DEVICE",
      error_message: "Recipient has no enabled push device.",
    })));
    return json({ ok: true, sent: 0, requestId });
  }

  // Direct FCM is the only supported provider. Legacy Expo/APNs-only rows
  // are disabled instead of silently routing through another gateway.
  const fcmDevices = devices.filter(
    (device) =>
      (device.platform === "android" || device.platform === "ios") &&
      isDirectFcmToken(device.token),
  );
  const fcmDeviceIds = new Set(fcmDevices.map((device) => device.id));
  const unsupportedDevices = devices.filter((device) => !fcmDeviceIds.has(device.id));
  const malformedIds = unsupportedDevices
    .map((device) => device.id)
    .filter(Boolean);
  if (malformedIds.length) {
    await writePushAudit(admin, unsupportedDevices.map((device) => ({
        ...auditContext,
        status: "failed" as const,
        stage: "token_validation",
        recipient_user_id: device.user_id,
        device_id: device.id,
        platform: device.platform,
        error_code: "UNSUPPORTED_DEVICE_TOKEN",
        error_message: "This platform does not have a direct FCM delivery path.",
      })));
  }
  if (malformedIds.length) {
    await admin.from("push_devices").update({ enabled: false }).in("id", malformedIds);
  }
  if (!fcmDevices.length) {
    return json({ ok: true, sent: 0, disabled: malformedIds.length, requestId });
  }
  let fcmSent = 0;
  let fcmFailed = 0;
  let fcmStale = 0;
  const fcmErrors: Array<Record<string, unknown>> = [];
  if (fcmDevices.length) {
    const fcmConfig = await loadFcmConfig(admin);
    if (!fcmConfig) {
      const errorMessage = "FCM service-account configuration is missing.";
      await writePushAudit(admin, fcmDevices.map((device) => ({
        ...auditContext,
        status: "failed" as const,
        stage: "provider_config",
        recipient_user_id: device.user_id,
        device_id: device.id,
        platform: device.platform,
        error_code: "FCM_NOT_CONFIGURED",
        error_message: errorMessage,
      })));
      fcmFailed = fcmDevices.length;
      fcmErrors.push(...fcmDevices.map((device) => ({
        index: fcmErrors.length,
        status: "error",
        error: errorMessage,
        deviceId: device.id,
      })));
    } else {
      for (const device of fcmDevices) {
        try {
          const result = await sendFcmMessage(fcmConfig, {
            token: device.token,
            notification: {
              title,
              body: messageBody,
              ...(richImage ? { image: richImage } : {}),
            },
            data: fcmData(finalNotificationData),
            android: {
              priority: "HIGH",
              notification: {
                channel_id: ANDROID_CHANNEL_ID,
                sound: "default",
                ...(richImage ? { image: richImage } : {}),
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: "default",
                  category: categoryId,
                },
              },
            },
          });
          const isStale = result.errorCode === "UNREGISTERED";
          if (isStale) {
            fcmStale += 1;
            await admin.from("push_devices").update({ enabled: false }).eq("id", device.id);
          }
          if (result.ok) {
            fcmSent += 1;
          } else {
            fcmFailed += 1;
            const error = {
              status: result.providerStatus ?? "error",
              error: result.errorMessage ?? result.errorCode ?? "FCM delivery failed.",
              deviceId: device.id,
            };
            fcmErrors.push(error);
          }
          await writePushAudit(admin, [{
            ...auditContext,
            status: result.ok ? "sent" as const : "failed" as const,
            stage: "provider_message",
            recipient_user_id: device.user_id,
            device_id: device.id,
            platform: device.platform,
            provider_http_status: result.httpStatus,
            provider_status: result.providerStatus,
            provider_ticket_id: result.messageName,
            error_code: result.errorCode,
            error_message: result.ok ? null : result.errorMessage ?? "FCM delivery failed.",
            details: { provider: "fcm" },
          }]);
        } catch (error) {
          fcmFailed += 1;
          const errorMessage = error instanceof Error ? error.message : "FCM delivery failed.";
          fcmErrors.push({
            status: "error",
            error: errorMessage,
            deviceId: device.id,
          });
          await writePushAudit(admin, [{
            ...auditContext,
            status: "failed" as const,
            stage: "provider_request",
            recipient_user_id: device.user_id,
            device_id: device.id,
            platform: device.platform,
            error_code: "FCM_PROVIDER_REQUEST_FAILED",
            error_message: auditText(errorMessage),
            details: { provider: "fcm" },
          }]);
        }
      }
    }
  }

  const sent = fcmSent;
  const failed = fcmFailed;
  const stale = fcmStale;
  const errors = fcmErrors;
  return json(
    {
      ok: failed === 0,
      sent,
      failed,
      errors,
      stale,
      requestId,
    },
    failed > 0 && sent === 0 ? 502 : 200,
  );
});
