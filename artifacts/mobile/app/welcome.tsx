import React, { useRef, useState, useEffect } from "react";
import {
  Animated,
  Image,
  PanResponder,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

const IL_MESSAGING  = require("@/assets/illustrations/messaging.png");
const IL_COMMUNITY  = require("@/assets/illustrations/community.png");
const IL_AI         = require("@/assets/illustrations/ai.png");
const IL_WALLET     = require("@/assets/illustrations/wallet.png");
const LOGO_WHITE    = require("@/assets/images/logo_white.png");
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useAuth } from "@/context/AuthContext";
import { storage, KEYS } from "@/lib/storage/mmkv";
import * as Haptics from "@/lib/haptics";

// ─── Slide data ────────────────────────────────────────────────────────────────
const SLIDES = [
  {
    accent: "#1f95ff",
    accentAlt: "#7B5EA7",
    tag: "MESSAGING",
    title: "Chat like\nnever before",
    subtitle:
      "Real-time messages, voice notes & encrypted video calls — with read receipts that actually work.",
    action: "Explore messaging",
    illustration: "messaging",
    orb1: { x: 0.15, y: 0.12, size: 280, color: "#1f95ff", opacity: 0.18 },
    orb2: { x: 0.85, y: 0.35, size: 220, color: "#7B5EA7", opacity: 0.14 },
    orb3: { x: 0.5, y: 0.58, size: 160, color: "#1f95ff", opacity: 0.08 },
  },
  {
    accent: "#AF52DE",
    accentAlt: "#FF6B9D",
    tag: "COMMUNITY",
    title: "Find your\ntribe nearby",
    subtitle:
      "Discover people, join communities, share stories and grow your circle every single day.",
    action: "Find community",
    illustration: "community",
    orb1: { x: 0.8, y: 0.08, size: 260, color: "#AF52DE", opacity: 0.18 },
    orb2: { x: 0.1, y: 0.42, size: 200, color: "#FF6B9D", opacity: 0.12 },
    orb3: { x: 0.6, y: 0.62, size: 180, color: "#7B2FBE", opacity: 0.10 },
  },
  {
    accent: "#FF9500",
    accentAlt: "#FF6B35",
    tag: "AI FEATURES",
    title: "AI that works\nfor you",
    subtitle:
      "Smart replies, image generation, voice transcription and instant translation — right in your chats.",
    action: "Try AI features",
    illustration: "ai",
    orb1: { x: 0.5, y: 0.05, size: 300, color: "#FF6B35", opacity: 0.16 },
    orb2: { x: 0.15, y: 0.45, size: 200, color: "#FF9500", opacity: 0.12 },
    orb3: { x: 0.85, y: 0.55, size: 150, color: "#FFD060", opacity: 0.10 },
  },
  {
    accent: "#34C759",
    accentAlt: "#00D4AA",
    tag: "WALLET",
    title: "Earn as you\nconnect",
    subtitle:
      "Send money, earn Nexa points, tip creators and manage your digital wallet — all in one place.",
    action: "Get started free",
    illustration: "wallet",
    orb1: { x: 0.2, y: 0.10, size: 240, color: "#00D4AA", opacity: 0.16 },
    orb2: { x: 0.82, y: 0.38, size: 220, color: "#34C759", opacity: 0.14 },
    orb3: { x: 0.45, y: 0.60, size: 170, color: "#00B884", opacity: 0.09 },
  },
];

const TOTAL = SLIDES.length;
const SWIPE_THRESHOLD = 52;
const BG = "#06080F";

function finish() {
  try { storage.setBoolean(KEYS.ONBOARDING_DONE, true); } catch {}
  router.replace("/(auth)/login");
}

// ─── Soft orb (layered circles simulate radial gradient) ──────────────────────
function SoftOrb({ cx, cy, size, color }: { cx: number; cy: number; size: number; color: string }) {
  return (
    <>
      <View style={{
        position: "absolute",
        left: cx - size * 0.75,
        top: cy - size * 0.75,
        width: size * 1.5,
        height: size * 1.5,
        borderRadius: size * 0.75,
        backgroundColor: color,
        opacity: 0.07,
      }} />
      <View style={{
        position: "absolute",
        left: cx - size * 0.5,
        top: cy - size * 0.5,
        width: size,
        height: size,
        borderRadius: size * 0.5,
        backgroundColor: color,
        opacity: 0.11,
      }} />
      <View style={{
        position: "absolute",
        left: cx - size * 0.27,
        top: cy - size * 0.27,
        width: size * 0.54,
        height: size * 0.54,
        borderRadius: size * 0.27,
        backgroundColor: color,
        opacity: 0.15,
      }} />
    </>
  );
}

