import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { Security2FABanner } from "@/components/ui/Security2FABanner";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { usePathname } from "expo-router";
import { safeRouter } from "@/lib/navUtils";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { TabSwipeProvider } from "@/context/TabSwipeContext";
import { getLocalConversations } from "@/lib/storage/localConversations";
import { supabase } from "@/lib/supabase";
import { getTotalUnread, subscribeUnread } from "@/lib/chatUnreadEvents";
import { Avatar } from "@/components/ui/Avatar";

// Visible bottom bar tabs — Chat · Discover · Shorts · Apps · Me
const BOTTOM_TABS = [
  { route: "/(tabs)/chats",    icon: "chatbubbles",        label: "Chat"     },
  { route: "/(tabs)/discover", icon: "compass",            label: "Discover" },
  { route: "/(tabs)/shorts",   icon: "play-circle",        label: "Shorts"   },
  { route: "/(tabs)/apps",     icon: "grid",               label: "Apps"     },
  { route: "/(tabs)/me",       icon: "person-circle",      label: "ME"       },
] as const;

function normalizeTabPath(p: string): string {
  if (p === "/" || p === "/(tabs)" || p === "/(tabs)/index") return "/(tabs)/chats";
  if (p === "/chats"    || p === "/(tabs)/chats")    return "/(tabs)/chats";
  if (p === "/discover" || p === "/(tabs)/discover") return "/(tabs)/discover";
  if (p === "/shorts"   || p === "/(tabs)/shorts")   return "/(tabs)/shorts";
  if (p === "/apps"     || p === "/(tabs)/apps")     return "/(tabs)/apps";
  if (p === "/me"       || p === "/(tabs)/me")       return "/(tabs)/me";
  if (p === "/search"   || p === "/(tabs)/search")   return "/(tabs)/search";
  return p;
}

function useTotalUnread(userId: string | undefined): number {
  const [total, setTotal] = useState(() => getTotalUnread());

  useEffect(() => {
    if (!userId) return;

    const unsubStore = subscribeUnread(setTotal);

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const fallbackRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(async () => {
        refreshTimer = null;
        try {
          const convs = await getLocalConversations();
          if (!cancelled) {
            setTotal(convs.reduce((s, c) => s + (c.unread_count ?? 0), 0));
          }
        } catch {}
      }, 250);
    };
    const chName = `tab-bar-unread-${userId}`;
    const channelTopic = `realtime:${chName}`;
    let ch: RealtimeChannel | null = null;

    // Web Strict Mode and fast auth transitions can run this effect again
    // before the previous channel has finished unsubscribing. Realtime rejects
    // callbacks added to a channel after subscribe(), so remove every stale
    // same-topic channel before constructing and configuring the replacement.
    const setupChannel = async () => {
      const staleChannels = supabase
        .getChannels()
        .filter((existing) => existing.topic === channelTopic);
      await Promise.all(
        staleChannels.map((staleChannel) =>
          supabase.removeChannel(staleChannel).catch(() => "error"),
        ),
      );
      if (cancelled) return;

      ch = supabase
        .channel(chName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "message_status",
            filter: `user_id=eq.${userId}`,
          },
          fallbackRefresh,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "message_status",
            filter: `user_id=eq.${userId}`,
          },
          fallbackRefresh,
        );

      if (cancelled) {
        await supabase.removeChannel(ch).catch(() => {});
        ch = null;
        return;
      }

      ch.subscribe((status) => {
        if (
          status === "CHANNEL_ERROR" &&
          !cancelled &&
          (__DEV__ || process.env.EXPO_PUBLIC_NOTIFICATION_DIAGNOSTICS === "1")
        ) {
          console.warn("[tab-bar-unread] Realtime channel error", {
            channel: chName,
            userId,
          });
        }
      });
    };
    void setupChannel();

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubStore();
      if (ch) {
        void supabase.removeChannel(ch).catch(() => {});
        ch = null;
      }
    };
  }, [userId]);

  return total;
}

