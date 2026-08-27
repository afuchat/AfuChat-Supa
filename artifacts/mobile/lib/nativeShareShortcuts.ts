import { NativeModules, Platform } from "react-native";

export type ShareShortcutChat = {
  chatId: string;
  label: string;
  avatarUrl?: string | null;
  lastMessageAt?: string | null;
  isGroup?: boolean;
  isChannel?: boolean;
};

type ShareShortcutsModule = {
  update?: (chats: ShareShortcutChat[]) => Promise<boolean> | void;
  getInitialChatId?: () => Promise<string | null>;
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
    .filter((chat) => !!chat.lastMessageAt)
    .sort((a, b) => {
      const aTime = Date.parse(a.lastMessageAt || "");
      const bTime = Date.parse(b.lastMessageAt || "");
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    })
    .slice(0, 8);

  try {
    Promise.resolve(native.update?.(unique)).catch(() => {});
  } catch {
    // Native modules can throw synchronously while a standalone build is
    // starting; sharing in the app must remain usable in that case.
  }
}

/**
 * Reads the chat ID attached to an Android Direct Share launch. The custom
 * native module is absent in Expo Go and on web, so callers can safely use
 * the null result as the normal fallback.
 */
export async function getNativeShareChatId(): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  const native = NativeModules.AfuChatShareShortcuts as ShareShortcutsModule | undefined;
  if (!native?.getInitialChatId) return null;
  try {
    const chatId = await native.getInitialChatId();
    return typeof chatId === "string" && chatId.length > 0 ? chatId : null;
  } catch {
    return null;
  }
}
