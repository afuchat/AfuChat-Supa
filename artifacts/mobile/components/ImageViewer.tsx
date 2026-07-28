import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { notifyPostReply } from "@/lib/notifyUser";

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
    const Constants = require("expo-constants").default;
    if (Constants?.appOwnership === "expo" || Constants?.executionEnvironment === "storeClient") {
      return null;
    }
    const m = require("react-native-reanimated");
    if (m && typeof m.useSharedValue === "function") return m;
  } catch {}
  return null;
})();

const _GH: typeof import("react-native-gesture-handler") | null = (() => {
  try {
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

/** Post metadata passed to the viewer from the feed or detail page. */
export type PostViewerMeta = {
  postId: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string | null;
  isVerified?: boolean;
  isOrgVerified?: boolean;
  likeCount: number;
  replyCount: number;
  viewCount: number;
  bookmarked: boolean;
  liked: boolean;
  isFollowing?: boolean;
  // Callbacks so the viewer can mutate feed state in-place
  onToggleLike?: () => void;
  onToggleBookmark?: () => void;
  onToggleFollow?: () => void;
};

// ─── Animated slide (uses Reanimated + GestureHandler) ───────────────────────

function AnimatedZoomSlide({
  uri, width, height, isActive, onClose, onSwipeLeft, onSwipeRight, onScaleChange,
}: ZoomSlideProps) {
  const {
    useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
    default: AnimatedRN,
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
      <AnimatedRN.Image source={{ uri }} style={[{ width, height }, animStyle]} resizeMode="contain" />
    </GestureDetector>
  );
}

// ─── Simple slide fallback ────────────────────────────────────────────────────

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

function AnimatedZoomSlideWithRoot(props: ZoomSlideProps) {
  const { GestureHandlerRootView } = _GH!;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AnimatedZoomSlide {...props} />
    </GestureHandlerRootView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (!n || n < 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 10_000)    return Math.round(n / 1_000) + "K";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

// ─── Post chrome overlay ──────────────────────────────────────────────────────

function PostChrome({
  meta,
  zoomed,
  insets,
  onClose,
  onNavigateToPost,
}: {
  meta: PostViewerMeta;
  zoomed: boolean;
  insets: ReturnType<typeof useSafeAreaInsets>;
  onClose: () => void;
  onNavigateToPost: () => void;
}) {
  const { user, profile: myProfile } = useAuth();
  const [liked, setLiked]           = useState(meta.liked);
  const [likeCount, setLikeCount]   = useState(meta.likeCount);
  const [bookmarked, setBookmarked] = useState(meta.bookmarked);
  const [following, setFollowing]   = useState(!!meta.isFollowing);
  const [replyText, setReplyText]   = useState("");
  const [sending, setSending]       = useState(false);
  const inputRef = useRef<TextInput>(null);
  const heartScale = useRef(new Animated.Value(1)).current;

  // Keep in sync if meta changes
  useEffect(() => { setLiked(meta.liked); setLikeCount(meta.likeCount); }, [meta.liked, meta.likeCount]);
  useEffect(() => { setBookmarked(meta.bookmarked); }, [meta.bookmarked]);
  useEffect(() => { setFollowing(!!meta.isFollowing); }, [meta.isFollowing]);

  function pulseLike() {
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: true, speed: 50, bounciness: 14 }),
      Animated.spring(heartScale, { toValue: 1,   useNativeDriver: true, speed: 22, bounciness: 4  }),
    ]).start();
  }

  function handleLike() {
    if (!user) { onNavigateToPost(); return; }
    pulseLike();
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => c + (newLiked ? 1 : -1));
    meta.onToggleLike?.();
  }

  function handleBookmark() {
    if (!user) { onNavigateToPost(); return; }
    setBookmarked((b) => !b);
    meta.onToggleBookmark?.();
  }

  function handleFollow() {
    if (!user) { onNavigateToPost(); return; }
    setFollowing(true);
    meta.onToggleFollow?.();
  }

  async function sendReply() {
    if (!user || !replyText.trim() || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.from("post_replies").insert({
        post_id: meta.postId,
        author_id: user.id,
        content: replyText.trim(),
      }).select("id").single();
      if (!error && data) {
        try {
          await notifyPostReply({
            postId: meta.postId,
            postAuthorId: meta.authorId,
            replierId: user.id,
            replierName: myProfile?.display_name ?? "Someone",
          });
        } catch {}
        setReplyText("");
        Keyboard.dismiss();
      }
    } catch {}
    setSending(false);
  }

  if (zoomed) return null;

  const isOwnPost = user?.id === meta.authorId;

  return (
    <>
      {/* ── Author row ── */}
      <View style={[styles.authorRow, { paddingTop: insets.top + 50 }]}>
        <TouchableOpacity
          onPress={() => { onClose(); setTimeout(() => router.push({ pathname: "/contact/[id]", params: { id: meta.authorId } } as any), 120); }}
          activeOpacity={0.8}
          style={styles.authorInfo}
        >
          <Avatar uri={meta.authorAvatar} name={meta.authorName} size={36} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={styles.authorName} numberOfLines={1}>{meta.authorName}</Text>
              {(meta.isVerified || meta.isOrgVerified) && (
                <VerifiedBadge isVerified={!!meta.isVerified} isOrganizationVerified={!!meta.isOrgVerified} size={13} />
              )}
            </View>
            <Text style={styles.authorHandle} numberOfLines={1}>@{meta.authorHandle}</Text>
          </View>
        </TouchableOpacity>
        {!isOwnPost && !following && (
          <TouchableOpacity onPress={handleFollow} style={styles.followBtn} activeOpacity={0.8}>
            <Text style={styles.followBtnText}>Follow</Text>
          </TouchableOpacity>
        )}
        {!isOwnPost && following && (
          <View style={styles.followingTag}>
            <Text style={styles.followingTagText}>Following</Text>
          </View>
        )}
      </View>

      {/* ── Bottom chrome: action bar + reply input ── */}
      <View style={[styles.bottomChrome, { paddingBottom: insets.bottom }]}>
        {/* Action bar */}
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.actionStat} onPress={onNavigateToPost} activeOpacity={0.7}>
            <Ionicons name="chatbubble-outline" size={20} color="rgba(255,255,255,0.75)" />
            <Text style={styles.actionCount}>{fmtCount(meta.replyCount)}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionStat} onPress={handleLike} activeOpacity={0.7}>
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={20}
                color={liked ? "#FF3B30" : "rgba(255,255,255,0.75)"}
              />
            </Animated.View>
            <Text style={[styles.actionCount, liked && { color: "#FF3B30" }]}>{fmtCount(likeCount)}</Text>
          </TouchableOpacity>

          <View style={styles.actionStat}>
            <Ionicons name="eye-outline" size={20} color="rgba(255,255,255,0.75)" />
            <Text style={styles.actionCount}>{fmtCount(meta.viewCount)}</Text>
          </View>

          <View style={{ flex: 1 }} />

          <TouchableOpacity style={styles.actionIcon} onPress={handleBookmark} activeOpacity={0.7}>
            <Ionicons
              name={bookmarked ? "bookmark" : "bookmark-outline"}
              size={20}
              color={bookmarked ? "#FFD60A" : "rgba(255,255,255,0.75)"}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionIcon}
            onPress={() => { try { Share.share({ message: `https://afuchat.com/post/${meta.postId}` }); } catch {} }}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        </View>

        {/* Reply input row */}
        <View style={styles.replyRow}>
          <Avatar uri={myProfile?.avatar_url ?? null} name={myProfile?.display_name ?? "You"} size={30} />
          <View style={styles.replyPill}>
            <TextInput
              ref={inputRef}
              style={styles.replyInput}
              placeholder="Post your reply…"
              placeholderTextColor="rgba(255,255,255,0.38)"
              value={replyText}
              onChangeText={setReplyText}
              multiline={false}
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={sendReply}
            />
            {replyText.trim().length > 0 && (
              <TouchableOpacity onPress={sendReply} disabled={sending} style={styles.sendBtn} activeOpacity={0.8}>
                {sending
                  ? <ActivityIndicator size={14} color="#fff" />
                  : <Ionicons name="arrow-up" size={14} color="#fff" />}
              </TouchableOpacity>
            )}
          </View>

          {/* Expand: navigate to full comment page */}
          <TouchableOpacity onPress={onNavigateToPost} hitSlop={8} style={styles.expandBtn} activeOpacity={0.7}>
            <Ionicons name="expand-outline" size={19} color="rgba(255,255,255,0.65)" />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

