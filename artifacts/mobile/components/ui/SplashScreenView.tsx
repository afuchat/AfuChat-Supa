/**
 * SplashScreenView
 *
 * JS-side splash overlay shown while fonts and assets load.
 *
 * Dark theme  → notification-icon.png  on black  (#000000)
 * Light theme → logo_black.webp  on cream  (#F5F0E8)
 *
 * Fades out quickly once `ready` becomes true, then calls `onDone`
 * so the parent can call SplashScreen.hideAsync().
 */

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LOGO_WHITE = require("@/assets/images/notification-icon.png");
const LOGO_BLACK = require("@/assets/images/logo_black.webp");

const { width } = Dimensions.get("window");
const LOGO_SIZE = Math.min(width * 0.32, 130);

interface Props {
  ready: boolean;
  onDone: () => void;
}

export function SplashScreenView({ ready, onDone }: Props) {
  const opacity    = useRef(new Animated.Value(1)).current;
  const scale      = useRef(new Animated.Value(1)).current;
  const doneFired  = useRef(false);
  const onDoneRef  = useRef(onDone);
  onDoneRef.current = onDone;

  // Detect theme: check stored user preference first, fall back to system
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = React.useState(systemScheme === "dark");

  React.useEffect(() => {
    AsyncStorage.getItem("@afuchat_theme")
      .then((val) => {
        if (val === "dark")       setIsDark(true);
        else if (val === "light") setIsDark(false);
        else                      setIsDark(systemScheme === "dark");
      })
      .catch(() => setIsDark(systemScheme === "dark"));
  }, [systemScheme]);

  useEffect(() => {
    if (!ready || doneFired.current) return;
    doneFired.current = true;

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        delay: 0,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1.08,
        duration: 180,
        delay: 0,
        useNativeDriver: true,
      }),
    ]).start(() => onDoneRef.current());
  }, [ready, opacity, scale]);

  // Dark  → black BG, white logo
  // Light → cream BG, black logo
  const bg            = isDark ? "#000000" : "#F5F0E8";
  const wordmarkColor = isDark ? "#FFFFFF"  : "#0A0A0A";
  const taglineColor  = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.38)";
  const logoSource    = isDark ? LOGO_WHITE : LOGO_BLACK;

  return (
    <Animated.View
      style={[styles.container, { opacity, backgroundColor: bg }, { pointerEvents: "none" }] as any}
    >
      <Animated.View style={[styles.logoWrap, { transform: [{ scale }] }]}>
        <Image
          source={logoSource}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="AfuChat logo"
          cachePolicy="memory"
        />
      </Animated.View>

      <View style={styles.wordmarkRow}>
        <Text style={[styles.wordmark, { color: wordmarkColor }]}>
          Afu<Text style={styles.wordmarkAccent}>Chat</Text>
        </Text>
      </View>

      <View style={styles.taglineWrap}>
        <Text style={[styles.tagline, { color: taglineColor }]}>
          Connect · Discover · Create
        </Text>
      </View>
    </Animated.View>
  );
}

export default SplashScreenView;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  wordmark: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: "System",
      android: "sans-serif-medium",
      default: "System",
    }),
  },
  wordmarkAccent: {
    color: "#1f95ff",
  },
  taglineWrap: {
    marginTop: 10,
  },
  tagline: {
    fontSize: 12,
    letterSpacing: 1.2,
    fontFamily: Platform.select({
      ios: "System",
      android: "sans-serif",
      default: "System",
    }),
  },
});
