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

// ─── Shared human figure component ────────────────────────────────────────────
function HumanFigure({
  x, y, headColor, bodyColor, size = 1, facing = "right",
}: { x: number; y: number; headColor: string; bodyColor: string; size?: number; facing?: "left" | "right" }) {
  const s = size;
  const flip = facing === "left" ? [{ scaleX: -1 }] : [];
  return (
    <View style={{ position: "absolute", left: x, top: y, transform: flip }}>
      {/* Head */}
      <View style={{
        width: 28 * s, height: 28 * s, borderRadius: 14 * s,
        backgroundColor: headColor, alignSelf: "center",
      }}>
        {/* Eyes */}
        <View style={{ flexDirection: "row", justifyContent: "space-evenly", marginTop: 9 * s }}>
          <View style={{ width: 4 * s, height: 4 * s, borderRadius: 2 * s, backgroundColor: "rgba(0,0,0,0.5)" }} />
          <View style={{ width: 4 * s, height: 4 * s, borderRadius: 2 * s, backgroundColor: "rgba(0,0,0,0.5)" }} />
        </View>
        {/* Smile */}
        <View style={{
          width: 12 * s, height: 6 * s, borderBottomLeftRadius: 8 * s, borderBottomRightRadius: 8 * s,
          borderWidth: 2 * s, borderTopWidth: 0, borderColor: "rgba(0,0,0,0.35)",
          alignSelf: "center", marginTop: 3 * s,
        }} />
      </View>
      {/* Neck */}
      <View style={{ width: 8 * s, height: 6 * s, backgroundColor: headColor, alignSelf: "center" }} />
      {/* Body */}
      <View style={{
        width: 36 * s, height: 44 * s, borderRadius: 10 * s,
        backgroundColor: bodyColor, alignSelf: "center",
      }}>
        {/* Arms */}
        <View style={{
          position: "absolute", left: -10 * s, top: 6 * s,
          width: 10 * s, height: 28 * s, borderRadius: 5 * s,
          backgroundColor: headColor,
        }} />
        <View style={{
          position: "absolute", right: -10 * s, top: 6 * s,
          width: 10 * s, height: 28 * s, borderRadius: 5 * s,
          backgroundColor: headColor,
        }} />
      </View>
      {/* Legs */}
      <View style={{ flexDirection: "row", gap: 4 * s, alignSelf: "center", marginTop: 2 * s }}>
        <View style={{ width: 11 * s, height: 30 * s, borderRadius: 6 * s, backgroundColor: bodyColor }} />
        <View style={{ width: 11 * s, height: 30 * s, borderRadius: 6 * s, backgroundColor: bodyColor }} />
      </View>
    </View>
  );
}