// ─── Top navigation bar ───────────────────────────────────────────────────────

function TopBar({
  images,
  index,
  hasMultiple,
  zoomed,
  insets,
  onClose,
  onShare,
}: {
  images: string[];
  index: number;
  hasMultiple: boolean;
  zoomed: boolean;
  insets: ReturnType<typeof useSafeAreaInsets>;
  onClose: () => void;
  onShare: () => void;
}) {
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.glassBtn}>
        <Ionicons name="arrow-back" size={20} color="#fff" />
      </TouchableOpacity>

      {hasMultiple && (
        <View style={styles.counterPill}>
          <Text style={styles.counterText}>{index + 1} / {images.length}</Text>
        </View>
      )}

      {!hasMultiple && <View style={{ width: 38 }} />}

      {!zoomed && (
        <TouchableOpacity onPress={onShare} hitSlop={12} style={styles.glassBtn}>
          <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
        </TouchableOpacity>
      )}
      {zoomed && <View style={{ width: 38 }} />}
    </View>
  );
}

// ─── Exported ImageViewer ─────────────────────────────────────────────────────

type ViewerProps = {
  images: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
  meta?: PostViewerMeta;
};

function AnimatedImageViewer({ images, initialIndex = 0, visible, onClose, meta }: ViewerProps) {
  const {
    useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
    default: AnimatedRN,
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

  const handleShare = () => {
    try { Share.share({ url: images[index], message: images[index] }); } catch {}
  };

  const navigateToPost = useCallback(() => {
    if (!meta?.postId) return;
    onClose();
    setTimeout(() => router.push({ pathname: "/post/[id]", params: { id: meta.postId } } as any), 120);
  }, [meta?.postId, onClose]);

  if (!visible || images.length === 0) return null;
  const hasMultiple = images.length > 1;

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
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.82)" }]} />

        {/* Main image — full screen */}
        <AnimatedRN.View style={[styles.slideWrap, { width, height }, slideStyle]}>
          <AnimatedZoomSlideWithRoot
            key={index} uri={images[index]} width={width} height={height}
            isActive onClose={onClose} onSwipeLeft={goLeft} onSwipeRight={goRight}
            onScaleChange={(s) => setZoomed(s > 1.05)}
          />
        </AnimatedRN.View>

        {/* Top bar */}
        <TopBar
          images={images} index={index} hasMultiple={hasMultiple}
          zoomed={zoomed} insets={insets} onClose={onClose} onShare={handleShare}
        />

        {/* Side nav arrows */}
        {hasMultiple && !zoomed && (
          <>
            <TouchableOpacity
              style={[styles.navBtn, styles.navLeft, { top: height / 2 - 24 }]}
              onPress={goRight} disabled={index === 0} activeOpacity={0.65}
            >
              <Ionicons name="chevron-back" size={30} color="#fff"
                style={{ opacity: index === 0 ? 0.18 : 1 } as any} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navBtn, styles.navRight, { top: height / 2 - 24 }]}
              onPress={goLeft} disabled={index === images.length - 1} activeOpacity={0.65}
            >
              <Ionicons name="chevron-forward" size={30} color="#fff"
                style={{ opacity: index === images.length - 1 ? 0.18 : 1 } as any} />
            </TouchableOpacity>
          </>
        )}

        {/* Post chrome — author row + action bar + reply input */}
        {meta && (
          <PostChrome
            meta={meta}
            zoomed={zoomed}
            insets={insets}
            onClose={onClose}
            onNavigateToPost={navigateToPost}
          />
        )}
      </View>
    </Modal>
  );
}

