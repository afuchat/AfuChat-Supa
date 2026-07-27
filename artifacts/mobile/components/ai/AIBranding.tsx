/**
 * AIBranding — shared AfuAI attribution + disclaimer components.
 *
 * Exports
 * -------
 * useAIDisclaimerSeen  Hook — AsyncStorage flag; returns {seen, markSeen}
 * AIDisclaimerCard     One-time onboarding card shown at the top of AfuAI chat
 * AIBrandingFooter     Micro-footer above the AfuAI input bar
 * AIBrandingBadge      Compact badge for embedded AI cards (search / post / chat-search)
 * AIInlineBrand        Single-line attribution text for tight spaces
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { LinearGradient } from "@/components/ui/SafeGradient";

// ─── constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "afuai_disclaimer_seen_v1";
const PURPLE      = "#7B61FF";
const AMBER       = "#FF9F0A";
const ENGAGERA    = "#1A73E8"; // Engagera brand blue

// ─── hook ─────────────────────────────────────────────────────────────────────

/**
 * Tracks whether the user has dismissed the one-time AfuAI onboarding card.
 *
 * Returns `{ seen: boolean | null, markSeen: () => void }`
 *   - `null`  → AsyncStorage not yet read (don't render card yet)
 *   - `false` → not seen (show card)
 *   - `true`  → already dismissed (hide card)
 */
export function useAIDisclaimerSeen() {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => setSeen(v === "1"))
      .catch(() => setSeen(true)); // on error, suppress the card
  }, []);

  const markSeen = useCallback(() => {
    setSeen(true);
    AsyncStorage.setItem(STORAGE_KEY, "1").catch(() => {});
  }, []);

  return { seen, markSeen };
}

// ─── AIDisclaimerCard ─────────────────────────────────────────────────────────

interface AIDisclaimerCardProps {
  onDismiss: () => void;
}

export function AIDisclaimerCard({ onDismiss }: AIDisclaimerCardProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={[dc.card, { backgroundColor: isDark ? "#18181B" : "#F4F4F8" }]}>
      {/* Gradient header */}
      <LinearGradient
        colors={[PURPLE, "#5B4FD6"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={dc.header}
      >
        <Ionicons name="sparkles" size={22} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={dc.headerTitle}>AfuAI</Text>
          <Text style={dc.headerSub}>by AfuChat Technologies · Powered by Engagera</Text>
        </View>
      </LinearGradient>

      {/* Capabilities */}
      <View style={dc.body}>
        {[
          { icon: "chatbubble-ellipses" as const, label: "Answer questions & have conversations" },
          { icon: "bulb"               as const, label: "Summarise content and give recommendations" },
          { icon: "globe"              as const, label: "Search the web and explain complex topics" },
        ].map(({ icon, label }) => (
          <View key={label} style={dc.row}>
            <View style={[dc.iconWrap, { backgroundColor: PURPLE + "18" }]}>
              <Ionicons name={icon} size={15} color={PURPLE} />
            </View>
            <Text style={[dc.rowText, { color: colors.text }]}>{label}</Text>
          </View>
        ))}

        {/* Accuracy notice */}
        <View style={[dc.notice, { backgroundColor: AMBER + "15", borderColor: AMBER + "40" }]}>
          <Ionicons name="warning" size={13} color={AMBER} />
          <Text style={[dc.noticeText, { color: isDark ? AMBER : "#B8730A" }]}>
            AfuAI may make mistakes. Always verify important information.
          </Text>
        </View>
      </View>

      {/* CTA */}
      <TouchableOpacity style={dc.btn} onPress={onDismiss} activeOpacity={0.85}>
        <LinearGradient colors={[PURPLE, "#5B4FD6"]} style={dc.btnGrad}>
          <Text style={dc.btnText}>Got it, let's go</Text>
          <Ionicons name="arrow-forward" size={15} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const dc = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 18,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.2,
  },
  headerSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    marginTop: 1,
  },
  body: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  btn: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  btnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
  },
  btnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});

// ─── AIBrandingFooter ─────────────────────────────────────────────────────────

/**
 * Slim one-line strip to sit directly above the AfuAI input bar.
 * "Powered by AfuAI · Engagera · May make mistakes"
 */
export function AIBrandingFooter() {
  const { isDark } = useTheme();
  return (
    <View style={[ft.bar, { backgroundColor: isDark ? "rgba(0,0,0,0.4)" : "rgba(245,245,250,0.8)" }]}>
      <Ionicons name="sparkles" size={10} color={PURPLE} />
      <Text style={[ft.text, { color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" }]}>
        Powered by{" "}
        <Text style={{ color: PURPLE, fontFamily: "Inter_600SemiBold" }}>AfuAI</Text>
        {" · "}
        <Text style={{ color: ENGAGERA }}>Engagera</Text>
        {"  ·  May make mistakes"}
      </Text>
    </View>
  );
}

const ft = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  text: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.1,
  },
});

// ─── AIBrandingBadge ──────────────────────────────────────────────────────────

interface AIBrandingBadgeProps {
  /** Reduces vertical padding and font size for tight spaces */
  compact?: boolean;
  style?: ViewStyle;
}

/**
 * Compact attribution pill for embedded AI cards (search insights, post
 * summaries, chat-search AI panel).
 */
export function AIBrandingBadge({ compact = false, style }: AIBrandingBadgeProps) {
  const { isDark } = useTheme();
  const sz  = compact ? 9  : 10;
  const pad = compact ? 6  : 8;
  const gap = compact ? 4  : 5;

  return (
    <View style={[bg.wrap, { paddingVertical: pad, gap }, style]}>
      <View style={[bg.pill, { backgroundColor: PURPLE + "18", gap: 4 }]}>
        <Ionicons name="sparkles" size={sz} color={PURPLE} />
        <Text style={[bg.label, { fontSize: sz, color: PURPLE }]}>AfuAI</Text>
        <Text style={[bg.sep, { fontSize: sz }]}>·</Text>
        <Text style={[bg.label, { fontSize: sz, color: ENGAGERA }]}>Engagera</Text>
      </View>
      <Text style={[bg.disclaimer, { fontSize: sz - 1, color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)" }]}>
        by AfuChat Technologies · May make mistakes
      </Text>
    </View>
  );
}

const bg = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
  },
  sep: {
    color: "rgba(128,128,128,0.5)",
    fontFamily: "Inter_400Regular",
  },
  disclaimer: {
    fontFamily: "Inter_400Regular",
    flexShrink: 1,
  },
});

// ─── AIInlineBrand ────────────────────────────────────────────────────────────

/**
 * Single-line attribution for tight header / subtitle spaces.
 */
export function AIInlineBrand({ style }: { style?: object }) {
  return (
    <Text style={[{ fontSize: 11, fontFamily: "Inter_400Regular" }, style]}>
      <Text style={{ color: PURPLE, fontFamily: "Inter_600SemiBold" }}>✦ AfuAI</Text>
      <Text style={{ color: "rgba(128,128,128,0.7)" }}> · Engagera · May make mistakes</Text>
    </Text>
  );
}
