import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { KEYS, storage } from "@/lib/storage/mmkv";
import { isExpoGo } from "@/lib/expoEnvironment";

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
// Keep burst coalescing short enough that a single chat message feels
// immediate. The Edge Function already batches the actual device sends.
const PUSH_DELIVERY_DEBOUNCE_MS = 100;
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

function logPushDiagnostic(message: string, details?: unknown): void {
  if (!__DEV__ && !PUSH_DIAGNOSTICS_ENABLED) return;
  if (details === undefined) {
    console.warn(`[push] ${message}`);
  } else {
    console.warn(`[push] ${message}`, details);
  }
}

export function getPushDiagnostics(): PushDiagnostics {
  return { ...pushDiagnostics };
}

export function isPushTokenRegistrationDue(): boolean {
  if (PUSH_NOTIFICATIONS_DISABLED) return false;
  const token = storage.getString(KEYS.PUSH_TOKEN);
  const registeredAt = storage.getNumber(KEYS.PUSH_TOKEN_REGISTERED_AT) ?? 0;
  const registeredBuild = storage.getString(KEYS.PUSH_TOKEN_REGISTERED_BUILD);
  const currentBuild =
    Constants.expoConfig?.version ??
    Constants.manifest2?.extra?.expoClient?.version ??
    "";
  return (
    !token ||
    !registeredAt ||
    !registeredBuild ||
    (!!currentBuild && registeredBuild !== currentBuild) ||
    Date.now() - registeredAt >= PUSH_REGISTRATION_TTL_MS
  );
}

export const PUSH_CATEGORY_MESSAGE = "message";
export const PUSH_CATEGORY_CALL = "call";
export const PUSH_CATEGORY_SOCIAL = "social";
export const PUSH_CATEGORY_MARKETPLACE = "marketplace";
export const PUSH_CATEGORY_SUPPORT = "support";
export const PUSH_CATEGORY_SYSTEM = "system";
export const PUSH_CATEGORY_UNIVERSAL = "universal";
export const PUSH_REPLY_CATEGORIES = [
  PUSH_CATEGORY_MESSAGE,
  "chat",
  PUSH_CATEGORY_CALL,
  PUSH_CATEGORY_SOCIAL,
  "follow",
  "mention",
  PUSH_CATEGORY_MARKETPLACE,
  "order",
  "payment",
  PUSH_CATEGORY_SUPPORT,
  PUSH_CATEGORY_SYSTEM,
  PUSH_CATEGORY_UNIVERSAL,
] as const;
export const PUSH_BACKGROUND_NOTIFICATION_TASK = "AFUCHAT_NOTIFICATION_ACTION_TASK";
// Android notification channels are immutable after creation. A fresh ID is
// required so devices that created the old channel with low/blocked visibility
// receive the corrected high-importance public channel settings.
export const PUSH_ANDROID_CHANNEL_ID = "messages_v2";
export const PUSH_ANDROID_SILENT_CHANNEL_ID = "messages_silent_v1";
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

export type PushPreferenceSnapshot = {
  enabled?: boolean;
  messages?: boolean;
  calls?: boolean;
  social?: boolean;
  marketplace?: boolean;
  sounds?: boolean;
  previews?: boolean;
  quietHours?: boolean;
  quietStart?: string;
  quietEnd?: string;
  timezoneOffsetMinutes?: number;
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
  categoryId?: string;
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

function isNativePushToken(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 20 && value.length <= 4096;
}

function isDirectFcmToken(value: unknown): value is string {
  return (
    isNativePushToken(value) &&
    !/^(?:Expo|Exponent)PushToken\[[^\]]+\]$/.test(value.trim())
  );
}

let backgroundTaskDefined = false;
let backgroundTaskRegistration: Promise<void> | null = null;

/**
 * Android can execute notification action tasks while the app is backgrounded
 * or terminated. Defining this at module scope is required by expo-task-manager:
 * the headless JS bundle loads this module before it invokes the task.
 */
