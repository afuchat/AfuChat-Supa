/**
 * VideoFeed — TikTok-exact vertical paging feed.
 *
 * Layout per item (height = SCREEN_H - tabBarHeight):
 *   ┌──────────────────────────────┐
 *   │  VIDEO SECTION  (flex: 1)   │  ← video player fills this
 *   │  [right action rail]        │  ← overlaid on video, right side
 *   │  [progress bar]             │  ← very bottom of video
 *   ├──────────────────────────────┤
 *   │  INFO SECTION  (INFO_H px)  │  ← solid #0a0a0a, below video
 *   │  @handle  [Follow]          │
 *   │  caption text               │
 *   │  ♫ audio name               │
 *   └──────────────────────────────┘
 *
 * Header (overlaid, TikTok-style):
 *   [LIVE]  Following · For You  [🔍]
 *
 * Auto-advance: when a video ends it automatically scrolls to the next item.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Linking,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Image as ExpoImage } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import UserName from "@/components/ui/UserName";
import { RichText } from "@/components/ui/RichText";
import { useAppAccent } from "@/context/AppAccentContext";
import { useTheme } from "@/hooks/useTheme";
import { notifyPostLike, notifyNewFollow } from "@/lib/notifyUser";
import { VideoFeedSkeleton } from "@/components/ui/Skeleton";
import { useResolvedVideoSource } from "@/hooks/useResolvedVideoSource";
import { getPreferredVideoHeight, isWifi } from "@/lib/networkQuality";
import { getCachedVideoUri, cacheVideo, markVideoWatched } from "@/lib/videoCache";
import { recordWatchHistory } from "@/lib/watchHistory";
import {
  computeFeedScore,
  detectTopicsInContent,
  diversifyFeed,
  getLearnedInterestBoosts,
  getNotInterestedSignals,
  getSeenVideoMap,
  markNotInterested,
  markVideosSeen,
  matchInterestsWeighted,
  extractHashtags,
  undoNotInterested,
  type FeedSignals,
} from "@/lib/feedAlgorithm";
import { showActionToast } from "@/lib/toast";
import { useAnimationGuard } from "@/hooks/useAnimationGuard";
import { subscribeCallAudio } from "@/lib/callAudioBus";

// ── Lazy-load Reanimated ──────────────────────────────────────────────────────
const _raVF = (() => {
  try {
    // Expo Go can provide a native Reanimated runtime that does not match the
    // app's bundled Reanimated 4 / Worklets JS runtime. In that case
    // useAnimatedStyle receives the transformed updater object and crashes in
    // styleUpdater. Use the existing non-Reanimated fallbacks in Expo Go.
    const Constants = require("expo-constants").default;
    if (Constants?.appOwnership === "expo" || Constants?.executionEnvironment === "storeClient") {
      return null;
    }
    const m = require("react-native-reanimated");
    if (m && typeof m.useSharedValue === "function") return m;
  } catch {}
  return null;
})();

function _vfStubSV<T>(init: T): { value: T } {
  const ref = React.useRef({ value: init });
  return ref.current;
}

const useSharedValue   = (_raVF?.useSharedValue   ?? _vfStubSV)                   as typeof import("react-native-reanimated").useSharedValue;
const useAnimatedStyle = (_raVF?.useAnimatedStyle ?? ((_fn: any) => ({})))         as typeof import("react-native-reanimated").useAnimatedStyle;
const withSpring       = (_raVF?.withSpring       ?? ((v: any) => v))               as typeof import("react-native-reanimated").withSpring;
const withTiming       = (_raVF?.withTiming       ?? ((v: any) => v))               as typeof import("react-native-reanimated").withTiming;
const withSequence     = (_raVF?.withSequence     ?? ((v: any) => v))               as typeof import("react-native-reanimated").withSequence;
const withDelay        = (_raVF?.withDelay        ?? ((_d: number, v: any) => v))   as typeof import("react-native-reanimated").withDelay;
const runOnJS          = (_raVF?.runOnJS          ?? ((fn: any) => fn))             as typeof import("react-native-reanimated").runOnJS;
const ReAnimated       = (_raVF?.default ?? require("react-native").Animated)      as typeof import("react-native-reanimated").default;

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE      = 20;
const FOR_YOU_POOL   = 200;
const BOTTOM_BAR_H   = 72;  // fixed action bar height between video and tab nav
const CAPTION_H      = 40;  // caption strip — 1 line only

// ─── Types ────────────────────────────────────────────────────────────────────

export type VideoPost = {
  id: string;
  author_id: string;
  content: string;
  video_url: string;
  image_url: string | null;
  audio_name: string | null;
  created_at: string;
  view_count: number;
  profile: { display_name: string; handle: string; avatar_url: string | null; is_verified: boolean; is_organization_verified: boolean };
  liked: boolean;
  bookmarked: boolean;
  likeCount: number;
  replyCount: number;
  following: boolean;
  score?: number;
};

export type FeedTab = "for_you" | "following";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffleArr<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtDur(secs: number): string {
  if (!secs || !isFinite(secs)) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Gradients ────────────────────────────────────────────────────────────────

function TopGradient() {
  return (
    <LinearGradient
      colors={["rgba(0,0,0,0.55)", "transparent"]}
      style={[styles.topGradient, { pointerEvents: "none" }]}
    />
  );
}

// ─── Bottom gradient (for caption/author readability) ─────────────────────────

function BottomGradient() {
  return (
    <LinearGradient
      colors={["transparent", "rgba(0,0,0,0.72)"]}
      style={[styles.bottomGradient, { pointerEvents: "none" }]}
    />
  );
}

// ─── Spinning music disc ──────────────────────────────────────────────────────

function MusicDisc({ isPlaying }: { isPlaying: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isPlaying) {
      animRef.current = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 3200,
          useNativeDriver: true,
        })
      );
      animRef.current.start();
    } else {
      animRef.current?.stop();
    }
    return () => { animRef.current?.stop(); };
  }, [isPlaying]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={[styles.musicDisc, { transform: [{ rotate }] }]}>
      <View style={styles.musicDiscInner} />
    </Animated.View>
  );
}

// ─── VideoItem ────────────────────────────────────────────────────────────────

type VideoItemProps = {
  item: VideoPost;
  index: number;
  isActive: boolean;
  isNearActive: boolean;
  screenW: number;
  itemH: number;
  videoH: number;
  globalMuted: boolean;
  onLike: (postId: string, liked: boolean) => void;
  onFollow: (authorId: string) => void;
  onView: (postId: string) => void;
  onBookmark: (postId: string, bookmarked: boolean) => void;
  onMore: (item: VideoPost) => void;
  onToggleMute: () => void;
  onVideoEnd: () => void;
  onPlayerReady: (index: number, player: ReturnType<typeof useVideoPlayer> | null) => void;
  currentUserId?: string;
};

const VideoItem = React.memo(
  function VideoItem({
    item,
    index,
    isActive,
    isNearActive,
    screenW,
    itemH,
    videoH,
    globalMuted,
    onLike,
    onFollow,
    onView,
    onBookmark,
    onMore,
    onToggleMute,
    onVideoEnd,
    onPlayerReady,
    currentUserId,
  }: VideoItemProps) {
    const { accent } = useAppAccent();
    const player = useVideoPlayer(null, (p) => {
      p.loop = false; // we handle loop manually so we can fire onVideoEnd
      p.muted = true; // always start muted — unmuted only after first frame confirmed
      p.timeUpdateEventInterval = 0.1; // 100ms time-update events for smooth progress bar
    });

    const [paused, setPaused] = useState(false);
    const [showBuffering, setShowBuffering] = useState(false);
    const [videoStarted, setVideoStarted] = useState(false);
    const [cachedUri, setCachedUri] = useState<string | null>(null);
    const [videoError, setVideoError] = useState(false);
    const [captionExpanded, setCaptionExpanded] = useState(false);
    const [duration, setDuration] = useState(0);

    const heartScale      = useSharedValue(1);
    const dtOpacity       = useSharedValue(0);
    const dtScale         = useSharedValue(0.3);
    const progressFill    = useSharedValue(0);
    const progressVisible = useSharedValue(0);

    useAnimationGuard(heartScale, dtOpacity, dtScale, progressFill, progressVisible);

    const progressHideTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
    const progressTrackWidth  = useRef(0);   // measured onLayout for seek math
    const durationRef         = useRef(0);   // mirrors `duration` for PanResponder closure

    function showProgressBar() {
      progressVisible.value = withTiming(1, { duration: 150 });
      if (progressHideTimer.current) clearTimeout(progressHideTimer.current);
      progressHideTimer.current = setTimeout(() => {
        progressVisible.value = withTiming(0, { duration: 300 });
        progressHideTimer.current = null;
      }, 2500);
    }

    // Seek to a 0-1 fraction — shared by tap and pan
    function seekToFrac(frac: number) {
      const clamped = Math.max(0, Math.min(1, frac));
      progressFill.value = clamped;
      try {
        if (durationRef.current > 0) player.currentTime = clamped * durationRef.current;
      } catch {}
    }

    const seekPanResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          showProgressBar();
          const frac = e.nativeEvent.locationX / Math.max(1, progressTrackWidth.current);
          seekToFrac(frac);
        },
        onPanResponderMove: (e) => {
          showProgressBar();
          const frac = e.nativeEvent.locationX / Math.max(1, progressTrackWidth.current);
          seekToFrac(frac);
        },
        onPanResponderRelease: () => {
          showProgressBar(); // reset auto-hide timer after lift
        },
      })
    ).current;

    const bufferingRef     = useRef(false);
    const bufferingTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
    const videoStartedRef  = useRef(false);
    const lastProgressTs   = useRef(0);
    const viewRecorded     = useRef(false);
    const cacheAttempted   = useRef(false);
    const cacheDelayTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const watchSaved       = useRef(false);
    const endFired         = useRef(false);
    // Refs so async callbacks (replaceAsync .then) never read stale closure values
    const isActiveRef      = useRef(isActive);
    const pausedRef        = useRef(false);
    useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
    useEffect(() => { pausedRef.current = paused; }, [paused]);

    const resolved = useResolvedVideoSource(item.id, item.video_url, {
      targetHeight: getPreferredVideoHeight(),
    });
    const playUri = videoError
      ? item.video_url
      : (cachedUri ?? resolved.uri ?? item.video_url);

    // Stay muted until the first video frame is confirmed playing.
    // This prevents the "5-second audio with frozen frame" artifact that occurs
    // because audio buffers much faster than video frames.
    useEffect(() => {
      try { player.muted = videoStarted ? globalMuted : true; } catch {}
    }, [globalMuted, videoStarted]);

    // Preload into cache when ±1 — no artificial delay, check immediately
    useEffect(() => {
      if (!isNearActive || cacheAttempted.current || !item.video_url) return;
      cacheAttempted.current = true;
      getCachedVideoUri(item.video_url).then((existing) => {
        if (existing) {
          setCachedUri(existing);
        } else if (isWifi()) {
          cacheVideo(item.video_url).then((local) => {
            if (local) setCachedUri(local);
          });
        }
      });
    }, [isNearActive, item.video_url]);

    // Reset when scrolled away; record view + watch on arrival
    useEffect(() => {
      if (!isActive) {
        setPaused(false);
        setVideoStarted(false);
        setShowBuffering(false);
        progressFill.value = 0;
        if (videoError) setVideoError(false);
        bufferingRef.current = false;
        videoStartedRef.current = false;
        lastProgressTs.current = 0;
        watchSaved.current = false;
        endFired.current = false;
        // Always restart from the beginning — never resume mid-video
        try { player.currentTime = 0; } catch {}
        if (bufferingTimer.current) {
          clearTimeout(bufferingTimer.current);
          bufferingTimer.current = null;
        }
      } else {
        // Seek to start whenever this item becomes active (handles return scroll)
        try { player.currentTime = 0; } catch {}
        endFired.current = false;
        if (!viewRecorded.current) {
          viewRecorded.current = true;
          onView(item.id);
        }
        if (!watchSaved.current) {
          watchSaved.current = true;
          const _wTitle = `${item.profile.display_name}${item.content ? `: ${item.content.slice(0, 60)}` : ""}`;
          markVideoWatched(item.id, item.video_url, {
            title: _wTitle,
            thumbnail: item.image_url,
          }).catch(() => { watchSaved.current = false; });
          recordWatchHistory(item.id, {
            title:     _wTitle,
            thumbnail: item.image_url ?? null,
            videoUrl:  item.video_url,
          }).catch(() => {});
        }
      }
    }, [isActive]);

    const mountedRef = useRef(true);
    useEffect(() => {
      mountedRef.current = true;
      return () => { mountedRef.current = false; };
    }, []);

    // Register player instance with VideoFeed so it can pause/play us immediately
    // without waiting for a React re-render cycle.
    useEffect(() => {
      onPlayerReady(index, player);
      return () => { onPlayerReady(index, null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index, player]);

    // Player source — after loading, immediately play if we are the active item
    // so we don't depend on the separate play/pause effect racing against replaceAsync.
    useEffect(() => {
      if (!playUri || !isNearActive) return;
      player.replaceAsync({ uri: playUri })
        .then(() => {
          if (!mountedRef.current) return;
          // Seek to start so a preloaded (partially-played) source starts fresh
          try { player.currentTime = 0; } catch {}
          if (isActiveRef.current && !pausedRef.current) {
            try { player.play(); } catch {}
          }
        })
        .catch(() => {
          if (mountedRef.current && !videoError) setVideoError(true);
        });
    }, [playUri, isNearActive]);

    // Play / pause — handles isActive / paused toggle changes after source is loaded
    useEffect(() => {
      try {
        if (!isNearActive) { player.pause(); return; }
        if (!isActive || paused) { player.pause(); } else { player.play(); }
      } catch (_) {}
    }, [isActive, isNearActive, paused]);

    // ── Native event listeners — replaces 250 ms setInterval polling ─────────
    // playingChange  → instant first-frame detection (no lag, no JS polling)
    // statusChange   → buffering spinner
    // playToEnd      → auto-advance at natural end
    // timeUpdate     → progress bar at 100 ms cadence (set in useVideoPlayer init)
    useEffect(() => {
      if (!isActive) return;
      const subs: Array<{ remove(): void }> = [];
      try {
        // Instant: fires the moment the first frame is decoded and playing
        subs.push(player.addListener("playingChange", ({ isPlaying }) => {
          if (!mountedRef.current) return;
          if (isPlaying && !videoStartedRef.current) {
            videoStartedRef.current = true;
            setVideoStarted(true);
            setShowBuffering(false);
            if (bufferingTimer.current) { clearTimeout(bufferingTimer.current); bufferingTimer.current = null; }
          }
        }));

        // Buffering spinner: show after 400 ms delay to avoid flash on fast buffers
        subs.push(player.addListener("statusChange", ({ status }) => {
          if (!mountedRef.current) return;
          const isLoading = (status as string) === "loading";
          if (isLoading !== bufferingRef.current) {
            bufferingRef.current = isLoading;
            if (isLoading) {
              if (!bufferingTimer.current) {
                bufferingTimer.current = setTimeout(() => {
                  if (mountedRef.current) setShowBuffering(true);
                  bufferingTimer.current = null;
                }, 400);
              }
            } else {
              if (bufferingTimer.current) { clearTimeout(bufferingTimer.current); bufferingTimer.current = null; }
              setShowBuffering(false);
            }
          }
        }));

        // Natural end → auto-advance
        subs.push(player.addListener("playToEnd", () => {
          if (!mountedRef.current || endFired.current) return;
          endFired.current = true;
          try { onVideoEnd(); } catch {}
        }));

        // Progress bar + duration + fallback 97% auto-advance
        subs.push(player.addListener("timeUpdate", ({ currentTime }) => {
          if (!mountedRef.current) return;
          try {
            const dur = player.duration;
            if (dur > 0) {
              const frac = currentTime / dur;
              progressFill.value = frac;
              if (duration !== dur) { setDuration(dur); durationRef.current = dur; }
              // Fallback advance in case playToEnd fires late (network stall)
              if (!endFired.current && frac >= 0.97) {
                endFired.current = true;
                onVideoEnd();
              }
            }
          } catch {}
        }));
      } catch {}

      return () => subs.forEach(s => { try { s.remove(); } catch {} });
    }, [isActive, duration, onVideoEnd]);

    // ── Animated styles ───────────────────────────────────────────────────────
    const heartAnimStyle = useAnimatedStyle(() => ({
      transform: [{ scale: heartScale.value }],
    }));
    const dtAnimStyle = useAnimatedStyle(() => ({
      opacity: dtOpacity.value,
      transform: [{ scale: dtScale.value }],
    }));
    const progressBarStyle = useAnimatedStyle(() => ({
      width: `${progressFill.value * 100}%` as any,
    }));
    const progressThumbStyle = useAnimatedStyle(() => ({
      left: `${progressFill.value * 100}%` as any,
    }));
    const progressTrackOpacityStyle = useAnimatedStyle(() => ({
      opacity: progressVisible.value,
    }));

    // ── Gestures ───────────────────────────────────────────────────────────────
    function triggerLike() { onLike(item.id, item.liked); }
    function triggerPause() { setPaused((p) => !p); }

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(250)
      .maxDistance(12)
      .onEnd(() => {
        "worklet";
        if (!item.liked) runOnJS(triggerLike)();
        dtOpacity.value = withSequence(
          withTiming(1, { duration: 80 }),
          withDelay(450, withTiming(0, { duration: 220 })),
        );
        dtScale.value = withSequence(
          withSpring(1, { damping: 10, stiffness: 280 }),
          withDelay(450, withTiming(0.3, { duration: 220 })),
        );
      });

    const singleTap = Gesture.Tap()
      .maxDuration(300)
      .maxDistance(12)
      .onEnd(() => {
        "worklet";
        runOnJS(triggerPause)();
      });

    const composed = Gesture.Exclusive(doubleTap, singleTap);

    function handleLikeTap() {
      heartScale.value = withSequence(
        withTiming(0.62, { duration: 75 }),
        withSpring(1, { damping: 8, stiffness: 320 }),
      );
      onLike(item.id, item.liked);
    }

    const isOwn = currentUserId === item.author_id;
    const captionLong = item.content.length > 72;
    const isPlaying = isActive && !paused && videoStarted;

    return (
      <View style={{ width: screenW, height: itemH, backgroundColor: "#000" }}>

        {/* ── VIDEO SECTION ───────────────────────────────────────────────── */}
        <View style={{ width: screenW, height: videoH, overflow: "hidden", backgroundColor: "#000" }}>

          {/* Thumbnail poster */}
          {item.image_url && !videoStarted ? (
            <ExpoImage
              source={{ uri: item.image_url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              priority="high"
            />
          ) : null}

          {/* Native video */}
          {isNearActive && (
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
            />
          )}

          {/* Gesture layer */}
          <GestureDetector gesture={composed}>
            <View style={StyleSheet.absoluteFill} />
          </GestureDetector>

          {/* Double-tap heart burst */}
          <ReAnimated.View style={[styles.centerOverlay, dtAnimStyle, { pointerEvents: "none" }]}>
            <Ionicons name="heart" size={100} color="#FF2D55" />
          </ReAnimated.View>

          {/* Pause indicator */}
          {paused && isActive && (
            <View style={[styles.centerOverlay, { pointerEvents: "none" }]}>
              <View style={styles.pauseCircle}>
                <Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
              </View>
            </View>
          )}

          {/* Buffering spinner */}
          {showBuffering && isActive && !paused && (
            <View style={[styles.centerOverlay, { pointerEvents: "none" } as any]}>
              <ActivityIndicator size="large" color="rgba(255,255,255,0.8)" />
            </View>
          )}

          {/* Mute toggle (top-right corner, subtle) */}
          <TouchableOpacity
            onPress={onToggleMute}
            style={styles.muteBtn}
            hitSlop={12}
            activeOpacity={0.7}
          >
            <Ionicons
              name={globalMuted ? "volume-mute" : "volume-high"}
              size={17}
              color="rgba(255,255,255,0.85)"
            />
          </TouchableOpacity>

          {/* Progress bar — hidden by default, tap anywhere on it to reveal,
              drag/swipe left-right to seek */}
          <View
            style={styles.progressTouchArea}
            onLayout={(e) => { progressTrackWidth.current = e.nativeEvent.layout.width; }}
            {...seekPanResponder.panHandlers}
          >
            <ReAnimated.View style={[styles.progressTrack, progressTrackOpacityStyle]}>
              <ReAnimated.View style={[styles.progressFill, progressBarStyle]} />
              <ReAnimated.View style={[styles.progressThumb, progressThumbStyle]} />
            </ReAnimated.View>
          </View>
          {duration > 0 && (
            <ReAnimated.Text style={[styles.durationLabel, progressTrackOpacityStyle]}>
              {fmtDur(duration)}
            </ReAnimated.Text>
          )}
        </View>

        {/* ── CAPTION STRIP — 1 line, tap to expand ────────────────────────── */}
        <View style={styles.captionStrip}>
          {item.content ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => captionLong && setCaptionExpanded((e) => !e)}
              style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" }}
            >
              <RichText style={styles.infoCaption} numberOfLines={captionExpanded ? undefined : 1}>
                {item.content}
              </RichText>
              {captionLong && !captionExpanded && (
                <Text style={styles.infoCaptionMore}> more</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.infoAudioRow}>
              <Ionicons name="musical-notes" size={11} color="rgba(255,255,255,0.45)" />
              <Text style={styles.infoAudioText} numberOfLines={1}>
                {item.audio_name ?? "Original audio"}
              </Text>
            </View>
          )}
        </View>

        {/* ── BOTTOM ACTION BAR ─────────────────────────────────────────────── */}
        <View style={styles.bottomBar}>

          {/* Left: avatar · @handle (stacked) · Follow/Following below */}
          <View style={styles.barLeft}>
            <TouchableOpacity
              onPress={() => router.push(`/@${item.profile.handle}` as any)}
              activeOpacity={0.85}
            >
              <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={34} userId={item.author_id} />
            </TouchableOpacity>
            <View style={{ flex: 1, minWidth: 0 }}>
              <TouchableOpacity
                onPress={() => router.push(`/@${item.profile.handle}` as any)}
                activeOpacity={0.85}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <UserName
                    userId={item.author_id}
                    name={`@${item.profile.handle}`}
                    style={styles.barHandle}
                    numberOfLines={1}
                    suppressStar
                  />
                  <VerifiedBadge
                    isVerified={item.profile.is_verified}
                    isOrganizationVerified={item.profile.is_organization_verified}
                    size={12}
                  />
                </View>
              </TouchableOpacity>
              {!isOwn && (
                <TouchableOpacity
                  onPress={() => !item.following && onFollow(item.author_id)}
                  style={[styles.barFollowBtn, item.following && styles.barFollowBtnActive]}
                  activeOpacity={item.following ? 1 : 0.8}
                >
                  <Text style={styles.barFollowBtnText}>
                    {item.following ? "Following" : "+ Follow"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Right: like · comment · bookmark · share — size 24, all solid, top-aligned */}
          <View style={styles.barActions}>
            {/* Like */}
            <ReAnimated.View style={heartAnimStyle}>
              <TouchableOpacity onPress={handleLikeTap} activeOpacity={0.7} style={styles.barAction}>
                <Ionicons name="heart" size={24} color={item.liked ? "#FF2D55" : "#fff"} />
                <Text style={styles.barActionLabel}>{fmt(item.likeCount)}</Text>
              </TouchableOpacity>
            </ReAnimated.View>
            {/* Comment */}
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/video/[id]", params: { id: item.id } })}
              activeOpacity={0.7}
              style={styles.barAction}
            >
              <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
              <Text style={styles.barActionLabel}>{fmt(item.replyCount)}</Text>
            </TouchableOpacity>
            {/* Bookmark */}
            <TouchableOpacity
              onPress={() => onBookmark(item.id, item.bookmarked)}
              activeOpacity={0.7}
              style={styles.barAction}
            >
              <Ionicons name="bookmark" size={24} color={item.bookmarked ? "#FFD60A" : "#fff"} />
              <Text style={styles.barActionLabel}> </Text>
            </TouchableOpacity>
            {/* Share */}
            <TouchableOpacity onPress={() => onMore(item)} activeOpacity={0.7} style={styles.barAction}>
              <Ionicons name="paper-plane" size={24} color="#fff" />
              <Text style={styles.barActionLabel}> </Text>
            </TouchableOpacity>
          </View>
        </View>

      </View>
    );
  },
  (prev, next) =>
    prev.isActive === next.isActive &&
    prev.isNearActive === next.isNearActive &&
    prev.screenW === next.screenW &&
    prev.itemH === next.itemH &&
    prev.videoH === next.videoH &&
    prev.globalMuted === next.globalMuted &&
    prev.item.id === next.item.id &&
    prev.item.liked === next.item.liked &&
    prev.item.bookmarked === next.item.bookmarked &&
    prev.item.likeCount === next.item.likeCount &&
    prev.item.replyCount === next.item.replyCount &&
    prev.item.following === next.item.following &&
    prev.item.view_count === next.item.view_count,
);

