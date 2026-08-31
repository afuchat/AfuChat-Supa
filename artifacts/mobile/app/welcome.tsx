import React, { useRef, useState, useEffect } from "react";
import {
  Animated,
  Image as RNImage,
  PanResponder,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import LocalizedText from "@/components/ui/LocalizedText";

const IL_MESSAGING  = require("@/assets/illustrations/messaging.webp");
const IL_COMMUNITY  = require("@/assets/illustrations/community.webp");
const IL_AI         = require("@/assets/illustrations/ai.webp");
const IL_WALLET     = require("@/assets/illustrations/wallet.webp");
const LOGO_WHITE    = require("@/assets/images/icon.png");
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useAuth } from "@/context/AuthContext";
import { storage, KEYS } from "@/lib/storage/mmkv";
import * as Haptics from "@/lib/haptics";
import Colors from "@/constants/colors";

// ─── Slide data ────────────────────────────────────────────────────────────────
const SLIDES = [
  {
    accent: Colors.brand,
    accentAlt: "#7B5EA7",
    title: "Connect with\npurpose",
    subtitle:
      "Build real connections, share what matters and make every interaction count.",
    action: "See how it works",
    illustration: "messaging",
    orb1: { x: 0.15, y: 0.12, size: 280, color: Colors.brand, opacity: 0.18 },
    orb2: { x: 0.85, y: 0.35, size: 220, color: "#7B5EA7", opacity: 0.14 },
    orb3: { x: 0.5, y: 0.58, size: 160, color: Colors.brand, opacity: 0.08 },
  },
  {
    accent: "#AF52DE",
    accentAlt: "#FF6B9D",
    title: "Find your\npeople",
    subtitle:
      "Follow your interests, join communities and discover conversations worth returning to.",
    action: "Explore communities",
    illustration: "community",
    orb1: { x: 0.8, y: 0.08, size: 260, color: "#AF52DE", opacity: 0.18 },
    orb2: { x: 0.1, y: 0.42, size: 200, color: "#FF6B9D", opacity: 0.12 },
    orb3: { x: 0.6, y: 0.62, size: 180, color: "#7B2FBE", opacity: 0.10 },
  },
  {
    accent: "#FF9500",
    accentAlt: "#FF6B35",
    title: "Create. Share.\nBe seen.",
    subtitle:
      "Post ideas, stories and moments that bring people together. AfuAI helps when you need it.",
    action: "Create your profile",
    illustration: "ai",
    orb1: { x: 0.5, y: 0.05, size: 300, color: "#FF6B35", opacity: 0.16 },
    orb2: { x: 0.15, y: 0.45, size: 200, color: "#FF9500", opacity: 0.12 },
    orb3: { x: 0.85, y: 0.55, size: 150, color: "#FFD060", opacity: 0.10 },
  },
  {
    accent: "#34C759",
    accentAlt: "#00D4AA",
    title: "Your activity\nhas value",
    subtitle:
      "Earn ACoin through participation, then use it for status, perks and a presence that feels like yours.",
    action: "Get started free",
    illustration: "wallet",
    orb1: { x: 0.2, y: 0.10, size: 240, color: "#00D4AA", opacity: 0.16 },
    orb2: { x: 0.82, y: 0.38, size: 220, color: "#34C759", opacity: 0.14 },
    orb3: { x: 0.45, y: 0.60, size: 170, color: "#00B884", opacity: 0.09 },
  },
];

const TOTAL = SLIDES.length;
const SWIPE_THRESHOLD = 52;
const BG = "#000000";

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

type OnboardingPageProps = {
  slide: (typeof SLIDES)[number];
  index: number;
  width: number;
  height: number;
  topInset: number;
  bottomInset: number;
  activeIndex: number;
  onNext: (index: number) => void;
  onSkip: () => void;
  onSelect: (index: number) => void;
};

