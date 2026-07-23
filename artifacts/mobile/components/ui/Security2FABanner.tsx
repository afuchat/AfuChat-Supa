import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";

const DISMISS_KEY = (uid: string) => `@afu_2fa_banner_dismissed_${uid}`;

interface Props {
  userId: string | undefined;
}

export function Security2FABanner({ userId }: Props) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const slideY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const show = useCallback(() => {
    setVisible(true);
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 200 }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [slideY, opacity]);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideY, { toValue: -80, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  }, [slideY, opacity]);

  const dismiss = useCallback(async () => {
    if (userId) {
      await AsyncStorage.setItem(DISMISS_KEY(userId), "1").catch(() => {});
    }
    hide();
  }, [userId, hide]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      try {
        const dismissed = await AsyncStorage.getItem(DISMISS_KEY(userId));
        if (dismissed === "1" || cancelled) return;

        const { data } = await supabase.auth.mfa.listFactors();
        if (cancelled) return;

        const has2FA = data?.totp?.some((f: any) => f.status === "verified");
        if (!has2FA) show();
      } catch { }
    })();

    return () => { cancelled = true; };
  }, [userId, show]);

  if (!visible) return null;

  const bg = isDark ? "rgba(30,30,38,0.97)" : "rgba(255,255,255,0.97)";
  const border = isDark ? "rgba(88,86,214,0.35)" : "rgba(88,86,214,0.25)";

  return (
    <Animated.View
      style={[
        st.wrap,
        {
          top: insets.top + 6,
          backgroundColor: bg,
          borderColor: border,
          opacity,
          transform: [{ translateY: slideY }],
          pointerEvents: "box-none",
        },
      ]}
    >
      <TouchableOpacity
        style={st.row}
        activeOpacity={0.82}
        onPress={() => {
          dismiss();
          router.push("/settings/two-factor" as any);
        }}
      >
        <View style={st.iconWrap}>
          <Ionicons name="shield-outline" size={20} color="#5856D6" />
        </View>
        <View style={st.textCol}>
          <Text style={st.title} numberOfLines={1}>Secure your account</Text>
          <Text style={st.sub} numberOfLines={1}>Enable 2FA for extra protection  ·  Tap to set up</Text>
        </View>
        <TouchableOpacity
          style={st.closeBtn}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          onPress={dismiss}
        >
          <Ionicons name="close" size={16} color="#8E8E93" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 999,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#5856D6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(88,86,214,0.12)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#5856D6",
    lineHeight: 18,
  },
  sub: {
    fontSize: 11.5,
    fontFamily: "Inter_400Regular",
    color: "#8E8E93",
    lineHeight: 16,
    marginTop: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(142,142,147,0.12)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