// ─── VideoMoreSheet ───────────────────────────────────────────────────────────
// TikTok-style "Send to / More actions" bottom sheet.
// • No X button — swipe down to dismiss only
// • No author details
// • No cancel button
// • Horizontal scroll rows with small gray icons
// • Light theme = app cream (#F5F0E8)

type MoreSheetProps = {
  visible: boolean;
  item: VideoPost | null;
  onClose: () => void;
  onNotInterested: (item: VideoPost) => void;
};

function VideoMoreSheet({ visible, item, onClose, onNotInterested }: MoreSheetProps) {
  const { isDark } = useTheme();
  const translateY = useRef(new Animated.Value(0)).current;

  // Reset position when sheet opens
  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 6 && Math.abs(gs.dx) < Math.abs(gs.dy),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 72 || gs.vy > 0.65) {
          Animated.timing(translateY, { toValue: 520, duration: 190, useNativeDriver: true }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 220 }).start();
        }
      },
    })
  ).current;

  if (!item) return null;
  const shareItem = item;

  // ── theme tokens ──────────────────────────────────────────────────────────
  const sheetBg   = isDark ? "#1C1C1E"  : "#F5F0E8";
  const iconBg    = isDark ? "#2A2A2D"  : "#D8D0C4";
  const iconColor = isDark ? "#8A8A8E"  : "#2D2520";
  const labelClr  = isDark ? "#8A8A8E"  : "#4A4440";
  const handleClr = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.18)";
  const sepClr    = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";

  const videoUrl = `https://afuchat.com/video/${item.id}`;

  async function doNativeShare() {
    onClose();
    setTimeout(() => {
      Share.share({
        message: `${shareItem.profile.display_name} on AfuChat: ${videoUrl}`,
        url: videoUrl,
        title: `${shareItem.profile.display_name} on AfuChat`,
      }).catch(() => {});
    }, 280);
  }

  async function doCopy() {
    Clipboard.setStringAsync(videoUrl).catch(() => {});
    onClose();
  }

  async function openUrl(url: string) {
    onClose();
    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    if (canOpen) Linking.openURL(url).catch(() => {});
    else doNativeShare();
  }

  // Row 1: Share platforms (horizontal scroll)
  const SHARE_ROW = [
    { id: "repost",    label: "Repost",     icon: "repeat",                 onPress: doNativeShare },
    { id: "copy",      label: "Copy link",  icon: "link",                   onPress: doCopy },
    { id: "whatsapp",  label: "WhatsApp",   icon: "logo-whatsapp",                  onPress: () => openUrl(`https://wa.me/?text=${encodeURIComponent(videoUrl)}`) },
    { id: "telegram",  label: "Telegram",   icon: "paper-plane",            onPress: () => openUrl(`https://t.me/share/url?url=${encodeURIComponent(videoUrl)}`) },
    { id: "sms",       label: "SMS",        icon: "chatbubble",             onPress: () => openUrl(`sms:?body=${encodeURIComponent(videoUrl)}`) },
    { id: "more",      label: "More",       icon: "ellipsis-horizontal-circle", onPress: doNativeShare },
  ] as const;

  // Row 2: Extra actions
  const ACTION_ROW = [
    { id: "notinterested", label: "Not interested", icon: "heart-dislike", onPress: () => { onNotInterested(item); onClose(); } },
    { id: "report",        label: "Report",         icon: "flag",          onPress: onClose },
    { id: "download",      label: "Save",           icon: "download",      onPress: onClose },
    { id: "story",         label: "Add to Story",   icon: "add-circle",    onPress: onClose },
    { id: "cast",          label: "Cast",           icon: "tv",            onPress: onClose },
  ] as const;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Tappable backdrop */}
      <TouchableOpacity
        style={msStyles.backdrop}
        activeOpacity={1}
        onPress={() => {
          Animated.timing(translateY, { toValue: 520, duration: 190, useNativeDriver: true }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        }}
      />

      {/* Sheet */}
      <Animated.View
        style={[msStyles.sheet, { backgroundColor: sheetBg, transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        {/* Drag handle */}
        <View style={[msStyles.handle, { backgroundColor: handleClr }]} />

        {/* Row 1 — Share platforms */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={msStyles.rowContent}
          scrollEventThrottle={16}
        >
          {SHARE_ROW.map((a) => (
            <TouchableOpacity key={a.id} style={msStyles.cell} onPress={a.onPress} activeOpacity={0.65}>
              <View style={[msStyles.iconCircle, { backgroundColor: iconBg }]}>
                <Ionicons name={a.icon as any} size={19} color={iconColor} />
              </View>
              <Text style={[msStyles.cellLabel, { color: labelClr }]} numberOfLines={1}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Thin divider */}
        <View style={[msStyles.sep, { backgroundColor: sepClr }]} />

        {/* Row 2 — Actions */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={msStyles.rowContent}
          scrollEventThrottle={16}
        >
          {ACTION_ROW.map((a) => (
            <TouchableOpacity key={a.id} style={msStyles.cell} onPress={a.onPress} activeOpacity={0.65}>
              <View style={[msStyles.iconCircle, { backgroundColor: iconBg }]}>
                <Ionicons name={a.icon as any} size={19} color={iconColor} />
              </View>
              <Text style={[msStyles.cellLabel, { color: labelClr }]} numberOfLines={1}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const msStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    overflow: "hidden",
  },
  handle: {
    width: 34,
    height: 3.5,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 9,
    marginBottom: 12,
  },
  rowContent: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexDirection: "row",
    gap: 4,
  },
  cell: {
    width: 66,
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  cellLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  sep: {
    height: 0.5,
    marginHorizontal: 14,
    marginVertical: 6,
  },
});

// ─── VideoFeed ────────────────────────────────────────────────────────────────

type Props = { tabBarHeight?: number };

export default function VideoFeed({ tabBarHeight = 52 }: Props) {
  const { user, profile } = useAuth();
  const { accent } = useAppAccent();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();

  const ITEM_H  = SCREEN_H - tabBarHeight;
  const VIDEO_H = ITEM_H - BOTTOM_BAR_H - CAPTION_H;

  const [tab, setTab] = useState<FeedTab>("for_you");
  const [posts, setPosts] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [globalMuted, setGlobalMuted] = useState(false);

  const flatListRef       = useRef<FlatList>(null);
  const cursorRef         = useRef<string | null>(null);
  const loadingMoreRef    = useRef(false);
  const hasMoreRef        = useRef(true);
  const postsLenRef       = useRef(0);
  const activeIndexRef    = useRef(0);
  const tabRef            = useRef<FeedTab>("for_you");
  const remainderRef      = useRef<VideoPost[]>([]);
  const loopPoolRef       = useRef<VideoPost[]>([]);   // full For You pool for endless cycling
  const followPoolRef     = useRef<VideoPost[]>([]);   // first page of Following for loop-back
  // Map of index → player instance. Populated by each VideoItem via onPlayerReady.
  // Allows onViewableItemsChanged to pause/play immediately — no React re-render needed.
  const playerMapRef      = useRef<Map<number, ReturnType<typeof useVideoPlayer>>>(new Map());

  const handlePlayerReady = useCallback(
    (idx: number, p: ReturnType<typeof useVideoPlayer> | null) => {
      if (p) playerMapRef.current.set(idx, p);
      else playerMapRef.current.delete(idx);
    },
    [],
  );

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { postsLenRef.current = posts.length; }, [posts.length]);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  // Pause all active video players when a call takes over audio.
  useEffect(() => {
    return subscribeCallAudio((event) => {
      if (event === "takeover") {
        playerMapRef.current.forEach((player) => {
          try { player.pause(); } catch {}
        });
      }
    });
  }, []);

  // ── Data fetch + algorithm ────────────────────────────────────────────────

  const fetchVideos = useCallback(
    async (cursor?: string | null) => {
      const currentTab = tabRef.current;

      if (cursor) {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        setLoading(true);
        cursorRef.current = null;
      }

      try {
        // ── For You: wide pool → score → diversify ──────────────────────────
        if (currentTab === "for_you" && !cursor) {
          const SELECT_COLS = `id, author_id, content, video_url, image_url, audio_name, created_at, view_count,
                     profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified)`;

          // 6-month window first — broad enough for most platforms
          const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
          let { data: raw } = await supabase
            .from("posts")
            .select(SELECT_COLS)
            .or("post_type.eq.video,post_type.is.null")
            .or("visibility.eq.public,visibility.is.null")
            .not("video_url", "is", null)
            .gte("created_at", sixMonthsAgo)
            .order("created_at", { ascending: false })
            .limit(FOR_YOU_POOL);

          // Fallback: if too few videos in window, open the full catalogue
          if (!raw || raw.length < 5) {
            const { data: fallback } = await supabase
              .from("posts")
              .select(SELECT_COLS)
              .or("post_type.eq.video,post_type.is.null")
              .or("visibility.eq.public,visibility.is.null")
              .not("video_url", "is", null)
              .order("created_at", { ascending: false })
              .limit(FOR_YOU_POOL);
            raw = fallback;
          }

          if (!raw || raw.length === 0) {
            setPosts([]);
            setLoading(false);
            return;
          }

          const postIds = raw.map((p: any) => p.id as string);
          const authorIds = [...new Set(raw.map((p: any) => p.author_id as string))];

          const [
            { data: likesData },
            { data: repliesData },
            { data: viewsData },
            { data: myLikes },
            { data: myBookmarks },
            { data: myFollows },
          ] = await Promise.all([
            supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
            supabase.from("post_replies").select("post_id").in("post_id", postIds),
            supabase.from("post_views").select("post_id").in("post_id", postIds),
            user
              ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id)
              : Promise.resolve({ data: [] as any[] }),
            user
              ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id)
              : Promise.resolve({ data: [] as any[] }),
            user
              ? supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", authorIds)
              : Promise.resolve({ data: [] as any[] }),
          ]);

          const likeMap: Record<string, number> = {};
          for (const l of (likesData || [])) likeMap[(l as any).post_id] = (likeMap[(l as any).post_id] || 0) + 1;
          const replyMap: Record<string, number> = {};
          for (const r of (repliesData || [])) replyMap[(r as any).post_id] = (replyMap[(r as any).post_id] || 0) + 1;
          const viewMap: Record<string, number> = {};
          for (const v of (viewsData || [])) viewMap[(v as any).post_id] = (viewMap[(v as any).post_id] || 0) + 1;
          const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id as string));
          const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id as string));
          const followedSet = new Set((myFollows || []).map((f: any) => f.following_id as string));

          const [learnedWeights, seenVideoMap, notInterestedSignals] = await Promise.all([
            getLearnedInterestBoosts(),
            getSeenVideoMap(),
            getNotInterestedSignals(),
          ]);

          const authorPageCount: Record<string, number> = {};
          for (const p of raw) authorPageCount[(p as any).author_id] = (authorPageCount[(p as any).author_id] || 0) + 1;

          type ScoredVideo = VideoPost & { score: number };

          const scored: ScoredVideo[] = raw.map((p: any) => {
            const lc = likeMap[p.id] || 0;
            const rc = replyMap[p.id] || 0;
            const vc = viewMap[p.id] || (p.view_count ?? 0);
            const interestMatches = matchInterestsWeighted(p.content || "", [], learnedWeights);
            const seenAt = seenVideoMap.get(p.id);
            const hashtags = extractHashtags(p.content || "");
            const engagementRate = lc / Math.max(vc, 1);
            const completionProxy = Math.min(lc / Math.max(vc, 0.5), 1);
            const postTopics = detectTopicsInContent(p.content || "");
            const notInterestedTopicCount = postTopics.filter((t) => notInterestedSignals.topics.has(t)).length;
            const signals: FeedSignals = {
              likeCount: lc,
              replyCount: rc,
              viewCount: vc,
              createdAt: p.created_at,
              interestMatches,
              isFollowing: followedSet.has(p.author_id),
              authorInteractionCount: myLikeSet.has(p.id) ? 3 : 0,
              isVerified: !!p.profiles?.is_verified,
              isOrgVerified: !!p.profiles?.is_organization_verified,
              hasImages: !!p.image_url,
              sameCountry: false,
              authorPostCountInFeed: authorPageCount[p.author_id] || 1,
              contentLength: (p.content || "").length,
              postType: "video",
              seenAt,
              engagementRate,
              hashtagCount: hashtags.length,
              completionProxy,
              notInterestedAuthorId: notInterestedSignals.authorIds.has(p.author_id),
              notInterestedTopicCount,
            };
            return {
              id: p.id,
              author_id: p.author_id,
              content: p.content || "",
              video_url: p.video_url,
              image_url: p.image_url || null,
              audio_name: p.audio_name || null,
              created_at: p.created_at,
              view_count: vc,
              profile: {
                display_name: p.profiles?.display_name || "User",
                handle: p.profiles?.handle || "user",
                avatar_url: p.profiles?.avatar_url || null,
                is_verified: !!p.profiles?.is_verified,
                is_organization_verified: !!p.profiles?.is_organization_verified,
              },
              liked: myLikeSet.has(p.id),
              bookmarked: myBookmarkSet.has(p.id),
              likeCount: lc,
              replyCount: rc,
              following: followedSet.has(p.author_id),
              score: computeFeedScore(signals),
            };
          });

          const diversified = diversifyFeed(scored);
          const page = diversified.slice(0, PAGE_SIZE * 3);

          loopPoolRef.current = diversified;                     // store full pool for endless looping
          setHasMore(true);                                      // always has more (we loop)
          hasMoreRef.current = true;
          remainderRef.current = diversified.slice(PAGE_SIZE * 3);
          cursorRef.current = page[page.length - 1]?.created_at ?? null;
          setPosts(page);
          setLoading(false);
          return;
        }

        // ── Load-more from remainder (For You) — loops forever ────────────
        if (currentTab === "for_you" && cursor) {
          const remainder = remainderRef.current;
          if (remainder.length > 0) {
            const next = remainder.slice(0, PAGE_SIZE);
            remainderRef.current = remainder.slice(PAGE_SIZE);
            setPosts((prev) => {
              const seen = new Set(prev.map((p) => p.id));
              return [...prev, ...next.filter((p) => !seen.has(p.id))];
            });
          } else if (loopPoolRef.current.length > 0) {
            // Pool exhausted — reshuffle and loop back seamlessly
            const reshuffled = shuffleArr([...loopPoolRef.current]);
            const next = reshuffled.slice(0, PAGE_SIZE);
            remainderRef.current = reshuffled.slice(PAGE_SIZE);
            setPosts((prev) => [...prev, ...next]);
          }
          // Always keep hasMore = true so the feed never stops
          setHasMore(true);
          hasMoreRef.current = true;
          loadingMoreRef.current = false;
          setLoadingMore(false);
          return;
        }

        // ── Following tab ────────────────────────────────────────────────────
        if (currentTab === "following") {
          if (!user) { setPosts([]); setLoading(false); return; }

          const { data: followData } = await supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", user.id);
          const followingIds = (followData || []).map((f: any) => f.following_id as string);

          if (followingIds.length === 0) { setPosts([]); setLoading(false); return; }

          let query = supabase
            .from("posts")
            .select(`id, author_id, content, video_url, image_url, audio_name, created_at, view_count,
                     profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified)`)
            .eq("post_type", "video")
            .in("author_id", followingIds)
            .or("visibility.eq.public,visibility.eq.followers,visibility.is.null")
            .not("video_url", "is", null)
            .order("created_at", { ascending: false })
            .limit(PAGE_SIZE);

          const realCursor = cursor === "loop" ? null : cursor;
          if (realCursor) query = (query as any).lt("created_at", realCursor);

          const { data } = await query;

          if (!data || data.length === 0) {
            if (cursor && followPoolRef.current.length > 0) {
              // Hit the end — loop back seamlessly using the first page
              cursorRef.current = null;
              const loop = shuffleArr([...followPoolRef.current]);
              setPosts((prev) => [...prev, ...loop]);
              setHasMore(true); hasMoreRef.current = true;
            } else {
              if (!cursor) setPosts([]);
              setHasMore(false); hasMoreRef.current = false;
            }
            loadingMoreRef.current = false; setLoadingMore(false); setLoading(false);
            return;
          }

          const postIds = data.map((p: any) => p.id as string);
          const authorIds = [...new Set(data.map((p: any) => p.author_id as string))];

          const [
            { data: likesData },
            { data: repliesData },
            { data: myLikes },
            { data: myBookmarks },
            { data: myFollows },
          ] = await Promise.all([
            supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
            supabase.from("post_replies").select("post_id").in("post_id", postIds),
            supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id),
            supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id),
            supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", authorIds),
          ]);

          const likeMap: Record<string, number> = {};
          for (const l of (likesData || [])) likeMap[(l as any).post_id] = (likeMap[(l as any).post_id] || 0) + 1;
          const replyMap: Record<string, number> = {};
          for (const r of (repliesData || [])) replyMap[(r as any).post_id] = (replyMap[(r as any).post_id] || 0) + 1;
          const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id as string));
          const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id as string));
          const followedSet = new Set((myFollows || []).map((f: any) => f.following_id as string));

          const enriched: VideoPost[] = data.map((p: any) => ({
            id: p.id, author_id: p.author_id, content: p.content || "",
            video_url: p.video_url, image_url: p.image_url || null, audio_name: p.audio_name || null,
            created_at: p.created_at, view_count: p.view_count || 0,
            profile: {
              display_name: p.profiles?.display_name || "User",
              handle: p.profiles?.handle || "user",
              avatar_url: p.profiles?.avatar_url || null,
              is_verified: !!p.profiles?.is_verified,
              is_organization_verified: !!p.profiles?.is_organization_verified,
            },
            liked: myLikeSet.has(p.id), bookmarked: myBookmarkSet.has(p.id),
            likeCount: likeMap[p.id] || 0, replyCount: replyMap[p.id] || 0,
            following: followedSet.has(p.author_id),
          }));

          const more = data.length === PAGE_SIZE;
          cursorRef.current = data[data.length - 1]?.created_at ?? null;
          // Always hasMore=true so we can loop; actual end is handled above
          setHasMore(true); hasMoreRef.current = true;

          if (cursor) {
            setPosts((prev) => { const s = new Set(prev.map((p) => p.id)); return [...prev, ...enriched.filter((p) => !s.has(p.id))]; });
          } else {
            followPoolRef.current = enriched;  // store first page for endless loop-back
            setPosts(enriched);
          }

          setLoading(false); loadingMoreRef.current = false; setLoadingMore(false);
        }
      } catch (_) {
        setLoading(false); loadingMoreRef.current = false; setLoadingMore(false);
      }
    },
    [user],
  );

  useEffect(() => {
    remainderRef.current  = [];
    loopPoolRef.current   = [];
    followPoolRef.current = [];
    cursorRef.current     = null;
    setPosts([]);
    setActiveIndex(0);
    activeIndexRef.current = 0;
    fetchVideos();
  }, [tab, fetchVideos]);

  // ── Auto-advance ──────────────────────────────────────────────────────────

  const handleVideoEnd = useCallback(() => {
    const nextIdx = activeIndexRef.current + 1;
    if (nextIdx < postsLenRef.current) {
      flatListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
      activeIndexRef.current = nextIdx;
      setActiveIndex(nextIdx);
    } else {
      // At end: loop back to 0
      flatListRef.current?.scrollToIndex({ index: 0, animated: true });
      activeIndexRef.current = 0;
      setActiveIndex(0);
    }
  }, []);

  // ── Interactions ──────────────────────────────────────────────────────────

  const handleLike = useCallback(
    async (postId: string, currentlyLiked: boolean) => {
      if (!user) { router.push("/(auth)/login" as any); return; }
      const post = posts.find((p) => p.id === postId);
      if (!post) return;

      if (currentlyLiked) {
        setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p));
        const { error } = await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
        if (error) setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p));
      } else {
        setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p));
        if (post.author_id !== user.id) {
          notifyPostLike({ postAuthorId: post.author_id, likerName: profile?.display_name || "Someone", likerUserId: user.id, postId });
        }
        const { error } = await supabase.from("post_acknowledgments").upsert(
          { post_id: postId, user_id: user.id },
          { onConflict: "post_id,user_id", ignoreDuplicates: true }
        );
        if (error) setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p));
      }
    },
    [user, profile, posts],
  );

  const handleFollow = useCallback(
    async (authorId: string) => {
      if (!user) { router.push("/(auth)/login" as any); return; }
      setPosts((prev) => prev.map((p) => (p.author_id === authorId ? { ...p, following: true } : p)));
      await supabase.from("follows").insert({ follower_id: user.id, following_id: authorId });
      try { notifyNewFollow({ targetUserId: authorId, followerName: profile?.display_name || "Someone", followerUserId: user.id }); } catch (_) {}
      try { const { rewardXp } = await import("../lib/rewardXp"); rewardXp("follow_user"); } catch (_) {}
    },
    [user, profile],
  );

  const recordedViews = useRef(new Set<string>());
  const handleView = useCallback(
    async (postId: string) => {
      if (!user || recordedViews.current.has(postId)) return;
      recordedViews.current.add(postId);
      supabase.from("post_views").upsert({ post_id: postId, viewer_id: user.id }, { onConflict: "post_id,viewer_id" }).then(null, () => {});
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, view_count: p.view_count + 1 } : p)));
    },
    [user],
  );

  const handleBookmark = useCallback(
    async (postId: string, currentlyBookmarked: boolean) => {
      if (!user) { router.push("/(auth)/login" as any); return; }
      if (currentlyBookmarked) {
        await supabase.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", user.id);
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, bookmarked: false } : p)));
      } else {
        await supabase.from("post_bookmarks").upsert({ post_id: postId, user_id: user.id }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, bookmarked: true } : p)));
      }
    },
    [user],
  );

  const [moreItem, setMoreItem] = useState<VideoPost | null>(null);

  const handleMore = useCallback((item: VideoPost) => setMoreItem(item), []);

  const handleNotInterested = useCallback(async (item: VideoPost) => {
    setPosts((prev) => prev.filter((p) => p.id !== item.id));
    const marked = await markNotInterested(item.author_id, item.content || "");
    showActionToast(
      "We\u2019ll show less of this",
      "Undo",
      async () => {
        await undoNotInterested(marked.authorId, marked.topics);
        setPosts((prev) => (prev.some((p) => p.id === item.id) ? prev : [item, ...prev]));
      },
      { type: "info", icon: "eye-off" },
    );
  }, []);

  const handleToggleMute = useCallback(() => setGlobalMuted((m) => !m), []);

  // ── FlatList config ───────────────────────────────────────────────────────

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        const idx = viewableItems[0].index!;
        const prevIdx = activeIndexRef.current;
        // Immediately stop the old video and start the new one via the player
        // map — this fires synchronously before React has re-rendered, so
        // there is no perceivable delay between the scroll settling and the
        // correct video playing/stopping.
        if (prevIdx !== idx) {
          try { playerMapRef.current.get(prevIdx)?.pause(); } catch {}
          try { playerMapRef.current.get(idx)?.play(); } catch {}
        }
        activeIndexRef.current = idx;
        setActiveIndex(idx);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: ITEM_H, offset: ITEM_H * index, index }),
    [ITEM_H],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: VideoPost; index: number }) => (
      <VideoItem
        item={item}
        index={index}
        isActive={index === activeIndexRef.current}
        isNearActive={Math.abs(index - activeIndexRef.current) <= 1}
        screenW={SCREEN_W}
        itemH={ITEM_H}
        videoH={VIDEO_H}
        globalMuted={globalMuted}
        onLike={handleLike}
        onFollow={handleFollow}
        onView={handleView}
        onBookmark={handleBookmark}
        onMore={handleMore}
        onToggleMute={handleToggleMute}
        onVideoEnd={handleVideoEnd}
        onPlayerReady={handlePlayerReady}
        currentUserId={user?.id}
      />
    ),
    [SCREEN_W, ITEM_H, VIDEO_H, globalMuted, handleLike, handleFollow, handleView, handleBookmark, handleMore, handleToggleMute, handleVideoEnd, handlePlayerReady, user?.id],
  );

  const onEndReached = useCallback(() => {
    if (!loadingMoreRef.current && hasMoreRef.current) {
      fetchVideos(cursorRef.current ?? "loop");
    }
  }, [fetchVideos]);

  // ── Header tab positions ──────────────────────────────────────────────────

  const TAB_TOP = insets.top + 6;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <VideoFeedSkeleton />;

  if (posts.length === 0) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: "#000" }]}>
        <TikTokHeader tab={tab} onTabChange={setTab} top={TAB_TOP} />
        <View style={styles.emptyIcon}>
          <Ionicons name="videocam" size={44} color="rgba(255,255,255,0.25)" />
        </View>
        <Text style={styles.emptyTitle}>
          {tab === "following" && !user
            ? "Sign in to see videos from\npeople you follow"
            : tab === "following"
            ? "No videos from people you follow yet"
            : "No videos yet"}
        </Text>
        <Text style={styles.emptySubtitle}>
          {tab === "following" && !user ? "" : "Be the first to post!"}
        </Text>
        {tab === "following" && !user && (
          <TouchableOpacity
            style={[styles.postBtn, { backgroundColor: accent }]}
            onPress={() => router.push("/(auth)/login" as any)}
          >
            <Text style={styles.postBtnText}>Sign In</Text>
          </TouchableOpacity>
        )}
        {tab === "for_you" && user && (
          <TouchableOpacity
            style={[styles.postBtn, { backgroundColor: accent }]}
            onPress={() => router.push("/moments/create-video" as any)}
          >
            <Text style={styles.postBtnText}>Post a Video</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        extraData={[activeIndex, globalMuted]}
        snapToInterval={ITEM_H}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={getItemLayout}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={false}
        onEndReached={onEndReached}
        onEndReachedThreshold={4}
        style={{ flex: 1, backgroundColor: "#000" }}
        contentContainerStyle={{ backgroundColor: "#000" }}
        ListFooterComponent={null}
      />

      {/* TikTok header overlaid on top */}
      <TikTokHeader tab={tab} onTabChange={setTab} top={TAB_TOP} />

      {/* TikTok-style more-options sheet */}
      <VideoMoreSheet
        visible={!!moreItem}
        item={moreItem}
        onClose={() => setMoreItem(null)}
        onNotInterested={handleNotInterested}
      />
    </View>
  );
}

