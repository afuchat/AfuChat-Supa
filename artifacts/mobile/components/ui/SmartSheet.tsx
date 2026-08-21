/**
 * SmartSheet
 * An advanced expanding bottom sheet that:
 *  - Opens at a partial "peek" height
 *  - Expands to full screen as the user drags up or scrolls content
 *  - Collapses back to peek when dragged down from full height
 *  - Dismisses when dragged down past the peek height threshold
 *  - Animated backdrop fades in/out with sheet height
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Fraction of screen height shown in peek mode. Default 0.58 */
  peekFraction?: number;
  /** Open directly at the full available screen height instead of peek mode. */
  fullScreen?: boolean;
  backgroundColor?: string;
  handleColor?: string;
};

export function SmartSheet({
  visible,
  onClose,
  children,
  peekFraction = 0.58,
  fullScreen = false,
  backgroundColor,
  handleColor,
}: Props) {
  const { colors, isDark } = useTheme();
  const resolvedBg = backgroundColor ?? colors.surface;
  const resolvedHandle = handleColor ?? (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)");
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const peekH = screenH * peekFraction;
  const fullH = fullScreen ? screenH : screenH - insets.top - 16;

  // Keep fresh values accessible inside the PanResponder closure (created once)
  const peekHRef = useRef(peekH);
  const fullHRef = useRef(fullH);
  peekHRef.current = peekH;
  fullHRef.current = fullH;

  const sheetH = useRef(new Animated.Value(0)).current;

  // isFull state drives ScrollView's scrollEnabled so it re-renders correctly
  const [isFull, setIsFull] = useState(false);
  const isFullRef = useRef(false);

  const scrollYRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  // ─── Snap functions (stored in refs so PanResponder can always call the latest) ─

  const snapToFullRef = useRef<() => void>(() => {});
  const snapToPeekRef = useRef<() => void>(() => {});
  const dismissRef = useRef<() => void>(() => {});

  snapToFullRef.current = () => {
    isFullRef.current = true;
    setIsFull(true);
    Animated.timing(sheetH, {
      toValue: fullHRef.current,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  snapToPeekRef.current = () => {
    isFullRef.current = false;
    setIsFull(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    Animated.timing(sheetH, {
      toValue: peekHRef.current,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  dismissRef.current = () => {
    isFullRef.current = false;
    setIsFull(false);
    Animated.timing(sheetH, {
      toValue: 0,
      duration: 220,
      useNativeDriver: false,
    }).start(() => {
      sheetH.setValue(0);
      onClose();
    });
  };

  // ─── Open/close animation ──────────────────────────────────────────────────

  useEffect(() => {
    if (visible) {
       isFullRef.current = fullScreen;
       setIsFull(fullScreen);
      sheetH.setValue(0);
      Animated.timing(sheetH, {
         toValue: fullScreen ? fullHRef.current : peekHRef.current,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [visible, fullScreen]);

  // ─── PanResponder ─────────────────────────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        const isV =
          Math.abs(gs.dy) > Math.abs(gs.dx) && Math.abs(gs.dy) > 5;
        if (!isV) return false;
        // Peek mode → intercept all vertical drags (prevents content scrolling)
        if (!isFullRef.current) return true;
        // Full mode → only intercept downward drag when scroll is at the very top
        return gs.dy > 8 && scrollYRef.current <= 1;
      },
      onPanResponderMove: (_, gs) => {
        const base = isFullRef.current
          ? fullHRef.current
          : peekHRef.current;
        const next = Math.max(
          peekHRef.current * 0.12,
          Math.min(fullHRef.current, base - gs.dy)
        );
        sheetH.setValue(next);
      },
      onPanResponderRelease: (_, gs) => {
        const base = isFullRef.current
          ? fullHRef.current
          : peekHRef.current;
        const projected = base - gs.dy - gs.vy * 120;
        const mid = (fullHRef.current + peekHRef.current) / 2;

        if (gs.vy > 1.5 || (!isFullRef.current && gs.dy > 100)) {
          // Fast/big downward fling from peek → dismiss
          dismissRef.current();
        } else if (isFullRef.current && (gs.vy > 0.6 || gs.dy > 80)) {
          // Downward from full → collapse to peek
          snapToPeekRef.current();
        } else if (gs.vy < -0.5 || gs.dy < -50) {
          // Upward drag/fling → expand to full
          snapToFullRef.current();
        } else if (projected >= mid) {
          snapToFullRef.current();
        } else if (projected >= peekHRef.current * 0.4) {
          snapToPeekRef.current();
        } else {
          dismissRef.current();
        }
      },
    })
  ).current;

  // ─── Scroll-based collapse ─────────────────────────────────────────────────

  const handleScrollEndDrag = useCallback((e: any) => {
    const { contentOffset, velocity } = e.nativeEvent;
    if (contentOffset.y <= 1 && (velocity?.y ?? 0) > 0.4) {
      snapToPeekRef.current();
    }
  }, []);

  // ─── Backdrop opacity tied to sheet height ─────────────────────────────────

  const backdropOpacity = sheetH.interpolate({
    inputRange: [0, screenH * 0.35],
    outputRange: [0, 0.55],
    extrapolate: "clamp",
  });

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => dismissRef.current()}
      statusBarTranslucent
    >
      {/* Tappable backdrop dismisses or collapses */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() =>
          isFullRef.current
            ? snapToPeekRef.current()
            : dismissRef.current()
        }
      />

      {/* Dimming overlay (pointer-events: none so backdrop Pressable works) */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: "#000",
            opacity: backdropOpacity,
            pointerEvents: "none",
          } as any,
        ]}
      />

      {/* The sheet itself — panHandlers on the whole view */}
      <Animated.View
        style={[styles.sheet, fullScreen && styles.sheetFull, { height: sheetH, backgroundColor: resolvedBg, paddingBottom: insets.bottom }]}
        {...panResponder.panHandlers}
      >
        {/* Drag handle indicator */}
        <View style={[styles.handleBar, fullScreen && styles.handleBarFull]}>
          <View style={[styles.handle, { backgroundColor: resolvedHandle }]} />
        </View>

        {/* Scrollable content area */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          scrollEnabled={isFull}
          bounces={false}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          onScrollEndDrag={handleScrollEndDrag}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 -8px 32px rgba(0,0,0,0.24)",
      } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.22,
        shadowRadius: 18,
        elevation: 20,
      },
    }),
  },
  sheetFull: {
    top: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  handleBar: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  handleBarFull: {
    paddingTop: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
});
