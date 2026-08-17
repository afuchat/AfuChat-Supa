import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { KEYS, storage } from "@/lib/storage/mmkv";

type NotificationsModule = typeof import("expo-notifications");

let cachedNotifications: NotificationsModule | null | undefined;
let handlerConfigured = false;
let registrationInFlight: Promise<string | null> | null = null;
const inFlightDeliveryKeys = new Set<string>();
const pendingChatDeliveries = new Map<string, {
  params: NotifyChatRecipientsParams;
  messageIds: Set<string>;
  timer: ReturnType<typeof setTimeout>;
}>();
const recentDeliveryKeys = new Map<string, number>();

const PUSH_REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000;
const PUSH_DELIVERY_DEBOUNCE_MS = 350;
const PUSH_DELIVERY_DEDUPE_MS = 30_000;
const PUSH_NATIVE_TIMEOUT_MS = 30_000;
const PUSH_NETWORK_TIMEOUT_MS = 15_000;
export const PUSH_NOTIFICATIONS_DISABLED =
  typeof process !== "undefined" && process.env.EXPO_PUBLIC_DISABLE_PUSH_NOTIFICATIONS === "1";
export const PUSH_DIAGNOSTICS_ENABLED =
  typeof process !== "undefined" && process.env.EXPO_PUBLIC_NOTIFICATION_DIAGNOSTICS === "1";

function withTimeout<T>(
  task: () => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    Promise.resolve()
      .then(task)
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}

type PushDiagnostics = {
  registrationAttempts: number;
  registrationDedupeHits: number;
  registrationNetworkRequests: number;
  registrationCacheHits: number;
  deliveryRecipientRequests: number;
  responseEvents: number;
  activeResponseListeners: number;
  activeTokenListeners: number;
  configured: boolean;
};

const pushDiagnostics: PushDiagnostics = {
  registrationAttempts: 0,
  registrationDedupeHits: 0,
  registrationNetworkRequests: 0,
  registrationCacheHits: 0,
  deliveryRecipientRequests: 0,
  responseEvents: 0,
  activeResponseListeners: 0,
  activeTokenListeners: 0,
  configured: false,
};

function recordPushDiagnostic(key: keyof Omit<PushDiagnostics, "activeResponseListeners" | "activeTokenListeners" | "configured">, amount = 1): void {
  if (!PUSH_DIAGNOSTICS_ENABLED) return;
  pushDiagnostics[key] += amount;
}

export function getPushDiagnostics(): PushDiagnostics {
  return { ...pushDiagnostics };
}

export function isPushTokenRegistrationDue(): boolean {
  if (PUSH_NOTIFICATIONS_DISABLED) return false;
  const token = storage.getString(KEYS.PUSH_TOKEN);
  const registeredAt = storage.getNumber(KEYS.PUSH_TOKEN_REGISTERED_AT) ?? 0;
  return !token || !registeredAt || Date.now() - registeredAt >= PUSH_REGISTRATION_TTL_MS;
}

export const PUSH_CATEGORY_MESSAGE = "message";
export const PUSH_CATEGORY_CALL = "call";
export const PUSH_ACTION_REPLY = "reply";
export const PUSH_ACTION_MARK_READ = "mark_read";
export const PUSH_ACTION_OPEN = "open";
export const PUSH_ACTION_CALL_BACK = "call_back";
export const PUSH_ACTION_DEFAULT = "expo.modules.notifications.actions.DEFAULT";

export type PushNotificationResponse = {
  actionIdentifier: string;
  userText?: string;
  notification?: {
    request?: {
      identifier?: string;
      content?: {
        data?: Record<string, unknown>;
      };
    };
  };
};

type NotifyChatRecipientsParams = {
  recipientIds: string[];
  senderName: string;
  senderAvatarUrl?: string | null;
  body: string;
  chatId: string;
  messageId: string;
  senderId?: string;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
};

function getNotifications(): NotificationsModule | null {
  if (cachedNotifications !== undefined) return cachedNotifications;
  if (Platform.OS === "web") {
    cachedNotifications = null;
    return cachedNotifications;
  }
  try {
    cachedNotifications = require("expo-notifications") as NotificationsModule;
  } catch {
    cachedNotifications = null;
  }
  return cachedNotifications;
}

function getProjectId(): string | null {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId;
  return typeof projectId === "string" && projectId.length > 0 ? projectId : null;
}

function isExpoPushToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:Expo|Exponent)PushToken\[[^\]]+\]$/.test(value.trim())
  );
}

