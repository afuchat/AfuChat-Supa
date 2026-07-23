import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─────────────────────────────────────────────────────────────────────────────
// Lazy-load Reanimated + GestureHandler with a try-catch IIFE.
//
// On certain Android Expo Go builds the native worklet runtime throws a Java
// NullPointerException during module initialisation — BEFORE any React code
// runs. A static `import` at the top of this file would propagate that crash
// to the module itself, making ALL exports (including `useImageViewer`) become
// undefined. The lazy IIFE approach catches the native error and falls back to
// a plain (non-animated) image viewer instead.
// ─────────────────────────────────────────────────────────────────────────────

const _RA: typeof import("react-native-reanimated") | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require("react-native-reanimated");
    if (m && typeof m.useSharedValue === "function") return m;
  } catch {}
  return null;
})();

const _GH: typeof import("react-native-gesture-handler") | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("react-native-gesture-handler");
  } catch {}
  return null;
})();

const RA_AVAILABLE = _RA !== null && _GH !== null;

// ─── Constants ───────────────────────────────────────────────────────────────

const SPRING = { damping: 20, stiffness: 200, mass: 0.8 };
const MAX_SCALE = 5;
const MIN_SCALE = 1;
const SWIPE_THRESHOLD = 60;

// ─── Types ───────────────────────────────────────────────────────────────────

type ZoomSlideProps = {
  uri: string;
  width: number;
  height: number;
  isActive: boolean;
  onClose: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onScaleChange: (s: number) => void;
};

// ─── Animated slide (uses Reanimated + GestureHandler) ───────────────────────

function AnimatedZoomSlide({
  uri, width, height, isActive, onClose, onSwipeLeft, onSwipeRight, onScaleChange,
}: ZoomSlideProps) {
  const {
    useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
    default: Animated,
  } = _RA!;
  const { Gesture, GestureDetector } = _GH!;

  const scale          = useSharedValue(1);
  const savedScale     = useSharedValue(1);
  const offsetX        = useSharedValue(0);
  const offsetY        = useSharedValue(0);
  const savedOffsetX   = useSharedValue(0);
  const savedOffsetY   = useSharedValue(0);

  const pinchStartScale = useSharedValue(1);
  const pinchStartOffX  = useSharedValue(0);
  const pinchStartOffY  = useSharedValue(0);
  const pinchFocalX     = useSharedValue(0);
  const pinchFocalY     = useSharedValue(0);

  useEffect(() => {
    if (!isActive) {
      scale.value      = withSpring(1, SPRING);
      offsetX.value    = withSpring(0, SPRING);
      offsetY.value    = withSpring(0, SPRING);
      savedScale.value = 1;
      savedOffsetX.value = 0;
      savedOffsetY.value = 0;
    }
  }, [isActive]);

  function clampOffset(val: number, s: number, dim: number) {
    "worklet";
    const maxPan = Math.max(0, (dim * s - dim) / 2);
    return Math.max(-maxPan, Math.min(maxPan, val));
  }

  const pinch = Gesture.Pinch()
    .onBegin((e: any) => {
      pinchStartScale.value = savedScale.value;
      pinchStartOffX.value  = savedOffsetX.value;
      pinchStartOffY.value  = savedOffsetY.value;
      pinchFocalX.value     = e.focalX - width / 2;
      pinchFocalY.value     = e.focalY - height / 2;
    })
    .onUpdate((e: any) => {
      const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStartScale.value * e.scale));
      scale.value = s;
      const scaleRatio = s / (pinchStartScale.value || 1);
      const fx = pinchFocalX.value;
      const fy = pinchFocalY.value;
      offsetX.value = clampOffset(fx + (pinchStartOffX.value - fx) * scaleRatio, s, width);
      offsetY.value = clampOffset(fy + (pinchStartOffY.value - fy) * scaleRatio, s, height);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1, SPRING);
        offsetX.value = withSpring(0, SPRING);
        offsetY.value = withSpring(0, SPRING);
        savedScale.value = 1;
        savedOffsetX.value = 0;
        savedOffsetY.value = 0;
        runOnJS(onScaleChange)(1);
      } else {
        savedScale.value   = scale.value;
        savedOffsetX.value = offsetX.value;
        savedOffsetY.value = offsetY.value;
        runOnJS(onScaleChange)(scale.value);
      }
    });

  const pan = Gesture.Pan()
    .minDistance(4)
    .maxPointers(1)
    .onUpdate((e: any) => {
      if (scale.value > 1.01) {
        offsetX.value = clampOffset(savedOffsetX.value + e.translationX, scale.value, width);
        offsetY.value = clampOffset(savedOffsetY.value + e.translationY, scale.value, height);
      }
    })
    .onEnd((e: any) => {
      if (scale.value <= 1.01) {
        const vx = e.velocityX, tx = e.translationX;
        if      (tx < -SWIPE_THRESHOLD || vx < -400) runOnJS(onSwipeLeft)();
        else if (tx >  SWIPE_THRESHOLD || vx >  400) runOnJS(onSwipeRight)();
        offsetX.value = withSpring(0, SPRING);
        offsetY.value = withSpring(0, SPRING);
      } else {
        savedOffsetX.value = offsetX.value;
        savedOffsetY.value = offsetY.value;
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd((e: any) => {
      if (scale.value > 1.5) {
        scale.value = withSpring(1, SPRING);
        offsetX.value = withSpring(0, SPRING);
        offsetY.value = withSpring(0, SPRING);
        savedScale.value = 1; savedOffsetX.value = 0; savedOffsetY.value = 0;
        runOnJS(onScaleChange)(1);
      } else {
        const targetScale = 2.5;
        const fx = e.x - width / 2, fy = e.y - height / 2;
        const newOffX = clampOffset(-fx * (targetScale - 1), targetScale, width);
        const newOffY = clampOffset(-fy * (targetScale - 1), targetScale, height);
        scale.value   = withSpring(targetScale, SPRING);
        offsetX.value = withSpring(newOffX, SPRING);
        offsetY.value = withSpring(newOffY, SPRING);
        savedScale.value = targetScale;
        savedOffsetX.value = newOffX;
        savedOffsetY.value = newOffY;
        runOnJS(onScaleChange)(targetScale);
      }
    });

  const singleTap = Gesture.Tap()
    .maxDuration(200)
    .onEnd(() => { if (scale.value <= 1.01) runOnJS(onClose)(); });

  const composed = Gesture.Simultaneous(
    Gesture.Simultaneous(pinch, pan),
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: offsetX.value }, { translateY: offsetY.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.Image source={{ uri }} style={[{ width, height }, animStyle]} resizeMode="contain" />
    </GestureDetector>
  );
}

// ─── Simple slide fallback (no Reanimated — plain Image + tap handler) ────────

function SimpleZoomSlide({ uri, width, height, onClose, onSwipeLeft, onSwipeRight }: ZoomSlideProps) {
  const startX = useRef(0);
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onClose}
      onPressIn={(e) => { startX.current = e.nativeEvent.locationX; }}
      onPressOut={(e) => {
        const dx = e.nativeEvent.locationX - startX.current;
        if      (dx < -SWIPE_THRESHOLD) onSwipeLeft();
        else if (dx >  SWIPE_THRESHOLD) onSwipeRight();
      }}
    >
      <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
    </TouchableOpacity>
  );
}

