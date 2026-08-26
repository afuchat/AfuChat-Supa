import { NativeModules, Platform } from "react-native";

export type ShareShortcutChat = {
  chatId: string;
  label: string;
  avatarUrl?: string | null;
  isGroup?: boolean;
  isChannel?: boolean;
};

type ShareShortcutsModule = {
  update?: (chats: ShareShortcutChat[]) => Promise<boolean> | void;
};

/**
 * Updates Android Direct Share targets when the app has a native build.
 *
 * Expo Go and web do not contain the custom native module, so this is
 * deliberately a no-op there. The visible share screen remains functional
 * on every platform.
 */
export function updateNativeShareShortcuts(chats: ShareShortcutChat[]): void {
  if (Platform.OS !== "android") return;
  const native = NativeModules.AfuChatShareShortcuts as ShareShortcutsModule | undefined;
  if (!native?.update) return;

  const unique = chats
    .filter((chat) => chat.chatId && chat.label)
    .filter((chat, index, list) => list.findIndex((item) => item.chatId === chat.chatId) === index)
    .slice(0, 8);

  try {
    Promise.resolve(native.update?.(unique)).catch(() => {});
  } catch {
    // Native modules can throw synchronously while a standalone build is
    // starting; sharing in the app must remain usable in that case.
  }
}