export function configurePushNotifications(): void {
  if (PUSH_NOTIFICATIONS_DISABLED) return;
  const notifications = getNotifications();
  if (!notifications || handlerConfigured) return;

  notifications.setNotificationHandler({
    handleNotification: async () => {
      const preferences = storage.getObject<{ enabled?: boolean; sounds?: boolean }>(KEYS.NOTIFICATION_PREFERENCES);
      const enabled = preferences?.enabled ?? true;
      return {
        shouldShowBanner: enabled,
        shouldShowList: enabled,
        shouldPlaySound: enabled && (preferences?.sounds ?? true),
        shouldSetBadge: enabled,
      };
    },
  });

  if (Platform.OS === "android") {
    notifications
      .setNotificationChannelAsync("messages", {
        name: "Messages",
        importance: notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: "default",
        lockscreenVisibility: notifications.AndroidNotificationVisibility.PUBLIC,
      })
      .catch(() => {});
  }

  notifications
    .setNotificationCategoryAsync(PUSH_CATEGORY_MESSAGE, [
      {
        identifier: PUSH_ACTION_REPLY,
        buttonTitle: "Reply",
        textInput: {
          submitButtonTitle: "Send",
          placeholder: "Write a reply…",
        },
        options: { opensAppToForeground: true },
      },
      {
        identifier: PUSH_ACTION_MARK_READ,
        buttonTitle: "Mark as read",
        options: { opensAppToForeground: true },
      },
      {
        identifier: PUSH_ACTION_OPEN,
        buttonTitle: "Open",
        options: { opensAppToForeground: true },
      },
    ])
    .catch(() => {});

  notifications
    .setNotificationCategoryAsync(PUSH_CATEGORY_CALL, [
      {
        identifier: PUSH_ACTION_OPEN,
        buttonTitle: "Open call",
        options: { opensAppToForeground: true },
      },
      {
        identifier: PUSH_ACTION_CALL_BACK,
        buttonTitle: "Call back",
        options: { opensAppToForeground: true },
      },
      {
        identifier: PUSH_ACTION_MARK_READ,
        buttonTitle: "Dismiss",
        options: { opensAppToForeground: true },
      },
    ])
    .catch(() => {});

  handlerConfigured = true;
  pushDiagnostics.configured = true;
}

export function addNotificationResponseListener(
  onResponse: (response: PushNotificationResponse) => void,
): { remove: () => void } | null {
  if (PUSH_NOTIFICATIONS_DISABLED) return null;
  const notifications = getNotifications();
  if (!notifications) return null;
  const subscription = notifications.addNotificationResponseReceivedListener((response) => {
    recordPushDiagnostic("responseEvents");
    onResponse(response as any);
  });
  if (PUSH_DIAGNOSTICS_ENABLED) pushDiagnostics.activeResponseListeners += 1;
  let removed = false;
  return {
    remove: () => {
      if (removed) return;
      removed = true;
      if (PUSH_DIAGNOSTICS_ENABLED) pushDiagnostics.activeResponseListeners = Math.max(0, pushDiagnostics.activeResponseListeners - 1);
      subscription.remove();
    },
  };
}

export async function getLastNotificationResponse(): Promise<PushNotificationResponse | null> {
  if (PUSH_NOTIFICATIONS_DISABLED) return null;
  const notifications = getNotifications();
  if (!notifications) return null;
  return (await notifications.getLastNotificationResponseAsync()) as PushNotificationResponse | null;
}

export function clearLastNotificationResponse(): void {
  const notifications = getNotifications();
  notifications?.clearLastNotificationResponse?.();
}

export async function dismissNotification(response: PushNotificationResponse): Promise<void> {
  const notifications = getNotifications();
  const identifier = response.notification?.request?.identifier;
  if (!notifications || !identifier) return;
  await notifications.dismissNotificationAsync(identifier);
}

export function getNotificationTarget(response: PushNotificationResponse): {
  chatId: string | null;
  messageId: string | null;
} {
  const data = response.notification?.request?.content?.data ?? {};
  const chatId =
    typeof data.chatId === "string"
      ? data.chatId
      : typeof data.chat_id === "string"
        ? data.chat_id
        : null;
  const messageId =
    typeof data.messageId === "string"
      ? data.messageId
      : typeof data.message_id === "string"
        ? data.message_id
        : null;
  return { chatId, messageId };
}

