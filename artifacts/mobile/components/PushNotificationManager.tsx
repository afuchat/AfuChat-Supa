import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/context/AuthContext";
import {
  registerForPushNotifications,
  setupNotificationChannels,
  setupNotificationListeners,
  clearBadge,
} from "@/lib/pushNotifications";
const RE_REGISTER_COOLDOWN_MS = 10 * 60 * 1000;

export function PushNotificationManager() {
  const { user } = useAuth();
  const registered = useRef(false);
  const lastRegisteredAt = useRef(0);

  useEffect(() => {
    setupNotificationChannels();
  }, []);

  useEffect(() => {
    if (!user || registered.current) return;

    registered.current = true;
    lastRegisteredAt.current = Date.now();
    registerForPushNotifications(user.id).catch(() => {});
    const cleanup = setupNotificationListeners();

    return () => {
      cleanup();
      registered.current = false;
    };
  }, [user?.id]);

  // ── App foreground — clear badge and refresh token ─────────────────
  useEffect(() => {
    if (!user) return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        clearBadge();
        const now = Date.now();
        if (now - lastRegisteredAt.current > RE_REGISTER_COOLDOWN_MS) {
          lastRegisteredAt.current = now;
          registerForPushNotifications(user.id).catch(() => {});
        }
      }
    });

    return () => subscription.remove();
  }, [user?.id]);

  return null;
}
