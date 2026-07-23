// ─── AfuChat Call Service ─────────────────────────────────────────────────────
// Background task that wakes up on high-priority FCM data messages even when
// the app is fully killed. This is the "CallService" analogue for React Native.
//
// HOW IT WORKS
//   1. The caller sends a high-priority FCM data message (via the
//      send-push-notification edge function with type:"missed_call").
//   2. Android wakes this task because the notification channel "calls" has
//      bypassDnd=true and MAX importance — the OS whitelists it for wakeup.
//   3. The task records the event; the notification body was already built by
//      the backend and shows in the system tray automatically.
//   4. When the user taps the notification, the app routes to /call-history.
//
// REQUIREMENT: This file must be imported at the very top of _layout.tsx
//   (before any React component renders) so TaskManager.defineTask is
//   registered synchronously at module scope. This is an Expo requirement.
//   The task is inactive in Expo Go — it only fires in development builds and
//   production builds where native modules are fully available.

export const CALL_SERVICE_TASK = "AFUCHAT_CALL_SERVICE";

try {
  const TaskManager = require("expo-task-manager");
  TaskManager.defineTask(CALL_SERVICE_TASK, ({ data, error }: any) => {
    if (error) {
      console.warn("[CallService] Background task error:", error.message);
      return;
    }
    const notifData = data?.notification?.request?.content?.data ?? {};
    if (notifData.type === "missed_call") {
      // The FCM backend already built and delivered the system tray
      // notification. No local notification needed — handled by backend.
      void notifData.callId;
    }
  });
} catch {
  // expo-task-manager not available (Expo Go) — silently skip.
}
