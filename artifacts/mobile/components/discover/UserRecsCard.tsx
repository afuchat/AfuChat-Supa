import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import UserName from "@/components/ui/UserName";
import { safeRouter } from "@/lib/navUtils";
import * as Haptics from "@/lib/haptics";

type SuggestUser = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  follower_count: number;
  bio: string | null;
  followed: boolean;
};

type Props = {
  seed?: number;
  onRequireAuth?: () => void;
};

export function UserRecsCard({ seed = 0, onRequireAuth }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [users, setUsers] = useState<SuggestUser[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: followData } = user
        ? await supabase.from("follows").select("following_id").eq("follower_id", user.id).limit(500)
        : { data: [] };
      const followingIds = new Set((followData || []).map((f: any) => f.following_id));
      if (user) followingIds.add(user.id);

      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, is_verified, is_organization_verified, follower_count, bio")
        .not("avatar_url", "is", null)
        .not("bio", "is", null)
        .not("display_name", "is", null)
        .order("follower_count", { ascending: false })
        .limit(40);

      if (!data) { setLoading(false); return; }
      const pool = data.filter((u: any) => !followingIds.has(u.id));
      const shuffled = pool.sort(() => Math.random() - 0.5);
      setUsers(shuffled.slice(0, 5).map((u: any) => ({ ...u, followed: false })));
    } catch (_) {}
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [seed]);

  const follow = useCallback((uid: string) => {
    if (!user) { onRequireAuth?.(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUsers((prev) => prev.map((u) => u.id === uid ? { ...u, followed: !u.followed } : u));
    supabase.from("follows").upsert({ follower_id: user.id, following_id: uid }).then(() => {});
  }, [user]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="small" color={colors.accent} style={{ margin: 24 }} />
      </View>
    );
  }

  if (users.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="sparkles" size={16} color={colors.accent} />
          <Text style={[styles.title, { color: colors.text }]}>People to follow</Text>
        </View>
        <TouchableOpacity onPress={() => safeRouter.push("/search" as any)} activeOpacity={0.7}>
          <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {users.map((u) => (
          <TouchableOpacity
            key={u.id}
            style={[styles.card, { backgroundColor: colors.surface }]}
            onPress={() => safeRouter.push(`/@${u.handle}` as any)}
            activeOpacity={0.88}
          >
            <Avatar uri={u.avatar_url} name={u.display_name} size={52} square={u.is_organization_verified} userId={u.id} />
            <View style={styles.cardNameRow}>
              <UserName userId={u.id} name={u.display_name} style={[styles.cardName, { color: colors.text }]} numberOfLines={1} />
              <VerifiedBadge isVerified={u.is_verified} isOrganizationVerified={u.is_organization_verified} size={13} />
            </View>
            <Text style={[styles.cardHandle, { color: colors.textMuted }]} numberOfLines={1}>@{u.handle}</Text>
            {u.bio ? (
              <Text style={[styles.cardBio, { color: colors.textSecondary }]} numberOfLines={2}>{u.bio}</Text>
            ) : (
              <Text style={[styles.cardBio, { color: colors.textMuted }]}>
                {formatFollowers(u.follower_count)} followers
              </Text>
            )}
            <TouchableOpacity
              style={[styles.followBtn, {
                backgroundColor: u.followed ? colors.surface : colors.accent,
                borderColor: u.followed ? colors.border : colors.accent,
                borderWidth: u.followed ? 1 : 0,
              }]}
              onPress={() => follow(u.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.followBtnText, { color: u.followed ? colors.text : "#fff" }]}>
                {u.followed ? "Following" : "Follow"}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function formatFollowers(n: number) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginVertical: 4,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 14, fontFamily: "Inter_700Bold" },
  seeAll: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  card: {
    width: 148,
    height: 200,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
  },
  cardNameRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 },
  cardName: { fontSize: 13, fontFamily: "Inter_700Bold", maxWidth: 100 },
  cardHandle: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardBio: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 15 },
  followBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 7,
    borderRadius: 20,
    width: "100%",
    alignItems: "center",
  },
  followBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
