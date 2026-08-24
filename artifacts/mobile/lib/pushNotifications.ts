import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { supabase } from "@/lib/supabase";

type NotificationsModule = typeof import("expo-notifications");
type PushResponse = {
  actionIdentifier: string;
  userText?: string;
  notification?: { request?: { identifier?: string; content?: { data?: Record<string, unknown> } } };
};

export const PUSH_ACTION_REPLY = "reply";
export const PUSH_ACTION_MARK_READ = "mark_read";
export const PUSH_ACTION_OPEN = "open";
export const PUSH_CATEGORY_MESSAGE = "message";
export const PUSH_BACKGROUND_TASK = "AFUCHAT_NOTIFICATION_ACTION_TASK";

let moduleCache: NotificationsModule | null | undefined;
let backgroundTaskRegistration: Promise<void> | null = null;
function getNotifications(): NotificationsModule | null {
  if (moduleCache !== undefined) return moduleCache;
  if (Platform.OS === "web") return (moduleCache = null);
  try {
    moduleCache = require("expo-notifications") as NotificationsModule;
  } catch {
    moduleCache = null;
  }
  return moduleCache;
}

function getTarget(response: PushResponse) {
  const data = response.notification?.request?.content?.data ?? {};
  return {
    chatId: typeof data.chatId === "string" ? data.chatId : typeof data.chat_id === "string" ? data.chat_id : null,
    messageId: typeof data.messageId === "string" ? data.messageId : typeof data.message_id === "string" ? data.message_id : null,
  };
}

async function markRead(response: PushResponse, userId: string) {
  const { chatId, messageId } = getTarget(response);
  if (!chatId && !messageId) return;
  const now = new Date().toISOString();
  if (messageId) {
    await supabase.from("message_status").upsert(
      { message_id: messageId, user_id: userId, delivered_at: now, read_at: now },
      { onConflict: "message_id,user_id" },
    );
    return;
  }
  const { data } = await supabase.from("messages").select("id").eq("chat_id", chatId).neq("sender_id", userId).limit(200);
  if (data?.length) {
    await supabase.from("message_status").upsert(
      data.map((message) => ({ message_id: message.id, user_id: userId, delivered_at: now, read_at: now })),
      { onConflict: "message_id,user_id" },
    );
  }
}

export async function handleNotificationResponse(response: PushResponse, userId: string) {
  if (response.actionIdentifier === PUSH_ACTION_MARK_READ) {
    await markRead(response, userId);
    return;
  }
  if (response.actionIdentifier !== PUSH_ACTION_REPLY) return;
  const text = response.userText?.trim();
  const { chatId, messageId } = getTarget(response);
  if (!text || !chatId) return;
  await supabase.from("messages").insert({
    chat_id: chatId,
    sender_id: userId,
    encrypted_content: text,
    ...(messageId ? { reply_to_message_id: messageId } : {}),
  });
  await markRead(response, userId);
}

function defineBackgroundTask() {
  if (Platform.OS === "web") return;
  try {
    const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
    TaskManager.defineTask(PUSH_BACKGROUND_TASK, async ({ data, error }: any) => {
      if (error || !data || !data.actionIdentifier) return;
      if (data.actionIdentifier !== PUSH_ACTION_REPLY && data.actionIdentifier !== PUSH_ACTION_MARK_READ) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (userId) await handleNotificationResponse(data as PushResponse, userId);
    });

    // Defining a task is not enough: Expo only delivers background action
    // responses to tasks that have also been registered with the notifications
    // module. Keep this registration idempotent because this module can be
    // imported by both the root layout and a notification manager.
    const notifications = getNotifications();
    if (notifications?.registerTaskAsync) {
      backgroundTaskRegistration = notifications.registerTaskAsync(PUSH_BACKGROUND_TASK)
        .then(() => undefined)
        .catch((error) => {
          if (__DEV__) console.warn("[push] background action task registration failed", error);
        });
    }
  } catch (error) {
    if (__DEV__) console.warn("[push] background action task unavailable", error);
  }
}
defineBackgroundTask();

