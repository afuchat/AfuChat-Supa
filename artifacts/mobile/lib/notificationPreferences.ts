import { Platform } from "react-native";
import {
  disablePushToken,
  registerPushToken,
  type PushPreferenceSnapshot,
} from "@/lib/pushNotifications";
import { KEYS, storage } from "@/lib/storage/mmkv";

export type NotificationPreferences = {
  enabled: boolean;
  messages: boolean;
  calls: boolean;
  social: boolean;
  marketplace: boolean;
  sounds: boolean;
  previews: boolean;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  messages: true,
  calls: true,
  social: true,
  marketplace: true,
  sounds: true,
  previews: true,
  quietHours: false,
  quietStart: "22:00",
  quietEnd: "07:00",
};

export function getNotificationPreferences(): NotificationPreferences {
  const saved = storage.getObject<Partial<NotificationPreferences>>(KEYS.NOTIFICATION_PREFERENCES);
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(saved ?? {}) };
}

export function saveNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): NotificationPreferences {
  const next = { ...getNotificationPreferences(), ...patch };
  storage.setObject(KEYS.NOTIFICATION_PREFERENCES, next);
  return next;
}

export function getPushPreferenceSnapshot(
  preferences: NotificationPreferences = getNotificationPreferences(),
): PushPreferenceSnapshot {
  return {
    enabled: preferences.enabled,
    messages: preferences.messages,
    calls: preferences.calls,
    social: preferences.social,
    marketplace: preferences.marketplace,
    sounds: preferences.sounds,
    previews: preferences.previews,
    quietHours: preferences.quietHours,
    quietStart: preferences.quietStart,
    quietEnd: preferences.quietEnd,
    timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
  };
}

/**
 * Notification permission and token work is intentionally fire-and-forget from
 * the settings UI. A slow permission prompt or network request must never
 * block the preference toggle or a settings screen transition.
 */
export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  const next = saveNotificationPreferences({ enabled });
  if (Platform.OS === "web") return;

  if (enabled) {
    try {
      const token = await registerPushToken();
      if (token) storage.setString(KEYS.PUSH_TOKEN, token);
    } catch {
      // Keep the local preference. The root manager can retry registration.
    }
    return;
  }

  const token = storage.getString(KEYS.PUSH_TOKEN);
  if (!token) return;
  try {
    await disablePushToken(token);
  } catch {
    // The local setting is still authoritative for this device.
  }
  storage.delete(KEYS.PUSH_TOKEN);
}

export function syncNotificationPreferences(preferences: NotificationPreferences): void {
  if (Platform.OS === "web" || !preferences.enabled) return;
  void registerPushToken({
    force: true,
    preferences: getPushPreferenceSnapshot(preferences),
  }).catch(() => {});
}