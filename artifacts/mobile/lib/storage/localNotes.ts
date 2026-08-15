import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteLocalConversation, getLocalConversation, saveConversations } from "./localConversations";

const ENABLED_PREFIX = "my_notes_enabled:";
export const LOCAL_NOTES_NAME = "My Notes";

export function getLocalNotesId(userId: string): string {
  return `local_notes:${userId}`;
}

export function isLocalNotesId(id: string | undefined | null): boolean {
  return !!id && id.startsWith("local_notes:");
}

async function getEnabledKey(userId: string): Promise<string | null> {
  const enabled = await AsyncStorage.getItem(`${ENABLED_PREFIX}${userId}`).catch(() => null);
  return enabled === "1" ? getLocalNotesId(userId) : null;
}

export async function createLocalNotesConversation(userId: string): Promise<string> {
  const id = getLocalNotesId(userId);
  await AsyncStorage.setItem(`${ENABLED_PREFIX}${userId}`, "1").catch(() => {});
  await saveConversations([{
    id,
    name: LOCAL_NOTES_NAME,
    is_group: false,
    is_channel: false,
    other_id: userId,
    other_display_name: LOCAL_NOTES_NAME,
    other_avatar: null,
    last_message: "",
    last_message_at: "",
    last_message_is_mine: true,
    last_message_status: "sent",
    is_pinned: false,
    is_archived: false,
    avatar_url: null,
    unread_count: 0,
    is_verified: false,
    is_organization_verified: false,
    other_last_seen: null,
    other_show_online: false,
  }]);
  return id;
}

export async function getLocalNotesConversation(userId: string) {
  const id = await getEnabledKey(userId);
  if (!id) return null;
  return getLocalConversation(id);
}

export async function removeLocalNotesConversation(userId: string): Promise<void> {
  const id = getLocalNotesId(userId);
  await deleteLocalConversation(id);
  await AsyncStorage.removeItem(`${ENABLED_PREFIX}${userId}`).catch(() => {});
}