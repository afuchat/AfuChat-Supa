import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  addPushTokenListener,
  configurePushNotifications,
  disablePushToken,
  registerPushToken,
} from "@/lib/pushNotifications";

export default function PushNotificationManager() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    let disposed = false;
    let registeredToken: string | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;

    const register = () => {
      registerPushToken()
        .then((token) => {
          if (disposed) return;
          registeredToken = token;
          retryCount = 0;
        })
        .catch((error) => {
          console.error("[push] token registration failed:", error);
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

    configurePushNotifications();
    register();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      tokenListener?.remove();
      if (registeredToken) disablePushToken(registeredToken).catch(() => {});
    };
  }, [user?.id]);

  return null;
}