import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { storage } from "@/lib/storage/mmkv";
import { useTheme } from "@/hooks/useTheme";

const TRUSTPILOT_URL = "https://www.trustpilot.com/review/afuchat.com?stars=5";
const STORAGE_KEY = "tp_review_dismissed_until";
const DAYS_REQUIRED = 7;
const SNOOZE_DAYS = 30;

function accountAgeInDays(createdAt: string | null): number {
  if (!createdAt) return 0;
  const ms = Date.now() - new Date(createdAt).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function isDismissed(): boolean {
  const until = storage.getNumber(STORAGE_KEY);
  return !!until && Date.now() < until;
}

function openTrustpilot() {
  Linking.openURL(TRUSTPILOT_URL).catch(() => {});
}

// ── Inline card (for Me tab) ──────────────────────────────────────────────────
export function TrustpilotReviewCard() {
  const { colors, isDark } = useTheme();
  const { profile } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!profile?.created_at) return;
    if (accountAgeInDays(profile.created_at) < DAYS_REQUIRED) return;
    if (isDismissed()) return;
    setVisible(true);
  }, [profile?.created_at]);

  function dismiss(permanent = false) {
    const until = permanent
      ? Date.now() + 365 * 24 * 60 * 60 * 1000
      : Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    storage.setNumber(STORAGE_KEY, until);
    setVisible(false);
  }

  function handleReview() {
    storage.setNumber(STORAGE_KEY, Date.now() + 365 * 24 * 60 * 60 * 1000);
    openTrustpilot();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <View style={[card.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={card.top}>
        <Text style={card.stars}>⭐⭐⭐⭐⭐</Text>
        <Pressable onPress={() => dismiss()} hitSlop={8}>
          <Text style={[card.x, { color: colors.textMuted }]}>✕</Text>
        </Pressable>
      </View>
      <Text style={[card.title, { color: colors.text }]}>Enjoying AfuChat?</Text>
      <Text style={[card.body, { color: colors.textMuted }]}>
        Leave us a quick review — it helps others discover AfuChat and keeps the team motivated!
      </Text>
      <Pressable style={card.btn} onPress={handleReview}>
        <Text style={card.btnText}>⭐ Rate on Trustpilot</Text>
      </Pressable>
      <Pressable onPress={() => dismiss(true)}>
        <Text style={[card.skip, { color: colors.textMuted }]}>Don't ask again</Text>
      </Pressable>
    </View>
  );
}

const card = StyleSheet.create({
  container: { marginHorizontal: 16, marginTop: 12, borderRadius: 16, borderWidth: 0.5, padding: 16 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  stars: { fontSize: 18, letterSpacing: 2 },
  x: { fontSize: 16, fontWeight: "600", paddingHorizontal: 4 },
  title: { fontSize: 15, fontWeight: "700", marginBottom: 5 },
  body: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  btn: { backgroundColor: "#00B67A", borderRadius: 12, paddingVertical: 11, paddingHorizontal: 20, alignItems: "center", marginBottom: 10 },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  skip: { textAlign: "center", fontSize: 12 },
});

// ── Modal popup (legacy, kept for compatibility) ──────────────────────────────
export function TrustpilotReviewPrompt() {
  const { profile } = useAuth();
  const { colors, isDark } = useTheme();
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!profile?.created_at) return;
    if (accountAgeInDays(profile.created_at) < DAYS_REQUIRED) return;
    if (isDismissed()) return;

    const timer = setTimeout(() => {
      setVisible(true);
    }, 4000);

    return () => clearTimeout(timer);
  }, [profile?.created_at]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  function dismiss(permanent = false) {
    const snoozeUntil = permanent
      ? Date.now() + 365 * 24 * 60 * 60 * 1000
      : Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    storage.setNumber(STORAGE_KEY, snoozeUntil);

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setVisible(false));
  }

  function handleReview() {
    storage.setNumber(STORAGE_KEY, Date.now() + 365 * 24 * 60 * 60 * 1000);
    openTrustpilot();
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 300, duration: 220, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  }

  if (!visible) return null;

  const bg = isDark ? "#1A1A1A" : "#FFFFFF";
  const border = isDark ? "#2A2A2A" : "#E8E8E8";
  const textPrimary = isDark ? "#F0F0F0" : "#111111";
  const textSecondary = isDark ? "#888888" : "#666666";

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => dismiss()}
    >
      <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} />
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: bg, borderColor: border, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.pill} />

          <Text style={styles.stars}>⭐⭐⭐⭐⭐</Text>

          <Text style={[styles.title, { color: textPrimary }]}>
            Enjoying AfuChat?
          </Text>
          <Text style={[styles.body, { color: textSecondary }]}>
            Your 5-star review helps others discover AfuChat and keeps us motivated to build great things. It only takes 30 seconds!
          </Text>

          <View style={[styles.trustRow, { borderColor: border }]}>
            <Text style={styles.tpLogo}>
              <Text style={{ color: "#00B67A", fontWeight: "800" }}>★</Text>
              {" "}
              <Text style={[styles.tpBrand, { color: textSecondary }]}>Trustpilot</Text>
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.reviewBtn, pressed && { opacity: 0.85 }]}
            onPress={handleReview}
          >
            <Text style={styles.reviewBtnText}>Share Your Review →</Text>
          </Pressable>

          <View style={styles.skipRow}>
            <Pressable onPress={() => dismiss()}>
              <Text style={[styles.skipText, { color: textSecondary }]}>Maybe Later</Text>
            </Pressable>
            <Text style={[styles.dot, { color: border }]}> · </Text>
            <Pressable onPress={() => dismiss(true)}>
              <Text style={[styles.skipText, { color: textSecondary }]}>Don't Ask Again</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingTop: 12,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  pill: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CCCCCC",
    marginBottom: 20,
  },
  stars: {
    fontSize: 36,
    marginBottom: 12,
    letterSpacing: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 10,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 18,
  },
  trustRow: {
    borderTopWidth: 1,
    paddingTop: 14,
    marginBottom: 18,
    width: "100%",
    alignItems: "center",
  },
  tpLogo: {
    fontSize: 15,
    fontWeight: "700",
  },
  tpBrand: {
    fontSize: 14,
    fontWeight: "600",
  },
  reviewBtn: {
    backgroundColor: "#00B67A",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
    marginBottom: 14,
  },
  reviewBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  skipRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  skipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  dot: {
    fontSize: 13,
  },
});
