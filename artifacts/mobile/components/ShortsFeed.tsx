/**
 * ShortsFeed — vertical short-video feed (TikTok / YouTube Shorts style).
 *
 *   • Two layouts:
 *       - "fullscreen" (mobile): edge-to-edge video, action rail overlaid on
 *         the right, author + caption + audio overlaid on the bottom-left,
 *         with the host (`discover.tsx`) hiding the bottom tab bar so the
 *         experience is fully immersive like TikTok.
 *       - "card": a 9:16 card centered in the column with the action rail
 *         living next to the player, not on top of it.
 *   • Real play/pause: tap the player to toggle.
 *   • Mute toggle, like, comment, bookmark, share, in-rail follow CTA.
 *   • Native playback uses expo-video.
 *   • The active card and its two neighbours are mounted so swiping feels
 *     instant — neighbours preload metadata silently in the background.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import { ShortsFeedSkeleton } from "@/components/ui/Skeleton";
import { VideoView, useVideoPlayer } from "expo-video";
import { router, useFocusEffect } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Avatar } from "@/components/ui/Avatar";
import UserName from "@/components/ui/UserName";
import { useResolvedVideoSource } from "@/hooks/useResolvedVideoSource";
import { sharePost } from "@/lib/share";
import { RichText } from "@/components/ui/RichText";
import { getPreferredVideoHeight } from "@/lib/networkQuality";
import { cacheShortsTab, getCachedShortsTab } from "@/lib/offlineStore";
import { getCachedVideoUri, markVideoWatched, cacheVideo } from "@/lib/videoCache";
import { showToast } from "@/lib/toast";
import { subscribeCallAudio } from "@/lib/callAudioBus";

type ShortPost = {
  id: string;
  author_id: string;
  content: string;
  video_url: string;
  image_url: string | null;
  created_at: string;
  view_count: number;
  profile: { display_name: string; handle: string; avatar_url: string | null };
  liked: boolean;
  likeCount: number;
  replyCount: number;
  bookmarked: boolean;
  following: boolean;
  localUri?: string;
};

export type ShortsFilter = "for_you" | "following";
export type ShortsLayout = "fullscreen" | "card";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                          Native expo-av player                          */
/* ─────────────────────────────────────────────────────────────────────── */

