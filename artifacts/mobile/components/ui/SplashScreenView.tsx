/**
 * SplashScreenView
 *
 * A JS-side splash overlay that mirrors the native splash screen appearance
 * (white logo on black) and animates out smoothly once the app is ready.
 *
 * Usage:
 *   <SplashScreenView ready={fontsReady && !authLoading} onDone={hideSplash} />
 *
 * The component fades itself out over 350ms once `ready` becomes true, then
 * calls `onDone` so the parent can call SplashScreen.hideAsync().
 */

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { LOGO_WHITE_B64, LOGO_BLACK_B64 } from "@/lib/logoAssets";
const LOGO_WHITE = { uri: LOGO_WHITE_B64 };
const LOGO_BLACK = { uri: LOGO_BLACK_B64 };
const { width } = Dimensions.get("window");
const LOGO_SIZE = Math.min(width * 0.28, 120);

interface Props {
  ready: boolean;
  onDone: () => void;
}

export function SplashScreenView({ ready, onDone }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const doneFired = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Detect theme: check stored preference, fall back to system color scheme
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = React.useState(systemScheme === "dark");

  React.useEffect(() => {
    AsyncStorage.getItem("@afuchat_theme")
      .then((val) => {
        if (val === "dark") setIsDark(true);
        else if (val === "light") setIsDark(false);
        else setIsDark(systemScheme === "dark");
      })
      .catch(() => setIsDark(systemScheme === "dark"));
  }, [systemScheme]);

  useEffect(() => {
    if (!ready || doneFired.current) return;
    doneFired.current = true;

    if (Platform.OS === "web") {
      // On web: opacity-only fade. Use a ref-stored setTimeout for onDone
      // because (a) the Animated .start() callback is unreliable on RN Web
      // when the native animated module is absent, and (b) storing the timer
      // in a ref prevents the effect cleanup from cancelling it on re-renders
      // after doneFired is already true.
      Animated.timing(opacity, {
        toValue: 0,
        duration: 350,
        delay: 80,
        useNativeDriver: false,
      }).start();
      timerRef.current = setTimeout(() => onDoneRef.current(), 480);
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 380,
          delay: 120,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.08,
          duration: 380,
          delay: 120,
          useNativeDriver: true,
        }),
      ]).start(() => onDoneRef.current());
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [ready, opacity, scale]);

  const bg = isDark ? "#000000" : "#FFFFFF";
  const wordmarkColor = isDark ? "#FFFFFF" : "#0A0A0A";
  const taglineColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.38)";
  const LOGO = isDark ? LOGO_WHITE : LOGO_BLACK;

  return (
    <Animated.View style={[styles.container, { opacity, backgroundColor: bg, pointerEvents: "none" } as any]}>
      <Animated.View style={[styles.logoWrap, { transform: [{ scale }] }]}>
        <Image
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="AfuChat logo"
        />
      </Animated.View>
      <View style={styles.wordmarkRow}>
        <Text style={[styles.wordmark, { color: wordmarkColor }]}>
          Afu<Text style={styles.wordmarkAccent}>Chat</Text>
        </Text>
      </View>
      {Platform.OS !== "web" && (
        <View style={styles.taglineWrap}>
          <Text style={[styles.tagline, { color: taglineColor }]}>Connect · Discover · Create</Text>
        </View>
      )}
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
    fontFamily: Platform.select({ ios: "System", android: "sans-serif-medium", default: "System" }),
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
    fontFamily: Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
  },
});
