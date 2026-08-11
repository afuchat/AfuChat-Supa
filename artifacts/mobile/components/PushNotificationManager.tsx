/**
 * PushNotificationManager
 * ─────────────────────────────────────────────────────────────────────────────
 * Mounts once at the root layout. Handles:
 *   - One-time foreground handler + category setup
 *   - Token registration when user signs in
 *   - Response listeners (tap / action buttons)
 *   - Badge clear on app foreground
 *   - Token refresh every 10 minutes while app is open
 */

import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/context/AuthContext";
import {
  setupNotificationHandler,
  setupNotificationCategories,
  registerForPushNotifications,
  setupNotificationListeners,
  clearBadge,
  getLastPushRegistrationError,
  setupExpoGoRealtimeBridge,
} from "@/lib/pushNotifications";

const RE_REGISTER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

export function PushNotificationManager() {
  const { user } = useAuth();
  const listenersCleanup = useRef<(() => void) | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRegisteredAt = useRef(0);

  // ── One-time: set foreground handler + action categories ───────────────────
  useEffect(() => {
    setupNotificationHandler();
    setupNotificationCategories();
  }, []);

  // ── Register token + start listeners when user signs in ───────────────────
  useEffect(() => {
    if (!user) {
      // Clean up listeners on sign-out
      listenersCleanup.current?.();
      listenersCleanup.current = null;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      return;
    }

    let cancelled = false;
    let retryCount = 0;
    const expoGoBridgeCleanup = setupExpoGoRealtimeBridge(user.id);

    const register = () => {
      if (cancelled) return;
      lastRegisteredAt.current = Date.now();
      registerForPushNotifications()
        .then((ok) => {
          if (cancelled || ok || retryCount >= 3) return;
          // Session restoration and the OS token service can finish after the
          // first render. Retry on a short backoff instead of waiting for the
          // next foreground event (or silently losing this device forever).
          retryCount += 1;
          retryTimer.current = setTimeout(register, retryCount * 5000);
          console.warn("[Push] registration retry scheduled:", getLastPushRegistrationError());
        })
        .catch((err) => {
          if (cancelled || retryCount >= 3) return;
          retryCount += 1;
          retryTimer.current = setTimeout(register, retryCount * 5000);
          console.warn("[Push] registration exception; retry scheduled:", err);
        });
    };

    register();

    // Set up notification response listeners
    if (!listenersCleanup.current) {
      listenersCleanup.current = setupNotificationListeners();
    }

    return () => {
      cancelled = true;
      expoGoBridgeCleanup();
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      listenersCleanup.current?.();
      listenersCleanup.current = null;
    };
  }, [user?.id]);

  // ── App comes to foreground — clear badge + periodic token refresh ─────────
  useEffect(() => {
    if (!user) return;

    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;

      clearBadge();

      const now = Date.now();
      if (now - lastRegisteredAt.current > RE_REGISTER_COOLDOWN_MS) {
        lastRegisteredAt.current = now;
        registerForPushNotifications().catch(() => {});
      }
    });

    return () => sub.remove();
  }, [user?.id]);

  return null;
}
