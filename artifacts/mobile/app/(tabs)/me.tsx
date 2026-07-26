import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MeTabSkeleton } from "@/components/ui/Skeleton";
import { Redirect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarViewer } from "@/components/ui/AvatarViewer";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import QRPosterSheet from "@/components/ui/QRPosterSheet";
import Colors from "@/constants/colors";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { showAlert } from "@/lib/alert";
import { isOnline } from "@/lib/offlineStore";
import { showToast } from "@/lib/toast";
import { TrustpilotReviewCard } from "@/components/TrustpilotReviewPrompt";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── MenuItem ─────────────────────────────────────────────────────────────────

type MenuItemProps = {
  icon: string;
  iconColor: string;
  label: string;
  value?: string;
  badge?: string;
  badgeColor?: string;
  onPress: () => void;
  showSeparator?: boolean;
  colors: any;
  destructive?: boolean;
  rightIcon?: string;
};

function MenuItem({ icon, iconColor, label, value, badge, badgeColor, onPress, showSeparator, colors, destructive, rightIcon }: MenuItemProps) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <>
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          style={mi.row}
          onPress={() => { Haptics.selectionAsync(); onPress(); }}
          onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
          onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start()}
          activeOpacity={1}
        >
          <View style={mi.iconWrap}>
            <Ionicons name={icon as any} size={22} color={colors.text} />
          </View>
          <Text style={[mi.label, { color: destructive ? "#FF3B30" : colors.text }]} numberOfLines={1}>{label}</Text>
          <View style={mi.right}>
            {!!value && <Text style={[mi.value, { color: colors.textMuted }]} numberOfLines={1}>{value}</Text>}
            {!!badge && (
              <View style={[mi.badge, { backgroundColor: (badgeColor || colors.accent) + "20" }]}>
                <Text style={[mi.badgeText, { color: badgeColor || colors.accent }]}>{badge}</Text>
              </View>
            )}
            <Ionicons name={(rightIcon ?? "chevron-forward") as any} size={15} color={colors.textMuted + "80"} />
          </View>
        </TouchableOpacity>
      </Animated.View>
      {showSeparator && <View style={[mi.sep, { backgroundColor: colors.border }]} />}
    </>
  );
}

const mi = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  iconWrap: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  right: { flexDirection: "row", alignItems: "center", gap: 6 },
  value: { fontSize: 13, fontFamily: "Inter_400Regular" },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sep: { height: 0.5, marginLeft: 62 },
});

// ─── SectionLabel ────────────────────────────────────────────────────────────