// ── Floating pill tab bar ─────────────────────────────────────────────────────
function CompactTabBar({
  userId,
  avatarUrl,
  displayName,
}: {
  userId: string | undefined;
  avatarUrl: string | null | undefined;
  displayName: string | null | undefined;
}) {
  const pathname           = usePathname();
  const insets             = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const totalUnread        = useTotalUnread(userId);
  const active             = normalizeTabPath(pathname);
  const [showCreatePicker, setShowCreatePicker] = useState(false);

  const CREATE_OPTIONS = [
    { icon: "camera",        label: "Story",   description: "Photo or video", route: "/stories/camera" },
    { icon: "create",        label: "Post",    description: "Share an update", route: "/moments/create" },
    { icon: "videocam",      label: "Video",   description: "Create a video", route: "/moments/create-video" },
    { icon: "document-text", label: "Article", description: "Write an article", route: "/moments/create-article" },
  ];

  const INACTIVE_ICON  = isDark ? "rgba(255,255,255,0.50)" : "rgba(0,0,0,0.38)";
  const ACTIVE_ICON    = colors.accent;
  const ACCENT         = colors.accent;
  const PILL_BOTTOM    = Math.max(insets.bottom, 8) + 6;
  const PILL_H         = 62;

  const BAR_BG      = isDark ? "#1C1C1E" : "#FFFFFF";
  const BAR_BORDER  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  const ACTIVE_WRAP = isDark ? colors.accent + "22" : colors.accent + "18";

  function handleTabPress(route: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    safeRouter.navigate(route as any);
  }

  return (
    <>
      {/* ── Pill bar ──────────────────────────────────────────────────── */}
      <View
        style={[
          pill.rowWrap,
          { bottom: PILL_BOTTOM, pointerEvents: "box-none" },
        ]}
      >
        <View
          style={[
            pill.bar,
            {
              height: PILL_H,
              backgroundColor: BAR_BG,
              borderColor: BAR_BORDER,
              ...Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isDark ? 0.35 : 0.12,
                  shadowRadius: 16,
                },
                android: { elevation: 8 },
                web: { boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.45)" : "0 4px 20px rgba(0,0,0,0.10)" } as any,
              }),
            },
          ]}
        >
          {BOTTOM_TABS.map((tab) => {
            const focused   = active === tab.route;
            const iconColor = focused ? ACTIVE_ICON : INACTIVE_ICON;

            return (
              <TouchableOpacity
                key={tab.route}
                style={pill.tab}
                onPress={() => handleTabPress(tab.route)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: focused }}
              >
                <View
                  style={[
                    pill.iconWrap,
                    focused && { backgroundColor: ACTIVE_WRAP, borderRadius: 18 },
                  ]}
                >
                  {tab.route === "/(tabs)/me" ? (
                    <Avatar
                      uri={avatarUrl}
                      name={displayName || "Me"}
                      size={24}
                      userId={userId}
                    />
                  ) : (
                    <Ionicons name={tab.icon as any} size={22} color={iconColor} />
                  )}
                  {/* Unread badge on Chat */}
                  {tab.route === "/(tabs)/chats" && totalUnread > 0 && (
                    <View style={[pill.badge, { backgroundColor: ACCENT }]}>
                      <Text style={pill.badgeText} numberOfLines={1}>
                        {totalUnread > 99 ? "99+" : String(totalUnread)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    pill.label,
                    { color: focused ? ACTIVE_ICON : INACTIVE_ICON },
                  ]}
                  numberOfLines={1}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* FAB — Create, right side, discover tab only */}
      {active === "/(tabs)/discover" && (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setShowCreatePicker(true);
          }}
          style={[
            pill.fab,
            {
              bottom: PILL_BOTTOM + PILL_H + 12,
              right: 24,
              backgroundColor: ACCENT,
            },
          ]}
          activeOpacity={0.82}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* FAB — Compose, right side, chats tab only */}
      {active === "/(tabs)/chats" && !!userId && (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            safeRouter.push("/chat/new" as any);
          }}
          style={[
            pill.fab,
            {
              bottom: PILL_BOTTOM + PILL_H + 12,
              right: 24,
              backgroundColor: ACCENT,
            },
          ]}
          activeOpacity={0.82}
        >
          <Ionicons name="create-outline" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Create picker sheet */}
      <Modal
        visible={showCreatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreatePicker(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setShowCreatePicker(false)}
        >
          <View style={[sheet.container, { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF", paddingBottom: insets.bottom + 20 }]}>
            <View style={[sheet.handle, { backgroundColor: isDark ? "#48484A" : "#C7C7CC" }]} />
            <Text style={[sheet.title, { color: isDark ? "#FFFFFF" : "#000000" }]}>What would you like to create?</Text>
            <View style={sheet.optionsGrid}>
              {CREATE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.route}
                  style={[sheet.option, { backgroundColor: isDark ? "#2C2C2E" : "#F2F2F7" }]}
                  onPress={() => {
                    setShowCreatePicker(false);
                    setTimeout(() => safeRouter.push(opt.route as any), 200);
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${opt.label}: ${opt.description}`}
                >
                  <View style={[sheet.iconBox, { backgroundColor: colors.accent + "20" }]}>
                    <Ionicons name={opt.icon as any} size={30} color={colors.accent} />
                  </View>
                  <Text style={[sheet.optionLabel, { color: isDark ? "#FFFFFF" : "#000000" }]}>
                    {opt.label}
                  </Text>
                  <Text style={[sheet.optionDescription, { color: isDark ? "#A9A9AF" : "#6B6B73" }]}>
                    {opt.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const pill = StyleSheet.create({
  rowWrap: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 100,
    alignItems: "center",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    width: "100%",
  },
  tab: {
    flex: 1,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 0,
  },
  iconWrap: {
    width: 44,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    width: "100%",
    fontSize: 9,
    lineHeight: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
    marginTop: 1,
    textAlign: "center",
    includeFontPadding: false,
    textTransform: "uppercase",
  },
  fab: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
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

const sheet = StyleSheet.create({
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  option: {
    flex: 1,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 16,
  },
  optionsGrid: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  optionDescription: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});

function ClassicTabLayout({ isLoggedIn, bottomPadding }: { isLoggedIn: boolean; bottomPadding: number }) {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "none",
        sceneStyle: { backgroundColor: "transparent", paddingBottom: bottomPadding },
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
      <Tabs.Screen name="shorts"        options={{ href: isLoggedIn ? undefined : null, lazy: true, sceneStyle: { backgroundColor: "#000", paddingBottom: 0 } }} />
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
  const insets         = useSafeAreaInsets();
  const PILL_H         = 62;
  const PILL_BOTTOM    = Math.max(insets.bottom, 8) + 8;
  // The custom pill bar is absolutely positioned over the tab scenes. Reserve
  // its full occupied height so list content and keyboard/toolbars cannot hide
  // underneath it on devices with different home-indicator insets.
  const bottomPadding  = isLoggedIn ? PILL_H + PILL_BOTTOM + 8 : 0;

  useEffect(() => {
    if (loading) return;
    const isFullySignedOut = session === null && user === null;
    if (prevSessionRef.current !== null && isFullySignedOut) {
      safeRouter.replace("/(auth)/login");
    }
    prevSessionRef.current = session;
  }, [session, user, loading]);

  useEffect(() => {
    if (loading) return;
    if (!session || !user) return;
    if (!profile) return;
    if (profile.onboarding_completed === false) {
      safeRouter.replace("/onboarding");
    }
  }, [session, user, profile, loading]);

  const isRedirecting =
    (!loading && prevSessionRef.current !== null && !isLoggedIn) ||
    (!loading && isLoggedIn && profile?.onboarding_completed === false);

  if (loading || isRedirecting) {
    return <View style={{ flex: 1, backgroundColor: "transparent" }} />;
  }

  return (
    <TabSwipeProvider>
      <View style={{ flex: 1 }}>
        <ClassicTabLayout isLoggedIn={isLoggedIn} bottomPadding={bottomPadding} />

        {isLoggedIn && (
          <CompactTabBar
            userId={user?.id}
            avatarUrl={profile?.avatar_url}
            displayName={profile?.display_name}
          />
        )}

        {isLoggedIn && (
          <Security2FABanner userId={user?.id} />
        )}
      </View>
    </TabSwipeProvider>
  );
}
