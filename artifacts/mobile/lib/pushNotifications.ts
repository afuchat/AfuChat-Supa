// @ts-nocheck
import { Platform } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { getPushSoundToken } from "@/lib/soundManager";
import { handleNotificationAction } from "@/lib/notificationActions";

// ── Notification Category IDs ─────────────────────────────────────────
export const NOTIF_CATEGORY = {
  MESSAGE_REPLY:   "afuchat_message_reply",
  POST_INTERACT:   "afuchat_post_interact",
  NEW_FOLLOWER:    "afuchat_new_follower",
  ORDER_UPDATE:    "afuchat_order_update",
  ORDER_SHIPPED:   "afuchat_order_shipped",
  GIFT_RECEIVED:   "afuchat_gift_received",
  MENTION:         "afuchat_mention",
} as const;

let _lastRegistrationError: string | null = null;
export function getLastPushRegistrationError(): string | null { return _lastRegistrationError; }

const _handledIds = new Set<string>();
function alreadyHandled(id: string): boolean {
  if (_handledIds.has(id)) return true;
  _handledIds.add(id);
  if (_handledIds.size > 50) {
    const first = _handledIds.values().next().value as string;
    _handledIds.delete(first);
  }
  return false;
}

let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;

try {
  Notifications = require("expo-notifications");
  Device = require("expo-device");

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    }),
  });
} catch {
  Notifications = null;
  Device = null;
}

// ─────────────────────────────────────────────────────────────────────
// Notification Categories (action buttons in status bar)
// ─────────────────────────────────────────────────────────────────────

