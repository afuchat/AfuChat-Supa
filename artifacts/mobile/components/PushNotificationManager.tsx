import { useEffect } from "react";
import { AppState, InteractionManager } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { safeRouter } from "@/lib/navUtils";
import {
  addNotificationResponseListener,
  addPushTokenListener,
  clearLastNotificationResponse,
  configurePushNotifications,
  dismissNotification,
  getLastNotificationResponse,
  getNotificationTarget,
  handleNotificationResponse,
  registerPushToken,
  getPushDiagnostics,
  isPushTokenRegistrationDue,
  PUSH_DIAGNOSTICS_ENABLED,
  PUSH_NOTIFICATIONS_DISABLED,
  PUSH_ACTION_MARK_READ,
  PUSH_ACTION_REPLY,
  type PushNotificationResponse,
} from "@/lib/pushNotifications";
import { getNotificationPreferences } from "@/lib/notificationPreferences";
import { KEYS, storage } from "@/lib/storage/mmkv";
import { onConnectivityChange } from "@/lib/offlineStore";

const handledResponseIds = new Set<string>();

export default function PushNotificationManager() {
  const { user, session } = useAuth();

  useEffect(() => {
    if (PUSH_NOTIFICATIONS_DISABLED) return;
    // AuthContext can briefly expose a cached/synthetic user while Android
    // restores the real Supabase session. Do not register a push token during
    // that window: the edge function needs a verified bearer session, and a
    // failed registration previously left returning users with no device row.
    if (!user?.id || !session?.user?.id || session.user.id !== user.id) return;

    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let startupFallback: ReturnType<typeof setTimeout> | null = null;
    let diagnosticsTimer: ReturnType<typeof setInterval> | null = null;
    let retryCount = 0;
    let interactionTask: { cancel?: () => void } | null = null;
    let registrationStarted = false;
    let registrationInFlight = false;
    let scheduledForce = false;

    const handleResponse = async (response: PushNotificationResponse) => {
      const requestId = response.notification?.request?.identifier ?? "unknown";
      const responseKey = `${requestId}:${response.actionIdentifier}:${response.userText ?? ""}`;
      if (handledResponseIds.has(responseKey)) return;
      handledResponseIds.add(responseKey);

      try {
        const { chatId } = getNotificationTarget(response);
        const isBackgroundAction =
          response.actionIdentifier === PUSH_ACTION_REPLY ||
          response.actionIdentifier === PUSH_ACTION_MARK_READ;
        if (!isBackgroundAction && chatId) {
          // Only explicit Open-style actions navigate. Reply and mark-read
          // complete in the background and must not launch the app.
          safeRouter.push({ pathname: "/chat/[id]", params: { id: chatId } } as any);
        }
        await handleNotificationResponse(response, user.id).catch((error) => {
          if (__DEV__) console.warn("[push] notification action failed:", error);
        });
      } catch (error) {
        if (__DEV__) console.warn("[push] notification action failed:", error);
      } finally {
        await dismissNotification(response).catch(() => {});
        clearLastNotificationResponse();
      }
    };

    const register = (force = false) => {
      if (!getNotificationPreferences().enabled || registrationInFlight) return;
      if (!force && !isPushTokenRegistrationDue()) return;
      registrationInFlight = true;
      registerPushToken()
        .then((token) => {
          if (disposed) return;
          if (token) storage.setString(KEYS.PUSH_TOKEN, token);
          retryCount = 0;
        })
        .catch((error) => {
          if (__DEV__ || PUSH_DIAGNOSTICS_ENABLED) {
            console.warn("[push] token registration failed:", error);
          }
          if (disposed || retryCount >= 3) return;
          const delay = Math.min(1000 * 2 ** retryCount, 15_000);
          retryCount += 1;
           scheduleRegister(delay);
         })
         .finally(() => {
           registrationInFlight = false;
        });
    };

    const scheduleRegister = (delay: number, force = false) => {
      scheduledForce = scheduledForce || force;
      if (retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        const nextForce = scheduledForce;
        scheduledForce = false;
        register(nextForce);
      }, delay);
    };

    const tokenListener = addPushTokenListener((nativeToken) => {
      if (disposed) return;
      const previousNativeToken = storage.getString(KEYS.PUSH_NATIVE_TOKEN);
      const nativeTokenChanged = previousNativeToken !== nativeToken;
      storage.setString(KEYS.PUSH_NATIVE_TOKEN, nativeToken);
      // The native device token can be emitted more than once during startup.
      // Only invalidate registration when the token actually changes.
      if (!nativeTokenChanged && !isPushTokenRegistrationDue()) return;
      if (nativeTokenChanged) storage.delete(KEYS.PUSH_TOKEN_REGISTERED_AT);
      scheduleRegister(0, true);
    });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && getNotificationPreferences().enabled && isPushTokenRegistrationDue()) {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
        scheduleRegister(250);
      }
    });
    const connectivityCleanup = onConnectivityChange((online) => {
      if (!online || disposed || !getNotificationPreferences().enabled || !isPushTokenRegistrationDue()) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      scheduleRegister(250);
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
        scheduleRegister(1500);
      };
      interactionTask = InteractionManager.runAfterInteractions(startRegistration);
      // InteractionManager can remain queued on slower devices while an
      // animation or native interaction never fully settles. Do not let that
      // prevent the device from ever registering its push token.
      startupFallback = setTimeout(startRegistration, 2500);
    }
    if (PUSH_DIAGNOSTICS_ENABLED) {
      diagnosticsTimer = setInterval(() => {
        console.info("[push diagnostics]", getPushDiagnostics());
      }, 30_000);
    }

    return () => {
      disposed = true;
      interactionTask?.cancel?.();
      if (startupFallback) clearTimeout(startupFallback);
      if (retryTimer) clearTimeout(retryTimer);
      if (diagnosticsTimer) clearInterval(diagnosticsTimer);
      tokenListener?.remove();
      responseListener?.remove();
      appStateSubscription.remove();
      connectivityCleanup();
    };
  }, [user?.id, session?.user?.id]);

  return null;
}