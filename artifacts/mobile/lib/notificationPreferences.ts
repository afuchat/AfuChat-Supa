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

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  saveNotificationPreferences({ enabled });
}

export function syncNotificationPreferences(preferences: NotificationPreferences): void {
  saveNotificationPreferences(preferences);
}