function OnboardingPage({
  slide,
  index,
  width,
  height,
  topInset,
  bottomInset,
  activeIndex,
  onNext,
  onSkip,
  onSelect,
}: OnboardingPageProps) {
  const isLast = index === TOTAL - 1;

  return (
    <View style={[s.page, { width, height, backgroundColor: BG }]}>
      {/* Every page owns its illustration, background orbs, header, and CTA.
          The parent track moves this complete surface as one unit. */}
      <View style={[s.illustrationBg, { pointerEvents: "none" }]}>
        <Image
          source={IL_SOURCES[index].src}
          style={s.illustrationBgImage}
          resizeMode="contain"
        />
      </View>

      <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
        <View style={StyleSheet.absoluteFill}>
          <SoftOrb cx={width * slide.orb1.x} cy={height * slide.orb1.y} size={slide.orb1.size} color={slide.orb1.color} />
        </View>
        <View style={StyleSheet.absoluteFill}>
          <SoftOrb cx={width * slide.orb2.x} cy={height * slide.orb2.y} size={slide.orb2.size} color={slide.orb2.color} />
        </View>
        <View style={StyleSheet.absoluteFill}>
          <SoftOrb cx={width * slide.orb3.x} cy={height * slide.orb3.y} size={slide.orb3.size} color={slide.orb3.color} />
        </View>
      </View>

      <LinearGradient
        colors={["transparent", `${BG}00`, `${BG}B0`, BG, BG]}
        locations={[0, 0.28, 0.52, 0.70, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={[StyleSheet.absoluteFill, { pointerEvents: "none" } as any]}
      />

      <View style={[s.topBar, { paddingTop: topInset + 12 }]}>
        <View style={s.logoRow}>
          <Image source={LOGO_WHITE} style={s.logoImg} />
          <Text style={s.logoText}>AfuChat</Text>
        </View>
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}>
          <View style={s.skipPill}>
            <Text style={s.skipText}>Skip</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={[s.card, { paddingBottom: Math.max(bottomInset, 20) + 8 }]}>
        <LinearGradient
          colors={[slide.accent + "55", slide.accentAlt + "30", "transparent"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={s.cardTopBorder}
        />

        <View>
          <LocalizedText style={s.title} __afuchatStaticText>{slide.title}</LocalizedText>
          <LocalizedText style={s.subtitle} __afuchatStaticText>{slide.subtitle}</LocalizedText>
        </View>

        <View style={s.progressRow}>
          {SLIDES.map((_, i) => {
            const active = i === activeIndex;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => onSelect(i)}
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

        <TouchableOpacity style={s.ctaWrap} onPress={() => onNext(index)} activeOpacity={0.84}>
          <LinearGradient
            colors={[slide.accent, slide.accentAlt]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.cta}
          >
            <LocalizedText style={s.ctaText} __afuchatStaticText>{slide.action}</LocalizedText>
            <View style={s.ctaArrowCircle}>
              <Ionicons name={isLast ? "checkmark" : "arrow-forward"} size={22} color="#111827" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <View style={s.hintRow}>
          <Text style={s.hintText}>Already have an account? </Text>
          <TouchableOpacity onPress={onSkip} hitSlop={8}>
            <Text style={[s.hintLink, { color: slide.accent }]}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function WelcomeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SW, height: SH } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const isBusyRef = useRef(false);
  const pageX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (user) router.replace("/(tabs)/discover");
  }, [user]);

  function goTo(nextIdx: number) {
    const current = activeIndexRef.current;
    if (isBusyRef.current || nextIdx === current || nextIdx < 0 || nextIdx >= TOTAL) return;
    isBusyRef.current = true;
    activeIndexRef.current = nextIdx;
    setActiveIndex(nextIdx);
    Haptics.selectionAsync();
    Animated.timing(pageX, {
      toValue: -nextIdx * SW,
      duration: 360,
      useNativeDriver: Platform.OS !== "web",
    }).start(({ finished }) => {
      isBusyRef.current = false;
      if (!finished) {
        pageX.setValue(-activeIndexRef.current * SW);
      }
    });
  }

  const finish = () => {
    if (isBusyRef.current) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try { storage.setBoolean(KEYS.ONBOARDING_DONE, true); } catch {}
    // The root auth-group transition is directional, so login slides in rather
    // than replacing the onboarding screen as an instant jump.
    router.replace("/(auth)/login");
  };

  const goNext = (index: number) => {
    if (index < TOTAL - 1) goTo(index + 1);
    else finish();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_THRESHOLD) goTo(activeIndexRef.current + 1);
        else if (g.dx > SWIPE_THRESHOLD) goTo(activeIndexRef.current - 1);
      },
    }),
  ).current;

  return (
    <View style={[s.root, { backgroundColor: BG }]} {...panResponder.panHandlers}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <Animated.View
        style={[
          s.pageTrack,
          { width: SW * TOTAL, height: SH, transform: [{ translateX: pageX }] },
        ]}
      >
        {SLIDES.map((slide, index) => (
          <OnboardingPage
            key={index}
            slide={slide}
            index={index}
            width={SW}
            height={SH}
            topInset={insets.top}
            bottomInset={insets.bottom}
            activeIndex={activeIndex}
            onNext={goNext}
            onSkip={finish}
            onSelect={goTo}
          />
        ))}
      </Animated.View>
    </View>
  );
}

// ─── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  pageTrack: {
    flexDirection: "row",
  },
  page: {
    flexShrink: 0,
    overflow: "hidden",
  },

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
    height: 62,
    gap: 12,
  },
  ctaText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  ctaArrowCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaArrow: {
    fontSize: 21,
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
