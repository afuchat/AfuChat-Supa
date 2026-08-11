/**
 * pushNotifications.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side push notification setup.
 *
 * Responsibilities:
 *   1. Request OS permission + obtain native FCM/APNs and Expo tokens
 *   2. Register token with the backend (register-push-token edge fn)
 *   3. Set up foreground notification handler
 *   4. Register notification action categories (Reply, Mark Read)
 *   5. Listen for notification responses (taps + action buttons)
 *   6. Badge management
 *
 * Push DISPATCH is server-side only: DB triggers → push-notification-trigger
 * edge function. This file never calls any "send" endpoint directly.
 */

import { Platform } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { isExpoGo } from "@/lib/expoEnvironment";

// ── Lazy-loaded modules (safe on web / Expo Go without native modules) ────────

let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;

function getNotifications(): typeof import("expo-notifications") | null {
  if (Platform.OS === "web" || isExpoGo()) return null;
  if (Notifications) return Notifications;
  try {
    Notifications = require("expo-notifications");
    Device = require("expo-device");
    return Notifications;
  } catch {
    return null;
  }
}

// ── Notification Category IDs ─────────────────────────────────────────────────

export const NOTIF_CATEGORY = {
  MESSAGE_REPLY: "afuchat_message_reply",
  POST_INTERACT: "afuchat_post_interact",
  ORDER_UPDATE:  "afuchat_order_update",
} as const;

// ── Dedup: prevent double-handling the same notification response ─────────────

