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

// ─── Messaging Illustration ────────────────────────────────────────────────────
function MessagingIllustration({ accent, W }: { accent: string; W: number }) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={[il.container, { width: W * 0.82 }]}>
      {/* Glow */}
      <View style={[il.glow, { backgroundColor: accent + "22" }]} />

      {/* Incoming bubble */}
      <View style={[il.bubbleIn, { borderColor: "rgba(255,255,255,0.10)" }]}>
        <View style={il.avatarDot} />
        <View style={{ flex: 1, gap: 7 }}>
          <View style={[il.msgLine, { width: "80%", backgroundColor: "rgba(255,255,255,0.22)" }]} />
          <View style={[il.msgLine, { width: "55%", backgroundColor: "rgba(255,255,255,0.14)" }]} />
        </View>
        {/* Encryption badge */}
        <View style={[il.lockBadge, { backgroundColor: accent + "30", borderColor: accent + "50" }]}>
          <View style={[il.lockBody, { backgroundColor: accent }]} />
        </View>
      </View>

      {/* Outgoing bubble */}
      <View style={[il.bubbleOut, { backgroundColor: accent + "28", borderColor: accent + "40" }]}>
        <View style={{ flex: 1, gap: 7 }}>
          <View style={[il.msgLine, { width: "70%", backgroundColor: accent + "80" }]} />
          <View style={[il.msgLine, { width: "45%", backgroundColor: accent + "55" }]} />
        </View>
        {/* Read receipt */}
        <View style={{ flexDirection: "row", gap: 2, alignItems: "center", marginTop: 2 }}>
          <View style={[il.tick, { backgroundColor: accent }]} />
          <View style={[il.tick, { backgroundColor: accent, marginLeft: -4 }]} />
        </View>
      </View>

      {/* Typing indicator */}
      <View style={[il.typingBubble, { borderColor: "rgba(255,255,255,0.10)" }]}>
        {[0, 1, 2].map(i => (
          <Animated.View key={i} style={[il.typingDot, {
            backgroundColor: "rgba(255,255,255,0.55)",
            opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: i === 1 ? [0.35, 1] : [0.7, 0.35] }),
            transform: [{ translateY: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: i === 1 ? [-3, 0] : [0, 0] }) }],
          }]} />
        ))}
      </View>

      {/* Signal rings */}
      <View style={il.signalGroup}>
        {[32, 22, 12].map((s, i) => (
          <View key={i} style={[il.signalRing, {
            width: s, height: s, borderRadius: s / 2,
            borderColor: accent + (i === 0 ? "30" : i === 1 ? "55" : "88"),
          }]} />
        ))}
      </View>

      {/* Floating elements */}
      <View style={[il.floatEl, { top: 12, right: 60, backgroundColor: accent + "20", borderColor: accent + "40" }]}>
        <Text style={{ fontSize: 12 }}>📎</Text>
      </View>
      <View style={[il.floatEl, { bottom: 18, left: 30, backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)" }]}>
        <Text style={{ fontSize: 11 }}>🎙️</Text>
      </View>
    </View>
  );
}

