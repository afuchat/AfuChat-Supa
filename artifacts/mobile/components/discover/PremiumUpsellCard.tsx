import React, { useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/hooks/useTheme";
import { safeRouter } from "@/lib/navUtils";
import * as Haptics from "@/lib/haptics";

type Variant = "ai" | "creator" | "wallet";

type Props = {
  variant?: Variant;
  onDismiss?: () => void;
};

const VARIANTS: Record<Variant, {
  gradient: [string, string];
  icon: string;
  badge: string;
  title: string;
  subtitle: string;
  perks: string[];
  cta: string;
}> = {
  ai: {
    gradient: ["#6C47FF", "#A855F7"],
    icon: "sparkles",
    badge: "AfuChat Premium",
    title: "Supercharge with AI",
    subtitle: "Write, edit, and translate posts instantly with built-in AI tools.",
    perks: ["AI post writer & editor", "Auto-translate any post", "Smart reply suggestions"],
    cta: "Try Premium free",
  },
  creator: {
    gradient: ["#FF6B35", "#F7931E"],
    icon: "star",
    badge: "Creator Plan",
    title: "Grow your audience faster",
    subtitle: "Get analytics, extended reach, and a verified badge for your profile.",
    perks: ["Audience analytics dashboard", "Priority in recommendations", "Creator verified badge"],
    cta: "Become a Creator",
  },
  wallet: {
    gradient: ["#007AFF", "#00C6FF"],
    icon: "wallet",
    badge: "AfuChat Premium",
    title: "Send & receive money",
    subtitle: "Built-in wallet for instant peer-to-peer payments right inside AfuChat.",
    perks: ["Instant P2P payments", "Tips for creators", "Premium-only cashback"],
    cta: "Unlock Wallet",
  },
};

export function PremiumUpsellCard({ variant = "ai", onDismiss }: Props) {
  const { colors, isDark } = useTheme();
  const v = VARIANTS[variant];
  const scale = useRef(new Animated.Value(1)).current;

  function press() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
    ]).start(() => safeRouter.push("/premium" as any));
  }

  return (
    <Animated.View style={[styles.outer, { transform: [{ scale }] }]}>
      <LinearGradient
        colors={v.gradient as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* dismiss button */}
        {onDismiss && (
          <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} hitSlop={10}>
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        )}

        {/* badge */}
        <View style={styles.badge}>
          <Ionicons name={v.icon as any} size={12} color="#fff" />
          <Text style={styles.badgeText}>{v.badge}</Text>
        </View>

        {/* headline */}
        <Text style={styles.title}>{v.title}</Text>
        <Text style={styles.subtitle}>{v.subtitle}</Text>

        {/* perks */}
        <View style={styles.perks}>
          {v.perks.map((p) => (
            <View key={p} style={styles.perkRow}>
              <View style={styles.perkCheck}>
                <Ionicons name="checkmark" size={11} color="#fff" />
              </View>
              <Text style={styles.perkText}>{p}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity style={styles.cta} onPress={press} activeOpacity={0.88}>
          <Text style={styles.ctaText}>{v.cta}</Text>
          <Ionicons name="arrow-forward" size={15} color={v.gradient[0]} />
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 6,
    ...Platform.select({
      web: { boxShadow: "0 4px 12px rgba(0,0,0,0.18)" } as any,
      default: { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    }),
  },
  gradient: {
    padding: 20,
    borderRadius: 20,
  },
  dismissBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
    lineHeight: 26,
  },
  subtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginBottom: 14,
  },
  perks: { gap: 8, marginBottom: 18 },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  perkCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  perkText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
  },
  ctaText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#6C47FF",
  },
});
