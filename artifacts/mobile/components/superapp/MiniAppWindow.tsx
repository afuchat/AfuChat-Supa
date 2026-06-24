import React, { Component, useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { LinearGradient } from "@/components/ui/SafeGradient";
import type { OpenApp } from "@/lib/superapp/types";

// ─── Per-mini-app error boundary ─────────────────────────────────────────────
// Catches crashes inside any mini app and shows the error on-screen instead of
// crashing the host app. Lets the user report the exact message to support.

type EBState = { error: Error | null };
class MiniAppErrorBoundary extends Component<
  { children: React.ReactNode; appName: string; onRetry: () => void },
  EBState
> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[MiniApp crash] ${this.props.appName}:`, error.message);
    console.error(error.stack);
    console.error(info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <MiniAppCrashScreen
          appName={this.props.appName}
          error={this.state.error}
          onRetry={() => {
            this.setState({ error: null });
            this.props.onRetry();
          }}
        />
      );
    }
    return this.props.children;
  }
}

function MiniAppCrashScreen({
  appName,
  error,
  onRetry,
}: {
  appName: string;
  error: Error;
  onRetry: () => void;
}) {
  return (
    <View style={eb.container}>
      <Ionicons name="warning-outline" size={40} color="#FF3B30" />
      <Text style={eb.title}>{appName} crashed</Text>
      <Text style={eb.msg}>{error.message || "Unknown error"}</Text>
      <ScrollView style={eb.stackWrap} contentContainerStyle={{ padding: 10 }}>
        <Text style={eb.stack} selectable>
          {error.stack ?? ""}
        </Text>
      </ScrollView>
      <TouchableOpacity style={eb.btn} onPress={onRetry}>
        <Text style={eb.btnTxt}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const eb = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "flex-start", padding: 24, paddingTop: 40, gap: 10, backgroundColor: "#0F0F0F" },
  title: { fontSize: 18, fontWeight: "700", color: "#F1F1F1" },
  msg: { fontSize: 13, color: "#FF6B6B", textAlign: "center" },
  stackWrap: { width: "100%", maxHeight: 200, backgroundColor: "#1A1A1A", borderRadius: 8, marginTop: 4 },
  stack: { fontSize: 10, color: "#888", lineHeight: 14 },
  btn: { marginTop: 12, backgroundColor: "#FF3B30", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  btnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },
});

const BUTTON_COOLDOWN_MS = 500;

interface Props {
  app: OpenApp;
  onClose: () => void;
  onMinimize: () => void;
  children: React.ReactNode;
}

export default function MiniAppWindow({ app, onClose, onMinimize, children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isActive = app.state === "active";
  const [showing, setShowing] = useState(false);

  const screenHeight = Dimensions.get("window").height;

  const translateY     = useRef(new Animated.Value(screenHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const minimizeBusy = useRef(false);
  const closeBusy    = useRef(false);

  const handleMinimize = useCallback(() => {
    if (minimizeBusy.current) return;
    minimizeBusy.current = true;
    setTimeout(() => { minimizeBusy.current = false; }, BUTTON_COOLDOWN_MS);
    onMinimize();
  }, [onMinimize]);

  const handleClose = useCallback(() => {
    if (closeBusy.current) return;
    closeBusy.current = true;
    setTimeout(() => { closeBusy.current = false; }, BUTTON_COOLDOWN_MS);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (isActive) {
      setShowing(true);
      translateY.setValue(screenHeight);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 26,
          stiffness: 260,
          mass: 0.9,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0.55,
          duration: 200,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: screenHeight,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start(({ finished }) => {
        if (finished) setShowing(false);
      });
    }
  }, [isActive]);

  if (!showing && !isActive) return null;

  return (
    <View style={[styles.container, { pointerEvents: showing ? "box-none" : "none" } as any]}>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity, pointerEvents: "box-none" } as any]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleMinimize} />
      </Animated.View>

      {/* Sliding window */}
      <Animated.View
        style={[
          styles.window,
          { transform: [{ translateY }], backgroundColor: colors.background },
        ]}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + 6,
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={app.manifest.gradient as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.appIcon}
            >
              <Ionicons name={app.manifest.icon as any} size={14} color="#fff" />
            </LinearGradient>
            <Text style={[styles.appName, { color: colors.text }]}>
              {app.manifest.name}
            </Text>
            {app.manifest.badge ? (
              <View style={[styles.badge, { backgroundColor: colors.accent + "20" }]}>
                <Text style={[styles.badgeText, { color: colors.accent }]}>
                  {app.manifest.badge}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.headerRight}>
            <Pressable
              onPress={handleMinimize}
              hitSlop={14}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.55 }]}
            >
              <Ionicons name="remove" size={22} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={handleClose}
              hitSlop={14}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.55 }]}
            >
              <View style={[styles.closeCircle, { backgroundColor: colors.backgroundSecondary }]}>
                <Ionicons name="close" size={15} color={colors.text} />
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.content}>
          <MiniAppErrorBoundary
            appName={app.manifest.name}
            onRetry={onClose}
          >
            {children}
          </MiniAppErrorBoundary>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  window: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 9 },
  appIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 2 },
  iconBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  closeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flex: 1 },
});