// ─── Community Illustration ────────────────────────────────────────────────────
function CommunityIllustration({ accent, W }: { accent: string; W: number }) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // 6 satellite nodes in hexagon
  const nodePos = [
    { x: 0, y: -80 }, { x: 70, y: -40 }, { x: 70, y: 40 },
    { x: 0, y: 80 }, { x: -70, y: 40 }, { x: -70, y: -40 },
  ];
  const nodeEmojis = ["❤️", "📍", "✨", "🎵", "🎮", "+"];
  const cx = (W * 0.82) / 2;

  return (
    <View style={[il.container, { width: W * 0.82 }]}>
      <View style={[il.glow, { backgroundColor: accent + "22" }]} />

      {/* Connection lines */}
      {nodePos.map((n, i) => (
        <View key={i} style={{
          position: "absolute",
          left: cx + n.x * 0.5,
          top: 130 + n.y * 0.5,
          width: Math.sqrt(n.x * n.x * 0.25 + n.y * n.y * 0.25),
          height: 1,
          backgroundColor: accent + "25",
          transform: [{ rotate: `${Math.atan2(n.y, n.x) * 180 / Math.PI}deg` }],
          transformOrigin: "left center",
        } as any} />
      ))}

      {/* Satellite nodes */}
      {nodePos.map((n, i) => (
        <Animated.View key={i} style={{
          position: "absolute",
          left: cx + n.x - 18,
          top: 130 + n.y - 18,
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: i === 3 ? accent + "35" : "rgba(255,255,255,0.08)",
          borderWidth: 1,
          borderColor: i === 3 ? accent + "70" : "rgba(255,255,255,0.14)",
          alignItems: "center",
          justifyContent: "center",
          transform: [{ translateY: floatAnim.interpolate({ inputRange: [0, 1], outputRange: [i % 2 === 0 ? -4 : 4, i % 2 === 0 ? 4 : -4] }) }],
        }}>
          <Text style={{ fontSize: 14 }}>{nodeEmojis[i]}</Text>
        </Animated.View>
      ))}

      {/* Center node */}
      <View style={[il.centerNode, { backgroundColor: accent + "25", borderColor: accent + "60" }]}>
        <View style={[il.centerNodeInner, { backgroundColor: accent + "40" }]}>
          <Text style={{ fontSize: 22 }}>👤</Text>
        </View>
      </View>

      {/* Online count badge */}
      <View style={[il.badge, { backgroundColor: accent, top: 72, right: cx - 12 }]}>
        <Text style={{ color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" }}>2.4k</Text>
      </View>
    </View>
  );
}

// ─── AI Illustration ───────────────────────────────────────────────────────────
function AIIllustration({ accent, W }: { accent: string; W: number }) {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(rotateAnim, { toValue: 1, duration: 8000, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const cx = (W * 0.82) / 2;
  const rings = [90, 68, 48];
  const ringDots = [12, 8, 5];

  return (
    <View style={[il.container, { width: W * 0.82 }]}>
      <View style={[il.glow, { backgroundColor: accent + "22" }]} />

      {/* Concentric rings */}
      {rings.map((r, ri) => (
        <Animated.View key={ri} style={{
          position: "absolute",
          left: cx - r,
          top: 130 - r,
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          borderWidth: ri === 0 ? 1 : 0.5,
          borderColor: accent + (ri === 0 ? "30" : ri === 1 ? "22" : "18"),
          transform: [{
            rotate: rotateAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [ri % 2 === 0 ? "0deg" : "360deg", ri % 2 === 0 ? "360deg" : "0deg"],
            })
          }],
        }}>
          {/* Ring dots */}
          {Array.from({ length: ringDots[ri] }).map((_, di) => {
            const angle = (di / ringDots[ri]) * 2 * Math.PI;
            return (
              <View key={di} style={{
                position: "absolute",
                left: r + Math.cos(angle) * r - 3,
                top: r + Math.sin(angle) * r - 3,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: accent + (di % 3 === 0 ? "CC" : di % 3 === 1 ? "70" : "40"),
              }} />
            );
          })}
        </Animated.View>
      ))}

      {/* Central AI core */}
      <Animated.View style={[il.aiCore, {
        left: cx - 32,
        top: 98,
        backgroundColor: accent + "30",
        borderColor: accent + "80",
        transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
      }]}>
        <Text style={{ fontSize: 28 }}>✦</Text>
      </Animated.View>

      {/* Floating particles */}
      {[
        { x: cx - 100, y: 50, emoji: "⚡" },
        { x: cx + 80, y: 60, emoji: "🔮" },
        { x: cx - 80, y: 210, emoji: "💬" },
        { x: cx + 90, y: 200, emoji: "🌐" },
      ].map((p, i) => (
        <Animated.View key={i} style={{
          position: "absolute",
          left: p.x - 14,
          top: p.y - 14,
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundColor: "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          alignItems: "center",
          justifyContent: "center",
          transform: [{ translateY: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [i % 2 === 0 ? -5 : 5, i % 2 === 0 ? 5 : -5] }) }],
        }}>
          <Text style={{ fontSize: 13 }}>{p.emoji}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

// ─── Wallet Illustration ───────────────────────────────────────────────────────
function WalletIllustration({ accent, W }: { accent: string; W: number }) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const growAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
    Animated.timing(growAnim, { toValue: 1, duration: 1200, useNativeDriver: true }).start();
  }, []);

  const cx = (W * 0.82) / 2;
  const bars = [0.4, 0.65, 0.5, 0.85, 0.72, 1.0];

  return (
    <View style={[il.container, { width: W * 0.82 }]}>
      <View style={[il.glow, { backgroundColor: accent + "22" }]} />

      {/* Main coin circle */}
      <Animated.View style={[il.coin, {
        left: cx - 60,
        top: 60,
        backgroundColor: accent + "20",
        borderColor: accent + "50",
        transform: [{ translateY: floatAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] }) }],
      }]}>
        {/* Facet lines */}
        {[0, 45, 90, 135].map(angle => (
          <View key={angle} style={{
            position: "absolute",
            left: 57, top: 2,
            width: 1,
            height: 116,
            backgroundColor: accent + "30",
            transform: [{ rotate: `${angle}deg` }],
            transformOrigin: "center center",
          } as any} />
        ))}
        <View style={[il.coinInner, { backgroundColor: accent + "35", borderColor: accent + "60" }]}>
          <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: accent }}>₦</Text>
        </View>
      </Animated.View>

      {/* Mini chart bars */}
      <View style={[il.chartContainer, { left: cx - 90, top: 195 }]}>
        {bars.map((h, i) => (
          <Animated.View key={i} style={{
            width: 16,
            height: 60 * h,
            borderRadius: 4,
            backgroundColor: i === 5 ? accent : accent + "55",
            alignSelf: "flex-end",
            transform: [{ scaleY: growAnim }],
            transformOrigin: "bottom",
          } as any} />
        ))}
      </View>

      {/* Floating coins */}
      {[
        { x: cx + 62, y: 75, size: 28 },
        { x: cx + 44, y: 118, size: 20 },
        { x: cx - 82, y: 100, size: 22 },
      ].map((c, i) => (
        <Animated.View key={i} style={{
          position: "absolute",
          left: c.x - c.size / 2,
          top: c.y - c.size / 2,
          width: c.size,
          height: c.size,
          borderRadius: c.size / 2,
          backgroundColor: accent + "25",
          borderWidth: 1.5,
          borderColor: accent + "50",
          transform: [{ translateY: floatAnim.interpolate({ inputRange: [0, 1], outputRange: [i % 2 === 0 ? 6 : -6, i % 2 === 0 ? -6 : 6] }) }],
        }} />
      ))}

      {/* Nexa badge */}
      <View style={[il.badge, { backgroundColor: accent, top: 72, left: cx - 22 }]}>
        <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" }}>+50 NX</Text>
      </View>

      {/* Sparkles */}
      {[
        { x: cx + 75, y: 165 }, { x: cx - 76, y: 165 }, { x: cx + 10, y: 60 },
      ].map((s, i) => (
        <Text key={i} style={{ position: "absolute", left: s.x, top: s.y, fontSize: 12, opacity: 0.7 }}>✦</Text>
      ))}
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

  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentY = useRef(new Animated.Value(0)).current;
  const illustrationScale = useRef(new Animated.Value(1)).current;
  const illustrationOpacity = useRef(new Animated.Value(1)).current;

  // Orb animated values
  const orbOpacities = useRef(SLIDES.map(() => ({
    o1: new Animated.Value(0),
    o2: new Animated.Value(0),
    o3: new Animated.Value(0),
  }))).current;

  useEffect(() => {
    if (user) router.replace("/(tabs)/chats");
    // Show first slide orbs
    Animated.parallel([
      Animated.timing(orbOpacities[0].o1, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(orbOpacities[0].o2, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(orbOpacities[0].o3, { toValue: 1, duration: 1000, useNativeDriver: true }),
    ]).start();
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

  const IllustrationMap: Record<string, React.FC<{ accent: string; W: number }>> = {
    messaging: MessagingIllustration,
    community: CommunityIllustration,
    ai: AIIllustration,
    wallet: WalletIllustration,
  };
  const IllustrationComponent = IllustrationMap[slide.illustration];

  return (
    <View style={[s.root, { backgroundColor: BG }]} {...panResponder.panHandlers}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Animated orbs (one set per slide, cross-fade) ── */}
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

      {/* Subtle noise/grain overlay */}
      <View style={[StyleSheet.absoluteFill, { opacity: 0.03, pointerEvents: "none" } as any]}>
        <LinearGradient
          colors={["rgba(255,255,255,0.06)", "transparent", "rgba(255,255,255,0.04)"]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── Top bar ── */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        {/* Logo wordmark */}
        <View style={s.logoRow}>
          <View style={[s.logoDot, { backgroundColor: slide.accent }]} />
          <Text style={s.logoText}>AfuChat</Text>
        </View>
        <TouchableOpacity onPress={finish} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}>
          <View style={s.skipPill}>
            <Text style={s.skipText}>Skip</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Illustration ── */}
      <Animated.View style={[s.illustrationArea, {
        opacity: illustrationOpacity,
        transform: [{ scale: illustrationScale }],
      }]}>
        <IllustrationComponent accent={slide.accent} W={SW} />
      </Animated.View>

      {/* Bottom gradient fade */}
      <LinearGradient
        colors={["transparent", `${BG}00`, `${BG}CC`, BG, BG]}
        locations={[0, 0.25, 0.55, 0.75, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={[StyleSheet.absoluteFill, { pointerEvents: "none" } as any]}
      />

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

// ─── Illustration shared styles ────────────────────────────────────────────────
const il = StyleSheet.create({
  container: {
    height: 270,
    alignSelf: "center",
    position: "relative",
    alignItems: "center",
  },
  glow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    alignSelf: "center",
    top: 30,
  },

  // Messaging
  bubbleIn: {
    position: "absolute",
    top: 20,
    left: 0,
    right: 60,
    height: 68,
    borderRadius: 20,
    borderTopLeftRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  avatarDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.14)",
    flexShrink: 0,
  },
  msgLine: {
    height: 8,
    borderRadius: 4,
  },
  lockBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  lockBody: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  bubbleOut: {
    position: "absolute",
    top: 104,
    left: 60,
    right: 0,
    height: 60,
    borderRadius: 18,
    borderTopRightRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "space-between",
  },
  tick: {
    width: 9,
    height: 5,
    borderRadius: 2,
    opacity: 0.8,
  },
  typingBubble: {
    position: "absolute",
    bottom: 28,
    left: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    height: 40,
    width: 72,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  signalGroup: {
    position: "absolute",
    top: 10,
    right: 8,
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
  },
  signalRing: {
    position: "absolute",
    borderWidth: 1.5,
  },

  // Community
  centerNode: {
    position: "absolute",
    left: "50%" as any,
    top: 94,
    marginLeft: -32,
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  centerNodeInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },

  // AI
  aiCore: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },

  // Wallet
  coin: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coinInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  chartContainer: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    height: 65,
    width: 180,
  },

  // Shared
  floatEl: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
});

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
  logoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  skipText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  illustrationArea: {
    position: "absolute",
    left: 0, right: 0,
    top: 0,
    height: "58%" as any,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 90,
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
    borderWidth: 1,
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
