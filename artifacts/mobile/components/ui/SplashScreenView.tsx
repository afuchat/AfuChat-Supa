/**
 * SplashScreenView
 *
 * JS-side splash overlay shown while fonts and assets load.
 *
 * Both themes use the protected app icon artwork on its blue background.
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

const APP_ICON = require("@/assets/images/icon.png");

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

  const bg            = "#0719D6";
  const wordmarkColor = "#FFFFFF";
  const taglineColor  = "rgba(255,255,255,0.62)";
  const logoSource    = APP_ICON;

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
    color: "#1018D8",
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
