import React, { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/AuthContext";

/**
 * Compatibility bridge for old channel links.
 *
 * Channels are now first-class chat conversations. The UUID is intentionally
 * shared by the channel and its chat row, so every entry point lands in the
 * same chat list / chat room experience.
 */
export default function ChannelRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !id) return;
    if (!user) {
      router.replace("/(auth)/login" as any);
      return;
    }

    // Channels use the same chat screen and cache-first hydration as every
    // other conversation. Do not fetch channel metadata on this bridge route.
    router.replace({
      pathname: "/chat/[id]",
      params: { id, isChannel: "true", chatName: "Channel" },
    } as any);
  }, [id, user?.id, loading]);

  return null;
}