export function configurePushNotifications() {
  const notifications = getNotifications();
  if (!notifications) return;
  // Retry registration if the native notifications module was not ready during
  // module evaluation (common during a cold start on Android).
  if (!backgroundTaskRegistration && notifications.registerTaskAsync) {
    backgroundTaskRegistration = notifications.registerTaskAsync(PUSH_BACKGROUND_TASK)
      .then(() => undefined)
      .catch((error) => {
        if (__DEV__) console.warn("[push] background action task registration failed", error);
      });
  }
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
  notifications.setNotificationCategoryAsync(PUSH_CATEGORY_MESSAGE, [
    { identifier: PUSH_ACTION_REPLY, buttonTitle: "Reply", textInput: { submitButtonTitle: "Send", placeholder: "Reply..." }, options: { opensAppToForeground: false } },
    { identifier: PUSH_ACTION_MARK_READ, buttonTitle: "Mark as read", options: { opensAppToForeground: false } },
    { identifier: PUSH_ACTION_OPEN, buttonTitle: "Open", options: { opensAppToForeground: true, isDestructive: false } },
  ]).catch(() => {});
  if (Platform.OS === "android") {
    notifications.setNotificationChannelAsync("messages_v2", {
      name: "Messages",
      importance: notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
    }).catch(() => {});
  }
}

export async function registerPushToken(): Promise<string | null> {
  const notifications = getNotifications();
  if (!notifications || Platform.OS === "web" || !Device.isDevice) return null;
  configurePushNotifications();
  const current = await notifications.getPermissionsAsync();
  const permission = (current as any).status === "granted" ? current : await notifications.requestPermissionsAsync();
  if ((permission as any).status !== "granted") return null;
  const token = await notifications.getDevicePushTokenAsync();
  if (token.type !== Platform.OS || typeof token.data !== "string" || token.data.length < 20 || /^(Expo|Exponent)PushToken\[/.test(token.data)) {
    throw new Error("The native build did not return a direct FCM token.");
  }
  const { error } = await supabase.functions.invoke("register-push-token", {
    body: { token: token.data, platform: Platform.OS, provider: "fcm", appVersion: Constants.expoConfig?.version ?? "" },
  });
  if (error) throw error;
  return token.data;
}

export function addNotificationResponseListener(listener: (response: PushResponse) => void) {
  return getNotifications()?.addNotificationResponseReceivedListener(listener as any) ?? null;
}

export async function getLastNotificationResponse() {
  const response = await getNotifications()?.getLastNotificationResponseAsync();
  if (!response) return response as null | undefined;
  return response as PushResponse;
}

export function clearLastNotificationResponse() {
  getNotifications()?.clearLastNotificationResponse?.();
}

export function getNotificationTarget(response: PushResponse) {
  return getTarget(response);
}

export type NotifyChatRecipientsParams = {
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

export async function notifyChatRecipients(params: NotifyChatRecipientsParams) {
  const recipientUserIds = [...new Set(params.recipientIds)].filter((id) => id && id !== params.senderId);
  if (!recipientUserIds.length) return;
  const { error } = await supabase.functions.invoke("send-push-notification", {
    body: {
      recipientUserIds,
      senderId: params.senderId,
      senderName: params.senderName,
      senderAvatarUrl: params.senderAvatarUrl ?? null,
      body: params.body,
      chatId: params.chatId,
      messageId: params.messageId,
      attachmentUrl: params.attachmentUrl ?? null,
      attachmentType: params.attachmentType ?? null,
      categoryId: PUSH_CATEGORY_MESSAGE,
      data: { chatId: params.chatId, messageId: params.messageId, categoryId: PUSH_CATEGORY_MESSAGE },
    },
  });
  if (error && __DEV__) console.warn("[push] delivery request failed", error.message);
}