// ─── Messaging Illustration ────────────────────────────────────────────────────
function MessagingIllustration({ accent, W }: { accent: string; W: number }) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const cx = (W * 0.82) / 2;
  return (
    <View style={[il.container, { width: W * 0.82, height: 280 }]}>
      <View style={[il.glow, { backgroundColor: accent + "18" }]} />

      {/* Person A — left, facing right */}
      <Animated.View style={{ transform: [{ translateY: floatAnim.interpolate({ inputRange: [0,1], outputRange: [-4,4] }) }] }}>
        <HumanFigure x={cx - 120} y={60} headColor="#F4C08A" bodyColor={accent} size={0.9} facing="right" />
      </Animated.View>

      {/* Person B — right, facing left */}
      <Animated.View style={{ transform: [{ translateY: floatAnim.interpolate({ inputRange: [0,1], outputRange: [4,-4] }) }] }}>
        <HumanFigure x={cx + 44} y={60} headColor="#C68642" bodyColor="#7B5EA7" size={0.9} facing="left" />
      </Animated.View>

      {/* Chat bubbles between them */}
      <View style={{
        position: "absolute", left: cx - 60, top: 50,
        backgroundColor: accent + "30", borderRadius: 14, borderBottomLeftRadius: 4,
        paddingHorizontal: 12, paddingVertical: 8, maxWidth: 110,
      }}>
        <View style={{ width: 64, height: 7, borderRadius: 4, backgroundColor: accent + "80", marginBottom: 5 }} />
        <View style={{ width: 44, height: 7, borderRadius: 4, backgroundColor: accent + "50" }} />
      </View>

      {/* Typing bubble */}
      <View style={{
        position: "absolute", left: cx - 58, top: 115,
        backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 14, borderBottomRightRadius: 4,
        paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", gap: 5,
      }}>
        {[0, 1, 2].map(i => (
          <Animated.View key={i} style={{
            width: 7, height: 7, borderRadius: 4,
            backgroundColor: "rgba(255,255,255,0.6)",
            opacity: pulseAnim.interpolate({ inputRange: [0,1], outputRange: i === 1 ? [0.3,1] : [0.8,0.3] }),
          }} />
        ))}
      </View>

      {/* Heart reaction */}
      <Animated.View style={{
        position: "absolute", left: cx + 22, top: 42,
        transform: [{ translateY: pulseAnim.interpolate({ inputRange: [0,1], outputRange: [0,-6] }) }],
        opacity: pulseAnim.interpolate({ inputRange: [0,1], outputRange: [0.6,1] }),
      }}>
        <Text style={{ fontSize: 18 }}>❤️</Text>
      </Animated.View>
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

  const cx = (W * 0.82) / 2;
  const people = [
    { dx: -155, skin: "#F4C08A", shirt: accent,     size: 0.82, delay: 0 },
    { dx: -88,  skin: "#8D5524", shirt: "#7B5EA7",   size: 0.92, delay: 300 },
    { dx: -16,  skin: "#C68642", shirt: "#FF6B9D",   size: 1.0,  delay: 100 },
    { dx: 54,   skin: "#FDBCB4", shirt: accent,      size: 0.92, delay: 200 },
    { dx: 120,  skin: "#6B3A2A", shirt: "#00D4AA",   size: 0.82, delay: 150 },
  ];

  return (
    <View style={[il.container, { width: W * 0.82, height: 280 }]}>
      <View style={[il.glow, { backgroundColor: accent + "18" }]} />

      {people.map((p, i) => (
        <Animated.View key={i} style={{
          transform: [{ translateY: floatAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [i % 2 === 0 ? -5 : 5, i % 2 === 0 ? 5 : -5],
          }) }],
        }}>
          <HumanFigure x={cx + p.dx} y={i === 2 ? 40 : 60} headColor={p.skin} bodyColor={p.shirt} size={p.size} />
        </Animated.View>
      ))}

      {/* Online badge */}
      <View style={[il.badge, { backgroundColor: accent, top: 28, left: cx - 16 }]}>
        <Text style={{ color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" }}>2.4k online</Text>
      </View>

      {/* Shared reaction row */}
      <View style={{ position: "absolute", bottom: 10, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 8 }}>
        {["👋","❤️","🎉","🔥","✨"].map((e, i) => (
          <Animated.View key={i} style={{
            backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 999,
            paddingHorizontal: 8, paddingVertical: 4,
            transform: [{ translateY: floatAnim.interpolate({ inputRange:[0,1], outputRange: [i%2===0?-3:3, i%2===0?3:-3] }) }],
          }}>
            <Text style={{ fontSize: 14 }}>{e}</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

// ─── AI Illustration ───────────────────────────────────────────────────────────
function AIIllustration({ accent, W }: { accent: string; W: number }) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const cx = (W * 0.82) / 2;
  return (
    <View style={[il.container, { width: W * 0.82, height: 280 }]}>
      <View style={[il.glow, { backgroundColor: accent + "20" }]} />

      {/* Human user on left */}
      <Animated.View style={{ transform: [{ translateY: floatAnim.interpolate({ inputRange:[0,1], outputRange:[-4,4] }) }] }}>
        <HumanFigure x={cx - 140} y={55} headColor="#F4C08A" bodyColor="#5A5A8A" size={0.95} facing="right" />
      </Animated.View>

      {/* AI orb / assistant on right */}
      <Animated.View style={{
        position: "absolute", left: cx + 20, top: 48,
        transform: [
          { translateY: floatAnim.interpolate({ inputRange:[0,1], outputRange:[4,-4] }) },
          { scale: pulseAnim.interpolate({ inputRange:[0,1], outputRange:[1, 1.06] }) },
        ],
      }}>
        {/* Outer glow ring */}
        <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: accent + "20", alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: accent + "35", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 30 }}>✦</Text>
          </View>
        </View>
        {/* Sparkles */}
        <Text style={{ position: "absolute", top: -8, right: 0, fontSize: 14, opacity: 0.9 }}>✨</Text>
        <Text style={{ position: "absolute", bottom: -4, left: -4, fontSize: 12, opacity: 0.7 }}>⚡</Text>
      </Animated.View>

      {/* Speech bubble from AI */}
      <View style={{
        position: "absolute", left: cx - 70, top: 40,
        backgroundColor: accent + "28", borderRadius: 14, borderBottomLeftRadius: 4,
        paddingHorizontal: 12, paddingVertical: 8,
      }}>
        <View style={{ width: 72, height: 7, borderRadius: 4, backgroundColor: accent + "80", marginBottom: 5 }} />
        <View style={{ width: 50, height: 7, borderRadius: 4, backgroundColor: accent + "55" }} />
      </View>

      {/* Floating feature pills */}
      {[
        { label: "Translate", x: cx - 100, y: 198 },
        { label: "Summarise", x: cx + 10, y: 205 },
      ].map((p, i) => (
        <Animated.View key={i} style={{
          position: "absolute", left: p.x, top: p.y,
          backgroundColor: "rgba(255,255,255,0.09)", borderRadius: 999,
          paddingHorizontal: 10, paddingVertical: 5,
          transform: [{ translateY: floatAnim.interpolate({ inputRange:[0,1], outputRange: [i%2===0?-3:3, i%2===0?3:-3] }) }],
        }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.75)" }}>{p.label}</Text>
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
    <View style={[il.container, { width: W * 0.82, height: 280 }]}>
      <View style={[il.glow, { backgroundColor: accent + "18" }]} />

      {/* Central human figure */}
      <Animated.View style={{ transform: [{ translateY: floatAnim.interpolate({ inputRange:[0,1], outputRange:[-5,5] }) }] }}>
        <HumanFigure x={cx - 22} y={30} headColor="#C68642" bodyColor={accent} size={1.05} />
      </Animated.View>

      {/* Coin stack left */}
      {[0,1,2].map(i => (
        <Animated.View key={i} style={{
          position: "absolute", left: cx - 120, top: 130 - i * 14,
          width: 44, height: 14, borderRadius: 7,
          backgroundColor: i === 0 ? accent : accent + (i === 1 ? "90" : "55"),
          transform: [{ translateY: floatAnim.interpolate({ inputRange:[0,1], outputRange:[-4+i,4-i] }) }],
        }} />
      ))}

      {/* Coin stack right */}
      {[0,1].map(i => (
        <Animated.View key={i} style={{
          position: "absolute", left: cx + 68, top: 140 - i * 14,
          width: 40, height: 14, borderRadius: 7,
          backgroundColor: i === 0 ? accent + "BB" : accent + "60",
          transform: [{ translateY: floatAnim.interpolate({ inputRange:[0,1], outputRange:[i%2===0?5:-5, i%2===0?-5:5] }) }],
        }} />
      ))}

      {/* Mini chart bars at bottom */}
      <View style={{ position: "absolute", left: cx - 88, bottom: 8, flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
        {bars.map((h, i) => (
          <Animated.View key={i} style={{
            width: 14, height: 52 * h, borderRadius: 4,
            backgroundColor: i === 5 ? accent : accent + "55",
            transform: [{ scaleY: growAnim }],
          } as any} />
        ))}
      </View>

      {/* Floating +badge */}
      <Animated.View style={{
        position: "absolute", left: cx + 30, top: 25,
        backgroundColor: accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4,
        transform: [{ translateY: floatAnim.interpolate({ inputRange:[0,1], outputRange:[-6,6] }) }],
      }}>
        <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" }}>+50 NX</Text>
      </Animated.View>
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

  // Shared
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