function SimpleImageViewer({ images, initialIndex = 0, visible, onClose, meta }: ViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setIndex(Math.min(initialIndex, Math.max(0, images.length - 1)));
  }, [visible, initialIndex]);

  const handleShare = () => {
    try { Share.share({ url: images[index], message: images[index] }); } catch {}
  };

  const navigateToPost = useCallback(() => {
    if (!meta?.postId) return;
    onClose();
    setTimeout(() => router.push({ pathname: "/post/[id]", params: { id: meta.postId } } as any), 120);
  }, [meta?.postId, onClose]);

  if (!visible || images.length === 0) return null;
  const hasMultiple = images.length > 1;

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Image
          source={{ uri: images[index] }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={Platform.OS === "ios" ? 70 : 18}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.82)" }]} />

        <View style={[styles.slideWrap, { width, height }]}>
          <SimpleZoomSlide
            key={index} uri={images[index]} width={width} height={height}
            isActive onClose={onClose}
            onSwipeLeft={() => { if (index < images.length - 1) setIndex(index + 1); }}
            onSwipeRight={() => { if (index > 0) setIndex(index - 1); }}
            onScaleChange={() => {}}
          />
        </View>

        <TopBar
          images={images} index={index} hasMultiple={hasMultiple}
          zoomed={false} insets={insets} onClose={onClose} onShare={handleShare}
        />

        {hasMultiple && (
          <>
            <TouchableOpacity
              style={[styles.navBtn, styles.navLeft, { top: height / 2 - 24 }]}
              onPress={() => { if (index > 0) setIndex(index - 1); }}
              disabled={index === 0} activeOpacity={0.65}
            >
              <Ionicons name="chevron-back" size={30} color="#fff"
                style={{ opacity: index === 0 ? 0.18 : 1 } as any} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navBtn, styles.navRight, { top: height / 2 - 24 }]}
              onPress={() => { if (index < images.length - 1) setIndex(index + 1); }}
              disabled={index === images.length - 1} activeOpacity={0.65}
            >
              <Ionicons name="chevron-forward" size={30} color="#fff"
                style={{ opacity: index === images.length - 1 ? 0.18 : 1 } as any} />
            </TouchableOpacity>
          </>
        )}

        {meta && (
          <PostChrome
            meta={meta}
            zoomed={false}
            insets={insets}
            onClose={onClose}
            onNavigateToPost={navigateToPost}
          />
        )}
      </View>
    </Modal>
  );
}