function NativeShortsPlayer({
  src,
  poster,
  active,
  paused,
  preloadOnly,
  loop = true,
  onTogglePause,
  onDoubleTap,
  onEnded,
}: {
  src: string;
  poster?: string | null;
  active: boolean;
  paused: boolean;
  preloadOnly: boolean;
  loop?: boolean;
  onTogglePause: () => void;
  onDoubleTap?: () => void;
  onEnded?: () => void;
}) {
  const player = useVideoPlayer(src ? { uri: src } : null, (p) => {
    p.loop = loop;
    p.muted = false;
    if (active && !paused && !preloadOnly) p.play();
  });

  const touchRef = useRef<{ y: number; t: number } | null>(null);
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endFiredRef = useRef(false);

  // ── Progress bar ────────────────────────────────────────────────────
  const [progress, setProgress] = useState(0);
  const barOpacity = useRef(new Animated.Value(0)).current;
  const barVisibleRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barWidthRef = useRef(1); // set by onLayout; avoid /0
  const isDraggingRef = useRef(false);
  // track whether active was true on the PREVIOUS render (for restart logic)
  const prevActiveRef = useRef(active);

  function _showBar() {
    barVisibleRef.current = true;
    Animated.timing(barOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    _resetHideTimer();
  }
  function _hideBar() {
    barVisibleRef.current = false;
    Animated.timing(barOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
  }
  function _resetHideTimer() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (!isDraggingRef.current) {
      hideTimerRef.current = setTimeout(_hideBar, 3000);
    }
  }

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Pause / resume when a call takes over the mic/speaker.
  const pausedByCallRef = useRef(false);
  React.useEffect(() => {
    return subscribeCallAudio((event) => {
      if (event === "takeover") {
        if (active && !paused && !preloadOnly) {
          pausedByCallRef.current = true;
          try { player.pause(); } catch {}
        }
      } else if (event === "release") {
        if (pausedByCallRef.current) {
          pausedByCallRef.current = false;
          if (active && !preloadOnly) { try { player.play(); } catch {} }
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, preloadOnly]);

  // Sync loop setting
  React.useEffect(() => {
    try { player.loop = loop; } catch {}
  }, [loop]);

  // Play / pause control
  React.useEffect(() => {
    try {
      if (active && !paused && !preloadOnly) {
        player.muted = false;
        player.play();
      } else {
        player.pause();
      }
    } catch {}
  }, [active, paused, preloadOnly]);

  // Restart from beginning when card becomes active (scrolled back to)
  React.useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;
    if (active && !wasActive && !preloadOnly) {
      try { player.currentTime = 0; } catch {}
      setProgress(0);
      _hideBar();
    }
    if (!active) {
      // scrolled away — hide bar immediately
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      _hideBar();
    }
  }, [active, preloadOnly]);

  // Progress polling (updates bar fill while playing)
  React.useEffect(() => {
    if (!active || preloadOnly) return;
    const timer = setInterval(() => {
      if (isDraggingRef.current) return;
      try {
        const dur = player.duration;
        if (dur > 0) setProgress(player.currentTime / dur);
      } catch {}
    }, 200);
    return () => clearInterval(timer);
  }, [active, preloadOnly]);

  // End-of-video detection (auto-scroll mode)
  React.useEffect(() => {
    if (loop || !active || !onEnded) { endFiredRef.current = false; return; }
    endFiredRef.current = false;
    const timer = setInterval(() => {
      try {
        const dur = player.duration;
        if (dur > 0 && player.currentTime / dur >= 0.97 && !endFiredRef.current) {
          endFiredRef.current = true;
          onEnded();
        }
      } catch {}
    }, 250);
    return () => clearInterval(timer);
  }, [loop, active, onEnded]);

  return (
    <View
      style={StyleSheet.absoluteFill}
      onStartShouldSetResponder={() => !preloadOnly}
      onResponderTerminationRequest={() => true}
      onResponderGrant={(e) => {
        touchRef.current = { y: e.nativeEvent.pageY, t: Date.now() };
      }}
      onResponderRelease={(e) => {
        const start = touchRef.current;
        touchRef.current = null;
        if (!start) return;
        const dy = Math.abs(e.nativeEvent.pageY - start.y);
        const dt = Date.now() - start.t;
        if (dy < 12 && dt < 350) {
          const now = Date.now();
          if (onDoubleTap && now - lastTapRef.current < 300) {
            if (singleTapTimerRef.current) {
              clearTimeout(singleTapTimerRef.current);
              singleTapTimerRef.current = null;
            }
            lastTapRef.current = 0;
            onDoubleTap();
          } else {
            lastTapRef.current = now;
            singleTapTimerRef.current = setTimeout(() => {
              singleTapTimerRef.current = null;
              lastTapRef.current = 0;
              _showBar();       // reveal progress bar on tap
              onTogglePause();
            }, 300);
          }
        }
      }}
      onResponderTerminate={() => { touchRef.current = null; }}
    >
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />

      {/* Pause overlay */}
      {!preloadOnly && paused && (
        <View style={[styles.centerPlayBtn, { pointerEvents: "none" }]}>
          <View style={styles.centerPlayCircle}>
            <Ionicons name="play" size={36} color="#fff" />
          </View>
        </View>
      )}

      {/* ── Progress / seek bar ────────────────────────────────────── */}
      {!preloadOnly && (
        <Animated.View
          style={[styles.progressContainer, { opacity: barOpacity }]}
          onLayout={(e) => { barWidthRef.current = e.nativeEvent.layout.width || 1; }}
          // child responder — takes over when bar is visible so user can seek
          onStartShouldSetResponder={() => barVisibleRef.current}
          onMoveShouldSetResponder={() => barVisibleRef.current}
          onResponderGrant={(e) => {
            isDraggingRef.current = true;
            if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
            const p = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidthRef.current));
            setProgress(p);
          }}
          onResponderMove={(e) => {
            const p = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidthRef.current));
            setProgress(p);
          }}
          onResponderRelease={(e) => {
            const p = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidthRef.current));
            setProgress(p);
            isDraggingRef.current = false;
            try {
              const dur = player.duration;
              if (dur > 0) player.currentTime = p * dur;
            } catch {}
            _resetHideTimer();
          }}
          onResponderTerminate={() => {
            isDraggingRef.current = false;
            _resetHideTimer();
          }}
        >
          {/* Track */}
          <View style={styles.progressTrack}>
            {/* Filled portion */}
            <View style={[styles.progressFill, { width: `${(progress * 100).toFixed(2)}%` as any }]} />
          </View>
          {/* Thumb dot */}
          <View
            style={[
              styles.progressThumb,
              { left: `${(progress * 100).toFixed(2)}%` as any },
            ]}
          />
        </Animated.View>
      )}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                          Single Short card                              */
/* ─────────────────────────────────────────────────────────────────────── */

