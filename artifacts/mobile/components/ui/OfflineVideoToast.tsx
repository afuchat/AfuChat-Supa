import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { onConnectivityChange, isOnline, getCachedShortsTab } from "@/lib/offlineStore";
import { T } from "@/constants/theme";
import { impactAsync, ImpactFeedbackStyle } from "@/lib/haptics";

const ND = Platform.OS !== "web";

const AUTO_DISMISS_MS = 12000;

export default function OfflineVideoToast() {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [cachedCount, setCachedCount] = useState(0);
  const translateY = useRef(new Animated.Value(-160)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const scale      = useRef(new Animated.Value(0.96)).current;
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const dismissingRef = useRef(false);
  const autoTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCachedCount = useCallback(async () => {
    try {
      const [fy, fl] = await Promise.all([
        getCachedShortsTab("for_you"),
        getCachedShortsTab("following"),
      ]);
      const total = (fy?.posts?.length ?? 0) + (fl?.posts?.length ?? 0);
      setCachedCount(total);
    } catch {
      setCachedCount(0);
    }
  }, []);

  const slideIn = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = false;
    setVisible(true);
    translateY.setValue(-160);
    opacity.setValue(0);
    scale.setValue(0.96);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 180,
        friction: 18,
        useNativeDriver: ND,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: ND,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 200,
        friction: 20,
        useNativeDriver: ND,
      }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 900, useNativeDriver: ND }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: ND }),
        ]),
        { iterations: 3 }
      ).start();
    });
  }, []);

  const slideOut = useCallback((then?: () => void) => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; }

    Animated.parallel([
      Animated.timing(translateY, { toValue: -160, duration: 280, useNativeDriver: ND }),
      Animated.timing(opacity,    { toValue: 0,    duration: 200, useNativeDriver: ND }),
      Animated.timing(scale,      { toValue: 0.94, duration: 260, useNativeDriver: ND }),
    ]).start(() => {
      setVisible(false);
      dismissingRef.current = false;
      then?.();
    });
  }, []);

  const handleDismiss = useCallback(() => {
    impactAsync(ImpactFeedbackStyle.Light);
    slideOut();
  }, [slideOut]);

  const handleWatchOffline = useCallback(() => {
    impactAsync(ImpactFeedbackStyle.Medium);
    slideOut(() => {
      router.push("/(tabs)/shorts" as any);
    });
  }, [slideOut]);

  useEffect(() => {
    const unsub = onConnectivityChange((online) => {
      if (!online) {
        dismissingRef.current = false;
        loadCachedCount().then(slideIn);
        if (autoTimer.current) clearTimeout(autoTimer.current);
        autoTimer.current = setTimeout(() => slideOut(), AUTO_DISMISS_MS);
      } else {
        slideOut();
      }
    });

    if (!isOnline()) {
      loadCachedCount().then(slideIn);
      autoTimer.current = setTimeout(() => slideOut(), AUTO_DISMISS_MS);
    }

    return () => {
      unsub();
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, []);

  if (!visible) return null;

  const top = insets.top + (Platform.OS === "android" ? 8 : 6);

  return (
    <Animated.View
      style={[
        st.wrapper,
        { top, opacity, transform: [{ translateY }, { scale }], pointerEvents: "box-none" },
      ]}
    >
      <View style={st.card}>
        {/* ── Top row ─────────────────────────────────────────────────── */}
        <View style={st.row}>
          {/* Icon bubble */}
          <Animated.View style={[st.iconBubble, { transform: [{ scale: pulseAnim }] }]}>
            <Ionicons name="wifi-outline" size={22} color="#fff" />
            <View style={st.iconDot} />
          </Animated.View>

          {/* Text */}
          <View style={st.textBlock}>
            <Text style={st.title}>You're offline</Text>
            <Text style={st.subtitle}>
              {cachedCount > 0
                ? `${cachedCount} cached short${cachedCount !== 1 ? "s" : ""} ready to watch`
                : "Some videos are cached & ready"}
            </Text>
          </View>

          {/* Close */}
          <Pressable
            onPress={handleDismiss}
            hitSlop={10}
            style={st.closeBtn}
            android_ripple={{ color: "rgba(255,255,255,0.12)", borderless: true }}
          >
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.55)" />
          </Pressable>
        </View>

        {/* ── Divider ─────────────────────────────────────────────────── */}
        <View style={st.divider} />

        {/* ── Action button ───────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={handleWatchOffline}
          activeOpacity={0.78}
          style={st.actionBtn}
        >
          <Ionicons name="play-circle" size={17} color="#fff" />
          <Text style={st.actionText}>Watch Offline Videos</Text>
          <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.7)" style={st.chevron} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const CARD_BG  = "#111318";
const ACCENT   = "#FF3B30";

const SHADOW = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: 16 },
  default: {},
});

const st = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: T.space.lg,
    right: T.space.lg,
    zIndex: 99999,
    ...SHADOW,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: T.radius.lg ?? 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },

  // ── Top row ────────────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: T.space.md,
    paddingHorizontal: T.space.lg,
    paddingTop: T.space.lg,
    paddingBottom: T.space.md,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  iconDot: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF9F0A",
    borderWidth: 1.5,
    borderColor: CARD_BG,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    color: "#fff",
    ...T.bodySemi,
    fontSize: 15,
    letterSpacing: -0.1,
  },
  subtitle: {
    color: "rgba(255,255,255,0.55)",
    ...T.caption,
    marginTop: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
  },

  // ── Divider ────────────────────────────────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginHorizontal: T.space.lg,
  },

  // ── Action button ──────────────────────────────────────────────────────────
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: T.space.sm,
    paddingHorizontal: T.space.lg,
    paddingVertical: T.space.md + 2,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  actionText: {
    flex: 1,
    color: "#fff",
    ...T.bodyMed,
    fontSize: 14,
  },
  chevron: {
    marginLeft: "auto",
  },
});