// ─── Illustration sources (all pre-loaded at require time) ────────────────────
const IL_SOURCES: { key: string; src: any }[] = [
  { key: "messaging", src: IL_MESSAGING },
  { key: "community", src: IL_COMMUNITY },
  { key: "ai",        src: IL_AI },
  { key: "wallet",    src: IL_WALLET },
];

// ─── Main component ────────────────────────────────────────────────────────────
export default function WelcomeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SW, height: SH } = useWindowDimensions();

  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const isBusyRef = useRef(false);

  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentY = useRef(new Animated.Value(0)).current;
  const illustrationScale = useRef(new Animated.Value(1)).current;
  const illustrationOpacity = useRef(new Animated.Value(1)).current;

  // Orb animated values — first slide starts at 1 so the illustration is
  // visible immediately on mount (no waiting for a fade-in decode delay).
  const orbOpacities = useRef(SLIDES.map((_, i) => ({
    o1: new Animated.Value(i === 0 ? 1 : 0),
    o2: new Animated.Value(i === 0 ? 1 : 0),
    o3: new Animated.Value(i === 0 ? 1 : 0),
  }))).current;

  useEffect(() => {
    if (user) router.replace("/(tabs)/discover");
    // First slide orbs are already at 1 — nothing to animate on mount.
  }, [user]);

  function crossfadeTo(nextIdx: number) {
    if (isBusyRef.current) return;
    const current = activeIndexRef.current;
    if (nextIdx === current || nextIdx < 0 || nextIdx >= TOTAL) return;
    isBusyRef.current = true;
    activeIndexRef.current = nextIdx;
    Haptics.selectionAsync();

    // Content out → change → in
    Animated.sequence([
      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(contentY, { toValue: 10, duration: 120, useNativeDriver: true }),
        Animated.timing(illustrationOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(illustrationScale, { toValue: 0.92, duration: 200, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setActiveIndex(nextIdx);
      // Fade orbs out
      Animated.parallel([
        Animated.timing(orbOpacities[current].o1, { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.timing(orbOpacities[current].o2, { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.timing(orbOpacities[current].o3, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
      // Fade new orbs in
      Animated.parallel([
        Animated.timing(orbOpacities[nextIdx].o1, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(orbOpacities[nextIdx].o2, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(orbOpacities[nextIdx].o3, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]).start();
      // Content in
      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(contentY, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(illustrationOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
        Animated.spring(illustrationScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 20 }),
      ]).start(() => { isBusyRef.current = false; });
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_THRESHOLD && activeIndexRef.current < TOTAL - 1)
          crossfadeTo(activeIndexRef.current + 1);
        else if (g.dx > SWIPE_THRESHOLD && activeIndexRef.current > 0)
          crossfadeTo(activeIndexRef.current - 1);
      },
    })
  ).current;

  function goNext() {
    if (activeIndex < TOTAL - 1) {
      crossfadeTo(activeIndex + 1);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      finish();
    }
  }

  const slide = SLIDES[activeIndex];
  const isLast = activeIndex === TOTAL - 1;

  return (
    <View style={[s.root, { backgroundColor: BG }]} {...panResponder.panHandlers}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Layer 1: All illustrations pre-rendered — decode on mount, not per-slide ── */}
      {/* They live BEHIND the orbs so they're part of the background, not overlaid on it */}
      {IL_SOURCES.map(({ key, src }, si) => (
        <Animated.View
          key={key}
          style={[s.illustrationBg, {
            opacity: Animated.multiply(
              illustrationOpacity,
              orbOpacities[si].o1, // reuse orb opacity as slide visibility
            ),
            transform: [{ scale: illustrationScale }],
          }]}
          pointerEvents="none"
        >
          <Image
            source={src}
            style={s.illustrationBgImage}
            resizeMode="contain"
          />
        </Animated.View>
      ))}

      {/* ── Layer 2: Orbs on top of the illustration ── */}
      {SLIDES.map((sl, si) => (
        <View key={si} style={[StyleSheet.absoluteFill, { pointerEvents: "none" } as any]}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: orbOpacities[si].o1 }]}>
            <SoftOrb cx={SW * sl.orb1.x} cy={SH * sl.orb1.y} size={sl.orb1.size} color={sl.orb1.color} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: orbOpacities[si].o2 }]}>
            <SoftOrb cx={SW * sl.orb2.x} cy={SH * sl.orb2.y} size={sl.orb2.size} color={sl.orb2.color} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: orbOpacities[si].o3 }]}>
            <SoftOrb cx={SW * sl.orb3.x} cy={SH * sl.orb3.y} size={sl.orb3.size} color={sl.orb3.color} />
          </Animated.View>
        </View>
      ))}

      {/* ── Layer 3: Gradient that blends the whole background into the dark bottom ── */}
      {/* Starts at ~30% down so the illustration top is fully visible */}
      <LinearGradient
        colors={["transparent", `${BG}00`, `${BG}B0`, BG, BG]}
        locations={[0, 0.28, 0.52, 0.70, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={[StyleSheet.absoluteFill, { pointerEvents: "none" } as any]}
      />

      {/* ── Top bar ── */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <View style={s.logoRow}>
          <Image source={LOGO_WHITE} style={s.logoImg} />
          <Text style={s.logoText}>AfuChat</Text>
        </View>
        <TouchableOpacity onPress={finish} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}>
          <View style={s.skipPill}>
            <Text style={s.skipText}>Skip</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Glass content card ── */}
      <View style={[s.card, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
        {/* Top gradient border on card */}
        <LinearGradient
          colors={[slide.accent + "55", slide.accentAlt + "30", "transparent"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={s.cardTopBorder}
        />

        <Animated.View style={{ opacity: contentOpacity, transform: [{ translateY: contentY }] }}>
          {/* Feature tag */}
          <View style={s.tagRow}>
            <View style={[s.tag, { backgroundColor: slide.accent + "20", borderColor: slide.accent + "40" }]}>
              <View style={[s.tagDot, { backgroundColor: slide.accent }]} />
              <Text style={[s.tagText, { color: slide.accent }]}>{slide.tag}</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={s.title}>{slide.title}</Text>

          {/* Subtitle */}
          <Text style={s.subtitle}>{slide.subtitle}</Text>
        </Animated.View>

        {/* Progress bar */}
        <View style={s.progressRow}>
          {SLIDES.map((_, i) => {
            const active = i === activeIndex;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => crossfadeTo(i)}
                hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
              >
                <View style={[s.progressSegment, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                  <LinearGradient
                    colors={active ? [slide.accent, slide.accentAlt] : ["transparent", "transparent"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: 2 }]}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* CTA */}
        <TouchableOpacity style={s.ctaWrap} onPress={goNext} activeOpacity={0.84}>
          <LinearGradient
            colors={[slide.accent, slide.accentAlt]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.cta}
          >
            <Text style={s.ctaText}>{slide.action}</Text>
            <View style={s.ctaArrowCircle}>
              <Text style={[s.ctaArrow, { color: slide.accent }]}>{isLast ? "✓" : "→"}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Auth hint */}
        <View style={s.hintRow}>
          <Text style={s.hintText}>Already have an account? </Text>
          <TouchableOpacity onPress={finish} hitSlop={8}>
            <Text style={[s.hintLink, { color: slide.accent }]}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  topBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    zIndex: 10,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  logoImg: {
    width: 26,
    height: 26,
  },
  logoText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  skipPill: {
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 999,
  },
  skipText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  // Illustration sits in the background layer behind orbs + gradient.
  // Full-width, anchored to the top half of the screen so it blends naturally.
  illustrationBg: {
    position: "absolute",
    left: 0, right: 0,
    top: 0,
    height: "62%" as any,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 8,
  },
  illustrationBgImage: {
    width: "92%" as any,
    height: "100%" as any,
  },

  card: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 26,
    paddingTop: 24,
  },
  cardTopBorder: {
    position: "absolute",
    top: 0, left: 26, right: 26,
    height: 1.5,
    borderRadius: 1,
    marginBottom: 0,
  },

  tagRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 6,
  },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },

  title: {
    fontSize: 38,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
    lineHeight: 46,
    color: "#FFFFFF",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 23,
    color: "rgba(255,255,255,0.60)",
    marginBottom: 28,
  },

  progressRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 22,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },

  ctaWrap: {
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 16,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 58,
    gap: 10,
  },
  ctaText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  ctaArrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaArrow: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },

  hintRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  hintText: {
    fontSize: 13.5,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.30)",
  },
  hintLink: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
  },
});