function defineBackgroundNotificationTask(): void {
  if (backgroundTaskDefined || Platform.OS === "web") return;
  try {
    const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
    TaskManager.defineTask(PUSH_BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
      if (error || !data || typeof data.actionIdentifier !== "string") return;
      if (data.actionIdentifier !== PUSH_ACTION_REPLY && data.actionIdentifier !== PUSH_ACTION_MARK_READ) return;

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;

      await handleNotificationResponse(data as PushNotificationResponse, userId);
    });
    backgroundTaskDefined = true;
  } catch (error) {
    logPushDiagnostic("background notification task unavailable", error);
  }
}

defineBackgroundNotificationTask();

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
      .setNotificationChannelAsync(PUSH_ANDROID_CHANNEL_ID, {
        name: "Messages",
        importance: notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: "default",
        lockscreenVisibility: notifications.AndroidNotificationVisibility.PUBLIC,
      })
      .catch(() => {});
    notifications
      .setNotificationChannelAsync(PUSH_ANDROID_SILENT_CHANNEL_ID, {
        name: "Messages (silent)",
        importance: notifications.AndroidImportance.LOW,
        vibrationPattern: [0, 0],
        sound: null,
        lockscreenVisibility: notifications.AndroidNotificationVisibility.PUBLIC,
      })
      .catch(() => {});
  }

  // Register the same reply/read/open contract for every notification source.
  // Reply and mark-read deliberately stay in the background; only Open is
  // allowed to foreground the app.
  for (const categoryId of PUSH_REPLY_CATEGORIES) {
    notifications
      .setNotificationCategoryAsync(categoryId, [
        {
          identifier: PUSH_ACTION_REPLY,
          buttonTitle: "Reply",
          textInput: {
            submitButtonTitle: "Send",
            placeholder: "Write a reply…",
          },
          options: { opensAppToForeground: false },
        },
        {
          identifier: PUSH_ACTION_MARK_READ,
          buttonTitle: "Mark as read",
          options: { opensAppToForeground: false },
        },
        {
          identifier: PUSH_ACTION_OPEN,
          buttonTitle: "Open",
          options: { opensAppToForeground: true },
        },
      ])
      .catch(() => {});
  }

  // The callback must be registered after defineTask, but does not need to
  // block the first frame or notification permission flow.
  if (Platform.OS !== "web" && !backgroundTaskRegistration) {
    const notificationsModule = notifications;
    backgroundTaskRegistration = notificationsModule
      .registerTaskAsync(PUSH_BACKGROUND_NOTIFICATION_TASK)
      .then(() => undefined)
      .catch((error) => {
        logPushDiagnostic("background notification task registration failed", error);
      });
  }

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
        : typeof data.replyToMessageId === "string"
          ? data.replyToMessageId
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