const ShortCard = React.memo(function ShortCard({
  item,
  active,
  preloadOnly,
  layout,
  cardWidth,
  cardHeight,
  bottomInset,
  autoScroll,
  onToggleAutoScroll,
  onAutoScrollEnd,
  onLike,
  onBookmark,
  onFollow,
  currentUserId,
}: {
  item: ShortPost;
  active: boolean;
  preloadOnly: boolean;
  layout: ShortsLayout;
  cardWidth: number;
  cardHeight: number;
  bottomInset: number;
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  onAutoScrollEnd: () => void;
  onLike: (postId: string, liked: boolean) => void;
  onBookmark: (postId: string, bookmarked: boolean) => void;
  onFollow: (authorId: string) => void;
  currentUserId?: string;
}) {
  const { colors } = useTheme();
  const online = useOnlineStatus();
  const [paused, setPaused] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const doubleTapOpacity = useRef(new Animated.Value(0)).current;
  const doubleTapScale = useRef(new Animated.Value(0.3)).current;
  // Use network-aware quality: cellular gets 360p to protect data,
  // WiFi gets up to 720p. Desktop card always uses 720p (typically WiFi).
  const targetHeight = layout === "fullscreen" ? getPreferredVideoHeight() : 720;
  // Use local file as fallback when available; skip manifest fetch when offline
  const fallbackUrl = item.localUri || item.video_url;
  const resolved = useResolvedVideoSource(online ? item.id : null, fallbackUrl, { targetHeight });
  const src = resolved.uri || fallbackUrl;
  const isFullscreen = layout === "fullscreen";

  function handleTogglePause() {
    setPaused((p) => !p);
  }

  function handleLike() {
    // Like-button bounce
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 0.7, duration: 80, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 8, useNativeDriver: true }),
    ]).start();
    // Double-tap heart burst (centre overlay)
    Animated.sequence([
      Animated.parallel([
        Animated.timing(doubleTapOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.spring(doubleTapScale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
      ]),
      Animated.delay(500),
      Animated.parallel([
        Animated.timing(doubleTapOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(doubleTapScale, { toValue: 0.3, duration: 250, useNativeDriver: true }),
      ]),
    ]).start();
    onLike(item.id, item.liked);
  }

  // Reset paused state when the card becomes active again.
  useEffect(() => {
    if (active) setPaused(false);
  }, [active]);

  const isOwnVideo = currentUserId === item.author_id;
  const showFollowBtn = !isOwnVideo && !item.following;

  // ─── Fullscreen (mobile) ────────────────────────────────────────────
  if (isFullscreen) {
    return (
      <View style={[styles.fullCard, { width: cardWidth, height: cardHeight, backgroundColor: "#000" }]}>
        <NativeShortsPlayer
          src={src}
          poster={item.image_url}
          active={active}
          paused={paused}
          preloadOnly={preloadOnly}
          loop={!autoScroll}
          onTogglePause={handleTogglePause}
          onDoubleTap={handleLike}
          onEnded={onAutoScrollEnd}
        />

        {/* Double-tap heart burst — centred, pointer-events:none so it never blocks taps */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              justifyContent: "center",
              alignItems: "center",
              opacity: doubleTapOpacity,
              transform: [{ scale: doubleTapScale }],
              pointerEvents: "none",
            } as any,
          ]}
        >
          <Ionicons name="heart" size={100} color="#FF3B30" />
        </Animated.View>

        {/* Caption above bottom bar */}
        {item.content ? (
          <Pressable
            style={[styles.fullCaptionAbove, { bottom: bottomInset + 66 }]}
            onPress={() => setCaptionExpanded((v) => !v)}
            hitSlop={8}
          >
            <RichText style={styles.fullCaption} numberOfLines={captionExpanded ? undefined : 1}>{item.content}</RichText>
            {!captionExpanded && item.content.length > 60 ? (
              <Text style={styles.fullCaptionMore}>more</Text>
            ) : null}
          </Pressable>
        ) : null}

        {/* Bottom bar: author info (left) + horizontal action buttons (right) */}
        <View style={[styles.fullBottomBar, { bottom: bottomInset + 10, pointerEvents: "box-none" }]}>
          {/* Author: avatar + handle + follow button */}
          <Pressable
            onPress={() => router.push(`/@${item.profile.handle}` as any)}
            style={styles.fullAuthorBlock}
          >
            <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={40} userId={item.author_id} />
            <View style={styles.fullAuthorText}>
              <Text style={styles.fullHandle} numberOfLines={1}>@{item.profile.handle}</Text>
              {showFollowBtn ? (
                <Pressable
                  onPress={() => onFollow(item.author_id)}
                  style={styles.fullFollowSlim}
                  hitSlop={4}
                >
                  <Text style={styles.fullFollowSlimText}>Follow</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>

          {/* Horizontal action buttons — size 26, all solid, top-aligned */}
          <View style={styles.fullActionsRow}>
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Pressable onPress={handleLike} style={styles.fullActionItem} hitSlop={6}>
                <Ionicons name="heart" size={26} color={item.liked ? "#FF3B30" : "#fff"} />
                <Text style={styles.fullActionLabel}>{formatCount(item.likeCount)}</Text>
              </Pressable>
            </Animated.View>

            <Pressable
              onPress={() => router.push({ pathname: "/video/[id]", params: { id: item.id } } as any)}
              style={styles.fullActionItem}
              hitSlop={6}
            >
              <Ionicons name="chatbubble-ellipses" size={26} color="#fff" />
              <Text style={styles.fullActionLabel}>{formatCount(item.replyCount)}</Text>
            </Pressable>

            <Pressable
              onPress={() => onBookmark(item.id, item.bookmarked)}
              style={styles.fullActionItem}
              hitSlop={6}
            >
              <Ionicons name="bookmark" size={26} color={item.bookmarked ? "#FFD60A" : "#fff"} />
              <Text style={styles.fullActionLabel}> </Text>
            </Pressable>

            <Pressable
              onPress={() => sharePost({
                postId: item.id,
                authorName: item.profile.display_name,
                content: item.content,
              })}
              style={styles.fullActionItem}
              hitSlop={6}
            >
              <Ionicons name="paper-plane" size={26} color="#fff" />
              <Text style={styles.fullActionLabel}> </Text>
            </Pressable>
          </View>
        </View>

        {/* Auto-scroll toggle pill — top-left, session only */}
        <Pressable
          onPress={onToggleAutoScroll}
          hitSlop={8}
          style={{
            position: "absolute",
            top: 56,
            left: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            backgroundColor: autoScroll ? "rgba(52,199,89,0.88)" : "rgba(0,0,0,0.45)",
            borderRadius: 20,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}
        >
          <Ionicons name={autoScroll ? "play-forward" : "play-forward"} size={14} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
            {autoScroll ? "Auto-scroll: On" : "Auto-scroll"}
          </Text>
        </Pressable>

      </View>
    );
  }

  // ─── Card layout ───────────────────────────────────────────────────
  return (
    <View style={[styles.cardOuter, { height: cardHeight }]}>
      <View style={[styles.cardInner, { width: cardWidth, height: cardHeight, backgroundColor: "#000" }]}>
        <NativeShortsPlayer
          src={src}
          poster={item.image_url}
          active={active}
          paused={paused}
          preloadOnly={preloadOnly}
          loop={!autoScroll}
          onTogglePause={handleTogglePause}
          onEnded={onAutoScrollEnd}
        />

        {/* Bottom info overlay */}
        <View style={[styles.bottomInfo, { pointerEvents: "box-none" }]}>
          <Pressable
            onPress={() => router.push(`/@${item.profile.handle}` as any)}
            style={styles.authorRow}
          >
            <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={36} userId={item.author_id} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.authorHandle} numberOfLines={1}>@{item.profile.handle}</Text>
              <UserName userId={item.author_id} name={item.profile.display_name} style={styles.authorName} numberOfLines={1} />
            </View>
            {showFollowBtn ? (
              <Pressable
                onPress={() => onFollow(item.author_id)}
                style={({ hovered }: any) => [
                  styles.followInline,
                  { backgroundColor: hovered ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)" },
                ]}
              >
                <Text style={styles.followInlineText}>Follow</Text>
              </Pressable>
            ) : null}
          </Pressable>
          {item.content ? (
            <Pressable onPress={() => setCaptionExpanded((v) => !v)} hitSlop={8}>
              <RichText style={styles.caption} numberOfLines={captionExpanded ? undefined : 1}>{item.content}</RichText>
              {!captionExpanded && item.content.length > 60 ? (
                <Text style={[styles.caption, { opacity: 0.55 }]}>more</Text>
              ) : null}
            </Pressable>
          ) : null}
        </View>

      </View>

      {/* Right-side action rail (sits next to the 9:16 player on desktop) */}
      <View style={[styles.rightRail, { pointerEvents: "box-none" }]}>
        <View style={styles.actionItem}>
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Pressable onPress={handleLike} style={({ hovered }: any) => [
              styles.actionBubble,
              { backgroundColor: hovered ? colors.backgroundTertiary : colors.surface },
            ]}>
              <Ionicons name="heart" size={26} color={item.liked ? "#FF3B30" : colors.text} />
            </Pressable>
          </Animated.View>
          <Text style={[styles.actionLabel, { color: colors.text }]}>{formatCount(item.likeCount)}</Text>
        </View>
        <View style={styles.actionItem}>
          <Pressable
            onPress={() => router.push({ pathname: "/video/[id]", params: { id: item.id } } as any)}
            style={({ hovered }: any) => [
              styles.actionBubble,
              { backgroundColor: hovered ? colors.backgroundTertiary : colors.surface },
            ]}
          >
            <Ionicons name="chatbubble-ellipses" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.actionLabel, { color: colors.text }]}>{formatCount(item.replyCount)}</Text>
        </View>
        <View style={styles.actionItem}>
          <Pressable
            onPress={() => onBookmark(item.id, item.bookmarked)}
            style={({ hovered }: any) => [
              styles.actionBubble,
              { backgroundColor: hovered ? colors.backgroundTertiary : colors.surface },
            ]}
          >
            <Ionicons name="bookmark" size={24} color={item.bookmarked ? "#FFD60A" : colors.text} />
          </Pressable>
        </View>
        <View style={styles.actionItem}>
          <Pressable
            onPress={() => sharePost({
              postId: item.id,
              authorName: item.profile.display_name,
              content: item.content,
            })}
            style={({ hovered }: any) => [
              styles.actionBubble,
              { backgroundColor: hovered ? colors.backgroundTertiary : colors.surface },
            ]}
          >
            <Ionicons name="paper-plane" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.actionLabel, { color: colors.text }]}>Share</Text>
        </View>
      </View>
    </View>
  );
});

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Feed list                                  */
/* ─────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────── */
/*                     Offline end-of-cache panel                          */
/* ─────────────────────────────────────────────────────────────────────── */

