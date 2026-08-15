import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { KEYS, storage } from "@/lib/storage/mmkv";

type NotificationsModule = typeof import("expo-notifications");

let cachedNotifications: NotificationsModule | null | undefined;
let handlerConfigured = false;

function getNotifications(): NotificationsModule | null {
  if (cachedNotifications !== undefined) return cachedNotifications;
  if (Platform.OS === "web") {
    cachedNotifications = null;
    return cachedNotifications;
  }
  try {
    cachedNotifications = require("expo-notifications") as NotificationsModule;
  } catch {
    cachedNotifications = null;
  }
  return cachedNotifications;
}

function getProjectId(): string | null {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId;
  return typeof projectId === "string" && projectId.length > 0 ? projectId : null;
}

export function configurePushNotifications(): void {
  const notifications = getNotifications();
  if (!notifications || handlerConfigured) return;

  notifications.setNotificationHandler({
    handleNotification: async () => {
      const preferences = storage.getObject<{ enabled?: boolean; sounds?: boolean }>(KEYS.NOTIFICATION_PREFERENCES);
      const enabled = preferences?.enabled ?? true;
      return {
        shouldShowBanner: enabled,
        shouldShowList: enabled,
        shouldPlaySound: enabled && (preferences?.sounds ?? true),
        shouldSetBadge: enabled,
      };
    },
  });

  if (Platform.OS === "android") {
    notifications
      .setNotificationChannelAsync("messages", {
        name: "Messages",
        importance: notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: "default",
        lockscreenVisibility: notifications.AndroidNotificationVisibility.PUBLIC,
      })
      .catch(() => {});
  }

  handlerConfigured = true;
}

export async function registerPushToken(): Promise<string | null> {
  const notifications = getNotifications();
  if (!notifications || Platform.OS === "web") return null;

  const device = require("expo-device") as typeof import("expo-device");
  if (!device.isDevice) return null;

  configurePushNotifications();

  const existing = await notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") return null;

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("Expo EAS project ID is required for push registration.");
  }

  const token = (await notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!token) return null;

  const { error } = await supabase.functions.invoke("register-push-token", {
    body: { token, platform: Platform.OS },
  });
  if (error) throw error;

  return token;
}

export async function disablePushToken(token: string): Promise<void> {
  if (!token) return;
  await supabase.functions.invoke("register-push-token", {
    body: { token, platform: Platform.OS, enabled: false },
  });
}

export function addPushTokenListener(
  onToken: (token: string) => void,
): { remove: () => void } | null {
  const notifications = getNotifications();
  if (!notifications) return null;
  return notifications.addPushTokenListener((event) => {
    if (typeof event.data === "string" && event.data.length > 0) {
      onToken(event.data);
    }
  });
}