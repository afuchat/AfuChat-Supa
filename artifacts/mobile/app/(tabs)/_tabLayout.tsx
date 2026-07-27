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
import { router, usePathname } from "expo-router";
import { safeRouter } from "@/lib/navUtils";
import type { Session } from "@supabase/supabase-js";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { TabSwipeProvider } from "@/context/TabSwipeContext";
import { getLocalConversations } from "@/lib/storage/localConversations";
import { supabase } from "@/lib/supabase";
import { getTotalUnread, subscribeUnread } from "@/lib/chatUnreadEvents";

// Visible bottom bar tabs
const BOTTOM_TABS = [
  { route: "/(tabs)/discover", icon: "home"        },
  { route: "/(tabs)/shorts",   icon: "play-circle" },
  // index 2 is the CREATE button — handled separately
  { route: "/(tabs)/apps",     icon: "grid"        },
  { route: "/(tabs)/chats",    icon: "chatbubble"  },
] as const;

function normalizeTabPath(p: string): string {
  if (p === "/" || p === "/(tabs)" || p === "/(tabs)/index") return "/(tabs)/discover";
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

    const fallbackRefresh = async () => {
      const convs = await getLocalConversations();
      setTotal(convs.reduce((s, c) => s + (c.unread_count ?? 0), 0));
    };
    const chName = `tab-bar-unread-${userId}-${Date.now()}`;
    const ch = supabase
      .channel(chName)
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

// ── Floating pill tab bar ─────────────────────────────────────────────────────
function CompactTabBar({
  userId,
  avatarUrl,
}: {
  userId: string | undefined;
  avatarUrl: string | null | undefined;
}) {
  const pathname           = usePathname();
  const insets             = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const totalUnread        = useTotalUnread(userId);
  const active             = normalizeTabPath(pathname);
  const [showCreatePicker, setShowCreatePicker] = useState(false);

  const CREATE_OPTIONS = [
    { icon: "camera",        label: "Story",   desc: "Share a photo or video story",     route: "/stories/camera",         color: "#FF9F0A"     },
    { icon: "create",        label: "Post",    desc: "Share a thought, photo, or link",  route: "/moments/create",         color: colors.accent },
    { icon: "videocam",      label: "Video",   desc: "Share a short video clip",         route: "/moments/create-video",   color: "#FF3B30"     },
    { icon: "document-text", label: "Article", desc: "Write a long-form article",        route: "/moments/create-article", color: "#007AFF"     },
  ];

  const PILL_BG      = isDark ? "rgba(10,12,22,0.82)" : "rgba(248,244,238,0.88)";
  const PILL_BORDER  = isDark ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.09)";
  const ACCENT       = colors.accent;

  function handleTabPress(route: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    safeRouter.navigate(route as any);
  }

  const slots: Array<
    | { kind: "tab"; route: string; icon: string }
    | { kind: "create" }
  > = [
    { kind: "tab", ...BOTTOM_TABS[0] },
    { kind: "tab", ...BOTTOM_TABS[1] },
    { kind: "create" },
    { kind: "tab", ...BOTTOM_TABS[2] },
    { kind: "tab", ...BOTTOM_TABS[3] },
  ];

  return (
    <>
      {/* Bottom content fade — scrolling content fades before it hits the pill */}
      <LinearGradient
        colors={["transparent", isDark ? "#06080F" : "#F5F0E8"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: Math.max(insets.bottom, 8) + 10 + 64,
          height: 80,
          zIndex: 98,
          pointerEvents: "none",
        } as any}
      />

      {/* Floating pill */}
      <View
        style={[
          pill.wrapper,
          {
            bottom: Math.max(insets.bottom, 8) + 10,
            backgroundColor: PILL_BG,
            borderWidth: 0.5,
            borderColor: PILL_BORDER,
            shadowColor: "#000",
            shadowOpacity: isDark ? 0.45 : 0.12,
          },
        ]}
        pointerEvents="box-none"
      >
        {slots.map((slot, idx) => {
          if (slot.kind === "create") {
            return (
              <TouchableOpacity
                key="create"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  setShowCreatePicker(true);
                }}
                style={[pill.createBtn, { backgroundColor: ACCENT }]}
                activeOpacity={0.82}
              >
                <Ionicons name="add" size={26} color="#fff" />
              </TouchableOpacity>
            );
          }

          const focused = active === slot.route;
          const iconColor = focused ? ACCENT : (isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.32)");

          return (
            <TouchableOpacity
              key={slot.route}
              style={pill.tab}
              onPress={() => handleTabPress(slot.route)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={slot.route.replace("/(tabs)/", "")}
              accessibilityState={{ selected: focused }}
            >
              <View style={pill.iconWrap}>
                <Ionicons
                  name={slot.icon as any}
                  size={24}
                  color={iconColor}
                />
                {/* Unread badge on chat */}
                {slot.route === "/(tabs)/chats" && totalUnread > 0 && (
                  <View style={[pill.badge, { backgroundColor: ACCENT }]}>
                    <Text style={pill.badgeText} numberOfLines={1}>
                      {totalUnread > 99 ? "99+" : String(totalUnread)}
                    </Text>
                  </View>
                )}
              </View>
              {/* Active dot */}
              <View
                style={[
                  pill.dot,
                  { backgroundColor: focused ? ACCENT : "transparent" },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>

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
            {CREATE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={[sheet.option, { backgroundColor: isDark ? "#2C2C2E" : "#F2F2F7" }]}
                onPress={() => {
                  setShowCreatePicker(false);
                  setTimeout(() => safeRouter.push(opt.route as any), 200);
                }}
                activeOpacity={0.8}
              >
                <View style={[sheet.iconBox, { backgroundColor: opt.color + "20" }]}>
                  <Ionicons name={opt.icon as any} size={24} color={opt.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[sheet.optionLabel, { color: isDark ? "#FFFFFF" : "#000000" }]}>{opt.label}</Text>
                  <Text style={[sheet.optionDesc,  { color: isDark ? "#8E8E93" : "#6C6C70" }]}>{opt.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={isDark ? "#48484A" : "#C7C7CC"} />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const pill = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    height: 64,
    borderRadius: 100,
    paddingHorizontal: 8,
    zIndex: 100,
    // Shadow
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 20,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 64,
    gap: 4,
  },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  createBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1f95ff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 10,
    marginHorizontal: 4,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  optionDesc:  { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
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
