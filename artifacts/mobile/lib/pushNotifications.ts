import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { supabase } from "@/lib/supabase";

type NotificationsModule = typeof import("expo-notifications");
let notifications: NotificationsModule | null | undefined;

function getNotifications(): NotificationsModule | null {
  if (notifications !== undefined) return notifications;
  if (Platform.OS === "web") return (notifications = null);
  try {
    notifications = require("expo-notifications") as NotificationsModule;
  } catch {
    notifications = null;
  }
  return notifications;
}

export function configurePushNotifications(): void {
  const module = getNotifications();
  if (!module) return;
  module.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
  if (Platform.OS === "android") {
    module.setNotificationChannelAsync("messages", {
      name: "Messages",
      importance: module.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
    }).catch(() => {});
  }
}

export async function registerPushToken(): Promise<string | null> {
  const module = getNotifications();
  if (!module || Platform.OS === "web" || !Device.isDevice) return null;
  configurePushNotifications();
  const current = await module.getPermissionsAsync();
  const permission = (current as any).status === "granted"
    ? current
    : await module.requestPermissionsAsync();
  if ((permission as any).status !== "granted") return null;
  const token = await module.getDevicePushTokenAsync();
  if (token.type !== Platform.OS || typeof token.data !== "string" || token.data.length < 20) {
    throw new Error("The native build did not return a valid FCM token.");
  }
  const { error } = await supabase.functions.invoke("register-push-token", {
    body: {
      token: token.data,
      platform: Platform.OS,
      provider: "fcm",
      appVersion: Constants.expoConfig?.version ?? "",
    },
  });
  if (error) throw error;
  return token.data;
}

export function addNotificationResponseListener(
  listener: (response: any) => void,
) {
  return getNotifications()?.addNotificationResponseReceivedListener(listener) ?? null;
}