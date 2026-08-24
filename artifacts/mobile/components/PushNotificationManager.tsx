import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { configurePushNotifications, registerPushToken } from "@/lib/pushNotifications";

export default function PushNotificationManager() {
  const { user, session } = useAuth();

  useEffect(() => {
    if (Platform.OS === "web" || !user?.id || session?.user?.id !== user.id) return;
    configurePushNotifications();
    let active = true;
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
    };
  }, [user?.id, session?.user?.id]);

  return null;
}