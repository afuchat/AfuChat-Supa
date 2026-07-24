import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { Security2FABanner } from "@/components/ui/Security2FABanner";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router, usePathname } from "expo-router";
import { safeRouter } from "@/lib/navUtils";
import type { Session } from "@supabase/supabase-js";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { TabSwipeProvider } from "@/context/TabSwipeContext";
import { getLocalConversations } from "@/lib/storage/localConversations";
import { supabase } from "@/lib/supabase";
import { emitShortsRefresh } from "@/lib/shortsRefresh";
import { getTotalUnread, subscribeUnread } from "@/lib/chatUnreadEvents";

const TABS = [
  { route: "/(tabs)/chats",    label: "Chats",   mdOn: "chatbubbles",   mdOff: "chatbubbles-outline"   },
  { route: "/(tabs)/discover", label: "Discover", mdOn: "compass",       mdOff: "compass-outline"       },
  { route: "/(tabs)/shorts",   label: "Shorts",   mdOn: "play-circle",   mdOff: "play-circle-outline"   },
  { route: "/(tabs)/apps",     label: "Apps",     mdOn: "grid",          mdOff: "grid-outline"          },
  { route: "/(tabs)/me",       label: "Profile",  mdOn: "person",        mdOff: "person-outline"        },
] as const;

function normalizeTabPath(p: string): string {
  if (p === "/" || p === "/(tabs)" || p === "/(tabs)/index" || p === "/chats" || p === "/(tabs)/chats") return "/(tabs)/chats";
  if (p === "/discover"  || p === "/(tabs)/discover")  return "/(tabs)/discover";
  if (p === "/shorts"    || p === "/(tabs)/shorts")    return "/(tabs)/shorts";
  if (p === "/apps"      || p === "/(tabs)/apps")      return "/(tabs)/apps";
  if (p === "/me"        || p === "/(tabs)/me")        return "/(tabs)/me";
  return p;
}