// ─── TikTok-style header with animated sliding underline ──────────────────────

function TikTokHeader({
  tab,
  onTabChange,
  top,
}: {
  tab: FeedTab;
  onTabChange: (t: FeedTab) => void;
  top: number;
}) {
  const underlineX   = useRef(new Animated.Value(0)).current;
  const tabLayouts   = useRef<{ x: number; w: number }[]>([{ x: 0, w: 0 }, { x: 0, w: 0 }]);
  const nd = true;

  const TABS: { key: FeedTab; label: string }[] = [
    { key: "following", label: "Following" },
    { key: "for_you",   label: "For You"   },
  ];

  function slideToTab(t: FeedTab) {
    const idx = TABS.findIndex((tb) => tb.key === t);
    const layout = tabLayouts.current[idx];
    if (!layout) return;
    const target = layout.x + layout.w / 2 - 11; // centre the 22px underline bar
    Animated.spring(underlineX, {
      toValue: target,
      useNativeDriver: nd,
      damping: 22,
      stiffness: 280,
      mass: 0.8,
    }).start();
  }

  // Slide on mount and whenever tab changes
  useEffect(() => { slideToTab(tab); }, [tab]);

  return (
    <View style={[styles.header, { top } as any]}>
      {/* LIVE pill */}
      <TouchableOpacity style={styles.livePill} activeOpacity={0.8}>
        <Ionicons name="tv" size={13} color="#fff" />
        <Text style={styles.liveText}>LIVE</Text>
      </TouchableOpacity>

      {/* Tabs + animated underline */}
      <View style={styles.headerTabs}>
        {TABS.map((t, idx) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => { onTabChange(t.key); slideToTab(t.key); }}
            style={styles.headerTab}
            activeOpacity={0.85}
            onLayout={(e) => {
              tabLayouts.current[idx] = {
                x: e.nativeEvent.layout.x,
                w: e.nativeEvent.layout.width,
              };
              if (t.key === tab) slideToTab(tab);
            }}
          >
            <Text style={[styles.headerTabText, tab === t.key && styles.headerTabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Single sliding underline bar */}
        <Animated.View
          style={[
            styles.headerTabUnderline,
            {
              position: "absolute",
              bottom: 0,
              left: 0,
              transform: [{ translateX: underlineX }],
            },
          ]}
        />
      </View>

      {/* Search */}
      <TouchableOpacity
        onPress={() => router.push("/search" as any)}
        style={styles.searchBtn}
        hitSlop={8}
        activeOpacity={0.8}
      >
        <Ionicons name="search" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Header ──
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    zIndex: 30,
    pointerEvents: "box-none",
  } as any,
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1.2,
    borderColor: "rgba(255,255,255,0.55)",
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  liveText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    ...Platform.select({
      web: { textShadow: "0 1px 3px rgba(0,0,0,0.8)" } as any,
      default: { textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
    }),
  },
  headerTabs: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
  headerTab: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  headerTabText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    ...Platform.select({
      web: { textShadow: "0 1px 4px rgba(0,0,0,0.9)" } as any,
      default: { textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
    }),
  },
  headerTabTextActive: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  headerTabUnderline: {
    marginTop: 3,
    width: 22,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "#fff",
  },
  searchBtn: {
    padding: 4,
  },

  // ── Layout ──
  center: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    pointerEvents: "none",
  } as any,

  // ── Music disc (kept for MusicDisc component) ──
  musicDisc: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#222",
    borderWidth: 3,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
  },
  musicDiscInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#666",
  },

  // ── Bottom action bar (WeChat / Douyin style) ──
  bottomBar: {
    height: BOTTOM_BAR_H,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#000",
    gap: 10,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  barLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  barHandle: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  barFollowBtn: {
    alignSelf: "flex-start",
    marginTop: 3,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
  barFollowBtnActive: {
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  barFollowBtnText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  barActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  barAction: {
    alignItems: "center",
    gap: 2,
  },
  barActionLabel: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    ...Platform.select({
      web: { textShadow: "0 1px 3px rgba(0,0,0,0.7)" } as any,
      default: { textShadowColor: "rgba(0,0,0,0.7)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
    }),
  },

  // ── Mute button ──
  muteBtn: {
    position: "absolute",
    top: 10,
    right: 12,
    padding: 6,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.25)",
  },

  // ── Progress bar ──
  // Transparent touch area — full width, tall enough to be easily tapped/dragged
  progressTouchArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 28,            // tall touch target; visual bar sits at the bottom
    justifyContent: "flex-end",
  },
  progressTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "visible",
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  progressThumb: {
    position: "absolute",
    top: -5,           // centre the 14px thumb on the 4px track
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#fff",
    marginLeft: -7,    // centre on the fill edge
    ...Platform.select({
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 4 },
      web: { boxShadow: "0 1px 4px rgba(0,0,0,0.4)" } as any,
    }),
  },
  durationLabel: {
    position: "absolute",
    bottom: 32,        // just above the progress track
    right: 10,
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    ...Platform.select({
      web: { textShadow: "0 1px 3px rgba(0,0,0,0.8)" } as any,
      default: { textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
    }),
  },

  // ── Pause circle ──
  pauseCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Bottom gradient ──
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    pointerEvents: "none",
  } as any,

  // ── Caption strip — between video and action bar ──
  captionStrip: {
    height: CAPTION_H,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#000",
    justifyContent: "center",
    borderTopWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  infoCaption: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  infoCaptionMore: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  infoAudioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  infoAudioText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },

  // ── Empty state ──
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    marginTop: 100,
  },
  emptyTitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  emptySubtitle: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  postBtn: {
    marginTop: 24,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 99,
  },
  postBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
