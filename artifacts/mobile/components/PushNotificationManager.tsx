import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { safeRouter } from "@/lib/navUtils";
import {
  addNotificationResponseListener,
  clearLastNotificationResponse,
  configurePushNotifications,
  getLastNotificationResponse,
  getNotificationTarget,
  handleNotificationResponse,
  registerPushToken,
  PUSH_ACTION_OPEN,
} from "@/lib/pushNotifications";

export default function PushNotificationManager() {
  const { user, session } = useAuth();

  useEffect(() => {
    if (Platform.OS === "web" || !user?.id || session?.user?.id !== user.id) return;
    configurePushNotifications();
    let active = true;
    const handleResponse = async (response: any) => {
      if (!active) return;
      const { chatId } = getNotificationTarget(response);
      if (response.actionIdentifier === PUSH_ACTION_OPEN && chatId) {
        safeRouter.push({ pathname: "/chat/[id]", params: { id: chatId } } as any);
      }
      try {
        await handleNotificationResponse(response, user.id);
      } finally {
        clearLastNotificationResponse();
      }
    };
    const responseSubscription = addNotificationResponseListener((response) => {
      void handleResponse(response);
    });
    getLastNotificationResponse().then((response) => {
      if (response) void handleResponse(response);
    }).catch(() => {});
    const register = () => {
      if (active) registerPushToken().catch((error) => {
        if (__DEV__) console.warn("[push] registration failed", error);
      });
    };
    const timer = setTimeout(register, 1500);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") register();
    });
    return () => {
      active = false;
      clearTimeout(timer);
      subscription.remove();
      responseSubscription?.remove();
    };
  }, [user?.id, session?.user?.id]);

  return null;
}