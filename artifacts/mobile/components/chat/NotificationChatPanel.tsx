import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { safeRouter } from "@/lib/navUtils";

type NotificationEvent = {
  id: string;
  kind: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_route: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
};

type NotificationRoute = {
  pathname: string;
  params?: Record<string, string>;
};

type Props = {
  userId: string;
  colors: any;
  bottomInset?: number;
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getSafeRoute(event: NotificationEvent): NotificationRoute | null {
  const route = event.cta_route?.trim();
  if (!route || !route.startsWith("/") || route.includes("://") || route.includes("..")) return null;

  // Routes are authored by the trusted notification producer. Keep an allowlist
  // here as a second line of defence because this value is rendered from data.
  if (
    route === "/premium" ||
    route === "/device-security" ||
    route === "/(tabs)/discover" ||
    route === "/(tabs)/shorts"
  ) {
    return { pathname: route };
  }
  if (route === "/chat/[id]" && event.entity_id) {
    return { pathname: route, params: { id: event.entity_id } };
  }
  if (route === "/contact/[id]" && event.entity_id) {
    return { pathname: route, params: { id: event.entity_id } };
  }
  if (route === "/post/[id]" && event.entity_id) {
    return { pathname: route, params: { id: event.entity_id } };
  }
  if (route === "/video/[id]" && event.entity_id) {
    return { pathname: route, params: { id: event.entity_id } };
  }
  if (route === "/article/[id]" && event.entity_id) {
    return { pathname: route, params: { id: event.entity_id } };
  }
  if (route === "/stories/view" && event.entity_id) {
    const storyOwnerId = typeof event.metadata?.story_owner_id === "string"
      ? event.metadata.story_owner_id
      : event.entity_id;
    return { pathname: route, params: { userId: storyOwnerId } };
  }
  return null;
}

export default function NotificationChatPanel({ userId, colors, bottomInset = 0 }: Props) {
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const unreadCount = events.reduce((count, event) => count + (event.read_at ? 0 : 1), 0);

  const loadEvents = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("notification_events")
      .select("id, kind, title, body, cta_label, cta_route, entity_id, metadata, created_at, read_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error) setEvents((data ?? []) as NotificationEvent[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadEvents();
    const channelName = `notifications-feed:${userId}`;
    // React Strict Mode and fast route changes can leave the previous channel
    // registered briefly. Supabase does not allow adding callbacks after that
    // channel has subscribed, so remove the stale owner before configuring the
    // replacement.
    const staleChannel = supabase.getChannels().find((item) => item.topic === `realtime:${channelName}`);
    if (staleChannel) void supabase.removeChannel(staleChannel);

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notification_events",
        filter: `recipient_id=eq.${userId}`,
      }, (payload) => {
        setEvents((previous) => [payload.new as NotificationEvent, ...previous].slice(0, 100));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadEvents, userId]);

  const markRead = useCallback(async (event: NotificationEvent) => {
    if (event.read_at) return;
    const readAt = new Date().toISOString();
    setEvents((previous) => previous.map((item) => item.id === event.id ? { ...item, read_at: readAt } : item));
    const { error } = await supabase
      .from("notification_events")
      .update({ read_at: readAt })
      .eq("id", event.id)
      .eq("recipient_id", userId);
    if (error) {
      setEvents((previous) => previous.map((item) => item.id === event.id ? { ...item, read_at: null } : item));
    }
  }, [userId]);

  const openEvent = useCallback(async (event: NotificationEvent) => {
    const route = getSafeRoute(event);
    if (!route) return;
    // Navigation is the primary action. A slow read receipt must never leave
    // the user stuck in the feed or make a valid destination appear lost.
    void markRead(event);
    safeRouter.push(route as any);
  }, [markRead]);

  const markAllRead = useCallback(async () => {
    if (!unreadCount) return;
    const readAt = new Date().toISOString();
    const unreadIds = events.filter((event) => !event.read_at).map((event) => event.id);
    setEvents((previous) => previous.map((event) => event.read_at ? event : { ...event, read_at: readAt }));
    const { error } = await supabase
      .from("notification_events")
      .update({ read_at: readAt })
      .eq("recipient_id", userId)
      .is("read_at", null)
      .in("id", unreadIds);
    if (error) {
      void loadEvents();
    }
  }, [events, loadEvents, unreadCount, userId]);

  if (loading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.intro, { backgroundColor: colors.surface }]}>
        <View style={[styles.bell, { backgroundColor: colors.accent + "18" }]}>
          <Ionicons name="notifications" size={24} color={colors.accent} />
        </View>
        <View style={styles.introCopy}>
          <View style={styles.introTitleRow}>
            <Text style={[styles.introTitle, { color: colors.text }]}>Updates & notifications</Text>
            {unreadCount > 0 && <View style={[styles.count, { backgroundColor: colors.accent }]}><Text style={styles.countText}>{unreadCount > 99 ? "99+" : unreadCount}</Text></View>}
          </View>
          <Text style={[styles.introBody, { color: colors.textSecondary }]}>Your important activity and account updates appear here.</Text>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={() => void markAllRead()} hitSlop={8} activeOpacity={0.7}>
            <Text style={[styles.markAll, { color: colors.accent }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>
      {events.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>You’re all caught up</Text>
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>New follows, activity, and account updates will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, paddingBottom: bottomInset + 24, gap: 10 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const route = getSafeRoute(item);
            const bubble = (
              <View style={[styles.bubble, { backgroundColor: colors.surface }]}>
                <View style={styles.titleRow}>
                  <Ionicons
                    name={item.kind === "follow" ? "person-add" : item.kind === "system" ? "shield-checkmark" : "notifications"}
                    size={16}
                    color={item.read_at ? colors.textSecondary : colors.accent}
                  />
                  <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
                  {!item.read_at && <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />}
                </View>
                <Text style={[styles.body, { color: colors.textSecondary }]}>{item.body}</Text>
                <Text style={[styles.date, { color: colors.textMuted }]}>{formatTime(item.created_at)}</Text>
                {item.cta_label && route && (
                  <TouchableOpacity
                    onPress={() => void openEvent(item)}
                    style={[styles.cta, { borderColor: colors.accent + "88" }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.ctaText, { color: colors.accent }]}>{item.cta_label}</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.accent} />
                  </TouchableOpacity>
                )}
              </View>
            );
            return (
              <View style={styles.messageRow}>
                {route && !item.cta_label ? (
                  <TouchableOpacity onPress={() => void openEvent(item)} activeOpacity={0.8}>
                    {bubble}
                  </TouchableOpacity>
                ) : bubble}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 8 },
  intro: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  bell: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  introCopy: { flex: 1, gap: 3 },
  introTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  introTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  countText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  markAll: { fontSize: 11, fontFamily: "Inter_700Bold" },
  introBody: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptyBody: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "center" },
  messageRow: { alignItems: "flex-start" },
  bubble: { maxWidth: "92%", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18, borderTopLeftRadius: 6, gap: 5 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { flex: 1, fontSize: 14, fontFamily: "Inter_700Bold" },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
  body: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  date: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cta: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, borderWidth: 1, marginTop: 4 },
  ctaText: { fontSize: 12, fontFamily: "Inter_700Bold" },
});