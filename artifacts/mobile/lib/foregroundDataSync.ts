import { NativeModules, Platform } from "react-native";

type DataSyncModule = {
  start?: () => Promise<boolean>;
  stop?: () => Promise<boolean>;
};

const nativeModule = (): DataSyncModule | null => {
  if (Platform.OS !== "android") return null;
  return (NativeModules.AfuChatDataSync as DataSyncModule | undefined) ?? null;
};

export function startForegroundDataSync(): void {
  const module = nativeModule();
  if (!module?.start) return;
  void module.start().catch(() => {
    // The durable SQLite queue remains authoritative if the service is
    // unavailable (Expo Go, an old installed build, or restricted OS state).
  });
}

export function stopForegroundDataSync(): void {
  const module = nativeModule();
  if (!module?.stop) return;
  void module.stop().catch(() => {});
}