// ─── Animated slide wrapper (wraps in GestureHandlerRootView) ─────────────────

function AnimatedZoomSlideWithRoot(props: ZoomSlideProps) {
  const { GestureHandlerRootView } = _GH!;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AnimatedZoomSlide {...props} />
    </GestureHandlerRootView>
  );
}

// ─── Shared chrome ────────────────────────────────────────────────────────────

function ViewerChrome({
  images,
  index,
  hasMultiple,
  zoomed,
  insets,
  onClose,
  onPrev,
  onNext,
  onDotPress,
  imgH,
}: {
  images: string[];
  index: number;
  hasMultiple: boolean;
  zoomed: boolean;
  insets: any;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDotPress: (i: number) => void;
  imgH: number;
}) {
  function handleShare() {
    try {
      Share.share({ url: images[index], message: images[index] });
    } catch {}
  }

  return (
    <>
      {/* ── Top bar ── */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.glassBtn}>
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>

        {hasMultiple && (
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>{index + 1} / {images.length}</Text>
          </View>
        )}

        <TouchableOpacity onPress={handleShare} hitSlop={12} style={styles.glassBtn}>
          <Ionicons name="share-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Side nav arrows ── */}
      {hasMultiple && !zoomed && (
        <>
          <TouchableOpacity
            style={[styles.navBtn, styles.navLeft, { top: insets.top + 56 + imgH / 2 - 24 }]}
            onPress={onPrev}
            disabled={index === 0}
            activeOpacity={0.65}
          >
            <Ionicons
              name="chevron-back"
              size={30}
              color="#fff"
              style={{ opacity: index === 0 ? 0.18 : 1, textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 } as any}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navBtn, styles.navRight, { top: insets.top + 56 + imgH / 2 - 24 }]}
            onPress={onNext}
            disabled={index === images.length - 1}
            activeOpacity={0.65}
          >
            <Ionicons
              name="chevron-forward"
              size={30}
              color="#fff"
              style={{ opacity: index === images.length - 1 ? 0.18 : 1, textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 } as any}
            />
          </TouchableOpacity>
        </>
      )}

      {/* ── Dot indicators ── */}
      {hasMultiple && (
        <View style={[styles.dots, { bottom: insets.bottom + 28 }]}>
          {images.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => onDotPress(i)} hitSlop={6}>
              <View style={[styles.dot, i === index && styles.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );
}

// ─── Exported ImageViewer ─────────────────────────────────────────────────────

type ViewerProps = { images: string[]; initialIndex?: number; visible: boolean; onClose: () => void };

function AnimatedImageViewer({ images, initialIndex = 0, visible, onClose }: ViewerProps) {
  const {
    useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
    default: Animated,
  } = _RA!;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex]   = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);

  const slideX       = useSharedValue(0);
  const slideOpacity = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      const safeIdx = Math.min(initialIndex, Math.max(0, images.length - 1));
      setIndex(safeIdx);
      setZoomed(false);
      slideX.value       = 0;
      slideOpacity.value = 1;
    }
  }, [visible, initialIndex]);

  const animateSlide = useCallback((dir: "left" | "right", nextIdx: number) => {
    const targetX = dir === "left" ? -width : width;
    slideX.value = withTiming(targetX, { duration: 220 }, () => {
      slideX.value       = -targetX;
      runOnJS(setIndex)(nextIdx);
      slideOpacity.value = 0;
      slideX.value       = withSpring(0, SPRING);
      slideOpacity.value = withTiming(1, { duration: 200 });
    });
  }, [width]);

  const goLeft  = useCallback(() => { if (index < images.length - 1) animateSlide("left",  index + 1); }, [index, images.length, animateSlide]);
  const goRight = useCallback(() => { if (index > 0)                  animateSlide("right", index - 1); }, [index, animateSlide]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: slideOpacity.value,
  }));

  if (!visible || images.length === 0) return null;
  const hasMultiple = images.length > 1;
  const imgH = height * 0.86;

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose} hardwareAccelerated>
      <View style={styles.root}>
        {/* Ambient blurred background */}
        <Image
          source={{ uri: images[index] }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={Platform.OS === "ios" ? 70 : 18}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.78)" }]} />

        {/* Main image */}
        <Animated.View style={[styles.slideWrap, { width, height: imgH }, slideStyle]}>
          <AnimatedZoomSlideWithRoot
            key={index} uri={images[index]} width={width} height={imgH}
            isActive onClose={onClose} onSwipeLeft={goLeft} onSwipeRight={goRight}
            onScaleChange={(s) => setZoomed(s > 1.05)}
          />
        </Animated.View>

        <ViewerChrome
          images={images}
          index={index}
          hasMultiple={hasMultiple}
          zoomed={zoomed}
          insets={insets}
          onClose={onClose}
          onPrev={goRight}
          onNext={goLeft}
          onDotPress={setIndex}
          imgH={imgH}
        />
      </View>
    </Modal>
  );
}

