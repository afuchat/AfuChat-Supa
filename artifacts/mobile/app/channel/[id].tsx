import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";

/**
 * Compatibility bridge for old channel links.
 *
 * Channels are now first-class chat conversations. The UUID is intentionally
 * shared by the channel and its chat row, so every entry point lands in the
 * same chat list / chat room experience.
 */
export default function ChannelRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [message, setMessage] = useState("Opening channel…");

  useEffect(() => {
    let cancelled = false;

    async function openChannel() {
      if (!id) return;
      if (!user) {
        router.replace("/(auth)/login" as any);
        return;
      }

      const { data: channel } = await supabase
        .from("channels")
        .select("id, name, handle, description, avatar_url, is_public")
        .eq("id", id)
        .maybeSingle();

      if (!channel) {
        if (!cancelled) setMessage("This channel is no longer available.");
        return;
      }

      if (!cancelled) {
        router.replace({
          pathname: "/chat/[id]",
          params: {
            id,
            isChannel: "true",
            chatName: channel.name || "Channel",
            chatAvatar: channel.avatar_url || "",
            channelHandle: channel.handle || "",
            channelDescription: channel.description || "",
          },
        } as any);
      }
    }

    openChannel().catch(() => {
      if (!cancelled) setMessage("Could not open this channel right now.");
    });
    return () => { cancelled = true; };
  }, [id, user?.id]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="small" color={colors.accent} />
      <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  message: { textAlign: "center", fontSize: 14 },
});