async function markNotificationRead(
  response: PushNotificationResponse,
  userId: string,
): Promise<void> {
  const { chatId, messageId } = getNotificationTarget(response);
  if (!userId || (!chatId && !messageId)) return;

  const now = new Date().toISOString();
  if (messageId) {
    await supabase.from("message_status").upsert(
      {
        message_id: messageId,
        user_id: userId,
        delivered_at: now,
        read_at: now,
      },
      { onConflict: "message_id,user_id" },
    );
    return;
  }

  const { data: unreadMessages } = await supabase
    .from("messages")
    .select("id")
    .eq("chat_id", chatId)
    .neq("sender_id", userId)
    .limit(200);
  if (!unreadMessages?.length) return;

  await supabase.from("message_status").upsert(
    unreadMessages.map((message) => ({
      message_id: message.id,
      user_id: userId,
      delivered_at: now,
      read_at: now,
    })),
    { onConflict: "message_id,user_id" },
  );
}

export async function handleNotificationResponse(
  response: PushNotificationResponse,
  userId: string,
): Promise<void> {
  if (response.actionIdentifier === PUSH_ACTION_MARK_READ) {
    await markNotificationRead(response, userId);
    return;
  }

  if (response.actionIdentifier !== PUSH_ACTION_REPLY) return;

  const text = response.userText?.trim();
  const { chatId, messageId } = getNotificationTarget(response);
  if (!text || !chatId || !userId) return;

  await supabase.from("messages").insert({
    chat_id: chatId,
    sender_id: userId,
    encrypted_content: text,
    ...(messageId ? { reply_to_message_id: messageId } : {}),
  });
  await markNotificationRead(response, userId);
}

export async function registerPushToken(): Promise<string | null> {
  if (PUSH_NOTIFICATIONS_DISABLED) return null;
  if (registrationInFlight) {
    recordPushDiagnostic("registrationDedupeHits");
    return registrationInFlight;
  }

  const registration = (async (): Promise<string | null> => {
    recordPushDiagnostic("registrationAttempts");
  const notifications = getNotifications();
  if (!notifications || Platform.OS === "web") return null;

  const device = require("expo-device") as typeof import("expo-device");
  if (!device.isDevice) return null;

  configurePushNotifications();

   const existing = await withTimeout(
     () => notifications.getPermissionsAsync(),
     PUSH_NATIVE_TIMEOUT_MS,
     "notification permission check",
   );
  let status = existing.status;
  if (status !== "granted") {
     const requested = await withTimeout(
       () => notifications.requestPermissionsAsync(),
       PUSH_NATIVE_TIMEOUT_MS,
       "notification permission request",
     );
    status = requested.status;
  }
  if (status !== "granted") return null;

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("Expo EAS project ID is required for push registration.");
  }

    const token = (
     await withTimeout(
       () => notifications.getExpoPushTokenAsync({ projectId }),
       PUSH_NATIVE_TIMEOUT_MS,
       "Expo push token request",
     )
   ).data;
   if (!isExpoPushToken(token)) {
     throw new Error("Expo returned an invalid push token.");
   }

  const previousToken = storage.getString(KEYS.PUSH_TOKEN);
  const previousRegistrationAt = storage.getNumber(KEYS.PUSH_TOKEN_REGISTERED_AT) ?? 0;
  if (
    previousToken === token &&
    previousRegistrationAt > 0 &&
    Date.now() - previousRegistrationAt < PUSH_REGISTRATION_TTL_MS
  ) {
    recordPushDiagnostic("registrationCacheHits");
    return token;
  }

  recordPushDiagnostic("registrationNetworkRequests");
   const { error } = await withTimeout(
     () =>
       supabase.functions.invoke("register-push-token", {
         body: { token, platform: Platform.OS },
       }),
     PUSH_NETWORK_TIMEOUT_MS,
     "push token registration",
   );
  if (error) throw error;

  storage.setString(KEYS.PUSH_TOKEN, token);
  storage.setNumber(KEYS.PUSH_TOKEN_REGISTERED_AT, Date.now());
  return token;
  })();

  registrationInFlight = registration;
  try {
    return await registration;
  } finally {
    if (registrationInFlight === registration) registrationInFlight = null;
  }
}

export async function disablePushToken(token: string): Promise<void> {
  if (PUSH_NOTIFICATIONS_DISABLED) return;
  // Older builds briefly persisted the native APNs/FCM token from
  // addPushTokenListener. It is not accepted by the Expo push service, so
  // never send it to the registry endpoint.
  if (!isExpoPushToken(token)) return;
  await withTimeout(
    () =>
      supabase.functions.invoke("register-push-token", {
        body: { token, platform: Platform.OS, enabled: false },
      }),
    PUSH_NETWORK_TIMEOUT_MS,
    "push token disable",
  );
}

