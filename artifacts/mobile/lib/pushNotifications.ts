import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { KEYS, storage } from "@/lib/storage/mmkv";

type NotificationsModule = typeof import("expo-notifications");

let cachedNotifications: NotificationsModule | null | undefined;
let handlerConfigured = false;
let registrationInFlight: Promise<string | null> | null = null;
const inFlightDeliveryKeys = new Set<string>();

const PUSH_REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PUSH_NOTIFICATIONS_DISABLED =
  typeof process !== "undefined" && process.env.EXPO_PUBLIC_DISABLE_PUSH_NOTIFICATIONS === "1";
export const PUSH_DIAGNOSTICS_ENABLED =
  typeof process !== "undefined" && process.env.EXPO_PUBLIC_NOTIFICATION_DIAGNOSTICS === "1";

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
export const PUSH_ACTION_REPLY = "reply";
export const PUSH_ACTION_MARK_READ = "mark_read";
export const PUSH_ACTION_OPEN = "open";
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

  const existing = await notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") return null;

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("Expo EAS project ID is required for push registration.");
  }

  const token = (await notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!token) return null;

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
  const { error } = await supabase.functions.invoke("register-push-token", {
    body: { token, platform: Platform.OS },
  });
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
  if (!token) return;
  await supabase.functions.invoke("register-push-token", {
    body: { token, platform: Platform.OS, enabled: false },
  });
}

export function addPushTokenListener(
  onToken: (token: string) => void,
): { remove: () => void } | null {
  if (PUSH_NOTIFICATIONS_DISABLED) return null;
  const notifications = getNotifications();
  if (!notifications) return null;
  const subscription = notifications.addPushTokenListener((event) => {
    if (typeof event.data === "string" && event.data.length > 0) onToken(event.data);
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

export async function notifyChatRecipients(params: {
  recipientIds: string[];
  senderName: string;
  senderAvatarUrl?: string | null;
  body: string;
  chatId: string;
  messageId: string;
  senderId?: string;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
}): Promise<void> {
  if (PUSH_NOTIFICATIONS_DISABLED || Platform.OS === "web" || params.recipientIds.length === 0) return;
  const recipientIds = [...new Set(params.recipientIds)].filter((id) => id && id !== params.senderId);
  if (recipientIds.length === 0) return;

  // A message can be observed by more than one optimistic/send path. Keep one
  // delivery job per message and recipient set, rather than creating a burst
  // of identical Edge Function requests.
  const deliveryKey = `${params.messageId}:${[...recipientIds].sort().join(",")}`;
  if (inFlightDeliveryKeys.has(deliveryKey)) return;
  inFlightDeliveryKeys.add(deliveryKey);
  recordPushDiagnostic("deliveryRecipientRequests", recipientIds.length);

  try {
    const { error } = await supabase.functions.invoke("send-push-notification", {
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
        },
      },
    });
    if (__DEV__ && error) console.warn("[push] message notification rejected:", error);
  } catch (error) {
    if (__DEV__) console.warn("[push] message notification failed:", error);
  } finally {
    inFlightDeliveryKeys.delete(deliveryKey);
  }
}