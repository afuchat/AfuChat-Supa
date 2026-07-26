/**
 * /shorts route — single source of truth for the vertical video feed.
 *
 * Priority:
 *   1. Fetch the latest public video from Supabase (online)
 *   2. Fall back to the most recently watched offline video
 *   3. Show an empty state only when there is truly nothing
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ShortsFeedSkeleton } from "@/components/ui/Skeleton";
import { supabase } from "@/lib/supabase";
import { getOfflineVideos } from "@/lib/videoCache";
import { useTheme } from "@/hooks/useTheme";

export default function ShortsRedirect() {
  const { colors, isDark } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [hasOffline, setHasOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ── 1. Try online feed ──────────────────────────────────────────
      try {
        const { data, error: dbErr } = await supabase
          .from("posts")
          .select("id")
          .eq("post_type", "video")
          .eq("visibility", "public")
          .not("video_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);

        if (cancelled) return;

        if (!dbErr && data?.[0]?.id) {
          router.replace({ pathname: "/video/[id]", params: { id: data[0].id } });
          return;
        }
      } catch {
        // Network is offline — fall through to offline store
      }

      if (cancelled) return;

      // ── 2. Fall back to offline video registry ──────────────────────
      try {
        const offlineVideos = await getOfflineVideos();
        if (cancelled) return;
        if (offlineVideos.length > 0) {
          // Most recently watched is first — go straight there
          router.replace({ pathname: "/video/[id]", params: { id: offlineVideos[0].postId } });
          return;
        }
      } catch {}

      if (cancelled) return;

      // ── 3. Nothing available ────────────────────────────────────────
      setHasOffline(false);
      setError("no_content");
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={isDark ? "#0F0F0F" : "#F5F0E8"}
        translucent
      />
      <Stack.Screen options={{ headerShown: false }} />

      {error ? (
        <View style={styles.errorWrap}>
          <Ionicons name="wifi" size={48} color={colors.textMuted} style={{ marginBottom: 16 }} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>You're offline</Text>
          <Text style={[styles.errorText, { color: colors.textMuted }]}>
            No internet connection. Watch some videos while online and they'll be saved here automatically.
          </Text>
          <TouchableOpacity
            style={[styles.offlineBtn, { backgroundColor: colors.accent }]}
            onPress={() => router.push("/settings/offline-videos")}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-download" size={16} color="#fff" />
            <Text style={styles.offlineBtnText}>View Offline Library</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ShortsFeedSkeleton dark={isDark} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    gap: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  errorText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  offlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 24,
  },
  offlineBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
