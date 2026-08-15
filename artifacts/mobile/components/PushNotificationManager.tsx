import { useEffect } from "react";
import { InteractionManager } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { safeRouter } from "@/lib/navUtils";
import {
  addNotificationResponseListener,
  addPushTokenListener,
  clearLastNotificationResponse,
  configurePushNotifications,
  disablePushToken,
  getLastNotificationResponse,
  getNotificationTarget,
  handleNotificationResponse,
  registerPushToken,
  PUSH_ACTION_MARK_READ,
  type PushNotificationResponse,
} from "@/lib/pushNotifications";
import { getNotificationPreferences } from "@/lib/notificationPreferences";
import { KEYS, storage } from "@/lib/storage/mmkv";

const handledResponseIds = new Set<string>();

export default function PushNotificationManager() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    let disposed = false;
    let registeredToken: string | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    let interactionTask: { cancel?: () => void } | null = null;

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
          registeredToken = token;
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

    const responseListener = addNotificationResponseListener((response) => {
      void handleResponse(response);
    });

    getLastNotificationResponse()
      .then((response) => {
        if (response) void handleResponse(response);
      })
      .catch(() => {});

    if (getNotificationPreferences().enabled) {
      configurePushNotifications();
      // Push registration can invoke a permission prompt and network request.
      // Keep both out of the first interaction frame after login.
      interactionTask = InteractionManager.runAfterInteractions(() => {
        retryTimer = setTimeout(register, 1200);
      });
    }

    return () => {
      disposed = true;
      interactionTask?.cancel?.();
      if (retryTimer) clearTimeout(retryTimer);
      tokenListener?.remove();
      responseListener?.remove();
      if (registeredToken) {
        disablePushToken(registeredToken).catch(() => {});
        storage.delete(KEYS.PUSH_TOKEN);
      }
    };
  }, [user?.id]);

  return null;
}