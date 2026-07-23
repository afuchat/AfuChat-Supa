import React, { useEffect, useRef, useState } from "react";
import {
  Animated, Platform, Pressable, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { supabase } from "@/lib/supabase";

export default function GamesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(1)).current;
  const [playerCount, setPlayerCount] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("life_earth_saves")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => { if (count !== null) setPlayerCount(count); });
  }, []);

  function onPressIn() {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  }
  function onPressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <GlassHeader title="AfuGames" />

      <View style={[s.inner, { paddingBottom: insets.bottom + 32 }]}>

        {/* Hero */}
        <LinearGradient
          colors={["#0f172a", "#1e1b4b", "#0f172a"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.hero}
        >
          <View style={s.heroOrb1} />
          <View style={s.heroOrb2} />
          <Text style={s.heroEmoji}>🌍</Text>
          <Text style={s.heroTitle}>LIFE EARTH</Text>
          <Text style={s.heroSub}>The Advanced Human Life Simulation</Text>
          <Text style={s.heroTagline}>
            One decision changes everything. Every path is different. No two lives are the same.
          </Text>
        </LinearGradient>

        {/* Game Card */}
        <Pressable
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          onPress={() => router.push({ pathname: "/games/play", params: { id: "lifesim" } } as any)}
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <LinearGradient
              colors={["#0f172a", "#1e293b"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.card}
            >
              {/* Live badge */}
              <View style={s.liveBadge}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>LIVE</Text>
                {playerCount !== null && (
                  <Text style={s.liveCount}>{playerCount.toLocaleString()} playing</Text>
                )}
              </View>

              {/* Card top */}
              <View style={s.cardTop}>
                <LinearGradient colors={["#1e40af", "#7c3aed"]} style={s.cardIcon}>
                  <Text style={{ fontSize: 30 }}>🌍</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>LIFE EARTH</Text>
                  <Text style={s.cardSub}>Mind-Based Life Simulation</Text>
                </View>
              </View>

              {/* Description */}
              <Text style={s.cardDesc}>
                Born anywhere on Earth. Every decision matters. Your choices unlock and lock future paths — the game never ends and never repeats.
              </Text>

              {/* Feature pills */}
              <View style={s.pillRow}>
                {["🧠 Mind-Based", "♾️ Endless", "🔗 Branching Paths", "🏆 Live Rankings"].map(p => (
                  <View key={p} style={s.pill}>
                    <Text style={s.pillText}>{p}</Text>
                  </View>
                ))}
              </View>

              <View style={s.divider} />

              {/* CTA */}
              <View style={s.cardFooter}>
                <View style={s.cardFooterLeft}>
                  <Text style={s.cardFooterLabel}>Every session is different</Text>
                  <Text style={s.cardFooterSub}>No two players share the same life</Text>
                </View>
                <View style={s.cardCta}>
                  <Text style={s.cardCtaText}>Play</Text>
                  <Ionicons name="arrow-forward" size={14} color="#fff" />
                </View>
              </View>
            </LinearGradient>
          </Animated.View>
        </Pressable>

        {/* Info row */}
        <View style={s.infoRow}>
          {[
            { icon: "🎯", label: "Consequence", sub: "Every choice locks & unlocks paths" },
            { icon: "♾️", label: "Endless", sub: "The game never ends" },
            { icon: "🌍", label: "Real World", sub: "20+ countries, 7 family classes" },
          ].map(item => (
            <View key={item.label} style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={s.infoIcon}>{item.icon}</Text>
              <Text style={[s.infoLabel, { color: colors.text }]}>{item.label}</Text>
              <Text style={[s.infoSub, { color: colors.textMuted }]}>{item.sub}</Text>
            </View>
          ))}
        </View>

      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  inner: { flex: 1, padding: 16, gap: 14 },

  hero: { borderRadius: 22, padding: 26, alignItems: "center", overflow: "hidden", position: "relative", gap: 6 },
  heroOrb1: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: "#3730a320", top: -70, right: -50 },
  heroOrb2: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "#7c3aed20", bottom: -50, left: -30 },
  heroEmoji: { fontSize: 44 },
  heroTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 4 },
  heroSub: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.55)", letterSpacing: 0.5 },
  heroTagline: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)", textAlign: "center", lineHeight: 18, maxWidth: 280, marginTop: 4 },

  card: { borderRadius: 22, padding: 18, gap: 12, overflow: "hidden", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: "rgba(34,197,94,0.15)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  liveText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#22c55e", letterSpacing: 1 },
  liveCount: { fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)" },

  cardTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  cardIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 1 },
  cardSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", marginTop: 2 },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.65)", lineHeight: 20 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  pill: { backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)" },
  pillText: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.7)" },
  divider: { height: 0.5, backgroundColor: "rgba(255,255,255,0.1)" },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardFooterLeft: { gap: 2 },
  cardFooterLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  cardFooterSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)" },
  cardCta: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#2563eb", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  cardCtaText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },

  infoRow: { flexDirection: "row", gap: 10 },
  infoCard: { flex: 1, borderRadius: 14, padding: 12, gap: 4, borderWidth: 0.5, alignItems: "center" },
  infoIcon: { fontSize: 22 },
  infoLabel: { fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "center" },
  infoSub: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 13 },
});