const _handledIds = new Set<string>();
function alreadyHandled(id: string): boolean {
  if (_handledIds.has(id)) return true;
  _handledIds.add(id);
  if (_handledIds.size > 100) {
    const first = _handledIds.values().next().value as string;
    _handledIds.delete(first);
  }
  return false;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. FOREGROUND HANDLER
// ═════════════════════════════════════════════════════════════════════════════

export function setupNotificationHandler(): void {
  // Android Expo Go no longer includes remote push notification support from
  // SDK 53 onward. Avoid touching the native notification module there.
  if (Platform.OS === "web" || isExpoGo()) return;

  const N = getNotifications();
  if (!N) return;

  N.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = (notification.request.content.data ?? {}) as Record<string, string>;

      // Suppress banner when user is already viewing that exact chat
      const isChatMsg =
        data.type === "message" || data.notifType === "new_message";

      if (isChatMsg) {
        try {
          const { getActiveChatId } = require("@/lib/chatVisited");
          const activeChatId = getActiveChatId() as string | null;
          const isActive =
            activeChatId != null &&
            (data.chatId === activeChatId || data.chat_id === activeChatId);

          if (isActive) {
            return {
              shouldShowAlert: false,
              shouldPlaySound: false,
              shouldSetBadge: true,
              shouldShowBanner: false,
              shouldShowList: false,
              priority: N.AndroidNotificationPriority.DEFAULT,
            };
          }
        } catch {}
      }

      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
        priority: N.AndroidNotificationPriority.MAX,
      };
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. PERMISSION + TOKEN REGISTRATION
// ═════════════════════════════════════════════════════════════════════════════

let _lastRegistrationError: string | null = null;
export function getLastPushRegistrationError(): string | null {
  return _lastRegistrationError;
}

let _registrationInFlight: Promise<boolean> | null = null;
const REGISTRATION_RETRIES = 3;

/**
 * Register at most once at a time and retry transient startup/auth failures.
 * App startup commonly races SecureStore hydration, Supabase session restore,
 * and the OS token service. Without this guard, two registrations can also
 * overwrite each other with partial token sets.
 */
export function registerForPushNotifications(): Promise<boolean> {
  if (_registrationInFlight) return _registrationInFlight;

  _registrationInFlight = (async () => {
    for (let attempt = 0; attempt < REGISTRATION_RETRIES; attempt += 1) {
      const registered = await registerForPushNotificationsOnce();
      if (registered) return true;

      const error = _lastRegistrationError ?? "";
      const permanent =
        error.includes("permission denied") ||
        error.includes("not supported on simulator") ||
        error.includes("require an Expo development build");
      if (permanent || attempt === REGISTRATION_RETRIES - 1) break;

      await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    }
    return false;
  })().finally(() => {
    _registrationInFlight = null;
  });

  return _registrationInFlight;
}

async function registerForPushNotificationsOnce(): Promise<boolean> {
  _lastRegistrationError = null;

  if (Platform.OS === "web") return false;
  if (isExpoGo()) {
    _lastRegistrationError =
      "Remote push notifications require an Expo development build or standalone app";
    return false;
  }

  const N = getNotifications();
  if (!N || !Device) {
    _lastRegistrationError = "Native notification module is unavailable";
    return false;
  }

  if (!Device.isDevice) {
    // Simulators cannot receive push notifications
    _lastRegistrationError = "Push notifications not supported on simulator";
    return false;
  }

  try {
    // Request permission
    const { status: existingStatus } = await N.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await N.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      _lastRegistrationError = "Push notification permission denied";
      return false;
    }

    // Create Android notification channels
    if (Platform.OS === "android") {
      await _createAndroidChannels(N);
    }

    // Android's native device token is an FCM registration token. iOS returns
    // an APNs device token here, which cannot be sent to FCM HTTP v1. iOS
    // therefore also needs an Expo push token until a direct APNs provider is
    // configured on the server.
    let fcmToken: string | null = null;
    let expoPushToken: string | null = null;

    if (Platform.OS === "android") {
      try {
        const tokenData = await N.getDevicePushTokenAsync();
        if (tokenData?.data) fcmToken = String(tokenData.data);
      } catch (tokenErr: any) {
        console.warn("[Push] native device token unavailable:", tokenErr);
      }
    }

    try {
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
      if (!projectId) {
        _lastRegistrationError = "Expo project ID is not configured";
        return false;
      }
      const tokenData = await N.getExpoPushTokenAsync({ projectId });
      if (tokenData?.data) expoPushToken = String(tokenData.data);
    } catch (tokenErr: any) {
      console.warn("[Push] Expo push token unavailable:", tokenErr);
    }

    if (Platform.OS === "ios" && !expoPushToken) {
      _lastRegistrationError =
        "Failed to obtain an Expo push token for iOS delivery";
      return false;
    }

    if (!fcmToken && !expoPushToken) {
      _lastRegistrationError = "Failed to obtain a native or Expo push token";
      return false;
    }

    // Register with backend
    const registrationBody: Record<string, unknown> = {
      platform: Platform.OS,
    };
    if (fcmToken) registrationBody.fcmToken = fcmToken;
    if (expoPushToken) registrationBody.expoPushToken = expoPushToken;

    const { error } = await supabase.functions.invoke("register-push-token", {
      body: registrationBody,
    });

    if (error) {
      _lastRegistrationError = `Token registration failed: ${error.message}`;
      console.warn("[Push] register-push-token error:", error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    _lastRegistrationError = err?.message ?? "Unknown error during push setup";
    console.warn("[Push] registerForPushNotifications error:", err);
    return false;
  }
}

async function _createAndroidChannels(
  N: typeof import("expo-notifications"),
): Promise<void> {
  const channels = [
    {
      id: "messages",
      name: "Messages",
      importance: N.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#1f95ff",
      showBadge: true,
    },
    {
      id: "calls",
      name: "Calls",
      importance: N.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 500, 500, 500],
      lightColor: "#34C759",
      showBadge: true,
    },
    {
      id: "social",
      name: "Social",
      importance: N.AndroidImportance.HIGH,
      sound: "default",
      showBadge: true,
    },
    {
      id: "marketplace",
      name: "Orders & Payments",
      importance: N.AndroidImportance.HIGH,
      sound: "default",
      showBadge: true,
    },
    {
      id: "default",
      name: "General",
      importance: N.AndroidImportance.DEFAULT,
      sound: "default",
      showBadge: true,
    },
  ];

  for (const ch of channels) {
    try {
      await N.setNotificationChannelAsync(ch.id, ch as any);
    } catch {}
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. NOTIFICATION CATEGORIES (action buttons)
// ═════════════════════════════════════════════════════════════════════════════

export async function setupNotificationCategories(): Promise<void> {
  if (Platform.OS === "web" || isExpoGo()) return;

  const N = getNotifications();
  if (!N) return;

  try {
    // Message: Reply (inline text) + Mark Read
    await N.setNotificationCategoryAsync(NOTIF_CATEGORY.MESSAGE_REPLY, [
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
    ]);

    // Post: Like + Comment
    await N.setNotificationCategoryAsync(NOTIF_CATEGORY.POST_INTERACT, [
      {
        identifier: "view_post",
        buttonTitle: "View",
        options: { opensAppToForeground: true },
      },
    ]);

    // Order: View Order + Confirm Delivery
    await N.setNotificationCategoryAsync(NOTIF_CATEGORY.ORDER_UPDATE, [
      {
        identifier: "view_order",
        buttonTitle: "View Order",
        options: { opensAppToForeground: true },
      },
      {
        identifier: "confirm_delivery",
        buttonTitle: "Confirm Delivery",
        options: { opensAppToForeground: false, isDestructive: false },
      },
    ]);
  } catch (err) {
    console.warn("[Push] setupNotificationCategories error:", err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. NOTIFICATION LISTENERS (tap + action handlers)
// ═════════════════════════════════════════════════════════════════════════════

let _listenersActive = false;

export function setupNotificationListeners(): () => void {
  if (Platform.OS === "web" || isExpoGo()) return () => {};

  const N = getNotifications();
  if (!N || _listenersActive) return () => {};

  _listenersActive = true;

  // Foreground notification received (informational only — handler above decides display)
  const receivedSub = N.addNotificationReceivedListener((notification) => {
    const data = (notification.request.content.data ?? {}) as Record<string, string>;
    console.log("[Push] notification received:", data.type ?? "unknown");
  });

  // User tapped a notification or triggered an action button
  const responseSub = N.addNotificationResponseReceivedListener(async (response) => {
    const id = response.notification.request.identifier;
    if (alreadyHandled(id)) return;

    const data = (response.notification.request.content.data ?? {}) as Record<string, string>;
    const actionId = response.actionIdentifier;

    // Action buttons (Reply, Mark Read, etc.)
    if (
      actionId !== N.DEFAULT_ACTION_IDENTIFIER &&
      actionId !== "expo.modules.notifications.actions.DISMISSED"
    ) {
      try {
        const { handleNotificationAction } = require("@/lib/notificationActions");
        await handleNotificationAction(actionId, data, response);
      } catch (err) {
        console.warn("[Push] handleNotificationAction error:", err);
      }
      return;
    }

    // Plain tap → navigate
    if (actionId === N.DEFAULT_ACTION_IDENTIFIER) {
      _routeNotification(data);
    }
  });

  return () => {
    receivedSub.remove();
    responseSub.remove();
    _listenersActive = false;
  };
}

function _routeNotification(data: Record<string, string>): void {
  const type = data.type ?? data.notifType;

  try {
    switch (type) {
      case "message":
      case "new_message":
        if (data.chatId || data.chat_id) {
          router.push(`/chat/${data.chatId ?? data.chat_id}` as any);
        }
        break;

      case "call": {
        // Reconstruct the IncomingCallNotice from push payload and deliver it to
        // CallContext via the push bridge. This fires when the app was backgrounded
        // and the user taps the incoming-call notification — the Realtime inbox
        // broadcast was never received, so the engine is still idle. acceptCall()
        // already handles idle → incoming_ringing promotion gracefully.
        const callId    = data.callId    ?? data.call_id    ?? "";
        const callerId  = data.callerId  ?? data.caller_id  ?? "";
        const callerName = data.callerName ?? data.caller_name ?? "Someone";
        const callerAvatar = data.callerAvatar ?? data.caller_avatar ?? null;
        const chatId    = data.chatId    ?? data.chat_id    ?? null;
        if (callId && callerId) {
          const { emitPushIncomingCall } = require("@/lib/callPushBridge");
          emitPushIncomingCall({ callId, callerId, callerName, callerAvatar, chatId });
        }
        break;
      }

      case "follow":
        if (data.actorHandle || data.actor_handle) {
          router.push(`/${data.actorHandle ?? data.actor_handle}` as any);
        }
        break;

      case "like":
      case "comment":
      case "mention":
      case "reply":
        if (data.postId || data.post_id) {
          router.push(`/post/${data.postId ?? data.post_id}` as any);
        } else if (data.chatId || data.chat_id) {
          router.push(`/chat/${data.chatId ?? data.chat_id}` as any);
        }
        break;

      case "order":
        if (data.orderId || data.order_id) {
          router.push(`/shop/order/${data.orderId ?? data.order_id}` as any);
        }
        break;

      case "payment":
        router.push("/settings" as any); // Navigate to wallet/AfuPay
        break;

      default:
        break;
    }
  } catch (err) {
    console.warn("[Push] _routeNotification error:", err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. BADGE
// ═════════════════════════════════════════════════════════════════════════════

export async function clearBadge(): Promise<void> {
  if (Platform.OS === "web" || isExpoGo()) return;

  const N = getNotifications();
  if (!N) return;
  try {
    await N.setBadgeCountAsync(0);
  } catch {}
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. AUTH HELPERS (called from AuthContext)
// ═════════════════════════════════════════════════════════════════════════════

let _currentUserId: string | null = null;

/** Called by AuthContext when the signed-in user changes. */
export function setCurrentUserId(userId: string | null): void {
  _currentUserId = userId;
}

export function getCurrentUserId(): string | null {
  return _currentUserId;
}

/**
 * Clears the stored FCM token from the backend when the user signs out,
 * so they no longer receive push notifications on this device.
 */
export async function clearPushToken(_userId?: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    // Clear both token channels for this user/device.
    await supabase.functions.invoke("register-push-token", {
      body: { token: "__clear__", fcmToken: "__clear__", expoPushToken: "__clear__", platform: Platform.OS },
    });
  } catch {}
}

let _switchAccountCallback: ((userId: string) => Promise<{ success: boolean; error?: string }>) | null = null;

/** Registers a callback invoked when the active account switches. */
export function registerSwitchAccount(
  fn: (userId: string) => Promise<{ success: boolean; error?: string }>,
): void {
  _switchAccountCallback = fn;
}

/** Invoke the registered switch-account callback (call from account switcher). */
export function notifySwitchAccount(userId: string): void {
  void _switchAccountCallback?.(userId);
}