export async function registerPushToken(options?: {
  force?: boolean;
  preferences?: PushPreferenceSnapshot;
}): Promise<string | null> {
  if (PUSH_NOTIFICATIONS_DISABLED) return null;
  if (registrationInFlight) {
    recordPushDiagnostic("registrationDedupeHits");
    return registrationInFlight;
  }

  const registration = (async (): Promise<string | null> => {
    recordPushDiagnostic("registrationAttempts");
    const notifications = getNotifications();
    if (!notifications || Platform.OS === "web") return null;
    // Expo Go cannot expose the Firebase-backed native token required by the
    // direct-FCM registry. Avoid sending its Expo token-shaped value to the
    // server, where it is correctly rejected as invalid.
    if (isExpoGo()) return null;

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

    // Always register the native FCM token. ExpoPushToken values are
    // intentionally not requested because delivery is handled directly by
    // Firebase HTTP v1.
    const deviceToken = await withTimeout(
      () => notifications.getDevicePushTokenAsync(),
      PUSH_NATIVE_TIMEOUT_MS,
      "FCM device token request",
    );
    // expo-notifications labels native tokens by platform ("android"/"ios"),
    // not by provider ("fcm"). On Android, the token data is the FCM token.
    if (
      deviceToken.type !== Platform.OS ||
      !isDirectFcmToken(deviceToken.data)
    ) {
      throw new Error(
        `The native build did not return a valid direct FCM token (type=${String(deviceToken.type)}).`,
      );
    }
    const token = deviceToken.data.trim();

    const previousToken = storage.getString(KEYS.PUSH_TOKEN);
    const previousRegistrationAt = storage.getNumber(KEYS.PUSH_TOKEN_REGISTERED_AT) ?? 0;
    const currentBuild =
      Constants.expoConfig?.version ??
      Constants.manifest2?.extra?.expoClient?.version ??
      "";
    const previousBuild = storage.getString(KEYS.PUSH_TOKEN_REGISTERED_BUILD);
    if (
      !options?.force &&
      previousToken === token &&
      previousRegistrationAt > 0 &&
      previousBuild === currentBuild &&
      Date.now() - previousRegistrationAt < PUSH_REGISTRATION_TTL_MS
    ) {
      recordPushDiagnostic("registrationCacheHits");
      return token;
    }

    recordPushDiagnostic("registrationNetworkRequests");
    const { error } = await withTimeout(
      () =>
        supabase.functions.invoke("register-push-token", {
          body: {
            token,
            platform: Platform.OS,
            provider: "fcm",
            preferences: options?.preferences,
          },
        }),
      PUSH_NETWORK_TIMEOUT_MS,
      "push token registration",
    );
    if (error) throw error;

    storage.setString(KEYS.PUSH_TOKEN, token);
    storage.setNumber(KEYS.PUSH_TOKEN_REGISTERED_AT, Date.now());
    if (currentBuild) storage.setString(KEYS.PUSH_TOKEN_REGISTERED_BUILD, currentBuild);
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
  if (isExpoGo()) return;
  if (!isDirectFcmToken(token)) return;
  await withTimeout(
    () =>
      supabase.functions.invoke("register-push-token", {
        body: {
          token,
          platform: Platform.OS,
          provider: "fcm",
          enabled: false,
        },
      }),
    PUSH_NETWORK_TIMEOUT_MS,
    "push token disable",
  );
}

export function addPushTokenListener(
  onTokenChanged: (nativeToken: string) => void,
): { remove: () => void } | null {
  if (PUSH_NOTIFICATIONS_DISABLED) return null;
  const notifications = getNotifications();
  if (!notifications) return null;
  const subscription = notifications.addPushTokenListener((event) => {
    // expo-notifications emits a native device token here. The registration
    // request revalidates it as an FCM token before persisting it.
    if (isNativePushToken(event.data)) onTokenChanged(event.data.trim());
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
     const { data, error } = await withTimeout(
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
              categoryId: params.categoryId ?? PUSH_CATEGORY_MESSAGE,
             data: {
               chatId: params.chatId,
               messageId: params.messageId,
               senderId: params.senderId ?? null,
               senderName: params.senderName,
               senderAvatarUrl: params.senderAvatarUrl ?? null,
               attachmentUrl: params.attachmentUrl ?? null,
               attachmentType: params.attachmentType ?? null,
                categoryId: params.categoryId ?? PUSH_CATEGORY_MESSAGE,
                groupKey: `sender:${params.senderId ?? params.chatId}`,
             },
           },
         }),
       PUSH_NETWORK_TIMEOUT_MS,
       "push notification delivery",
     );
     if (error) {
       logPushDiagnostic("message notification rejected", error);
     } else if (data && typeof data === "object" && "ok" in data && data.ok === false) {
       logPushDiagnostic("message notification provider failure", {
         requestId: "requestId" in data ? data.requestId : undefined,
         response: data,
       });
     } else if (PUSH_DIAGNOSTICS_ENABLED && data && typeof data === "object") {
       console.info("[push] message notification result", data);
     }
  } catch (error) {
     logPushDiagnostic("message notification failed", error);
  } finally {
    inFlightDeliveryKeys.delete(deliveryKey);
  }
}

export function notifyChatRecipients(params: NotifyChatRecipientsParams): void {
  // Web senders still need to notify native recipients. The browser does not
  // register a device token, but it can invoke the authenticated Edge Function
  // which delivers directly to the recipient's Android/iOS FCM device.
  if (PUSH_NOTIFICATIONS_DISABLED || params.recipientIds.length === 0) return;
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