import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect, useCallback } from "react";

export interface ChatAppearance {
  bubbleColor?: string;  // hex — outgoing bubble tint
  bgColor?: string;      // hex — chat background
  fontSize?: number;     // per-chat override: 13 | 15 | 17 | 19
  wallpaper?: string;    // pattern: "none" | "dots" | "lines" | "grid" | "diamonds"
}

const storeKey = (chatId: string) => `afu_chat_appearance_${chatId}`;

export async function getChatAppearance(chatId: string): Promise<ChatAppearance | null> {
  try {
    const raw = await AsyncStorage.getItem(storeKey(chatId));
    return raw ? (JSON.parse(raw) as ChatAppearance) : null;
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