export function addPushTokenListener(
  onTokenChanged: () => void,
): { remove: () => void } | null {
  if (PUSH_NOTIFICATIONS_DISABLED) return null;
  const notifications = getNotifications();
  if (!notifications) return null;
  const subscription = notifications.addPushTokenListener((event) => {
    // expo-notifications emits a native device token here, not an
    // ExpoPushToken. Force a fresh getExpoPushTokenAsync() instead of
    // persisting this value as a server-deliverable token.
    if (typeof event.data === "string" && event.data.length > 0) onTokenChanged();
  });
  if (PUSH_DIAGNOSTICS_ENABLED) pushDiagnostics.activeTokenListeners += 1;
  let removed = false;
  return {
    remove: () => {
      if (removed) return;
      removed = true;
      if (PUSH_DIAGNOSTICS_ENABLED) pushDiagnostics.activeTokenListeners = Math.max(0, pushDiagnostics.activeTokenListeners - 1);
      subscription.remove();
    },
  };
}

async function deliverChatNotification(
  params: NotifyChatRecipientsParams,
  recipientIds: string[],
  deliveryKey: string,
): Promise<void> {
  if (inFlightDeliveryKeys.has(deliveryKey)) return;
  inFlightDeliveryKeys.add(deliveryKey);
  recordPushDiagnostic("deliveryRecipientRequests", recipientIds.length);

  try {
     const { error } = await withTimeout(
       () =>
         supabase.functions.invoke("send-push-notification", {
           body: {
             recipientUserIds: recipientIds,
             senderId: params.senderId,
             senderName: params.senderName,
             senderAvatarUrl: params.senderAvatarUrl ?? undefined,
             body: params.body,
             chatId: params.chatId,
             messageId: params.messageId,
             attachmentUrl: params.attachmentUrl ?? undefined,
             attachmentType: params.attachmentType ?? undefined,
             categoryId: PUSH_CATEGORY_MESSAGE,
             data: {
               chatId: params.chatId,
               messageId: params.messageId,
               senderId: params.senderId ?? null,
               senderName: params.senderName,
               senderAvatarUrl: params.senderAvatarUrl ?? null,
               attachmentUrl: params.attachmentUrl ?? null,
               attachmentType: params.attachmentType ?? null,
               categoryId: PUSH_CATEGORY_MESSAGE,
             },
           },
         }),
       PUSH_NETWORK_TIMEOUT_MS,
       "push notification delivery",
     );
    if (__DEV__ && error) console.warn("[push] message notification rejected:", error);
  } catch (error) {
    if (__DEV__) console.warn("[push] message notification failed:", error);
  } finally {
    inFlightDeliveryKeys.delete(deliveryKey);
  }
}

export function notifyChatRecipients(params: NotifyChatRecipientsParams): void {
  if (PUSH_NOTIFICATIONS_DISABLED || Platform.OS === "web" || params.recipientIds.length === 0) return;
  const recipientIds = [...new Set(params.recipientIds)].filter((id) => id && id !== params.senderId);
  if (recipientIds.length === 0) return;

  const sortedRecipients = [...recipientIds].sort();
  const messageKey = `${params.messageId}:${sortedRecipients.join(",")}`;
  const previousDeliveryAt = recentDeliveryKeys.get(messageKey);
  if (previousDeliveryAt && Date.now() - previousDeliveryAt < PUSH_DELIVERY_DEDUPE_MS) return;
  recentDeliveryKeys.set(messageKey, Date.now());

  // Several send paths can observe the same message, and rapid message bursts
  // should not create one Edge Function request per message. Debounce by chat
  // and recipient set, retaining the newest message for reply/read actions.
  const batchKey = `${params.chatId}:${sortedRecipients.join(",")}`;
  const pending = pendingChatDeliveries.get(batchKey);
  if (pending) {
    if (pending.messageIds.has(params.messageId)) return;
    pending.messageIds.add(params.messageId);
    pending.params = {
      ...params,
      body: `${params.senderName || "Someone"} sent ${pending.messageIds.size} new messages`,
      messageId: params.messageId,
    };
    return;
  }

  const timer = setTimeout(() => {
    const job = pendingChatDeliveries.get(batchKey);
    if (!job) return;
    pendingChatDeliveries.delete(batchKey);
    void deliverChatNotification(job.params, sortedRecipients, messageKey);
  }, PUSH_DELIVERY_DEBOUNCE_MS);
  pendingChatDeliveries.set(batchKey, {
    params,
    messageIds: new Set([params.messageId]),
    timer,
  });

  // Keep the client-side dedupe cache bounded on long-lived sessions.
  if (recentDeliveryKeys.size > 500) {
    const cutoff = Date.now() - PUSH_DELIVERY_DEDUPE_MS;
    for (const [key, timestamp] of recentDeliveryKeys) {
      if (timestamp < cutoff) recentDeliveryKeys.delete(key);
    }
  }
}