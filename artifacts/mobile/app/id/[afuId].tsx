import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

const BRAND = "#1f95ff";
const DARK_BG = "#0a0f1a";
const CARD_BG = "#111827";
const BORDER = "rgba(255,255,255,0.08)";

type ProfileData = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  is_verified: boolean;
  subscription_tier: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
};

const TIER_COLOR: Record<string, string> = {
  silver: "#8E9BB5",
  gold: "#C8923A",
  platinum: "#1f95ff",
};
const TIER_LABEL: Record<string, string> = {
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

export default function IdLandingPage() {
  const { afuId } = useLocalSearchParams<{ afuId: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") {
      if (!afuId) return;
      supabase
        .rpc("lookup_profile_by_afu_id", { p_afu_id: String(afuId).padStart(8, "0") })
        .then(({ data }) => {
          const p = data?.[0];
          if (p) router.replace({ pathname: "/contact/[id]", params: { id: p.id } } as any);
          else router.back();
        })
        .catch(() => router.back());
      return;
    }

    async function load() {
      if (!afuId) { setError("Invalid ID"); setLoading(false); return; }
      try {
        const { data, error: rpcErr } = await supabase.rpc("lookup_profile_by_afu_id", {
          p_afu_id: String(afuId).padStart(8, "0"),
        });
        if (rpcErr || !data?.[0]) { setError("User not found"); setLoading(false); return; }

        const pid = data[0].id;
        const [
          { data: prof },
          { count: followersCount },
          { count: followingCount },
          { count: postsCount },
          { data: subData },
        ] = await Promise.all([
          supabase.from("profiles").select("id,handle,display_name,avatar_url,bio,country,is_verified").eq("id", pid).single(),
          supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", pid),
          supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", pid),
          supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", pid),
          supabase.from("user_subscriptions").select("subscription_plans(tier)").eq("user_id", pid).eq("is_active", true).maybeSingle(),
        ]);

        if (!prof) { setError("User not found"); setLoading(false); return; }

        setProfile({
          id: prof.id,
          handle: prof.handle,
          display_name: prof.display_name,
          avatar_url: prof.avatar_url,
          bio: prof.bio,
          country: prof.country,
          is_verified: (prof as any).is_verified ?? false,
          subscription_tier: (subData as any)?.subscription_plans?.tier ?? null,
          followers_count: followersCount ?? 0,
          following_count: followingCount ?? 0,
          posts_count: postsCount ?? 0,
        });

        if (user) {
          const { data: fData } = await supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", pid).maybeSingle();
          setFollowing(!!fData);
        }
      } catch {
        setError("Could not load profile");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [afuId, user]);

  if (Platform.OS !== "web") {
    return (
      <View style={{ flex: 1, backgroundColor: DARK_BG, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={BRAND} size="large" />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <Header />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 }}>
          <ActivityIndicator color={BRAND} size="large" />
          <Text style={styles.loadingText}>Loading profile…</Text>
        </View>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={styles.root}>
        <Header />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 16 }}>
          <Ionicons name="person-circle-outline" size={64} color="rgba(255,255,255,0.2)" />
          <Text style={styles.errorText}>{error ?? "User not found"}</Text>
          <Text style={styles.errorSub}>This AfuChat ID (#{afuId}) doesn't exist or has been removed.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => Linking.openURL("https://afuchat.com")}>
            <Text style={styles.primaryBtnText}>Visit AfuChat</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  async function handleFollow() {
    if (!user) { router.push("/(auth)/login" as any); return; }
    setFollowLoading(true);
    try {
      if (following) {
        await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile!.id);
        setFollowing(false);
      } else {
        await supabase.from("follows").insert({ follower_id: user.id, following_id: profile!.id });
        setFollowing(true);
      }
    } finally {
      setFollowLoading(false);
    }
  }

  const deepLink = `afuchat://id/${afuId}`;
  const tierColor = profile.subscription_tier ? TIER_COLOR[profile.subscription_tier] ?? BRAND : null;
  const tierLabel = profile.subscription_tier ? TIER_LABEL[profile.subscription_tier] ?? profile.subscription_tier : null;

  return (
    <View style={styles.root}>
      <Header />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{(profile.display_name || profile.handle || "?")[0].toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.nameBlock}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Text style={styles.displayName}>{profile.display_name}</Text>
                {profile.is_verified && (
                  <Ionicons name="checkmark-circle" size={18} color={BRAND} />
                )}
                {tierLabel && tierColor && (
                  <View style={[styles.tierBadge, { backgroundColor: tierColor + "22", borderColor: tierColor + "44" }]}>
                    <Text style={[styles.tierText, { color: tierColor }]}>{tierLabel}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.handle}>@{profile.handle}</Text>
              {profile.country && (
                <Text style={styles.country}>{profile.country}</Text>
              )}
            </View>
          </View>

          {profile.bio && (
            <Text style={styles.bio}>{profile.bio}</Text>
          )}

          <View style={styles.statsRow}>
            <Stat value={profile.followers_count} label="Followers" />
            <View style={styles.statDivider} />
            <Stat value={profile.following_count} label="Following" />
            <View style={styles.statDivider} />
            <Stat value={profile.posts_count} label="Posts" />
          </View>

          <View style={styles.idRow}>
            <Ionicons name="qr-code-outline" size={14} color="rgba(255,255,255,0.3)" />
            <Text style={styles.idText}>AfuChat ID: <Text style={{ color: BRAND, fontFamily: "monospace" }}>#{afuId}</Text></Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 1 }]}
              onPress={() => Linking.openURL(deepLink).catch(() => Linking.openURL("https://afuchat.com"))}
            >
              <Ionicons name="phone-portrait-outline" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Open in App</Text>
            </TouchableOpacity>
            {user && user.id !== profile.id && (
              <TouchableOpacity
                style={[styles.secondaryBtn, { flex: 1, borderColor: following ? "rgba(255,255,255,0.2)" : BRAND }]}
                onPress={handleFollow}
                disabled={followLoading}
              >
                {followLoading ? (
                  <ActivityIndicator color={BRAND} size="small" />
                ) : (
                  <>
                    <Ionicons name={following ? "person-remove-outline" : "person-add-outline"} size={16} color={following ? "rgba(255,255,255,0.6)" : BRAND} />
                    <Text style={[styles.secondaryBtnText, { color: following ? "rgba(255,255,255,0.6)" : BRAND }]}>
                      {following ? "Following" : "Follow"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {user && user.id !== profile.id && (
            <TouchableOpacity
              style={styles.messageBtn}
              onPress={() => router.push({ pathname: "/chat/[id]", params: { id: profile.id } } as any)}
            >
              <Ionicons name="chatbubble-outline" size={16} color={BRAND} />
              <Text style={styles.messageBtnText}>Send Message</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.downloadCard}>
          <Text style={styles.downloadTitle}>Don't have AfuChat yet?</Text>
          <Text style={styles.downloadSub}>Connect with {profile.display_name} and millions of others on Africa's premier social super-app.</Text>
          <View style={styles.badgeRow}>
            <TouchableOpacity style={styles.storeBadge} onPress={() => Linking.openURL("https://play.google.com/store/apps/details?id=com.afuchat.app")}>
              <Ionicons name="logo-google-playstore" size={20} color="#fff" />
              <View>
                <Text style={styles.storeSmall}>GET IT ON</Text>
                <Text style={styles.storeLabel}>Google Play</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.storeBadge} onPress={() => Linking.openURL("https://apps.apple.com/app/afuchat")}>
              <Ionicons name="logo-apple" size={20} color="#fff" />
              <View>
                <Text style={styles.storeSmall}>DOWNLOAD ON THE</Text>
                <Text style={styles.storeLabel}>App Store</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            <Text style={{ color: BRAND, fontWeight: "600" }}>AfuChat</Text> — Africa's Social Super-App
          </Text>
          <View style={styles.footerLinks}>
            <TouchableOpacity onPress={() => router.push("/terms" as any)}>
              <Text style={styles.footerLink}>Terms</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>·</Text>
            <TouchableOpacity onPress={() => router.push("/privacy" as any)}>
              <Text style={styles.footerLink}>Privacy</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>·</Text>
            <TouchableOpacity onPress={() => Linking.openURL("https://afuchat.com")}>
              <Text style={styles.footerLink}>afuchat.com</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.footerCopy}>© {new Date().getFullYear()} AfuChat Technologies Limited</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => Linking.openURL("https://afuchat.com")} style={styles.logoRow}>
        <View style={styles.logoMark}>
          <Text style={styles.logoMarkText}>A</Text>
        </View>
        <Text style={styles.logoText}>AfuChat</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.downloadBadge} onPress={() => Linking.openURL("https://afuchat.com")}>
        <Text style={styles.downloadBadgeText}>Get the App</Text>
      </TouchableOpacity>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const formatted = value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000
    ? `${(value / 1_000).toFixed(1)}K`
    : String(value);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{formatted}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK_BG, minHeight: "100%" as any },
  scroll: { paddingBottom: 60, alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoMark: { width: 32, height: 32, borderRadius: 10, backgroundColor: BRAND, alignItems: "center", justifyContent: "center" },
  logoMarkText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  logoText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  downloadBadge: { backgroundColor: BRAND, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  downloadBadgeText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  card: { marginTop: 40, marginHorizontal: 16, maxWidth: 480, width: "100%" as any, backgroundColor: CARD_BG, borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 24, gap: 16 },
  avatarRow: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#1a2233" },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: BRAND + "22" },
  avatarInitial: { fontSize: 32, fontWeight: "700", color: BRAND },
  nameBlock: { flex: 1, gap: 4 },
  displayName: { fontSize: 22, fontWeight: "700", color: "#fff" },
  handle: { fontSize: 14, color: "rgba(255,255,255,0.5)" },
  country: { fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 },
  tierBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  tierText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  bio: { fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 21 },
  statsRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 16 },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontWeight: "700", color: "#fff" },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: "500" },
  statDivider: { width: 1, height: 32, backgroundColor: BORDER },
  idRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  idText: { fontSize: 12, color: "rgba(255,255,255,0.3)" },
  actionRow: { flexDirection: "row", gap: 10 },
  primaryBtn: { backgroundColor: BRAND, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  secondaryBtn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, backgroundColor: "transparent" },
  secondaryBtnText: { fontWeight: "700", fontSize: 14 },
  messageBtn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: BRAND + "44", backgroundColor: BRAND + "10" },
  messageBtnText: { color: BRAND, fontWeight: "600", fontSize: 14 },
  downloadCard: { marginTop: 24, marginHorizontal: 16, maxWidth: 480, width: "100%" as any, backgroundColor: CARD_BG, borderRadius: 20, borderWidth: 1, borderColor: BORDER, padding: 24, gap: 12 },
  downloadTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  downloadSub: { fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 20 },
  badgeRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" as any },
  storeBadge: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: BORDER },
  storeSmall: { fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: "600", letterSpacing: 0.5 },
  storeLabel: { fontSize: 14, color: "#fff", fontWeight: "700" },
  footer: { marginTop: 40, alignItems: "center", gap: 8, paddingHorizontal: 24 },
  footerText: { fontSize: 14, color: "rgba(255,255,255,0.4)" },
  footerLinks: { flexDirection: "row", alignItems: "center", gap: 8 },
  footerLink: { fontSize: 13, color: "rgba(255,255,255,0.35)" },
  footerDot: { fontSize: 13, color: "rgba(255,255,255,0.2)" },
  footerCopy: { fontSize: 11, color: "rgba(255,255,255,0.2)" },
  loadingText: { marginTop: 16, color: "rgba(255,255,255,0.4)", fontSize: 14 },
  errorText: { fontSize: 20, fontWeight: "700", color: "#fff" },
  errorSub: { fontSize: 14, color: "rgba(255,255,255,0.5)", textAlign: "center", maxWidth: 320 },
});