function useTotalUnread(userId: string | undefined): number {
  const [total, setTotal] = useState(() => getTotalUnread());

  useEffect(() => {
    if (!userId) return;

    const unsubStore = subscribeUnread(setTotal);

    const fallbackRefresh = async () => {
      const convs = await getLocalConversations();
      setTotal(convs.reduce((s, c) => s + (c.unread_count ?? 0), 0));
    };
    const ch = supabase
      .channel(`tab-bar-unread-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_status", filter: `user_id=eq.${userId}` }, fallbackRefresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "message_status", filter: `user_id=eq.${userId}` }, fallbackRefresh)
      .subscribe();

    return () => {
      unsubStore();
      supabase.removeChannel(ch);
    };
  }, [userId]);

  return total;
}

// ── Compact floating tab bar ──────────────────────────────────────────────────
function CompactTabBar({
  userId,
  avatarUrl,
}: {
  userId: string | undefined;
  avatarUrl: string | null | undefined;
}) {
  const pathname        = usePathname();
  const insets          = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const totalUnread     = useTotalUnread(userId);
  const active          = normalizeTabPath(pathname);
  const isAndroid       = Platform.OS === "android";

  const lastShortsTapRef = useRef<number>(0);

  // ── Pill position — instant, no animation ────────────────────────────────────
  const ITEM_W  = 64;
  const PILL_W  = 56;
  const PILL_H  = 32;
  const BAR_PAD = 6;

  const pillX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const idx = TABS.findIndex(t => t.route === active);
    if (idx === -1) return;
    pillX.setValue(idx * ITEM_W);
  }, [active]);

  const bottomPos = Math.max(insets.bottom, 4) + 6;

  const barBg      = isDark ? "rgba(38,38,44,0.96)" : "rgba(255,255,255,0.97)";
  const borderColor = isDark ? "rgba(58,58,64,1)"   : "rgba(221,215,201,1)";

  const shadow = isDark
    ? { elevation: 20 }
    : { elevation: 12 };

  const ripple = { color: colors.accent + "22", borderless: false } as const;

  function handleTabPress(route: typeof TABS[number]["route"]) {
    if (route === "/(tabs)/shorts" && active === "/(tabs)/shorts") {
      const now = Date.now();
      if (now - lastShortsTapRef.current < 400) {
        emitShortsRefresh();
        lastShortsTapRef.current = 0;
        return;
      }
      lastShortsTapRef.current = now;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    safeRouter.navigate(route as any);
  }

  return (
    <View style={[bar.container, { bottom: bottomPos, pointerEvents: "box-none" }]}>
      <View style={[bar.pill, shadow, { backgroundColor: barBg, borderColor }]}>
        {/* Accent highlight — jumps instantly to active tab */}
        <Animated.View
          style={[
            bar.highlight,
            {
              width: PILL_W,
              height: PILL_H,
              borderRadius: PILL_H / 2,
              backgroundColor: colors.accent + "30",
              left: BAR_PAD + (ITEM_W - PILL_W) / 2,
              transform: [{ translateX: pillX }],
            },
          ]}
        />

        {TABS.map((tab) => {
          const focused    = active === tab.route;
          const mutedColor = isDark ? "rgba(95,93,105,1)" : "rgba(110,108,118,1)";
          const iconColor  = focused ? colors.accent : mutedColor;
          const isProfile  = tab.route === "/(tabs)/me";

          return (
            <View key={tab.route} style={bar.item}>
              <Pressable
                android_ripple={ripple}
                style={({ pressed }) => [
                  bar.pressable,
                  isAndroid && pressed ? { opacity: 0.68 } : null,
                ]}
                onPress={() => handleTabPress(tab.route)}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: focused }}
              >
                <View style={bar.iconChip}>
                  {isProfile && avatarUrl ? (
                    <ExpoImage
                      source={{ uri: avatarUrl }}
                      style={[
                        bar.avatar,
                        focused
                          ? { borderColor: colors.accent, borderWidth: 2.5 }
                          : { borderColor: "rgba(128,128,128,0.22)", borderWidth: 2 },
                      ]}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <Ionicons
                      name={(focused ? tab.mdOn : tab.mdOff) as any}
                      size={22}
                      color={iconColor}
                    />
                  )}
                </View>
                <Text
                  style={[
                    bar.label,
                    { color: iconColor },
                    focused && bar.labelActive,
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </Pressable>

              {tab.route === "/(tabs)/chats" && totalUnread > 0 && (
                <View style={[bar.badge, { backgroundColor: colors.accent }]}>
                  <Text style={bar.badgeText} numberOfLines={1}>
                    {totalUnread > 99 ? "99+" : String(totalUnread)}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const bar = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  pill: {
    flexDirection: "row",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderWidth: 1,
    alignSelf: "center",
    overflow: "hidden",
  },
  highlight: {
    position: "absolute",
    top: 9,
    zIndex: 0,
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    zIndex: 1,
  },
  pressable: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    paddingVertical: 2,
    width: 64,
  },
  iconChip: {
    width: 64,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 0.1,
    lineHeight: 14,
    textAlign: "center",
  },
  labelActive: {
    fontSize: 11.5,
    fontFamily: "Inter_700Bold",
    fontWeight: "900",
    letterSpacing: 0.15,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    zIndex: 10,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    lineHeight: 12,
  },
});

function ClassicTabLayout({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        animation: "none",
        sceneStyle: { backgroundColor: "transparent" },
        tabBarStyle: {
          display: "none",
          backgroundColor: "transparent",
          elevation: 0,
          ...Platform.select({ web: {}, default: { shadowOpacity: 0 } }),
          borderTopWidth: 0,
        },
        tabBarBackground: () => null,
      }}
    >
      <Tabs.Screen name="index"         options={{ href: null }} />
      <Tabs.Screen name="chats"         options={{ href: isLoggedIn ? undefined : null }} />
      <Tabs.Screen name="discover"      options={{ href: isLoggedIn ? undefined : null, lazy: true }} />
      <Tabs.Screen name="shorts"        options={{ href: isLoggedIn ? undefined : null, lazy: true }} />
      <Tabs.Screen name="search"        options={{ href: null }} />
      <Tabs.Screen name="contacts"      options={{ href: null }} />
      <Tabs.Screen name="communities"   options={{ href: null }} />
      <Tabs.Screen name="apps"          options={{ href: isLoggedIn ? undefined : null, lazy: true }} />
      <Tabs.Screen name="me"            options={{ href: isLoggedIn ? undefined : null, lazy: true }} />
    </Tabs>
  );
}

export default function TabLayout() {
  const { session, profile, loading, user } = useAuth();
  const isLoggedIn     = !!session || !!user;
  const prevSessionRef = useRef<Session | null>(null);

  useEffect(() => {
    if (loading) return;
    const isFullySignedOut = session === null && user === null;
    if (prevSessionRef.current !== null && isFullySignedOut) {
      router.replace("/(auth)/login");
    }
    prevSessionRef.current = session;
  }, [session, user, loading]);

  // Guard: if a logged-in user somehow reaches the tabs without completing
  // onboarding, push them back to the onboarding flow.
  useEffect(() => {
    if (loading) return;
    if (!session || !user) return;
    if (!profile) return;
    if (profile.onboarding_completed === false) {
      router.replace("/onboarding");
    }
  }, [session, user, profile, loading]);

  return (
    <TabSwipeProvider>
      <View style={{ flex: 1 }}>
        <ClassicTabLayout isLoggedIn={isLoggedIn} />

        {isLoggedIn && (
          <CompactTabBar
            userId={user?.id}
            avatarUrl={profile?.avatar_url}
          />
        )}

        {isLoggedIn && (
          <Security2FABanner userId={user?.id} />
        )}
      </View>
    </TabSwipeProvider>
  );
}