// Exported component — picks animated or simple viewer at mount time.
export function ImageViewer(props: ViewerProps) {
  if (RA_AVAILABLE) return <AnimatedImageViewer {...props} />;
  return <SimpleImageViewer {...props} />;
}

// ─── useImageViewer hook ───────────────────────────────────────────────────────

export function useImageViewer() {
  const [state, setState] = useState<{
    visible: boolean;
    images: string[];
    index: number;
    meta?: PostViewerMeta;
  }>({ visible: false, images: [], index: 0 });

  const openViewer = useCallback(
    (images: string[], index = 0, meta?: PostViewerMeta) =>
      setState({ visible: true, images, index, meta }),
    []
  );
  const closeViewer = useCallback(
    () => setState((s) => ({ ...s, visible: false })),
    []
  );
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
    paddingBottom: 10,
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

  // ── Author row ──────────────────────────────────────────────────────────────
  authorRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  authorInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  authorName: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    flexShrink: 1,
  },
  authorHandle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  followBtn: {
    marginLeft: 10,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  followBtnText: {
    color: "#000",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  followingTag: {
    marginLeft: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  followingTagText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Bottom chrome ───────────────────────────────────────────────────────────
  bottomChrome: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: "rgba(0,0,0,0.50)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },

  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 20,
  },
  actionStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  actionCount: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  actionIcon: {
    padding: 4,
  },

  replyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  replyPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 38,
  },
  replyInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
    margin: 0,
  },
  sendBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  expandBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
});