function CountdownRing({ seconds, total = 5 }: { seconds: number; total?: number }) {
  const SIZE = 56;
  const color = seconds <= 2 ? "#ff6b6b" : "#fff";
  const borderColor = seconds <= 2 ? "rgba(255,80,80,0.35)" : "rgba(255,255,255,0.18)";
  return (
    <View style={[endStyles.ringWrap, {
      width: SIZE, height: SIZE, borderRadius: SIZE / 2,
      borderWidth: 3, borderColor,
    }]}>
      <Text style={[endStyles.ringNum, { color }]}>{seconds}</Text>
    </View>
  );
}

function OfflineEndPanel({
  posts,
  onReplay,
  onDismiss,
}: {
  posts: ShortPost[];
  onReplay: () => void;
  onDismiss: () => void;
}) {
  const slideY = useRef(new Animated.Value(360)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const [countdown, setCountdown] = useState(5);
  const numScale = useRef(new Animated.Value(1)).current;
  const didAutoPlay = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, tension: 70, friction: 13, useNativeDriver: true }),
      Animated.timing(bgOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (countdown <= 0) {
      if (!didAutoPlay.current) { didAutoPlay.current = true; onReplay(); }
      return;
    }
    Animated.sequence([
      Animated.timing(numScale, { toValue: 1.4, duration: 130, useNativeDriver: true }),
      Animated.spring(numScale, { toValue: 1, tension: 220, friction: 9, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "box-none" }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.78)", opacity: bgOpacity, pointerEvents: "none" }]} />
      <Animated.View style={[endStyles.panel, { transform: [{ translateY: slideY }] }]}>
        {/* Dismiss */}
        <Pressable onPress={onDismiss} style={endStyles.dismissBtn} hitSlop={10}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.55)" />
        </Pressable>

        {/* Header */}
        <View style={endStyles.header}>
          <View style={endStyles.iconWrap}>
            <Ionicons name="albums" size={22} color="#fff" />
          </View>
          <Text style={endStyles.titleText}>End of cached shorts</Text>
          <Text style={endStyles.subtitleText}>
            {`${posts.length} video${posts.length === 1 ? "" : "s"} saved · replaying from the top`}
          </Text>
        </View>

        {/* Thumbnails strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginVertical: 16 }}
          contentContainerStyle={endStyles.thumbStrip}
        >
          {posts.map((p, i) => (
            <View key={p.id} style={endStyles.thumbCard}>
              {p.image_url ? (
                <Image source={{ uri: p.image_url }} style={endStyles.thumbImg} resizeMode="cover" />
              ) : (
                <View style={[endStyles.thumbImg, endStyles.thumbFallback]}>
                  <Ionicons name="videocam" size={18} color="rgba(255,255,255,0.35)" />
                </View>
              )}
              {i === 0 && (
                <View style={endStyles.thumbFirst}>
                  <Ionicons name="play" size={8} color="#fff" />
                </View>
              )}
              <Text style={endStyles.thumbHandle} numberOfLines={1}>@{p.profile.handle}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Bottom: countdown + replay button */}
        <View style={endStyles.bottomRow}>
          <CountdownRing seconds={countdown} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={endStyles.replayHint}>Playing again in {countdown}s</Text>
            <Pressable onPress={onReplay} style={endStyles.replayBtn} hitSlop={4}>
              <Ionicons name="play" size={13} color="#000" />
              <Text style={endStyles.replayBtnText}>Play again now</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

export default function ShortsFeed({
  topInset = 0,
  bottomInset = 0,
  layout = "card",
  filter = "for_you",
}: {
  topInset?: number;
  bottomInset?: number;
  layout?: ShortsLayout;
  filter?: ShortsFilter;
}) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const online = useOnlineStatus();
  const { width: winW, height: winH } = useWindowDimensions();

  const [posts, setPosts] = useState<ShortPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoScroll, setAutoScroll] = useState(false);
  const autoScrollRef = useRef(false);
  const [offlineCacheAge, setOfflineCacheAge] = useState<number | null>(null);
  const [showEndPanel, setShowEndPanel] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const loadMoreInFlight = useRef(false);
  const postsRef = useRef<ShortPost[]>([]);
  postsRef.current = posts;
  const prevOnlineRef = useRef(online);
  const endPanelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIndexRef = useRef(activeIndex);
  React.useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  React.useEffect(() => { autoScrollRef.current = autoScroll; }, [autoScroll]);

  useFocusEffect(
    useCallback(() => {
      activateKeepAwakeAsync?.("shorts-feed")?.catch(() => {});
      return () => {
        setAutoScroll(false);
        autoScrollRef.current = false;
        deactivateKeepAwake("shorts-feed").catch(() => {});
      };
    }, [])
  );

  const isFullscreen = layout === "fullscreen";

  const cardHeight = useMemo(() => {
    if (isFullscreen) return Math.max(360, winH);
    const usable = winH - topInset;
    return Math.max(360, usable);
  }, [winH, topInset, isFullscreen]);

  const cardWidth = useMemo(() => {
    if (isFullscreen) return winW;
    const target = (cardHeight - 32) * (9 / 16);
    const maxByCol = Math.min(420, winW - 200);
    return Math.min(maxByCol, Math.max(280, target));
  }, [cardHeight, winW, isFullscreen]);

  const PAGE_SIZE = 30;

  const buildShortPosts = useCallback(async (data: any[], user: any) => {
    const postIds = data.map((p: any) => p.id);
    const authorIds = [...new Set(data.map((p: any) => p.author_id as string))];
    const [
      { data: likesData },
      { data: repliesData },
      { data: myLikes },
      { data: myFollows },
      { data: myBookmarks },
    ] = await Promise.all([
      supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
      supabase.from("post_replies").select("post_id").in("post_id", postIds),
      user
        ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id)
        : Promise.resolve({ data: [] as any[] }),
      user
        ? supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", authorIds)
        : Promise.resolve({ data: [] as any[] }),
      user
        ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const likeMap: Record<string, number> = {};
    for (const l of likesData || []) likeMap[(l as any).post_id] = (likeMap[(l as any).post_id] || 0) + 1;
    const replyMap: Record<string, number> = {};
    for (const r of repliesData || []) replyMap[(r as any).post_id] = (replyMap[(r as any).post_id] || 0) + 1;
    const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
    const followingSet = new Set((myFollows || []).map((f: any) => f.following_id as string));
    const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id));
    return data.map((p: any) => ({
      id: p.id,
      author_id: p.author_id,
      content: p.content || "",
      video_url: p.video_url,
      image_url: p.image_url || null,
      created_at: p.created_at,
      view_count: p.view_count || 0,
      profile: {
        display_name: p.profiles?.display_name || "User",
        handle: p.profiles?.handle || "user",
        avatar_url: p.profiles?.avatar_url || null,
      },
      liked: myLikeSet.has(p.id),
      likeCount: likeMap[p.id] || 0,
      replyCount: replyMap[p.id] || 0,
      bookmarked: myBookmarkSet.has(p.id),
      following: followingSet.has(p.author_id),
    }));
  }, []);

  const fetchFollowingIds = useCallback(async () => {
    if (filter !== "following" || !user) return null;
    const { data: follows } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id);
    return (follows || []).map((r: any) => r.following_id as string);
  }, [filter, user]);

  const load = useCallback(async () => {
    setLoading(true);
    cursorRef.current = null;
    setHasMore(true);
    setOfflineCacheAge(null);

    if (!online) {
      // Offline: serve from cache; resolve local file URIs
      const cached = await getCachedShortsTab(filter);
      if (cached?.posts?.length) {
        const withLocal = await Promise.all(
          cached.posts.map(async (p: ShortPost) => {
            const localUri = await getCachedVideoUri(p.video_url).catch(() => null);
            return localUri ? { ...p, localUri } : null;
          })
        );
        const playable = withLocal.filter(Boolean) as ShortPost[];
        setPosts(playable);
        if (cached.cachedAt) setOfflineCacheAge(cached.cachedAt);
      } else {
        setPosts([]);
      }
      setHasMore(false);
      setLoading(false);
      return;
    }

    const followingAuthorIds = await fetchFollowingIds();
    if (followingAuthorIds !== null && followingAuthorIds.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("posts")
      .select(`
        id, author_id, content, video_url, image_url, created_at, view_count,
        profiles!posts_author_id_fkey(display_name, handle, avatar_url)
      `)
      .eq("post_type", "video")
      .eq("visibility", "public")
      .not("video_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (followingAuthorIds) {
      query = query.in("author_id", followingAuthorIds);
    }

    const { data } = await query;

    if (!data || data.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    if (data.length < PAGE_SIZE) setHasMore(false);
    cursorRef.current = data[data.length - 1]?.created_at ?? null;

    const mapped = await buildShortPosts(data, user);
    setPosts(mapped);
    setLoading(false);

    // Persist to cache for offline access
    cacheShortsTab(filter, mapped).catch(() => {});
  }, [user, filter, online, fetchFollowingIds, buildShortPosts]);

  const loadMore = useCallback(async () => {
    if (!online || loadMoreInFlight.current || !hasMore || !cursorRef.current) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    try {
      const followingAuthorIds = await fetchFollowingIds();
      if (followingAuthorIds !== null && followingAuthorIds.length === 0) return;

      let query = supabase
        .from("posts")
        .select(`
          id, author_id, content, video_url, image_url, created_at, view_count,
          profiles!posts_author_id_fkey(display_name, handle, avatar_url)
        `)
        .eq("post_type", "video")
        .eq("visibility", "public")
        .not("video_url", "is", null)
        .lt("created_at", cursorRef.current!)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (followingAuthorIds) {
        query = query.in("author_id", followingAuthorIds);
      }

      const { data } = await query;
      if (!data || data.length === 0) {
        setHasMore(false);
        return;
      }
      if (data.length < PAGE_SIZE) setHasMore(false);
      cursorRef.current = data[data.length - 1]?.created_at ?? null;

      const mapped = await buildShortPosts(data, user);
      setPosts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        return [...prev, ...mapped.filter((p) => !existingIds.has(p.id))];
      });
    } finally {
      setLoadingMore(false);
      loadMoreInFlight.current = false;
    }
  }, [hasMore, online, user, fetchFollowingIds, buildShortPosts, PAGE_SIZE]);

  useEffect(() => { load(); }, [load]);

  // Offline toast — fires once when the feed transitions online → offline
  useEffect(() => {
    const wasOnline = prevOnlineRef.current;
    prevOnlineRef.current = online;
    if (wasOnline && !online && postsRef.current.length > 0) {
      showToast(
        `Watching offline · ${postsRef.current.length} cached video${postsRef.current.length === 1 ? "" : "s"}`,
        { type: "info", duration: 3500, icon: "cloud-offline" },
      );
    }
    // Reconnected: dismiss end panel if it was showing
    if (!wasOnline && online) {
      setShowEndPanel(false);
    }
  }, [online]);

  // End-of-cache panel — triggers 1.2s after landing on the last cached video offline
  useEffect(() => {
    if (endPanelTimerRef.current) clearTimeout(endPanelTimerRef.current);
    if (!online && postsRef.current.length > 0 && activeIndex >= postsRef.current.length - 1) {
      endPanelTimerRef.current = setTimeout(() => setShowEndPanel(true), 1200);
    } else {
      setShowEndPanel(false);
    }
    return () => { if (endPanelTimerRef.current) clearTimeout(endPanelTimerRef.current); };
  }, [activeIndex, online, posts.length]);

  const handleReplay = useCallback(() => {
    setShowEndPanel(false);
    setActiveIndex(0);
    listRef.current?.scrollToIndex({ index: 0, animated: true });
  }, []);

  const handleDismissEndPanel = useCallback(() => {
    setShowEndPanel(false);
  }, []);

  // Auto-save viewed video + prefetch next for offline access (native only)
  useEffect(() => {
    if (!online) return;
    const item = postsRef.current[activeIndex];
    if (!item) return;
    const timer = setTimeout(() => {
      markVideoWatched(item.id, item.video_url, {
        title: item.content || item.id,
        thumbnail: item.image_url,
        authorId: item.author_id,
        authorHandle: item.profile.handle,
        authorName: item.profile.display_name,
        authorAvatar: item.profile.avatar_url,
      }).catch(() => {});
      // Prefetch next video silently so it's ready offline
      const next = postsRef.current[activeIndex + 1];
      if (next) cacheVideo(next.video_url).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [activeIndex, online]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first && typeof first.index === "number") {
      setActiveIndex(first.index);
    }
  }).current;

  const listRef = useRef<FlatList>(null);
  const handleAutoScrollEnd = useCallback(() => {
    if (!autoScrollRef.current) return;
    const next = activeIndexRef.current + 1;
    if (next >= postsRef.current.length) return;
    listRef.current?.scrollToIndex({ index: next, animated: true });
  }, []);

  const toggleLike = useCallback(async (postId: string, currentlyLiked: boolean) => {
    if (!user) { router.push("/(auth)/login" as any); return; }
    // Optimistic update — flip instantly
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, liked: !currentlyLiked, likeCount: Math.max(0, p.likeCount + (currentlyLiked ? -1 : 1)) }
          : p,
      ),
    );
    if (currentlyLiked) {
      const { error } = await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
      if (error) {
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p)
        );
      }
    } else {
      const { error } = await supabase.from("post_acknowledgments").upsert(
        { post_id: postId, user_id: user.id },
        { onConflict: "post_id,user_id", ignoreDuplicates: true }
      );
      if (error) {
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p)
        );
      }
    }
  }, [user]);

  const toggleBookmark = useCallback(async (postId: string, currentlyBookmarked: boolean) => {
    if (!user) { router.push("/(auth)/login" as any); return; }
    if (currentlyBookmarked) {
      await supabase.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", user.id);
    } else {
      await supabase.from("post_bookmarks").upsert(
        { post_id: postId, user_id: user.id },
        { onConflict: "post_id,user_id" },
      );
    }
    setPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, bookmarked: !currentlyBookmarked } : p,
    ));
  }, [user]);

  const toggleFollow = useCallback(async (authorId: string) => {
    if (!user) { router.push("/(auth)/login" as any); return; }
    await supabase
      .from("follows")
      .upsert({ follower_id: user.id, following_id: authorId }, { onConflict: "follower_id,following_id" });
    setPosts((prev) => prev.map((p) => p.author_id === authorId ? { ...p, following: true } : p));
  }, [user]);

  const handleToggleAutoScroll = useCallback(() => {
    setAutoScroll((v) => { autoScrollRef.current = !v; return !v; });
  }, []);

  const keyExtractor = useCallback((item: ShortPost) => item.id, []);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: cardHeight, offset: cardHeight * index, index,
  }), [cardHeight]);

  const renderItem = useCallback(({ item, index }: { item: ShortPost; index: number }) => {
    // Mount active card + 2 neighbours so swipe animation is instant
    const distance = Math.abs(index - activeIndex);
    const preloadOnly = distance > 0 && distance <= 2;
    return (
      <ShortCard
        item={item}
        active={index === activeIndex}
        preloadOnly={preloadOnly}
        layout={layout}
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        bottomInset={bottomInset}
        autoScroll={autoScroll}
        onToggleAutoScroll={handleToggleAutoScroll}
        onAutoScrollEnd={handleAutoScrollEnd}
        onLike={toggleLike}
        onBookmark={toggleBookmark}
        onFollow={toggleFollow}
        currentUserId={user?.id}
      />
    );
  }, [activeIndex, layout, cardWidth, cardHeight, bottomInset, autoScroll,
      handleToggleAutoScroll, handleAutoScrollEnd, toggleLike, toggleBookmark,
      toggleFollow, user?.id]);

  if (loading) {
    return <ShortsFeedSkeleton dark={isFullscreen} />;
  }

  if (posts.length === 0) {
    return (
      <View style={[styles.loading, { backgroundColor: isFullscreen ? "#000" : colors.background }]}>
        <Ionicons
          name={online ? "videocam" : "cloud-offline"}
          size={48}
          color={isFullscreen ? "rgba(255,255,255,0.6)" : colors.textMuted}
        />
        <Text style={{
          color: isFullscreen ? "#fff" : colors.text,
          fontFamily: "Inter_600SemiBold", fontSize: 16, marginTop: 12,
        }}>
          {!online
            ? "No cached shorts"
            : filter === "following" ? "No shorts from people you follow" : "No shorts yet"}
        </Text>
        <Text style={{
          color: isFullscreen ? "rgba(255,255,255,0.6)" : colors.textMuted,
          fontFamily: "Inter_400Regular", fontSize: 13,
          marginTop: 4, textAlign: "center", paddingHorizontal: 32,
        }}>
          {!online
            ? "Watch shorts while online to save them for offline playback."
            : filter === "following" ? "Follow creators to see their shorts here." : "Be the first to post a short video."}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
    <FlatList
      ref={listRef}
      data={posts}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      snapToAlignment="start"
      snapToInterval={cardHeight}
      disableIntervalMomentum
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      getItemLayout={getItemLayout}
      windowSize={3}
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      updateCellsBatchingPeriod={50}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      ListFooterComponent={loadingMore ? (
        <View style={{ paddingVertical: 12, alignItems: "center" }}>
          <View style={{ width: 48, height: 6, borderRadius: 3, backgroundColor: isFullscreen ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.1)" }} />
        </View>
      ) : null}
      style={{ flex: 1, backgroundColor: isFullscreen ? "#000" : colors.background }}
    />
    {showEndPanel && (
      <OfflineEndPanel
        posts={posts}
        onReplay={handleReplay}
        onDismiss={handleDismissEndPanel}
      />
    )}
    </View>
  );
}

/* ── End-of-cache panel styles ──────────────────────────────────────────── */
const endStyles = StyleSheet.create({
  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(14,14,18,0.97)",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingBottom: 32,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
  },
  dismissBtn: {
    position: "absolute",
    top: 16,
    right: 18,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  header: { alignItems: "center", gap: 6, marginBottom: 4 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  titleText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.1,
  },
  subtitleText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  thumbStrip: { gap: 8, paddingHorizontal: 2 },
  thumbCard: { width: 72, alignItems: "center", gap: 5 },
  thumbImg: {
    width: 72,
    height: 96,
    borderRadius: 10,
    overflow: "hidden",
  },
  thumbFallback: {
    backgroundColor: "#1e1e26",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbFirst: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbHandle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 72,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 4,
  },
  ringWrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  ringTrack: {
    position: "absolute",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.15)",
  },
  ringFill: {
    position: "absolute",
    borderWidth: 3,
    borderTopColor: "transparent",
    borderRightColor: "transparent",
  },
  ringNum: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    position: "absolute",
  },
  replayHint: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  replayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  replayBtnText: {
    color: "#000",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  /* ── Desktop card layout ────────────────────────────────────────── */
  cardOuter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 12,
  },
  cardInner: {
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  bottomInfo: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 16,
    gap: 8,
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  authorHandle: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  authorName: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_400Regular" },
  caption: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    ...Platform.select({ web: { textShadow: "0 1px 2px rgba(0,0,0,0.5)" } as any, default: { textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 } }),
  },
  followInline: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
  followInlineText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  muteBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  centerPlayBtn: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  centerPlayCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  rightRail: {
    flexDirection: "column",
    alignItems: "center",
    gap: 18,
    paddingTop: 60,
  },
  actionItem: { alignItems: "center", gap: 4 },
  actionBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  actionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  /* ── Fullscreen (mobile) layout ─────────────────────────────────── */
  fullCard: {
    position: "relative",
    overflow: "hidden",
  },
  fullCaptionAbove: {
    position: "absolute",
    left: 14,
    right: 14,
  },
  fullCaption: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    ...Platform.select({ web: { textShadow: "0 1px 3px rgba(0,0,0,0.6)" } as any, default: { textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 } }),
  },
  fullCaptionMore: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 1,
    ...Platform.select({ web: { textShadow: "0 1px 3px rgba(0,0,0,0.6)" } as any, default: { textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 } }),
  },
  /* ── Progress / seek bar ─────────────────────────────────────── */
  progressContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 44,           // large touch target
    justifyContent: "flex-end",
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.30)",
    borderRadius: 2,
    overflow: "hidden",
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
    bottom: 10 - 5,       // aligns with track centre (paddingBottom 10, track height 3, thumb 12 → offset 4)
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#fff",
    marginLeft: -6,       // centre on the fill edge
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 3,
  },
  /* Bottom bar: row spanning full width */
  fullBottomBar: {
    position: "absolute",
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  /* Left: avatar + handle column */
  fullAuthorBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  fullAuthorText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  fullHandle: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    ...Platform.select({ web: { textShadow: "0 1px 3px rgba(0,0,0,0.6)" } as any, default: { textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 } }),
  },
  /* Slim Follow button replaces display name */
  fullFollowSlim: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#fff",
  },
  fullFollowSlimText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  /* Right: horizontal action buttons row */
  fullActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  fullActionItem: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    gap: 2,
  },
  fullActionLabel: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    ...Platform.select({ web: { textShadow: "0 1px 2px rgba(0,0,0,0.6)" } as any, default: { textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 } }),
  },
});