function SimpleImageViewer({ images, initialIndex = 0, visible, onClose }: ViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setIndex(Math.min(initialIndex, Math.max(0, images.length - 1)));
  }, [visible, initialIndex]);

  if (!visible || images.length === 0) return null;
  const hasMultiple = images.length > 1;
  const imgH = height * 0.86;

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Ambient blurred background */}
        <Image
          source={{ uri: images[index] }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={Platform.OS === "ios" ? 70 : 18}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.78)" }]} />

        {/* Main image */}
        <View style={[styles.slideWrap, { width, height: imgH }]}>
          <SimpleZoomSlide
            key={index} uri={images[index]} width={width} height={imgH}
            isActive onClose={onClose}
            onSwipeLeft={() => { if (index < images.length - 1) setIndex(index + 1); }}
            onSwipeRight={() => { if (index > 0) setIndex(index - 1); }}
            onScaleChange={() => {}}
          />
        </View>

        <ViewerChrome
          images={images}
          index={index}
          hasMultiple={hasMultiple}
          zoomed={false}
          insets={insets}
          onClose={onClose}
          onPrev={() => { if (index > 0) setIndex(index - 1); }}
          onNext={() => { if (index < images.length - 1) setIndex(index + 1); }}
          onDotPress={setIndex}
          imgH={imgH}
        />
      </View>
    </Modal>
  );
}

// Exported component — picks animated or simple viewer at mount time.
// The choice is stable (RA_AVAILABLE never changes after module init).
export function ImageViewer(props: ViewerProps) {
  if (RA_AVAILABLE) return <AnimatedImageViewer {...props} />;
  return <SimpleImageViewer {...props} />;
}

// ─── useImageViewer hook (no reanimated — always works) ───────────────────────

export function useImageViewer() {
  const [state, setState] = useState<{ visible: boolean; images: string[]; index: number }>({
    visible: false, images: [], index: 0,
  });
  const openViewer  = useCallback((images: string[], index = 0) => setState({ visible: true, images, index }), []);
  const closeViewer = useCallback(() => setState((s) => ({ ...s, visible: false })), []);
  return { ...state, openViewer, closeViewer };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 14,
    zIndex: 20,
  },

  glassBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.13)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },

  counterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  counterText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },

  slideWrap: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "visible",
  },

  navBtn: {
    position: "absolute",
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  navLeft:  { left: 4 },
  navRight: { right: 4 },

  dots: {
    position: "absolute",
    flexDirection: "row",
    gap: 5,
    alignSelf: "center",
  },
  dot: {
    width: 6,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 22,
    borderRadius: 2,
  },
});
