/**
 * GlobalInboxListener — root-level real-time message receiver.
 *
 * Lives inside <AuthProvider> in _layout.tsx so it is always mounted while
 * the user is logged in, regardless of which screen is visible.
 *
 * What it does:
 *  1. Subscribes to the `user-inbox:${userId}` Supabase Broadcast channel.
 *     Senders publish here immediately after the DB insert (~20 ms delivery).
 *  2. Emits every incoming message to globalMessageEvents so chat/[id].tsx
 *     can pick it up as a fast path (before the Postgres Changes event fires).
 *  3. Auto-reconnects on CLOSED / CHANNEL_ERROR with exponential backoff
 *     (max 15 s) so the ~20 ms fast path survives network hiccups.
 *
 * The listener only delivers messages to the in-app event bus.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { emitIncomingMessage, IncomingMessage } from "@/lib/globalMessageEvents";

export function GlobalInboxListener() {
  const { user } = useAuth();
  const recentIds = useRef(new Set<string>());
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  const handlePayload = useCallback((payload: any) => {
    const msg = payload as IncomingMessage;
    if (!msg?.id || !msg?.chat_id || !msg?.sender_id) return;
    if (msg.sender_id === userIdRef.current) return;

    // Deduplicate — broadcast may fire more than once if sender re-tries
    if (recentIds.current.has(msg.id)) return;
    recentIds.current.add(msg.id);
    setTimeout(() => recentIds.current.delete(msg.id), 15_000);

    // Emit to global event bus → chat/[id].tsx fast path picks it up
    emitIncomingMessage(msg);
  }, []);

  // ── Supabase Broadcast subscription with auto-reconnect ────────────────────
  useEffect(() => {
    if (!user?.id) return;

    let destroyed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    let currentChannel: ReturnType<typeof supabase.channel> | null = null;

    // React effects can be re-entered during auth transitions or dev Strict
    // Mode. Evict a channel left behind by the previous effect before adding
    // handlers; Supabase caches channels by topic.
    const staleChannel = supabase
      .getChannels()
      .find((channel) => channel.topic === `realtime:user-inbox:${user.id}`);
    if (staleChannel) {
      supabase.removeChannel(staleChannel).catch(() => {});
    }

    const connect = () => {
      if (destroyed) return;

      const ch = supabase
        .channel(`user-inbox:${user.id}`, {
          config: { broadcast: { self: false } },
        })
        .on("broadcast", { event: "new_message" }, ({ payload }) => {
          handlePayload(payload);
        });

      // Assign before subscribe. A fast terminal status can otherwise arrive
      // before currentChannel is set and leave the failed channel registered.
      currentChannel = ch;
      ch.subscribe((status: string) => {
          if (currentChannel !== ch) return;
          if (status === "SUBSCRIBED") {
            retryCount = 0;
          } else if (
            status === "CLOSED" ||
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            if (currentChannel) {
              supabase.removeChannel(currentChannel).catch(() => {});
              currentChannel = null;
            }
            if (!destroyed) {
              const delay = Math.min(500 * Math.pow(2, retryCount), 15_000);
              retryCount = Math.min(retryCount + 1, 6);
              reconnectTimer = setTimeout(connect, delay);
            }
          }
        });
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (currentChannel) supabase.removeChannel(currentChannel).catch(() => {});
    };
  }, [user?.id, handlePayload]);

  return null;
}
