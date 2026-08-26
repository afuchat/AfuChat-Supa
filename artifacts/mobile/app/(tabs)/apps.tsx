import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { safeRouter } from "@/lib/navUtils";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/ui/SafeGradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "@/lib/haptics";
import { useSuperApp } from "@/lib/superapp/MiniAppRuntime";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { isOnline } from "@/lib/offlineStore";
import { showToast } from "@/lib/toast";

const USAGE_KEY = "afu_app_usage";
const COLS = 4;
const H_PAD = 16;

type AppItem = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  gradient: [string, string];
  route: string;
  badge?: string;
  featuredSub?: string;
  orgOnly?: boolean;
  miniApp?: boolean;
  nativeOnly?: boolean;
};

type Category = {
  id: string;
  title: string;
  apps: AppItem[];
};

const CATEGORIES: Category[] = [
  {
    id: "super",
    title: "Super Apps",
    apps: [
      {
        id: "afupay",
        label: "AfuPay",
        icon: "wallet",
        gradient: ["#34C759", "#00C781"],
        route: "/wallet",
        miniApp: true,
        featuredSub: "Send, receive and manage your ACoins & Nexa.",
      },
      {
        id: "afumarket",
        label: "AfuMarket",
        icon: "storefront",
        gradient: ["#AF52DE", "#BF5AF2"],
        route: "/store",
        badge: "NEW",
        miniApp: true,
        featuredSub: "Shop from verified stores and sellers.",
      },
      {
        id: "afugames",
        label: "AfuGames",
        icon: "game-controller",
        gradient: ["#FF3B30", "#FF6B35"],
        route: "/games",
        featuredSub: "Play mini games and compete with friends.",
      },
      {
        id: "afubusiness",
        label: "AfuBusiness",
        icon: "briefcase",
        gradient: ["#1C1C1E", "#3A3A3C"],
        route: "/business",
        miniApp: true,
        orgOnly: true,
        featuredSub: "Tools and analytics for your business.",
      },
    ],
  },
  {
    id: "ai",
    title: "Intelligence",
    apps: [
      {
        id: "afusearch",
        label: "Search",
        icon: "search",
        gradient: ["#5856D6", "#6E6CD3"],
        route: "/search",
        miniApp: true,
        featuredSub: "Find people, posts, channels, events and more.",
      },
      {
        id: "afulens",
        label: "AfuLab",
        icon: "scan",
        gradient: ["#FF6B35", "#FF3B00"],
        route: "/lab",
        badge: "AI",
        miniApp: true,
        nativeOnly: true,
        featuredSub: "Point your camera and get instant AI-powered answers.",
      },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    apps: [
      {
        id: "afuservices",
        label: "Services",
        icon: "card",
        gradient: ["#AF52DE", "#BF5AF2"],
        route: "/mini-programs",
        miniApp: true,
        featuredSub: "Pay bills, top up, and access local services.",
      },
      {
        id: "afufreelance",
        label: "Freelance",
        icon: "briefcase",
        gradient: ["#34C759", "#30D158"],
        route: "/freelance",
        badge: "NEW",
        miniApp: true,
        featuredSub: "Hire talent or find work on AfuFreelance.",
      },
    ],
  },
  {
    id: "tools",
    title: "Tools",
    apps: [
      {
        id: "afufiles",
        label: "Files",
        icon: "folder",
        gradient: ["#5856D6", "#6E6CD3"],
        route: "/file-manager",
        featuredSub: "Browse your shared media and files in one place.",
      },
    ],
  },
  {
    id: "entertainment",
    title: "Entertainment",
    apps: [
      {
        id: "afugifts",
        label: "Gifts",
        icon: "gift",
        gradient: ["#FF3B30", "#FF453A"],
        route: "/gifts",
        featuredSub: "Send animated gifts to people you love.",
      },
      {
        id: "afuevents",
        label: "Events",
        icon: "calendar",
        gradient: ["#FF9500", "#FFCC00"],
        route: "/digital-events",
        miniApp: true,
        featuredSub: "Discover local and online events near you.",
      },
    ],
  },
  {
    id: "community",
    title: "Community",
    apps: [
      {
        id: "afumatch",
        label: "AfuMatch",
        icon: "heart",
        gradient: ["#FF2D55", "#FF375F"],
        route: "/match",
        featuredSub: "Meet new people and find meaningful connections.",
      },
      {
        id: "afucollections",
        label: "Collections",
        icon: "albums",
        gradient: ["#BF5AF2", "#AF52DE"],
        route: "/collections",
        miniApp: true,
        featuredSub: "Curate and share themed collections.",
      },
      {
        id: "afuusernames",
        label: "Handles",
        icon: "at",
        gradient: ["#007AFF", "#5AC8FA"],
        route: "/username-market",
        miniApp: true,
        featuredSub: "Buy and sell premium @handles.",
      },
    ],
  },
];

const ALL_APPS = CATEGORIES.flatMap((c) => c.apps);
const FEATURED_IDS = ["afupay", "afumarket", "afugames", "afumatch", "afufreelance"];

function resolveGradient(gradient: [string, string], accent: string): [string, string] {
  return gradient.map((c) => (c === "#1018D8" ? accent : c)) as [string, string];
}

function openAppItem(app: AppItem, openApp: (id: string) => void) {
  const needsNetwork = app.miniApp;
  if (needsNetwork && !isOnline()) {
    showToast(`${app.label} requires an internet connection`, { type: "info", icon: "wifi" });
  }
  // On web the mini-app overlay uses native animations and native-only modules
  // (e.g. react-native-webview) that aren't available. Fall back to the standard
  // Expo Router route which works on all platforms.
  if (app.miniApp && Platform.OS !== "web") {
    openApp(app.id);
  } else {
    safeRouter.push(app.route as any);
  }
}

function FeaturedCard({
  app,
  accent,
  onTap,
  openApp,
}: {
  app: AppItem;
  accent: string;
  onTap: (id: string) => void;
  openApp: (id: string) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  }
  function handlePressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }
  function handlePress() {
    Haptics.selectionAsync();
    onTap(app.id);
    openAppItem(app, openApp);
  }

  const [c0, c1] = resolveGradient(app.gradient, accent);

  return (
    <Animated.View style={{ transform: [{ scale }], marginRight: 12 }}>
      <Pressable onPress={handlePress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <LinearGradient colors={[c0, c1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.featCard}>
          <View style={styles.featCardInner}>
            <View style={styles.featIconRing}>
              <Ionicons name={app.icon} size={28} color="#fff" />
            </View>
            {app.badge ? (
              <View style={styles.featBadge}>
                <Text style={styles.featBadgeText}>{app.badge}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.featLabel} numberOfLines={1}>{app.label}</Text>
          {app.featuredSub ? (
            <Text style={styles.featSub} numberOfLines={2}>{app.featuredSub}</Text>
          ) : null}
          <View style={styles.featOpenBtn}>
            <Text style={styles.featOpenText}>Open</Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function AppTile({
  app,
  tileWidth,
  usageCount,
  onTap,
  openApp,
}: {
  app: AppItem;
  tileWidth: number;
  usageCount?: number;
  onTap: (id: string) => void;
  openApp: (id: string) => void;
}) {
  const { colors, accent } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  }
  function handlePressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }).start();
  }
  function handlePress() {
    Haptics.selectionAsync();
    onTap(app.id);
    openAppItem(app, openApp);
  }

  return (
    <Animated.View style={[{ transform: [{ scale }], width: tileWidth, alignItems: "center" }]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.tilePressable}
      >
        <View style={styles.iconWrapper}>
          <LinearGradient
            colors={resolveGradient(app.gradient, accent)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGradient}
          >
            <Ionicons name={app.icon} size={26} color="#fff" />
          </LinearGradient>
          {app.badge ? (
            <View style={[styles.badge, app.badge === "AI" ? styles.badgeAI : app.badge === "NEW" ? styles.badgeNew : styles.badgeDefault]}>
              <Text style={styles.badgeText}>{app.badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={1}>
          {app.label}
        </Text>
        {usageCount && usageCount > 0 ? (
          <Text style={[styles.usageText, { color: colors.textMuted }]}>
            {usageCount > 99 ? "99+" : usageCount}{"x"}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export default function AppsScreen() {
  const { colors, accent, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: SW } = useWindowDimensions();
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const { isPremium, profile } = useAuth();
  const isOrgVerified = !!profile?.is_organization_verified;
  const { openApp } = useSuperApp();

  const tileWidth = Math.floor((SW - H_PAD * 2) / COLS);

  useEffect(() => {
    AsyncStorage.getItem(USAGE_KEY).then((raw) => {
      if (raw) {
        try { setUsageCounts(JSON.parse(raw)); } catch (_) {}
      }
    });
  }, []);

  function trackTap(appId: string) {
    setUsageCounts((prev) => {
      const updated = { ...prev, [appId]: (prev[appId] ?? 0) + 1 };
      AsyncStorage.setItem(USAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }

  function isVisible(a: AppItem) {
    if (a.orgOnly && !isOrgVerified) return false;
    return true;
  }

  const featuredApps = FEATURED_IDS
    .map((id) => ALL_APPS.find((a) => a.id === id))
    .filter((a): a is AppItem => !!a && isVisible(a));

  const filteredCategories = CATEGORIES.map((cat) => ({
    ...cat,
    apps: cat.apps.filter((a) => {
      if (!isVisible(a)) return false;
      if (!searchQuery) return true;
      return a.label.toLowerCase().includes(searchQuery.toLowerCase());
    }),
  })).filter((cat) => cat.apps.length > 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingHorizontal: H_PAD }]}>
          <View style={styles.headerLeft}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{"Apps"}</Text>
            {isPremium ? (
              <View style={[styles.premiumPill, { backgroundColor: colors.backgroundSecondary }]}>
                <Ionicons name="diamond" size={11} color="#FFD60A" />
                <Text style={styles.premiumPillText}>{"Premium"}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Search bar ── */}
        <View style={[styles.searchWrap, { paddingHorizontal: H_PAD, marginBottom: 20 }]}>
          <View style={[styles.searchBox, { backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)" }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search apps…"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* ── Featured horizontal scroll ── */}
        {!searchQuery ? (
          <View style={{ marginBottom: 28 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, paddingHorizontal: H_PAD, marginBottom: 12 }]}>
              {"Featured"}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: H_PAD, paddingBottom: 4 }}
              decelerationRate="fast"
              snapToInterval={172}
              snapToAlignment="start"
            >
              {featuredApps.map((app) => (
                <FeaturedCard
                  key={app.id}
                  app={app}
                  accent={accent}
                  onTap={trackTap}
                  openApp={openApp}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* ── Category grids ── */}
        {filteredCategories.map((cat) => {
          const padCount = cat.apps.length % COLS === 0 ? 0 : COLS - (cat.apps.length % COLS);
          return (
            <View key={cat.id} style={{ marginBottom: 24 }}>
              <Text style={[styles.sectionTitle, { color: colors.text, paddingHorizontal: H_PAD, marginBottom: 4 }]}>
                {cat.title}
              </Text>
              <View style={[styles.grid, { paddingHorizontal: H_PAD }]}>
                {cat.apps.map((app) => (
                  <AppTile
                    key={app.id}
                    app={app}
                    tileWidth={tileWidth}
                    usageCount={usageCounts[app.id]}
                    onTap={trackTap}
                    openApp={openApp}
                  />
                ))}
                {Array.from({ length: padCount }).map((_, i) => (
                  <View key={"pad-" + i} style={{ width: tileWidth }} />
                ))}
              </View>
            </View>
          );
        })}

        {filteredCategories.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="search" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No apps match "{searchQuery}"</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  premiumPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  premiumPillText: { color: "#FFD60A", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  searchWrap: {},
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  /* Featured card */
  featCard: {
    width: 160,
    borderRadius: 20,
    padding: 16,
    justifyContent: "space-between",
    minHeight: 170,
  },
  featCardInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  featIconRing: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  featBadge: {
    backgroundColor: "rgba(255,255,255,0.28)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  featBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  featLabel: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  featSub: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
    flex: 1,
  },
  featOpenBtn: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  featOpenText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  /* Grid tile */
  grid: { flexDirection: "row", flexWrap: "wrap" },
  tilePressable: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 2,
    width: "100%",
  },
  iconWrapper: { position: "relative", marginBottom: 8 },
  iconGradient: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -7,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  badgeAI: { backgroundColor: "#007AFF" },
  badgeNew: { backgroundColor: "#34C759" },
  badgeDefault: { backgroundColor: "#FF3B30" },
  badgeText: { color: "#fff", fontSize: 8, fontFamily: "Inter_700Bold" },
  tileLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    maxWidth: 68,
  },
  usageText: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 1 },
  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
