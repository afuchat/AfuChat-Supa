import React, { useRef, useState, useEffect } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { storage, KEYS } from "@/lib/storage/mmkv";
import * as Haptics from "@/lib/haptics";

const SLIDES = [
  {
    photo: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=900&q=80",
    accent: "#1f95ff",
    tag: "MESSAGING",
    title: "Chat like\nnever before",
    subtitle:
      "Messages, voice notes & video calls — with real-time receipts and end-to-end encryption.",
    action: "Explore messaging",
  },
  {
    photo: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=900&q=80",
    accent: "#AF52DE",
    tag: "COMMUNITY",
    title: "Find your\ntribe nearby",
    subtitle:
      "Discover people, events and groups around you. Share stories and grow your circle every day.",
    action: "Find community",
  },
  {
    photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=900&q=80",
    accent: "#FF9500",
    tag: "AI FEATURES",
    title: "AI that actually\nworks for you",
    subtitle:
      "Smart replies, image generation, voice transcription and translation — right in your chats.",
    action: "Try AI features",
  },
  {
    photo: "https://images.unsplash.com/photo-1573497491765-dccce02b29df?w=900&q=80",
    accent: "#34C759",
    tag: "WALLET",
    title: "Earn as you\nconnect",
    subtitle:
      "Send money, earn Nexa points, tip creators and manage your digital wallet — all in one place.",
    action: "Get started free",
  },
];

const TOTAL = SLIDES.length;
const SWIPE_THRESHOLD = 52;

function finish() {
  try { storage.setBoolean(KEYS.ONBOARDING_DONE, true); } catch {}
  router.replace("/(auth)/login");
}

export default function WelcomeScreen() {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SW, height: SH } = useWindowDimensions();

  const bgColor = isDark ? "#0A0A0A" : "#FFFFFF";

  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const isBusyRef = useRef(false);

  // Per-slide image opacity — first slide starts visible
  const imgOpacities = useRef(SLIDES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;

  // Content text animation
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (user) router.replace("/(tabs)/chats");
  }, [user]);

  // ── Crossfade to target slide ───────────────────────────────────────────────
  function crossfadeTo(nextIdx: number) {
    if (isBusyRef.current) return;
    const current = activeIndexRef.current;
    if (nextIdx === current || nextIdx < 0 || nextIdx >= TOTAL) return;

    isBusyRef.current = true;
    activeIndexRef.current = nextIdx;
    setActiveIndex(nextIdx);
    Haptics.selectionAsync();

    // Content: fade out → slide up slightly → fade in new text
    Animated.sequence([
      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(contentY, { toValue: 8, duration: 120, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(contentY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]),
    ]).start(() => { isBusyRef.current = false; });

    // Image: crossfade old out, new in simultaneously
    Animated.parallel([
      Animated.timing(imgOpacities[current], {
        toValue: 0,
        duration: 480,
        useNativeDriver: !isWeb,
      }),
      Animated.timing(imgOpacities[nextIdx], {
        toValue: 1,
        duration: 480,
        useNativeDriver: !isWeb,
      }),
    ]).start();
  }

  // ── Swipe gesture ───────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_THRESHOLD && activeIndexRef.current < TOTAL - 1) {
          crossfadeTo(activeIndexRef.current + 1);
        } else if (g.dx > SWIPE_THRESHOLD && activeIndexRef.current > 0) {
          crossfadeTo(activeIndexRef.current - 1);
        }
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
    <View style={[s.root, { backgroundColor: bgColor }]} {...panResponder.panHandlers}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Full-screen crossfade image stack ── */}
      {SLIDES.map((sl, i) => (
        <Animated.View
          key={i}
          style={[StyleSheet.absoluteFill, { opacity: imgOpacities[i] }]}
        >
          <Image
            source={{ uri: sl.photo }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </Animated.View>
      ))}

      {/* Full-screen gradient — image fades into solid background from ~25% down */}
      <LinearGradient
        colors={["transparent", `${bgColor}00`, `${bgColor}AA`, `${bgColor}F0`, bgColor, bgColor]}
        locations={[0, 0.20, 0.44, 0.60, 0.74, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[StyleSheet.absoluteFill, { pointerEvents: "none" } as any]}
      />

      {/* Top bar — floats over the image */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <View />
        <TouchableOpacity
          onPress={finish}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
        >
          <View style={s.skipPill}>
            <Text style={s.skipText}>Skip</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Content area — sits at the bottom, layered above the gradient ── */}
      <View style={[s.content, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
        <Animated.View
          style={[s.contentInner, { opacity: contentOpacity, transform: [{ translateY: contentY }] }]}
        >
          {/* Feature tag */}
          <View style={[s.tag, { backgroundColor: slide.accent + "28" }]}>
            <View style={[s.tagDot, { backgroundColor: slide.accent }]} />
            <Text style={[s.tagText, { color: slide.accent }]}>{slide.tag}</Text>
          </View>

          {/* Title */}
          <Text style={[s.title, { color: isDark ? "#F5F5F5" : "#0A0A0A" }]}>
            {slide.title}
          </Text>

          {/* Subtitle */}
          <Text style={[s.subtitle, { color: isDark ? "rgba(255,255,255,0.80)" : "rgba(0,0,0,0.72)" }]}>
            {slide.subtitle}
          </Text>
        </Animated.View>

        {/* Dots */}
        <View style={s.dotsRow}>
          {SLIDES.map((_, i) => {
            const active = i === activeIndex;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => crossfadeTo(i)}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              >
                <View
                  style={[
                    s.dot,
                    {
                      width: active ? 24 : 7,
                      backgroundColor: active
                        ? slide.accent
                        : isDark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.22)",
                    },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[s.cta, { backgroundColor: slide.accent }]}
          onPress={goNext}
          activeOpacity={0.84}
        >
          <Text style={s.ctaText}>{slide.action}</Text>
          <Text style={s.ctaArrow}> →</Text>
        </TouchableOpacity>

        {/* Auth hint */}
        <View style={s.hintRow}>
          <Text style={[s.hintText, { color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)" }]}>
            Already have an account?{" "}
          </Text>
          <TouchableOpacity onPress={finish} hitSlop={8}>
            <Text style={[s.hintLink, { color: slide.accent }]}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  topBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    zIndex: 10,
  },
  skipPill: {
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  skipText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
  },

  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 4,
    justifyContent: "flex-end",
  },
  contentInner: { marginBottom: 20 },

  tag: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 14,
    gap: 6,
  },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.4 },

  title: {
    fontSize: 38,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
    lineHeight: 46,
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 15.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
  },

  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 22,
  },
  dot: { height: 7, borderRadius: 3.5 },

  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 999,
    marginBottom: 16,
  },
  ctaText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.1,
  },
  ctaArrow: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },

  hintRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  hintText: { fontSize: 13.5, fontFamily: "Inter_400Regular" },
  hintLink: { fontSize: 13.5, fontFamily: "Inter_700Bold" },
});