export async function setupNotificationCategories(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.MESSAGE_REPLY, [
      {
        identifier: "chat_reply",
        buttonTitle: "Reply",
        options: { opensAppToForeground: false },
        textInput: {
          submitButtonTitle: "Send",
          placeholder: "Type a message…",
        },
      },
      {
        identifier: "mark_read",
        buttonTitle: "Mark Read",
        options: { opensAppToForeground: false, isDestructive: false },
      },
      {
        identifier: "snooze_1h",
        buttonTitle: "Snooze 1h",
        options: { opensAppToForeground: false, isDestructive: false },
      },
    ]);

    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.POST_INTERACT, [
      {
        identifier: "post_reply",
        buttonTitle: "Reply",
        options: { opensAppToForeground: false },
        textInput: {
          submitButtonTitle: "Send",
          placeholder: "Write your reply…",
        },
      },
      {
        identifier: "like",
        buttonTitle: "❤️ Like",
        options: { opensAppToForeground: false, isDestructive: false },
      },
      {
        identifier: "view_post",
        buttonTitle: "View Post",
        options: { opensAppToForeground: true },
      },
    ]);

    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.NEW_FOLLOWER, [
      {
        identifier: "follow_back",
        buttonTitle: "Follow Back",
        options: { opensAppToForeground: false, isDestructive: false },
      },
      {
        identifier: "view_profile",
        buttonTitle: "View Profile",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "mark_read",
        buttonTitle: "Dismiss",
        options: { opensAppToForeground: false, isDestructive: false },
      },
    ]);

    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.ORDER_UPDATE, [
      {
        identifier: "view_order",
        buttonTitle: "View Order",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "mark_read",
        buttonTitle: "Dismiss",
        options: { opensAppToForeground: false, isDestructive: false },
      },
    ]);

    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.ORDER_SHIPPED, [
      {
        identifier: "confirm_delivery",
        buttonTitle: "✓ Confirm Delivery",
        options: { opensAppToForeground: false, isDestructive: false },
      },
      {
        identifier: "view_order",
        buttonTitle: "View Order",
        options: { opensAppToForeground: true },
      },
    ]);

    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.GIFT_RECEIVED, [
      {
        identifier: "view_profile",
        buttonTitle: "👤 View Sender",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "mark_read",
        buttonTitle: "Dismiss",
        options: { opensAppToForeground: false, isDestructive: false },
      },
    ]);

    await Notifications.setNotificationCategoryAsync(NOTIF_CATEGORY.MENTION, [
      {
        identifier: "post_reply",
        buttonTitle: "Reply",
        options: { opensAppToForeground: false },
        textInput: {
          submitButtonTitle: "Send",
          placeholder: "Write your reply…",
        },
      },
      {
        identifier: "like",
        buttonTitle: "❤️ Like",
        options: { opensAppToForeground: false, isDestructive: false },
      },
      {
        identifier: "view_post",
        buttonTitle: "View Post",
        options: { opensAppToForeground: true },
      },
    ]);
  } catch (e) {
    console.warn("[PushNotif] Category setup failed:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Notification Channels (Android)
// ─────────────────────────────────────────────────────────────────────

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android" || !Notifications) return;
  try {
    const base = {
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      bypassDnd: false,
    };

    await Notifications.setNotificationChannelAsync("default", {
      name: "AfuChat",
      description: "General AfuChat notifications",
      importance: Notifications.AndroidImportance.MAX,
      lightColor: "#1f95ff",
      ...base,
    });

    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      description: "Chat messages from your contacts",
      importance: Notifications.AndroidImportance.MAX,
      lightColor: "#1f95ff",
      ...base,
    });

    await Notifications.setNotificationChannelAsync("social", {
      name: "Social",
      description: "Likes, follows, replies and mentions",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#007AFF",
      ...base,
    });

    await Notifications.setNotificationChannelAsync("marketplace", {
      name: "Marketplace & Payments",
      description: "Orders, escrow releases, disputes and payments",
      importance: Notifications.AndroidImportance.MAX,
      lightColor: "#34C759",
      ...base,
    });

    await Notifications.setNotificationChannelAsync("system", {
      name: "System & Account",
      description: "Account updates, verifications and admin messages",
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: false,
      ...base,
    });

    await Notifications.setNotificationChannelAsync("calls", {
      name: "Incoming Calls",
      description: "Voice and video call alerts",
      importance: Notifications.AndroidImportance.MAX,
      lightColor: "#34C759",
      bypassDnd: true,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: "default",
    });
  } catch (e) {
    console.warn("[PushNotif] Channel setup failed:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Registration — gets native FCM token (Android) / APNs token (iOS)
// and saves it to the profiles.fcm_token column via the edge function.
// ─────────────────────────────────────────────────────────────────────

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (!Notifications || !Device) return null;
  try {
    if (!Device.isDevice) return null;

    await setupNotificationChannels();
    await setupNotificationCategories();

    try {
      const { CALL_SERVICE_TASK } = require("./callService");
      await Notifications.registerTaskAsync(CALL_SERVICE_TASK);
    } catch {
      // expo-task-manager unavailable (Expo Go or web) — skip silently.
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return null;

    // Get the native device push token directly — FCM token on Android,
    // APNs device token on iOS. No Expo relay involved.
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = tokenData.data as string;

    // Primary: save via Supabase Edge Function (uses service role key server-side)
    let savedViaEdgeFn = false;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) {
        const { error: fnErr } = await supabase.functions.invoke("register-push-token", {
          body: { token, platform: Platform.OS },
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!fnErr) savedViaEdgeFn = true;
        else console.warn("[PushNotif] Edge function token save failed:", fnErr.message);
      }
    } catch (fnCatchErr: any) {
      console.warn("[PushNotif] Edge function unreachable:", fnCatchErr?.message);
    }

    // Fallback: direct Supabase client update
    if (!savedViaEdgeFn) {
      const { error: dbError } = await supabase
        .from("profiles")
        .update({ fcm_token: token })
        .eq("id", userId);
      if (dbError) console.warn("[PushNotif] Fallback DB save failed:", dbError.message);
    }

    return token;
  } catch (error: any) {
    const msg = error?.message || String(error);
    if (msg?.includes?.("removed from Expo Go")) {
      _lastRegistrationError = "Not available in Expo Go";
    } else {
      console.warn("[PushNotif] Registration failed:", msg);
      _lastRegistrationError = msg;
    }
    return null;
  }
}

export async function clearPushToken(userId: string): Promise<void> {
  try {
    await supabase.from("profiles").update({ fcm_token: null }).eq("id", userId);
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────
// Linked-account session registry
// ─────────────────────────────────────────────────────────────────────

let _switchAccount: ((userId: string) => Promise<{ success: boolean; error?: string }>) | null = null;
let _currentUserId: string | null = null;

export function registerSwitchAccount(
  fn: (userId: string) => Promise<{ success: boolean; error?: string }>
) {
  _switchAccount = fn;
}

export function setCurrentUserId(id: string | null) {
  _currentUserId = id;
}

// ─────────────────────────────────────────────────────────────────────
// Notification response routing (tap on notification body)
// ─────────────────────────────────────────────────────────────────────

async function routeNotificationResponse(response: any) {
  const id = response.notification.request.identifier;
  if (alreadyHandled(id)) return;

  const data = (response.notification.request.content.data || {}) as Record<string, string>;

  if (
    data.recipientUserId &&
    data.recipientUserId !== _currentUserId &&
    _switchAccount
  ) {
    try {
      await _switchAccount(data.recipientUserId);
      await new Promise<void>((resolve) => setTimeout(resolve, 350));
    } catch {}
  }

  if (response.actionIdentifier === "view_post" && data.postId) {
    router.push(`/p/${data.postId}` as any);
    return;
  }
  if (response.actionIdentifier === "view_profile" && data.actorId) {
    router.push(`/contact/${data.actorId}` as any);
    return;
  }
  if (response.actionIdentifier === "view_order") {
    if (data.orderId) router.push(`/shop/order/${data.orderId}` as any);
    else router.push("/shop/my-orders" as any);
    return;
  }
  if (data?.url) { router.push(data.url as any); return; }

  switch (data?.type) {
    case "message":
      if (data.chatId) router.push(`/chat/${data.chatId}` as any);
      break;
    case "order":
    case "escrow":
      if (data.orderId) router.push(`/shop/order/${data.orderId}` as any);
      else router.push("/shop/my-orders" as any);
      break;
    case "payment":
      router.push("/(tabs)/me" as any);
      break;
    case "channel":
    case "live":
      router.push("/channel/intro" as any);
      break;
    case "follow":
      if (data.actorId) router.push(`/contact/${data.actorId}` as any);
      break;
    case "like":
    case "reply":
    case "mention":
      if (data.postId) router.push(`/p/${data.postId}` as any);
      break;
    case "gift":
      router.push("/(tabs)/me" as any);
      break;
    case "incoming_call":
      // App was in background — user tapped the incoming call notification.
      // Navigate to the call screen in incoming mode; CallContext will handle
      // showing the accept/decline UI via IncomingCallModal.
      if (data.callId) {
        // Emit to CallContext via a global event so it can show IncomingCallModal
        try {
          const { emitPushIncomingCall } = require("@/lib/callPushBridge");
          emitPushIncomingCall({
            callId: data.callId,
            callerId: data.callerId ?? "",
            callerName: data.callerName ?? "Unknown",
            callerAvatar: data.callerAvatar || null,
            chatId: data.chatId || null,
          });
        } catch {}
      }
      break;
    case "missed_call":
      router.push("/call-history" as any);
      break;
    default:
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Notification listeners
// ─────────────────────────────────────────────────────────────────────

let _listenersActive = false;

export function setupNotificationListeners() {
  if (!Notifications) return () => {};
  if (_listenersActive) return () => {};
  _listenersActive = true;

  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      const { actionIdentifier, userText } = response as any;
      const data = (response.notification.request.content.data || {}) as Record<string, string>;
      handleNotificationAction(actionIdentifier, userText, data).then(() => {
        routeNotificationResponse(response);
      });
    }
  }).catch(() => {});

  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    const data = (notification.request.content.data || {}) as Record<string, string>;
    if (data.message_id) {
      supabase.auth.getUser()
        .then(({ data: { user } }) => {
          if (!user) return;
          supabase
            .from("message_status")
            .upsert(
              { message_id: data.message_id, user_id: user.id, delivered_at: new Date().toISOString() },
              { onConflict: "message_id,user_id", ignoreDuplicates: true }
            )
            .then(() => {})
            .catch(() => {});
        })
        .catch(() => {});
    }
  });

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    async (response) => {
      const { actionIdentifier, userText } = response as any;
      const data = (response.notification.request.content.data || {}) as Record<string, string>;

      await handleNotificationAction(actionIdentifier, userText, data);

      const DEFAULT = Notifications?.DEFAULT_ACTION_IDENTIFIER ?? "expo.modules.notifications.actions.DEFAULT";
      const isNavAction = [
        DEFAULT,
        "view_post",
        "view_profile",
        "view_order",
      ].includes(actionIdentifier);

      if (isNavAction) {
        routeNotificationResponse(response);
      }
    }
  );

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
    _listenersActive = false;
  };
}

// ─────────────────────────────────────────────────────────────────────
// Direct push sender — calls the send-push-notification edge function
// which sends via FCM HTTP v1 API using server-side credentials.
// ─────────────────────────────────────────────────────────────────────

export async function sendPushNotification(params: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  categoryIdentifier?: string;
}): Promise<void> {
  try {
    const soundToken = await getPushSoundToken();
    const { error } = await supabase.functions.invoke("send-push-notification", {
      body: {
        userId: params.userId,
        title: params.title,
        body: params.body,
        data: params.data,
        categoryIdentifier: params.categoryIdentifier,
        sound: soundToken ?? "default",
      },
    });
    if (error) console.warn("[PushNotif] send-push-notification edge fn error:", error.message);
  } catch (error: any) {
    console.warn("[PushNotif] sendPushNotification failed:", error?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Badge
// ─────────────────────────────────────────────────────────────────────

export async function clearBadge(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {}
}
