import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useNearbyLocation } from "@/hooks/useNearbyLocation";
import { supabase } from "@/lib/supabase";

type NearbyPerson = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  distance_km: number | null;
  is_following: boolean;
  is_online: boolean;
};

const RADII = [5, 25, 100];

function distanceLabel(distance: number | null) {
  if (distance == null) return "Nearby";
  if (distance < 1) return `${Math.round(distance * 1000)} m away`;
  return `${distance.toFixed(distance < 10 ? 1 : 0)} km away`;
}

function PersonAvatar({ person, color }: { person: NearbyPerson; color: string }) {
  return person.avatar_url ? (
    <ExpoImage
      source={{ uri: person.avatar_url }}
      style={styles.avatar}
      contentFit="cover"
      cachePolicy="memory-disk"
    />
  ) : (
    <View style={[styles.avatar, { backgroundColor: color + "20" }]}>
      <Text style={[styles.initial, { color }]}>
        {(person.display_name || person.handle || "?")[0].toUpperCase()}
      </Text>
    </View>
  );
}

export default function FindPeopleTab() {
  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const { coords, locating, error: locationError, requestLocation } = useNearbyLocation();
  const [radius, setRadius] = useState(25);
  const [people, setPeople] = useState<NearbyPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);

  const loadPeople = useCallback(async (nextCoords = coords) => {
    if (!user || !nextCoords) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data, error: rpcError }, { data: follows }] = await Promise.all([
        supabase.rpc("nearby_users", {
          user_lat: nextCoords.lat,
          user_lng: nextCoords.lng,
          radius_km: radius,
          exclude_id: user.id,
        }),
        supabase.from("follows").select("following_id").eq("follower_id", user.id),
      ]);
      if (rpcError) throw rpcError;
      const followed = new Set((follows || []).map((row: any) => row.following_id));
      setPeople(((data || []) as any[]).map((person) => ({
        id: person.id,
        display_name: person.display_name || `@${person.handle}`,
        handle: person.handle || "",
        avatar_url: person.avatar_url || null,
        bio: person.bio || null,
        distance_km: typeof person.distance_km === "number" ? person.distance_km : null,
        is_following: followed.has(person.id),
        is_online: !!person.location_updated_at &&
          Date.now() - new Date(person.location_updated_at).getTime() < 5 * 60_000,
      })));
    } catch {
      setError("Nearby people could not be loaded right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [coords, radius, user]);

  useEffect(() => {
    if (coords) void loadPeople(coords);
  }, [coords, loadPeople]);

  const findNearby = useCallback(async () => {
    const next = await requestLocation();
    if (next) void loadPeople(next);
  }, [loadPeople, requestLocation]);

  const toggleFollow = useCallback(async (person: NearbyPerson) => {
    if (!user) {
      router.push("/(auth)/login" as any);
      return;
    }
    setFollowBusy(person.id);
    const nextFollowing = !person.is_following;
    setPeople((current) => current.map((item) =>
      item.id === person.id ? { ...item, is_following: nextFollowing } : item,
    ));
    try {
      const query = supabase.from("follows");
      const result = nextFollowing
        ? await query.insert({ follower_id: user.id, following_id: person.id })
        : await query.delete().eq("follower_id", user.id).eq("following_id", person.id);
      if (result.error) throw result.error;
    } catch {
      setPeople((current) => current.map((item) =>
        item.id === person.id ? { ...item, is_following: person.is_following } : item,
      ));
    } finally {
      setFollowBusy(null);
    }
  }, [user]);

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <View style={[styles.heroIcon, { backgroundColor: accent + "18" }]}>
          <Ionicons name="location-outline" size={32} color={accent} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Find your people</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Sign in to discover AfuChat people near you.
        </Text>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: accent }]} onPress={() => router.push("/(auth)/login" as any)}>
          <Text style={styles.primaryButtonText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!coords) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <View style={[styles.heroIcon, { backgroundColor: accent + "18" }]}>
          {locating ? <ActivityIndicator color={accent} /> : <Ionicons name="navigate-outline" size={32} color={accent} />}
        </View>
        <Text style={[styles.title, { color: colors.text }]}>People around you</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {locationError || "Turn on location to see people who are nearby. Your exact location is never shown."}
        </Text>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: accent, opacity: locating ? 0.6 : 1 }]} onPress={findNearby} disabled={locating}>
          <Ionicons name="locate-outline" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>{locating ? "Finding people…" : "Find nearby people"}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.intro}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>People around you</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Meet AfuChat users nearby
          </Text>
        </View>
        <TouchableOpacity style={[styles.refreshButton, { backgroundColor: accent + "14" }]} onPress={findNearby} disabled={locating}>
          <Ionicons name="locate-outline" size={20} color={accent} />
        </TouchableOpacity>
      </View>
      <View style={styles.radiusRow}>
        <Text style={[styles.radiusLabel, { color: colors.textMuted }]}>Within</Text>
        {RADII.map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.radiusChip, { backgroundColor: radius === value ? accent : colors.surface }]}
            onPress={() => setRadius(value)}
          >
            <Text style={{ color: radius === value ? "#fff" : colors.textMuted, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
              {value} km
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading && people.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={accent} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{error}</Text>
          <TouchableOpacity onPress={() => void loadPeople()}><Text style={{ color: accent, fontFamily: "Inter_600SemiBold" }}>Try again</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(item) => item.id}
          contentContainerStyle={people.length ? styles.list : styles.emptyList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadPeople(); }} tintColor={accent} />}
          renderItem={({ item }) => (
            <View style={[styles.personCard, { backgroundColor: colors.surface }]}>
              <TouchableOpacity style={styles.personIdentity} onPress={() => router.push(`/@${item.handle}` as any)}>
                <View>
                  <PersonAvatar person={item} color={accent} />
                  {item.is_online && <View style={[styles.onlineDot, { backgroundColor: "#36C96F", borderColor: colors.surface }]} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.personName, { color: colors.text }]} numberOfLines={1}>{item.display_name}</Text>
                  <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>@{item.handle} · {distanceLabel(item.distance_km)}</Text>
                  {item.bio && <Text style={[styles.bio, { color: colors.textMuted }]} numberOfLines={1}>{item.bio}</Text>}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.followButton, { borderColor: item.is_following ? colors.border : accent, backgroundColor: item.is_following ? "transparent" : accent }]}
                onPress={() => void toggleFollow(item)}
                disabled={followBusy === item.id}
              >
                {followBusy === item.id ? <ActivityIndicator size="small" color={item.is_following ? accent : "#fff"} /> : <Text style={{ color: item.is_following ? accent : "#fff", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{item.is_following ? "Following" : "Follow"}</Text>}
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>No one found within {radius} km yet.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 14 },
  heroIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 320 },
  primaryButton: { minHeight: 46, borderRadius: 23, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 8 },
  primaryButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  intro: { flexDirection: "row", alignItems: "center", paddingTop: 20, paddingBottom: 14 },
  introTitle: { textAlign: "left" },
  refreshButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  radiusRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 14 },
  radiusLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginRight: 2 },
  radiusChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  list: { paddingBottom: 24, gap: 10 },
  emptyList: { flexGrow: 1 },
  personCard: { borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  personIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  initial: { fontSize: 20, fontFamily: "Inter_700Bold" },
  onlineDot: { position: "absolute", right: 0, bottom: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  personName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  handle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  bio: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  followButton: { minWidth: 76, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
});