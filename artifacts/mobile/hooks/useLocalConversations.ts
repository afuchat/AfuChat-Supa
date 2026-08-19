// ─── useLocalConversations ─────────────────────────────────────────────────────
// Permanent local-first hook: conversation list renders from device instantly.
// Network sync only fetches what changed since the last update.
// Conversations are stored permanently — no TTL.

import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  getLocalConversations,
  saveConversations,
  type LocalConversation,
} from "@/lib/storage/localConversations";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { supabase } from "@/lib/supabase";

export type { LocalConversation };

export function useLocalConversations(userId: string | undefined) {
  const [conversations, setConversations] = useState<LocalConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const lastSyncRef = useRef<number>(0);
  const generationRef = useRef(0);
  const syncingRef = useRef(false);

  // Step 1: Render from device instantly — zero network
  const loadLocal = useCallback(async (generation: number) => {
    try {
      const local = await getLocalConversations();
      if (generation !== generationRef.current) return;
      if (local.length > 0) setConversations(local);
    } finally {
      // An empty cache is a valid state. Never leave a first-time or offline
      // user behind an infinite spinner while waiting for the network.
      if (generation === generationRef.current) setLoading(false);
    }
  }, []);

  // Step 2: Background sync from Supabase
  const syncFromServer = useCallback(async (
    force = false,
    expectedUserId = userId,
    expectedGeneration = generationRef.current,
  ) => {
    if (
      !expectedUserId ||
      !isOnline() ||
      syncingRef.current ||
      expectedGeneration !== generationRef.current
    ) return;
    // Debounce: don't sync more than once every 30s unless forced
    const now = Date.now();
    if (!force && now - lastSyncRef.current < 30_000) return;
    lastSyncRef.current = now;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const { data: memberRows } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", expectedUserId);

      if (!memberRows?.length) {
        if (expectedGeneration === generationRef.current) setLoading(false);
        return;
      }

      const chatIds = memberRows.map((m: any) => m.chat_id);

      const { data: chatRows } = await supabase
        .from("chats")
        .select(`
          id, name, is_group, is_channel, is_pinned, is_archived, avatar_url, updated_at,
          chat_members(user_id, profiles(id, display_name, avatar_url, is_verified, is_organization_verified, last_seen, show_online_status))
        `)
        .in("id", chatIds)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false });

      if (!chatRows || expectedGeneration !== generationRef.current) return;

      const { data: lastMsgs } = await supabase
        .from("messages")
        .select("id, chat_id, encrypted_content, sent_at, attachment_type, sender_id")
        .in("chat_id", chatIds)
        .order("sent_at", { ascending: false })
        .limit(chatIds.length * 3);

      const lastMsgMap: Record<string, any> = {};
      for (const m of (lastMsgs ?? [])) {
        if (!lastMsgMap[m.chat_id]) {
          let preview = m.encrypted_content || "";
          if (m.attachment_type === "story_reply" && preview.startsWith("storyUserId:")) {
            const pipeIdx = preview.indexOf("|");
            preview = pipeIdx >= 0 ? `\u{1F4F8} ${preview.slice(pipeIdx + 1)}` : "\u{1F4F8} Story";
          }
          lastMsgMap[m.chat_id] = {
            last_message: preview,
            last_message_at: m.sent_at,
          last_message_is_mine: m.sender_id === expectedUserId,
          };
        }
      }

      const items: LocalConversation[] = chatRows.map((c: any) => {
        const others = (c.chat_members ?? []).filter((m: any) => m.user_id !== expectedUserId);
        // A direct chat without a resolvable other profile is an orphan. Do
        // not persist it as "Unknown"; it can never open a real conversation.
        if (!c.is_group && !c.is_channel && !others[0]?.profiles?.id) continue;
        const other = others[0]?.profiles;
        const lm = lastMsgMap[c.id] ?? {};
        return {
          id: c.id,
          name: c.name ?? null,
          is_group: !!c.is_group,
          is_channel: !!c.is_channel,
          other_id: other?.id ?? null,
          other_display_name: other?.display_name ?? null,
          other_avatar: other?.avatar_url ?? null,
          last_message: lm.last_message ?? null,
          last_message_at: lm.last_message_at ?? c.updated_at ?? null,
          last_message_is_mine: lm.last_message_is_mine ?? false,
          last_message_status: "sent",
          is_pinned: !!c.is_pinned,
          is_archived: !!c.is_archived,
          avatar_url: c.avatar_url ?? null,
          unread_count: 0,
          is_verified: !!other?.is_verified,
          is_organization_verified: !!other?.is_organization_verified,
          other_last_seen: other?.last_seen ?? null,
          other_show_online: other?.show_online_status !== false,
          stored_at: Date.now(),
        };
      });

      items.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime();
      });

      if (expectedGeneration !== generationRef.current) return;
      setConversations(items);
      setLoading(false);
      // Persist permanently (INSERT OR REPLACE — updates metadata like last_message)
      await saveConversations(items);
    } catch {
    } finally {
      syncingRef.current = false;
      if (expectedGeneration === generationRef.current) setSyncing(false);
    }
  }, [userId]);

  useEffect(() => {
    const generation = ++generationRef.current;
    lastSyncRef.current = 0;
    if (!userId) {
      setConversations([]);
      setLoading(false);
      setSyncing(false);
      return;
    }

    syncingRef.current = false;
    setConversations([]);
    setLoading(true);
    void (async () => {
      await loadLocal(generation);
      if (generation === generationRef.current) {
        await syncFromServer(true, userId, generation);
      }
    })();
  }, [userId, loadLocal, syncFromServer]);

  useEffect(() => {
    if (!userId) return;
    const generation = generationRef.current;
    return onConnectivityChange((online) => {
      if (online) void syncFromServer(true, userId, generation);
    });
  }, [userId, syncFromServer]);

  useEffect(() => {
    if (!userId) return;
    const generation = generationRef.current;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void syncFromServer(false, userId, generation);
    });
    return () => sub.remove();
  }, [userId, syncFromServer]);

  return { conversations, loading, syncing, refresh: () => syncFromServer(true) };
}
