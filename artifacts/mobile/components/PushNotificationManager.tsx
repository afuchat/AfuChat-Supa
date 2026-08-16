import { useEffect } from "react";
import { AppState, InteractionManager } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { safeRouter } from "@/lib/navUtils";
import {
  addNotificationResponseListener,
  addPushTokenListener,
  clearLastNotificationResponse,
  configurePushNotifications,
  getLastNotificationResponse,
  getNotificationTarget,
  handleNotificationResponse,
  registerPushToken,
  PUSH_ACTION_MARK_READ,
  type PushNotificationResponse,
} from "@/lib/pushNotifications";
import { getNotificationPreferences } from "@/lib/notificationPreferences";
import { KEYS, storage } from "@/lib/storage/mmkv";
import { onConnectivityChange } from "@/lib/offlineStore";

const handledResponseIds = new Set<string>();

export default function PushNotificationManager() {
  const { user, session } = useAuth();

  useEffect(() => {
    // AuthContext can briefly expose a cached/synthetic user while Android
    // restores the real Supabase session. Do not register a push token during
    // that window: the edge function needs a verified bearer session, and a
    // failed registration previously left returning users with no device row.
    if (!user?.id || !session?.user?.id || session.user.id !== user.id) return;

    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let startupFallback: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    let interactionTask: { cancel?: () => void } | null = null;
    let registrationStarted = false;

    const handleResponse = async (response: PushNotificationResponse) => {
      const requestId = response.notification?.request?.identifier ?? "unknown";
      const responseKey = `${requestId}:${response.actionIdentifier}:${response.userText ?? ""}`;
      if (handledResponseIds.has(responseKey)) return;
      handledResponseIds.add(responseKey);

      try {
        await handleNotificationResponse(response, user.id);
        const { chatId } = getNotificationTarget(response);
        if (response.actionIdentifier !== PUSH_ACTION_MARK_READ && chatId) {
          safeRouter.push({ pathname: "/chat/[id]", params: { id: chatId } } as any);
        }
      } catch (error) {
        if (__DEV__) console.warn("[push] notification action failed:", error);
      } finally {
        clearLastNotificationResponse();
      }
    };

    const register = () => {
      if (!getNotificationPreferences().enabled) return;
      registerPushToken()
        .then((token) => {
          if (disposed) return;
          if (token) storage.setString(KEYS.PUSH_TOKEN, token);
          retryCount = 0;
        })
        .catch((error) => {
          if (__DEV__) console.warn("[push] token registration failed:", error);
          if (disposed || retryCount >= 3) return;
          const delay = Math.min(1000 * 2 ** retryCount, 15_000);
          retryCount += 1;
          retryTimer = setTimeout(register, delay);
        });
    };

    const tokenListener = addPushTokenListener((token) => {
      if (disposed) return;
      registeredToken = token;
      register();
    });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && getNotificationPreferences().enabled) {
        retryCount = 0;
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(register, 250);
      }
    });
    const connectivityCleanup = onConnectivityChange((online) => {
      if (!online || disposed || !getNotificationPreferences().enabled) return;
      retryCount = 0;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(register, 250);
    });

    const responseListener = addNotificationResponseListener((response) => {
      void handleResponse(response);
    });

    getLastNotificationResponse()
      .then((response) => {
        if (response) void handleResponse(response);
      })
      .catch(() => {});

    if (getNotificationPreferences().enabled) {
      // Notification channel setup, permission checks, and token registration
      // are all native work. Keep them out of the first release-build frame.
      const startRegistration = () => {
        if (registrationStarted || disposed) return;
        registrationStarted = true;
        configurePushNotifications();
        retryTimer = setTimeout(register, 1500);
      };
      interactionTask = InteractionManager.runAfterInteractions(startRegistration);
      // InteractionManager can remain queued on slower devices while an
      // animation or native interaction never fully settles. Do not let that
      // prevent the device from ever registering its push token.
      startupFallback = setTimeout(startRegistration, 2500);
    }

    return () => {
      disposed = true;
      interactionTask?.cancel?.();
      if (startupFallback) clearTimeout(startupFallback);
      if (retryTimer) clearTimeout(retryTimer);
      tokenListener?.remove();
      responseListener?.remove();
      appStateSubscription.remove();
      connectivityCleanup();
    };
  }, [user?.id, session?.user?.id]);

  return null;
}