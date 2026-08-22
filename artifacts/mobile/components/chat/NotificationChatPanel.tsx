import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

type NotificationEvent = {
  id: string;
  kind: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_route: string | null;
  entity_id: string | null;
  created_at: string;
  read_at: string | null;
};

type Props = {
  userId: string;
  colors: any;
  bottomInset?: number;
};

function formatTime(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotificationChatPanel({ userId, colors, bottomInset = 0 }: Props) {
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("notification_events")
      .select("id, kind, title, body, cta_label, cta_route, entity_id, created_at, read_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error) setEvents((data ?? []) as NotificationEvent[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadEvents();
    const channel = supabase
      .channel(`notifications-feed:${userId}`)
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
    await supabase.from("notification_events").update({ read_at: readAt }).eq("id", event.id).eq("recipient_id", userId);
  }, [userId]);

  const openEvent = useCallback(async (event: NotificationEvent) => {
    await markRead(event);
    if (!event.cta_route) return;
    router.push(event.cta_route as any);
  }, [markRead]);

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
          <Text style={[styles.introTitle, { color: colors.text }]}>Updates & notifications</Text>
          <Text style={[styles.introBody, { color: colors.textSecondary }]}>Your important activity and account updates appear here.</Text>
        </View>
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
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={item.cta_route ? 0.75 : 1}
              onPress={() => void openEvent(item)}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: item.read_at ? colors.border : colors.accent + "66" }]}
            >
              <View style={[styles.kindIcon, { backgroundColor: item.read_at ? colors.backgroundSecondary : colors.accent + "18" }]}>
                <Ionicons
                  name={item.kind === "follow" ? "person-add" : item.kind === "system" ? "shield-checkmark" : "notifications"}
                  size={18}
                  color={item.read_at ? colors.textSecondary : colors.accent}
                />
              </View>
              <View style={styles.copy}>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
                  {!item.read_at && <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />}
                </View>
                <Text style={[styles.body, { color: colors.textSecondary }]}>{item.body}</Text>
                <Text style={[styles.date, { color: colors.textMuted }]}>{formatTime(item.created_at)}</Text>
                {item.cta_label && item.cta_route && (
                  <View style={[styles.cta, { backgroundColor: colors.accent }]}>
                    <Text style={styles.ctaText}>{item.cta_label}</Text>
                    <Ionicons name="arrow-forward" size={14} color="#fff" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
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
  introTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  introBody: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptyBody: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: { flexDirection: "row", padding: 14, borderRadius: 18, borderWidth: 0.5, gap: 11 },
  kindIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 5 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { flex: 1, fontSize: 14, fontFamily: "Inter_700Bold" },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
  body: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  date: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cta: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, marginTop: 4 },
  ctaText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
});