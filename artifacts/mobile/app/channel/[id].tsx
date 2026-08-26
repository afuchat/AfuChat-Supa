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
        .select("id, name, avatar_url, is_public")
        .eq("id", id)
        .maybeSingle();

      if (!channel) {
        if (!cancelled) setMessage("This channel is no longer available.");
        return;
      }

      const { data: membership } = await supabase
        .from("chat_members")
        .select("user_id")
        .eq("chat_id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!membership && !channel.is_public) {
        if (!cancelled) setMessage("This is a private channel. Use an invite link to join.");
        return;
      }

      if (!membership) {
        const { data: subscription } = await supabase
          .from("channel_subscriptions")
          .select("id")
          .eq("channel_id", id)
          .eq("user_id", user.id)
          .maybeSingle();

        const { error: memberError } = await supabase
          .from("chat_members")
          .upsert({ chat_id: id, user_id: user.id, is_admin: false }, { onConflict: "chat_id,user_id" });
        const { error: subscriptionError } = await supabase
          .from("channel_subscriptions")
          .upsert({ channel_id: id, user_id: user.id }, { onConflict: "channel_id,user_id" });

        if (memberError || subscriptionError) {
          if (!cancelled) setMessage("Could not join this channel right now.");
          return;
        }
        if (!subscription) {
          await supabase.rpc("increment_channel_subscriber", { p_channel_id: id });
        }
      }

      if (!cancelled) {
        router.replace({
          pathname: "/chat/[id]",
          params: {
            id,
            isChannel: "true",
            chatName: channel.name || "Channel",
            chatAvatar: channel.avatar_url || "",
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