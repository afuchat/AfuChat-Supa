/**
 * [handle].tsx — catch-all route for /@username and /username
 *
 * Rules:
 *  • /@username  (unauthenticated) → public profile page
 *  • /username   (unauthenticated) → referral link: saves referrer_handle → sends to /register
 *  • Any handle + logged-in user  → navigate to /contact/[id] (full in-app profile)
 *
 * Route-leak guard: logs a warning in __DEV__ whenever a reserved app path
 * slips through to this catch-all instead of resolving to a static file.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams, useRootNavigationState } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import UserName from "@/components/ui/UserName";
import { ProfileNotFoundView } from "@/app/profile-not-found";
import { ProfilePrivateView } from "@/app/profile-private";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { T } from "@/constants/theme";
import { ContactProfileSkeleton } from "@/components/ui/Skeleton";
import { logHandleLeak } from "@/lib/deepLinkVerifier";

function safeNavigate(path: string, params?: Record<string, string>) {
  try {
    if (params) router.replace({ pathname: path as any, params });
    else router.replace(path as any);
  } catch {}
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type PubProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  xp: number;
  current_grade: string;
  country: string | null;
  is_private?: boolean;
};

type PubCounts = { followers: number; following: number; posts: number };

// ─── Public Profile (shown to unauthenticated visitors of /@username) ──────────

function PublicProfileScreen({ handle }: { handle: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<PubProfile | null>(null);
  const [counts, setCounts] = useState<PubCounts>({ followers: 0, following: 0, posts: 0 });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      let profileData: PubProfile | null = null;

      const { data: primary } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, xp, current_grade, country, is_private")
        .eq("handle", handle)
        .maybeSingle();

      if (primary) {
        profileData = primary as PubProfile;
      } else {
        const { data: alias } = await supabase
          .from("owned_usernames")
          .select("owner_id")
          .eq("handle", handle)
          .maybeSingle();
        if (alias?.owner_id) {
          const { data: byId } = await supabase
            .from("profiles")
            .select("id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, xp, current_grade, country, is_private")
            .eq("id", alias.owner_id)
            .maybeSingle();
          profileData = byId as PubProfile | null;
        }
      }

      if (!profileData) { setNotFound(true); setLoading(false); return; }
      setProfile(profileData);
      const data = profileData;

      const [{ count: followers }, { count: following }, { count: posts }] = await Promise.all([
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", data.id),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", data.id),
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", data.id),
      ]);
      setCounts({ followers: followers || 0, following: following || 0, posts: posts || 0 });
      setLoading(false);
    }
    load();
  }, [handle]);

  if (loading) {
    return (
      <View style={[pub.root, pub.centered, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.brand} size="large" />
      </View>
    );
  }
  if (notFound || !profile) return (
    <View style={[pub.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ProfileNotFoundView handle={handle} />
    </View>
  );
  if (profile.is_private) return (
    <View style={[pub.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ProfilePrivateView
        handle={profile.handle}
        displayName={profile.display_name}
        avatarUrl={profile.avatar_url ?? undefined}
        profileId={profile.id}
      />
    </View>
  );

  return (
    <View style={[pub.root, { backgroundColor: colors.background }]}>

      {/* ── Flat header ─────────────────────────────────────────────────── */}
      <View style={[pub.header, { paddingTop: insets.top, borderBottomColor: colors.separator }]}>
        <TouchableOpacity
          style={pub.headerBack}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)/discover" as any);
            }
          }}
          hitSlop={{ top: 8, left: 8, right: 12, bottom: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.brand} />
        </TouchableOpacity>
        <Text style={[pub.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {profile.display_name}
        </Text>
        <View style={pub.headerSide} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}>

        {/* ── Identity block ────────────────────────────────────────────── */}
        <View style={[pub.identityBlock, { borderBottomColor: colors.separator }]}>
          <Avatar
            uri={profile.avatar_url}
            name={profile.display_name}
            size={80}
            style={{ marginBottom: 14 }}
          />
          <View style={pub.nameRow}>
            <UserName userId={profile.id} name={profile.display_name} style={[pub.displayName, { color: colors.text }]} />
            {(profile.is_verified || profile.is_organization_verified) && (
              <VerifiedBadge size={19} />
            )}
          </View>
          <Text style={[pub.handleText, { color: colors.textMuted }]}>@{profile.handle}</Text>

          {profile.bio ? (
            <Text style={[pub.bio, { color: colors.textSecondary }]} numberOfLines={4}>
              {profile.bio}
            </Text>
          ) : null}

          {profile.country ? (
            <View style={pub.metaRow}>
              <Ionicons name="location-outline" size={13} color={colors.textMuted} />
              <Text style={[pub.metaText, { color: colors.textMuted }]}>{profile.country}</Text>
            </View>
          ) : null}

          {profile.current_grade ? (
            <View style={pub.metaRow}>
              <Ionicons name="flash-outline" size={13} color={colors.textMuted} />
              <Text style={[pub.metaText, { color: colors.textMuted }]}>
                {profile.current_grade} · {profile.xp.toLocaleString()} Nexa
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <View style={[pub.statsRow, { borderBottomColor: colors.separator }]}>
          {[
            { label: "Posts",     value: counts.posts },
            { label: "Followers", value: counts.followers },
            { label: "Following", value: counts.following },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <View style={[pub.statSep, { backgroundColor: colors.separator }]} />}
              <View style={pub.statCell}>
                <Text style={[pub.statNum, { color: colors.text }]}>{s.value.toLocaleString()}</Text>
                <Text style={[pub.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <View style={[pub.actionsBlock, { borderBottomColor: colors.separator }]}>
          <TouchableOpacity
            style={[pub.btnPrimary, { backgroundColor: Colors.brand }]}
            onPress={() => router.push("/(auth)/login" as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add-outline" size={17} color="#fff" />
            <Text style={pub.btnPrimaryText}>Follow</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[pub.btnSecondary, { borderColor: colors.border }]}
            onPress={() => router.push("/(auth)/login" as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="chatbubble-outline" size={17} color={colors.text} />
            <Text style={[pub.btnSecondaryText, { color: colors.text }]}>Message</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Reserved app-route segments (never treated as user handles) ───────────────
//
// Expo Router resolves explicit files before dynamic routes, so these should
// never reach [handle].tsx under normal navigation. This guard is a belt-and-
// suspenders defence for deep-links or typos that slip through.
const RESERVED_ROUTES = new Set([
  "browser", "onboarding", "welcome", "settings",
  "wallet", "shop", "chat", "discover", "video", "shorts", "moments",
  "match", "games", "ai", "support", "company", "freelance", "article",
  "channel", "group", "join", "my-posts", "profile", "post", "stories",
  "red-envelope", "mini-programs", "gifts", "p", "update-password",
  "contact", "cart", "orders", "product", "index", "logout", "register",
  "login", "reset-password", "404", "not-found",
  // Additional routes guarded below
  "about", "lab", "achievements", "watch-history",
  "referral", "prestige", "store", "premium", "status", "digital-id",
  "qr-scanner", "create-post", "followers", "saved-posts", "collections",
  "language-settings", "linked-accounts", "device-security",
  "phone-contacts", "user-discovery", "username-market",
  "digital-events", "file-manager", "business",
  "business-verification", "paid-communities", "help", "lab",
]);

// ─── Router / Splash (handles redirect logic) ──────────────────────────────────

export default function HandleScreen() {
  const { handle: rawHandle } = useLocalSearchParams<{ handle: string }>();
  const { session, loading: authLoading } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigationState = useRootNavigationState();
  const hasNavigated = useRef(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileNotFound, setProfileNotFound] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  const isAtHandle = (rawHandle || "").startsWith("@");
  const cleanHandle = (rawHandle || "").replace(/^@/, "").toLowerCase();

  // Valid user handle: 1-30 alphanumeric/underscore chars, not a reserved app route.
  // Dots are intentionally excluded (no dots in AfuChat handles).
  const isValidHandle =
    /^[a-zA-Z0-9_]{1,30}$/.test(cleanHandle) &&
    !RESERVED_ROUTES.has(cleanHandle.toLowerCase());

  // ── Route-leak detection ─────────────────────────────────────────────────────
  // Log a warning when a reserved app path reaches this catch-all instead of
  // resolving to a static file. This lets us catch missing route registrations
  // during development without crashing the app.
  useEffect(() => {
    if (!cleanHandle) return;
    const lower = cleanHandle.toLowerCase();

    if (RESERVED_ROUTES.has(lower)) {
      logHandleLeak(cleanHandle, "reserved app route reached [handle].tsx — missing static file");
      // Bounce the user to a safe home instead of showing a broken profile
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        safeNavigate(session ? "/(tabs)" : "/welcome");
      }
    }
  }, [cleanHandle, session]);

  useEffect(() => {
    // For /@username when not logged in, skip DB resolve — PublicProfileScreen handles it.
    if (isAtHandle && !authLoading && !session) return;
    if (!cleanHandle || !isValidHandle) { setDataReady(true); return; }

    async function resolve() {
      const { data: primary } = await supabase
        .from("profiles")
        .select("id")
        .eq("handle", cleanHandle)
        .maybeSingle();

      if (primary?.id) { setProfileId(primary.id); setDataReady(true); return; }

      const { data: alias } = await supabase
        .from("owned_usernames")
        .select("owner_id")
        .eq("handle", cleanHandle)
        .maybeSingle();

      if (alias?.owner_id) { setProfileId(alias.owner_id); setDataReady(true); return; }

      setProfileNotFound(true);
      setDataReady(true);
    }
    resolve();
  }, [cleanHandle, isValidHandle, isAtHandle, authLoading, session]);

  useEffect(() => {
    if (hasNavigated.current) return;
    if (!dataReady) return;
    if (authLoading) return;
    if (!navigationState?.key) return;

    // Reserved app route accidentally deep-linked: bounce to the appropriate home.
    if (RESERVED_ROUTES.has(cleanHandle.toLowerCase())) {
      hasNavigated.current = true;
      safeNavigate(session ? "/(tabs)" : "/welcome");
      return;
    }

    if (profileNotFound || !cleanHandle || !isValidHandle) return;
    // /@username without session → shown as public profile, no redirect needed
    if (isAtHandle && !session) return;

    hasNavigated.current = true;

    if (session) {
      // Logged-in: go to full contact/profile screen
      if (profileId) safeNavigate("/contact/[id]", { id: profileId });
    } else {
      // Plain /username (referral link): save referrer_handle then send to register
      AsyncStorage.setItem("referrer_handle", cleanHandle).catch(() => {});
      safeNavigate("/(auth)/register");
    }
  }, [dataReady, authLoading, navigationState?.key, cleanHandle, isValidHandle, profileId, profileNotFound, session, isAtHandle]);

  // While auth state is loading, render nothing — prevents flashing the public
  // profile screen for a logged-in user before session hydrates.
  if (authLoading) return null;

  // Logged-in user — show skeleton while handle→ID resolves, then navigate
  if (session) {
    if (dataReady && (profileNotFound || !isValidHandle)) return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <ProfileNotFoundView handle={cleanHandle} />
      </View>
    );
    // Show skeleton instead of blank while the DB lookup + navigation fires
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ContactProfileSkeleton />
      </View>
    );
  }

  // Plain /username referral link — render nothing while the redirect fires
  if (!isAtHandle) return null;

  // /@username — public profile
  if (!isValidHandle || (dataReady && profileNotFound)) return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <ProfileNotFoundView handle={cleanHandle} />
    </View>
  );

  return <PublicProfileScreen handle={cleanHandle} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pub = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: T.pageH,
    paddingBottom: 12,
    paddingTop: 8,
  },
  headerBack: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    ...T.title,
    textAlign: "center",
  },
  headerSide: { width: 40 },

  // Identity block — centered, no card
  identityBlock: {
    alignItems: "center",
    paddingHorizontal: T.pageH,
    paddingTop: 28,
    paddingBottom: 24,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  displayName: { ...T.h2, textAlign: "center" },
  handleText: { ...T.caption, textAlign: "center", marginTop: 2 },
  bio: {
    ...T.body,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  metaText: { ...T.caption },

  // Stats — inline row, no card
  statsRow: {
    flexDirection: "row",
    paddingVertical: 20,
    paddingHorizontal: T.pageH,
  },
  statCell: { flex: 1, alignItems: "center", gap: 2 },
  statNum: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  statLabel: { ...T.caption, marginTop: 1 },
  statSep: { width: 0.5, marginVertical: 4 },

  // Action buttons
  actionsBlock: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: T.pageH,
    paddingVertical: 16,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnPrimaryText: {
    color: "#fff",
    ...T.bodySemi,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  btnSecondaryText: { ...T.bodySemi },

});