function SectionLabel({ label, colors }: { label: string; colors: any }) {
  return <Text style={[sl.text, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>;
}
const sl = StyleSheet.create({
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.7, marginBottom: 6, marginTop: 24, marginLeft: 20 },
});

// ─── MenuCard ─────────────────────────────────────────────────────────────────

function MenuCard({ children, colors }: { children: React.ReactNode; colors: any }) {
  return (
    <View style={[mc.card, { backgroundColor: colors.surface }]}>
      {children}
    </View>
  );
}
const mc = StyleSheet.create({
  card: { overflow: "hidden" },
});

// ─── Profile Completion Bar ───────────────────────────────────────────────────

type ProfileFields = {
  avatar_url?: string | null; bio?: string | null; country?: string | null;
  website_url?: string | null; display_name?: string | null; handle?: string | null;
};

function ProfileCompletionBar({ profile, isPremium, colors, accent }: { profile: ProfileFields | null; isPremium: boolean; colors: any; accent: string }) {
  const fillAnim = useRef(new Animated.Value(0)).current;
  const checks = [
    { label: "Photo",   done: !!profile?.avatar_url },
    { label: "Bio",     done: !!profile?.bio },
    { label: "Country", done: !!profile?.country },
    { label: "Website", done: !!profile?.website_url },
    { label: "Premium", done: isPremium },
  ];
  const score = checks.filter((c) => c.done).length;
  const pct = score / checks.length;
  useEffect(() => {
    Animated.timing(fillAnim, { toValue: pct, duration: 900, delay: 400, useNativeDriver: false }).start();
  }, [pct]);
  if (score === checks.length) return null;
  return (
    <View>
      <SectionLabel label="Profile" colors={colors} />
      <MenuCard colors={colors}>
        <TouchableOpacity style={pc.wrap} onPress={() => router.push("/profile/edit")} activeOpacity={0.8}>
          <View style={pc.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={[pc.title, { color: colors.text }]}>Complete your profile</Text>
              <Text style={[pc.sub, { color: colors.textMuted }]}>{score} of {checks.length} steps done</Text>
            </View>
            <View style={[pc.pctBubble, { backgroundColor: accent + "18" }]}>
              <Text style={[pc.pctText, { color: accent }]}>{Math.round(pct * 100)}%</Text>
            </View>
          </View>
          <View style={[pc.track, { backgroundColor: colors.border }]}>
            <Animated.View
              style={[pc.fill, { backgroundColor: accent, width: fillAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}
            />
          </View>
          <View style={pc.checks}>
            {checks.map((c) => (
              <View key={c.label} style={pc.checkItem}>
                <Ionicons name={c.done ? "checkmark-circle" : "ellipse"} size={14} color={c.done ? "#34C759" : colors.border} />
                <Text style={[pc.checkLabel, { color: c.done ? colors.textSecondary : colors.textMuted }]}>{c.label}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>
      </MenuCard>
    </View>
  );
}
const pc = StyleSheet.create({
  wrap: { padding: 14, gap: 10 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  pctBubble: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  pctText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2 },
  checks: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  checkItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  checkLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MeScreen() {
  const { colors, accent, isDark } = useTheme();
  const { profile, isPremium, subscription, loading, user, equippedGoods } = useAuth();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [qrPosterOpen, setQrPosterOpen] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);

  const afuId = useMemo(() => {
    if (!profile?.id) return "00000000";
    return String(parseInt(profile.id.replace(/-/g, "").slice(0, 8), 16) % 100000000).padStart(8, "0");
  }, [profile?.id]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const insets = useSafeAreaInsets();

  type PurchaseInfo = { handle: string; price: number; purchasedAt: string; sellerHandle: string | null };
  const [purchasePopup, setPurchasePopup] = useState<PurchaseInfo | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);

  async function showHandlePurchase(handle: string) {
    void Haptics.selectionAsync();
    setPurchaseLoading(true);
    const { data } = await supabase
      .from("username_listings")
      .select("price, created_at, seller_id, profiles!username_listings_seller_id_fkey(handle)")
      .eq("username", handle)
      .not("sold_to_id", "is", null)
      .maybeSingle();
    setPurchaseLoading(false);
    if (!data) return;
    setPurchasePopup({
      handle,
      price: (data as any).price ?? 0,
      purchasedAt: (data as any).created_at ?? "",
      sellerHandle: (data as any).profiles?.handle ?? null,
    });
  }

  function fmtDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // ── Load stats ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const STATS_KEY = `me_stats_${user.id}`;
    AsyncStorage.getItem(STATS_KEY).then((raw) => {
      if (raw) { try { const { fc, fgc, pc } = JSON.parse(raw); setFollowerCount(fc ?? 0); setFollowingCount(fgc ?? 0); setPostCount(pc ?? 0); } catch {} }
    });
    if (!isOnline()) return;
    Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id),
      supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", user.id),
    ]).then(([{ count: fc }, { count: fgc }, { count: pc }]) => {
      setFollowerCount(fc ?? 0); setFollowingCount(fgc ?? 0); setPostCount(pc ?? 0);
      AsyncStorage.setItem(STATS_KEY, JSON.stringify({ fc, fgc, pc })).catch(() => {});
    }).catch(() => {});
  }, [user?.id]);

  // ── Live stats via realtime ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const STATS_KEY = `me_stats_${user.id}`;
    function persist(patch: Record<string, number>) {
      AsyncStorage.getItem(STATS_KEY).then((raw) => {
        try { const cur = raw ? JSON.parse(raw) : {}; AsyncStorage.setItem(STATS_KEY, JSON.stringify({ ...cur, ...patch })).catch(() => {}); } catch {}
      });
    }
    const ch = supabase
      .channel(`me-stats:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "follows", filter: `following_id=eq.${user.id}` }, () =>
        void (async () => {
          try {
            const { count } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id);
            setFollowerCount(count ?? 0);
            persist({ fc: count ?? 0 });
          } catch {}
        })()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "follows", filter: `follower_id=eq.${user.id}` }, () =>
        void (async () => {
          try {
            const { count } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id);
            setFollowingCount(count ?? 0);
            persist({ fgc: count ?? 0 });
          } catch {}
        })()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "posts", filter: `author_id=eq.${user.id}` }, () =>
        void (async () => {
          try {
            const { count } = await supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", user.id);
            setPostCount(count ?? 0);
            persist({ pc: count ?? 0 });
          } catch {}
        })()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // ── My Notes ────────────────────────────────────────────────────────────────
  const openMyNotes = useCallback(async () => {
    if (!user || notesLoading) return;
    void Haptics.selectionAsync();
    setNotesLoading(true);
    try {
      const CACHE_KEY = `notes_chat_id_${user.id}`;
      const NOTES_NAME = `notes:${user.id}`;
      let notesId = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);

      if (isOnline()) {
        if (notesId) {
          const { data: existing } = await supabase.from("chats").select("id, name").eq("id", notesId).eq("name", NOTES_NAME).maybeSingle();
          if (!existing) notesId = null;
        }
        if (!notesId) {
          const { data: found } = await supabase.from("chats").select("id").eq("name", NOTES_NAME).maybeSingle();
          if (found) {
            notesId = found.id;
          } else {
            const { data: newChat, error: createErr } = await supabase
              .from("chats").insert({ is_group: false, is_channel: false, name: NOTES_NAME, created_by: user.id, user_id: user.id }).select("id").single();
            if (createErr || !newChat) throw new Error(createErr?.message || "Failed to create notes chat");
            await supabase.from("chat_members").insert({ chat_id: newChat.id, user_id: user.id });
            notesId = newChat.id;
          }
          await AsyncStorage.setItem(CACHE_KEY, notesId!).catch(() => {});
        }
      } else if (!notesId) {
        showToast("My Notes will be available once you connect to the internet", { type: "info" });
        return;
      }

      router.push({ pathname: "/chat/[id]", params: { id: notesId, otherId: user.id, otherName: "My Notes" } } as any);
    } catch (err: any) {
      showAlert("Error", err.message || "Could not open notes");
    } finally {
      setNotesLoading(false);
    }
  }, [user, notesLoading]);

  if (!loading && !profile) return <Redirect href="/discover" />;
  if (loading || !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }}>
        <MeTabSkeleton />
      </View>
    );
  }

  const acoin = profile?.acoin || 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <OfflineBanner />

      {/* ── Settings gear ───────────────────────────────────────────────────── */}
      {(
        <TouchableOpacity
          onPress={() => router.push("/settings" as any)}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          activeOpacity={0.7}
          style={{
            position: "absolute",
            top: insets.top + 10,
            right: 16,
            zIndex: 10,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.backgroundSecondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="settings" size={19} color={colors.text} />
        </TouchableOpacity>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, {
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 96,
          alignSelf: "center",
          width: "100%",
        }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero Card ───────────────────────────────────────────────────── */}
        <View style={[s.heroCard, { backgroundColor: colors.surface }]}>

          {/* Avatar + info row */}
          <View style={s.heroTop}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setAvatarOpen(true)}
              onLongPress={() => { void Haptics.impactAsync(); setQrPosterOpen(true); }}
              delayLongPress={400}
            >
              <Avatar
                uri={profile?.avatar_url}
                name={profile?.display_name}
                size={74}
                userId={user?.id}
                square={!!(profile?.is_organization_verified || profile?.is_business_mode)}
                prestigeRing={
                  equippedGoods.has('sg2') ? 'void' :
                  equippedGoods.has('sg3') ? 'diamond' : null
                }
              />
              {isPremium && (
                <View style={s.premiumDot}>
                  <Ionicons name="diamond" size={9} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text style={[s.heroName, { color: equippedGoods.has('sg4') ? Colors.gold : colors.text }]} numberOfLines={1} ellipsizeMode="tail">
                  {profile?.display_name || "User"}
                </Text>
                <VerifiedBadge isVerified={profile?.is_verified} isOrganizationVerified={profile?.is_organization_verified} size={17} />
              </View>

              <TouchableOpacity
                onPress={() => profile?.handle && showHandlePurchase(profile.handle)}
                activeOpacity={0.7}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                {purchaseLoading && <ActivityIndicator size="small" color={colors.textMuted} style={{ marginRight: 4 }} />}
                <Text style={[s.heroHandle, { color: colors.textMuted }]}>@{profile?.handle || "handle"}</Text>
                <Ionicons name="information-circle" size={13} color={colors.textMuted} style={{ opacity: 0.6 }} />
              </TouchableOpacity>

              {profile?.is_organization_verified && (
                <View style={[s.businessChip, { backgroundColor: Colors.gold + "20" }]}>
                  <Ionicons name="briefcase" size={10} color={Colors.gold} />
                  <Text style={[s.businessChipText, { color: Colors.gold }]}>Business</Text>
                </View>
              )}
            </View>
          </View>

          {/* Bio */}
          {!!profile?.bio && (
            <Text style={[s.heroBio, { color: colors.textSecondary, borderTopColor: colors.border }]} numberOfLines={2}>
              {profile.bio}
            </Text>
          )}

          {/* ACoin bar */}
          <TouchableOpacity
            style={[s.acoinBar, { backgroundColor: Colors.gold + "10", borderTopColor: colors.border }]}
            onPress={() => router.push("/prestige")}
            activeOpacity={0.8}
          >
            <View style={[s.acoinIconWrap, { backgroundColor: Colors.gold + "22" }]}>
              <Text style={s.acoinEmoji}>🪙</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.acoinBalance, { color: Colors.gold }]}>{fmtCount(acoin)} ACoin</Text>
              <Text style={[s.acoinSub, { color: colors.textMuted }]}>Prestige level & rewards</Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={Colors.gold + "80"} />
          </TouchableOpacity>
        </View>

        {/* ── Stats Row ───────────────────────────────────────────────────── */}
        <View style={[s.statsRow, { backgroundColor: colors.surface }]}>
          {[
            {
              label: "Followers", count: followerCount,
              onPress: () => profile?.id && router.push({ pathname: "/followers", params: { userId: profile.id, type: "followers", ownerHandle: profile.handle } } as any),
            },
            {
              label: "Following", count: followingCount,
              onPress: () => profile?.id && router.push({ pathname: "/followers", params: { userId: profile.id, type: "following", ownerHandle: profile.handle } } as any),
            },
            {
              label: "Posts", count: postCount,
              onPress: () => router.push("/my-posts"),
            },
          ].map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && <View style={[s.statDivider, { backgroundColor: colors.border }]} />}
              <TouchableOpacity style={s.statCell} onPress={stat.onPress} activeOpacity={0.7}>
                <Text style={[s.statValue, { color: colors.text }]}>{fmtCount(stat.count)}</Text>
                <Text style={[s.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* ── Quick Actions ───────────────────────────────────────────────── */}
        <View style={[s.quickRow, { backgroundColor: colors.surface }]}>
          {[
            { icon: "create",    label: "Edit Profile", color: accent, onPress: () => router.push("/profile/edit") },
            { icon: "person",    label: "My Profile",   color: accent, onPress: () => profile?.handle && router.push(`/@${profile.handle}` as any) },
            { icon: "qr-code",   label: "QR Code",      color: accent, onPress: () => router.push("/qr-scanner" as any) },
            { icon: "card",      label: "Digital ID",   color: accent, onPress: () => router.push("/digital-id" as any) },
          ].map((a) => (
            <TouchableOpacity key={a.label} style={s.quickBtn} onPress={a.onPress} activeOpacity={0.75}>
              <View style={[s.quickIconWrap, { backgroundColor: a.color + "15" }]}>
                <Ionicons name={a.icon as any} size={20} color={a.color} />
              </View>
              <Text style={[s.quickLabel, { color: colors.textSecondary }]} numberOfLines={1}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Premium Banner / Card ───────────────────────────────────────── */}
        {!isPremium ? (
          <TouchableOpacity
            style={[s.premiumBanner, { backgroundColor: isDark ? "#0f1923" : "#1A1208" }]}
            onPress={() => router.push("/premium")}
            activeOpacity={0.88}
          >
            <View style={[s.premiumIconWrap, { backgroundColor: "#FFD60A18" }]}>
              <Ionicons name="diamond" size={22} color="#FFD60A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.premiumTitle}>Upgrade to Premium</Text>
              <Text style={s.premiumSub}>Verified badge, exclusive perks & more</Text>
            </View>
            <View style={[s.premiumChip, { backgroundColor: "#FFD60A22" }]}>
              <Text style={s.premiumChipText}>Upgrade</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View>
            <SectionLabel label="Subscription" colors={colors} />
            <MenuCard colors={colors}>
              <MenuItem
                icon="diamond"
                iconColor={accent}
                label="Premium Active"
                value={subscription?.plan_tier ? `${subscription.plan_tier}` : "Active"}
                onPress={() => router.push("/premium")}
                colors={colors}
              />
            </MenuCard>
          </View>
        )}

        {/* ── Profile Completion ──────────────────────────────────────────── */}
        <ProfileCompletionBar profile={profile} isPremium={isPremium} colors={colors} accent={accent} />

        {/* ── My Content ─────────────────────────────────────────────────── */}
        <View>
          <SectionLabel label="My Content" colors={colors} />
          <MenuCard colors={colors}>
            <MenuItem
              icon="grid"
              iconColor={accent}
              label="My Posts"
              value={`${fmtCount(postCount)} posts`}
              onPress={() => router.push("/my-posts")}
              showSeparator
              colors={colors}
            />
            <MenuItem
              icon="bookmark"
              iconColor={accent}
              label="Saved Posts"
              onPress={() => router.push("/saved-posts" as any)}
              showSeparator
              colors={colors}
            />
            <MenuItem
              icon="time"
              iconColor={accent}
              label="Watch History"
              onPress={() => router.push("/watch-history" as any)}
              showSeparator
              colors={colors}
            />
            <MenuItem
              icon="document-text"
              iconColor={accent}
              label="My Notes"
              badge={notesLoading ? "…" : undefined}
              onPress={openMyNotes}
              colors={colors}
            />
          </MenuCard>
        </View>

        {/* ── Social & Growth ─────────────────────────────────────────────── */}
        <View>
          <SectionLabel label="Social & Growth" colors={colors} />
          <MenuCard colors={colors}>
            <MenuItem
              icon="people"
              iconColor={accent}
              label="Find People"
              onPress={() => router.push("/user-discovery")}
              showSeparator
              colors={colors}
            />
            <MenuItem
              icon="gift"
              iconColor={accent}
              label="Referral Program"
              badge="Earn ACoin"
              onPress={() => router.push("/referral" as any)}
              showSeparator
              colors={colors}
            />
            <MenuItem
              icon="trophy"
              iconColor={accent}
              label="Prestige & Rewards"
              badge="NEW"
              onPress={() => router.push("/prestige")}
              showSeparator
              colors={colors}
            />
            <MenuItem
              icon="people-circle"
              iconColor={accent}
              label="Phone Contacts"
              onPress={() => router.push("/phone-contacts" as any)}
              showSeparator
              colors={colors}
            />
            <MenuItem
              icon="ribbon"
              iconColor={accent}
              label="Achievements"
              onPress={() => router.push("/achievements" as any)}
              colors={colors}
            />
          </MenuCard>
        </View>

        {/* ── Trustpilot ──────────────────────────────────────────────────── */}
        <TrustpilotReviewCard />

      </ScrollView>

      <AvatarViewer
        visible={avatarOpen}
        uri={profile?.avatar_url}
        name={profile?.display_name || undefined}
        onClose={() => setAvatarOpen(false)}
      />

      <QRPosterSheet
        visible={qrPosterOpen}
        onClose={() => setQrPosterOpen(false)}
        displayName={profile?.display_name || "AfuChat User"}
        handle={profile?.handle || "user"}
        avatarUrl={profile?.avatar_url || null}
        afuId={afuId}
        isVerified={!!profile?.is_verified}
        isOrgVerified={!!profile?.is_organization_verified}
      />

      {/* ── Username Purchase Details Modal ─────────────────────────────── */}
      <Modal visible={!!purchasePopup} transparent animationType="none" onRequestClose={() => setPurchasePopup(null)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}
          activeOpacity={1}
          onPress={() => setPurchasePopup(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{ width: "82%", backgroundColor: colors.surface, borderRadius: 22, padding: 24, borderWidth: 0.5, borderColor: colors.border, gap: 16 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.text }}>Username Details</Text>
              <TouchableOpacity onPress={() => setPurchasePopup(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ alignItems: "center", paddingVertical: 8 }}>
              <View style={{ backgroundColor: accent + "18", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24 }}>
                <Text style={{ fontSize: 26, fontFamily: "Inter_700Bold", color: accent }}>@{purchasePopup?.handle}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
                <Ionicons name="storefront" size={13} color="#34C759" />
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#34C759" }}>Purchased from Marketplace</Text>
              </View>
            </View>
            <View style={{ gap: 12, backgroundColor: colors.backgroundSecondary, borderRadius: 14, padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Ionicons name="cash" size={16} color={colors.icon} />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>Price Paid</Text>
                </View>
                <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFD60A" }}>🪙 {purchasePopup?.price.toLocaleString()} ACoin</Text>
              </View>
              <View style={{ height: 0.5, backgroundColor: colors.border }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Ionicons name="calendar" size={16} color={colors.icon} />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>Purchased On</Text>
                </View>
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }}>{purchasePopup ? fmtDate(purchasePopup.purchasedAt) : "—"}</Text>
              </View>
              {purchasePopup?.sellerHandle && (
                <>
                  <View style={{ height: 0.5, backgroundColor: colors.border }} />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <Ionicons name="person" size={16} color={colors.icon} />
                      <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.textSecondary }}>Sold By</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }}>@{purchasePopup.sellerHandle}</Text>
                  </View>
                </>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setPurchasePopup(null)}
              style={{ backgroundColor: accent, borderRadius: 16, paddingVertical: 12, alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  content: { gap: 0, paddingHorizontal: 0 },

  // Hero
  heroCard: { overflow: "hidden" },
  heroTop: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, gap: 14 },
  heroName: { fontSize: 19, fontFamily: "Inter_700Bold", flexShrink: 1 },
  heroHandle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  heroBio: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, paddingHorizontal: 20, paddingBottom: 14, paddingTop: 12 },
  premiumDot: { position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: "#FFD60A", alignItems: "center", justifyContent: "center" },
  businessChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start", marginTop: 3 },
  businessChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  // ACoin bar
  acoinBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  acoinIconWrap: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  acoinEmoji: { fontSize: 18 },
  acoinBalance: { fontSize: 15, fontFamily: "Inter_700Bold" },
  acoinSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Stats
  statsRow: { flexDirection: "row", paddingVertical: 16, paddingHorizontal: 8 },
  statCell: { flex: 1, alignItems: "center", gap: 3 },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: 0.5, marginVertical: 4 },

  // Quick actions
  quickRow: { flexDirection: "row", paddingVertical: 16, paddingHorizontal: 4 },
  quickBtn: { flex: 1, alignItems: "center", gap: 7 },
  quickIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "center" },

  // Premium banner
  premiumBanner: { padding: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  premiumIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  premiumTitle: { color: "#FFD60A", fontSize: 15, fontFamily: "Inter_700Bold" },
  premiumSub: { color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  premiumChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  premiumChipText: { color: "#FFD60A", fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
