import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";

type Person = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  follower_count: number;
  is_verified: boolean;
  is_organization_verified: boolean;
  last_seen: string | null;
  is_following: boolean;
};

type Filter = "all" | "online" | "recent";
const ONLINE_WINDOW = 10 * 60_000;
const RECENT_WINDOW = 24 * 60 * 60_000;

function isOnline(lastSeen: string | null) {
  return !!lastSeen && Date.now() - new Date(lastSeen).getTime() <= ONLINE_WINDOW;
}

function relativeSeen(lastSeen: string | null) {
  if (!lastSeen) return "Not active recently";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60_000));
  if (minutes < 1) return "Active now";
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  return "Active recently";
}

function Avatar({ person, accent }: { person: Person; accent: string }) {
  return person.avatar_url ? (
    <ExpoImage source={{ uri: person.avatar_url }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
  ) : (
    <View style={[styles.avatar, { backgroundColor: accent + "20" }]}>
      <Text style={[styles.initial, { color: accent }]}>
        {(person.display_name || person.handle || "?")[0].toUpperCase()}
      </Text>
    </View>
  );
}

export default function FindPeopleTab() {
  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  const loadPeople = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      // This is deliberately a live presence query, not a recommendation or
      // history query. last_seen is updated by the session heartbeat.
      const [{ data, error: profileError }, { data: follows, error: followError }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, handle, avatar_url, bio, follower_count, is_verified, is_organization_verified, last_seen")
          .neq("id", user.id)
          .eq("onboarding_completed", true)
          .eq("is_banned", false)
          .eq("account_deleted", false)
          .not("handle", "is", null)
          .order("last_seen", { ascending: false, nullsFirst: false })
          .limit(100),
        supabase.from("follows").select("following_id").eq("follower_id", user.id),
      ]);
      if (profileError) throw profileError;
      if (followError) throw followError;
      const followed = new Set((follows ?? []).map((row: any) => row.following_id));
      setPeople(((data ?? []) as any[]).map((person) => ({
        id: person.id,
        display_name: person.display_name || `@${person.handle}`,
        handle: person.handle || "",
        avatar_url: person.avatar_url || null,
        bio: person.bio || null,
        follower_count: Number(person.follower_count || 0),
        is_verified: !!person.is_verified,
        is_organization_verified: !!person.is_organization_verified,
        last_seen: person.last_seen || null,
        is_following: followed.has(person.id),
      })));
      setLastUpdated(Date.now());
    } catch {
      setError("Live users could not be loaded right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void loadPeople();
  }, [loadPeople, user]);

  useEffect(() => {
    if (!user) return;
    // Keep the current user eligible for the live feed while this tab is open.
    const heartbeat = () => {
      supabase.rpc("update_last_seen").then(() => {}, () => {});
    };
    heartbeat();
    const heartbeatTimer = setInterval(heartbeat, 60_000);
    const pollTimer = setInterval(() => void loadPeople(true), 30_000);
    const channel = supabase
      .channel(`find-presence-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void loadPeople(true))
      .subscribe();
    return () => {
      clearInterval(heartbeatTimer);
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
    };
  }, [loadPeople, user]);

  const visiblePeople = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return people.filter((person) => {
      const matchesQuery = !needle || person.display_name.toLowerCase().includes(needle) || person.handle.toLowerCase().includes(needle);
      const age = person.last_seen ? Date.now() - new Date(person.last_seen).getTime() : Infinity;
      const matchesFilter = filter === "all" || (filter === "online" ? age <= ONLINE_WINDOW : age <= RECENT_WINDOW);
      return matchesQuery && matchesFilter;
    }).sort((a, b) => Number(isOnline(b.last_seen)) - Number(isOnline(a.last_seen)));
  }, [filter, lastUpdated, people, query]);

  const toggleFollow = useCallback(async (person: Person) => {
    if (!user) return router.push("/(auth)/login" as any);
    setFollowBusy(person.id);
    const next = !person.is_following;
    setPeople((current) => current.map((item) => item.id === person.id ? { ...item, is_following: next } : item));
    try {
      const result = next
        ? await supabase.from("follows").insert({ follower_id: user.id, following_id: person.id })
        : await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", person.id);
      if (result.error) throw result.error;
    } catch {
      setPeople((current) => current.map((item) => item.id === person.id ? { ...item, is_following: !next } : item));
    } finally {
      setFollowBusy(null);
    }
  }, [user]);

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <View style={[styles.heroIcon, { backgroundColor: accent + "18" }]}><Ionicons name="radio" size={32} color={accent} /></View>
        <Text style={[styles.title, { color: colors.text }]}>Find your people</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Sign in to see who is active on AfuChat right now.</Text>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: accent }]} onPress={() => router.push("/(auth)/login" as any)}>
          <Text style={styles.primaryButtonText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={styles.headingRow}>
            <Text style={[styles.title, { color: colors.text }]}>Find people</Text>
            <View style={[styles.livePill, { backgroundColor: "#36C96F18" }]}>
              <View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Real people, active right now</Text>
        </View>
        <TouchableOpacity style={[styles.refreshButton, { backgroundColor: accent + "14" }]} onPress={() => { setRefreshing(true); void loadPeople(); }} accessibilityLabel="Refresh live users">
          <Ionicons name="refresh" size={20} color={accent} />
        </TouchableOpacity>
      </View>
      <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search by name or username" placeholderTextColor={colors.textMuted} style={[styles.searchInput, { color: colors.text }]} returnKeyType="search" />
        {!!query && <TouchableOpacity onPress={() => setQuery("")}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity>}
      </View>
      <View style={styles.filterRow}>
        {([["all", "Everyone"], ["online", "Online now"], ["recent", "Active today"]] as const).map(([value, label]) => (
          <TouchableOpacity key={value} onPress={() => setFilter(value)} style={[styles.filterChip, { backgroundColor: filter === value ? accent : colors.surface }]}>
            {value === "online" && <View style={[styles.tinyDot, { backgroundColor: filter === value ? "#fff" : "#36C96F" }]} />}
            <Text style={[styles.filterText, { color: filter === value ? "#fff" : colors.textMuted }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading && people.length === 0 ? <View style={styles.center}><ActivityIndicator color={accent} /></View> : error && people.length === 0 ? (
        <View style={styles.center}><Ionicons name="cloud-offline-outline" size={30} color={colors.textMuted} /><Text style={[styles.subtitle, { color: colors.textMuted }]}>{error}</Text><TouchableOpacity onPress={() => void loadPeople()}><Text style={{ color: accent, fontFamily: "Inter_600SemiBold" }}>Try again</Text></TouchableOpacity></View>
      ) : (
        <FlatList
          data={visiblePeople}
          keyExtractor={(item) => item.id}
          contentContainerStyle={visiblePeople.length ? styles.list : styles.emptyList}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadPeople(); }} tintColor={accent} />}
          renderItem={({ item }) => (
            <View style={[styles.personCard, { backgroundColor: colors.surface }]}>
              <TouchableOpacity style={styles.personIdentity} onPress={() => router.push(`/@${item.handle}` as any)} activeOpacity={0.75}>
                <View><Avatar person={item} accent={accent} />{isOnline(item.last_seen) && <View style={[styles.onlineDot, { backgroundColor: "#36C96F", borderColor: colors.surface }]} />}</View>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}><Text style={[styles.personName, { color: colors.text }]} numberOfLines={1}>{item.display_name}</Text>{(item.is_verified || item.is_organization_verified) && <Ionicons name="checkmark-circle" size={15} color={accent} />}</View>
                  <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>@{item.handle} · {item.follower_count} followers</Text>
                  <Text style={[styles.activity, { color: isOnline(item.last_seen) ? "#36C96F" : colors.textMuted }]}>{relativeSeen(item.last_seen)}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.followButton, { borderColor: item.is_following ? colors.border : accent, backgroundColor: item.is_following ? "transparent" : accent }]} onPress={() => void toggleFollow(item)} disabled={followBusy === item.id}>
                {followBusy === item.id ? <ActivityIndicator size="small" color={item.is_following ? accent : "#fff"} /> : <Text style={{ color: item.is_following ? accent : "#fff", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{item.is_following ? "Following" : "Follow"}</Text>}
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<View style={styles.center}><Ionicons name={filter === "online" ? "radio-outline" : "people-outline"} size={34} color={colors.textMuted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>No users match this view</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>{query ? "Try a different name or username." : "Check back soon — people will appear here as they come online."}</Text></View>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },
  heroIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 320 },
  primaryButton: { minHeight: 46, borderRadius: 23, paddingHorizontal: 24, justifyContent: "center" },
  primaryButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 20, paddingBottom: 14 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#36C96F" },
  liveText: { color: "#36C96F", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.6 },
  refreshButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  searchBox: { height: 46, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  filterRow: { flexDirection: "row", gap: 8, paddingVertical: 14 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  filterText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tinyDot: { width: 6, height: 6, borderRadius: 3 },
  list: { paddingBottom: 24, gap: 10 },
  emptyList: { flexGrow: 1 },
  personCard: { borderRadius: 17, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  personIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  initial: { fontSize: 20, fontFamily: "Inter_700Bold" },
  onlineDot: { position: "absolute", right: 0, bottom: 1, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  personName: { maxWidth: "88%", fontSize: 14, fontFamily: "Inter_700Bold" },
  handle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  activity: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 3 },
  followButton: { minWidth: 78, height: 33, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
});