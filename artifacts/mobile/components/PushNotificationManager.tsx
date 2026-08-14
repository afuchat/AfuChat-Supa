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
    const tokenListener = addPushTokenListener((token) => {
      if (disposed) return;
      registeredToken = token;
      registerPushToken().catch(() => {});
    });

    configurePushNotifications();
    registerPushToken()
      .then((token) => {
        if (!disposed) registeredToken = token;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      tokenListener?.remove();
      if (registeredToken) disablePushToken(registeredToken).catch(() => {});
    };
  }, [user?.id]);

  return null;
}