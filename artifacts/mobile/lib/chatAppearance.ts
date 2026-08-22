import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect, useCallback } from "react";

export interface ChatAppearance {
  fontSize?: number;     // per-chat override: 13 | 15 | 17 | 19
  wallpaper?: string;    // pattern: "none" | "dots" | "lines" | "grid" | "diamonds"
}

const storeKey = (chatId: string) => `afu_chat_appearance_${chatId}`;

export async function getChatAppearance(chatId: string): Promise<ChatAppearance | null> {
  try {
    const raw = await AsyncStorage.getItem(storeKey(chatId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<ChatAppearance>;
    const appearance: ChatAppearance = {};
    if (typeof saved.fontSize === "number") appearance.fontSize = saved.fontSize;
    if (typeof saved.wallpaper === "string") appearance.wallpaper = saved.wallpaper;
    return Object.keys(appearance).length > 0 ? appearance : null;
  } catch {
    return null;
  }
}

export async function saveChatAppearance(chatId: string, appearance: ChatAppearance): Promise<void> {
  try {
    await AsyncStorage.setItem(storeKey(chatId), JSON.stringify(appearance));
  } catch {}
}

export async function clearChatAppearance(chatId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storeKey(chatId));
  } catch {}
}

export function useChatAppearance(chatId: string | undefined) {
  const [appearance, setAppearance] = useState<ChatAppearance | null>(null);

  useEffect(() => {
    if (!chatId) return;
    getChatAppearance(chatId).then(setAppearance);
  }, [chatId]);

  const updateAppearance = useCallback(
    async (next: ChatAppearance | null) => {
      if (!chatId) return;
      setAppearance(next);
      if (next && Object.values(next).some((v) => v !== undefined)) {
        await saveChatAppearance(chatId, next);
      } else {
        await clearChatAppearance(chatId);
      }
    },
    [chatId],
  );

  return { appearance, updateAppearance };
}
