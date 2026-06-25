import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image as RNImage,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
// PagerView gives true native 1:1 finger-tracking on Android/iOS.
const _PagerView: any = Platform.OS !== "web"
  ? (() => { try { return require("react-native-pager-view").default; } catch { return null; } })()
  : null;
import { TabSwipeContext } from "@/context/TabSwipeContext";
import { Image as ExpoImage } from "expo-image";
import { showAlert } from "@/lib/alert";
import { useSafeAreaInsets, useSafeAreaInsets as useCardInsets } from "react-native-safe-area-context";
import { router, useNavigation, useFocusEffect } from "expo-router";
import { safeRouter } from "@/lib/navUtils";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { ImageViewer, useImageViewer } from "@/components/ImageViewer";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { RichText } from "@/components/ui/RichText";
import Colors from "@/constants/colors";
import { PostSkeleton } from "@/components/ui/Skeleton";
import { useContextMenu, ContextMenu } from "@/components/desktop/ContextMenu";
import { VideoThumbnail } from "@/components/ui/VideoThumbnail";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import UserName from "@/components/ui/UserName";
import OfflineBanner from "@/components/ui/OfflineBanner";
import PostUploadBanner from "@/components/ui/PostUploadBanner";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { getLocalFeedPosts, saveFeedPosts, getNewestFeedPostDate, type FeedTab as LocalFeedTab } from "@/lib/storage/localFeed";
import { getCachedFeedTab, cacheFeedTab, getCachedMoments, cacheMoments } from "@/lib/offlineStore";
import { notifyPostLike } from "@/lib/notifyUser";
import { timeAgo as formatRelative, formatPostDate } from "@/lib/timeAgo";
import { sharePost, shareVideo } from "@/lib/share";
import { matchInterestsWeighted, recordInteraction, getLearnedInterestBoosts, computeFeedScore, diversifyFeed, getSeenPostIds, markPostsSeen, weightedSample, type FeedSignals } from "@/lib/feedAlgorithm";
import { setHandleId } from "@/lib/profileCache";
import { trackEvent } from "@/lib/activityTracker";
import { getMergedLearnedWeights } from "@/lib/personalization";
import { useLanguage } from "@/context/LanguageContext";
import { translateText, LANG_LABELS } from "@/lib/translate";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { DesktopFeedLayout, FEED_COLUMN_MAX_WIDTH } from "@/components/desktop/DesktopFeedLayout";
import { encodeId } from "@/lib/shortId";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import SignInPromptModal from "@/components/ui/SignInPromptModal";
import { PostShareCaptureModal, type ShareablePost } from "@/components/ui/PostShareCard";
import { VideoCommentsSheet } from "@/components/ui/VideoCommentsSheet";
import { UserRecsCard } from "@/components/discover/UserRecsCard";
import { DismissSheet, type DismissReason } from "@/components/discover/DismissSheet";
import { SuggestedUsers } from "@/components/ui/SuggestedUsers";
import { LinearGradient } from "@/components/ui/SafeGradient";

type PostItem = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  visibility: string;
  is_verified: boolean;
  is_organization_verified: boolean;
  profile: { display_name: string; handle: string; avatar_url: string | null; bio: string | null };
  liked: boolean;
  likeCount: number;
  replyCount: number;
  score: number;
  bookmarked: boolean;
  post_type: string;
  article_title: string | null;
  article_body: string | null;
  video_url: string | null;
  duration_seconds: number | null;
  isFollowing: boolean;
  language_code?: string | null;
  org_page_id?: string;
  org_slug?: string;
  org_type?: string;
  org_verified?: boolean;
  showThreadLine?: boolean;
};

function formatNum(n: number): string {
  if (!n || n < 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, "") + "M";
  if (n >= 10_000) return Math.round(n / 1_000) + "K";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function RecentCommenters(_props: { postId: string; replyCount: number; bgColor: string; accentColor: string }) {
  return null;
}

function BookmarkButton({ bookmarked, onPress }: { bookmarked: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  function handlePress() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.7, duration: 100, useNativeDriver: Platform.OS !== "web" }),
      Animated.spring(scale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
    onPress();
  }
  return (
    <Animated.View style={{ transform: [{ scale }], marginLeft: "auto" }}>
      <TouchableOpacity onPress={handlePress} hitSlop={8}>
        <Ionicons name={bookmarked ? "bookmark" : "bookmark-outline"} size={21} color={bookmarked ? Colors.gold : colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── PostImages: swipeable carousel, one image at a time ─────────────────────
function PostImages({
  images,
  onPress,
  onDoubleTap,
  effectiveW,
}: {
  images: string[];
  onPress: (index: number) => void;
  onDoubleTap: () => void;
  effectiveW: number;
}) {
  const { isDark, colors } = useTheme();
  const [currentIdx, setCurrentIdx] = React.useState(0);

  const L_PAD  = 50;
  const R_PAD  = 12;
  const imgW   = effectiveW - L_PAD - R_PAD;
  const imgH   = Math.round(imgW * 0.62);
  const CORNER = 12;
  const BG     = isDark ? "#1c1c1e" : "#e9e9e9";

  const heartOpacity = useRef(new Animated.Value(0)).current;
  const heartScale   = useRef(new Animated.Value(0.3)).current;
  const lastTapMs    = useRef(0);
  const tapTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashHeart() {
    heartOpacity.setValue(0);
    heartScale.setValue(0.3);
    Animated.parallel([
      Animated.timing(heartOpacity, { toValue: 1, duration: 120, useNativeDriver: Platform.OS !== "web" }),
      Animated.spring(heartScale,   { toValue: 1, speed: 50, bounciness: 14, useNativeDriver: Platform.OS !== "web" }),
    ]).start(() => {
      setTimeout(() => {
        Animated.timing(heartOpacity, { toValue: 0, duration: 380, useNativeDriver: Platform.OS !== "web" }).start();
      }, 500);
    });
    onDoubleTap();
  }

  function handleTap(idx: number) {
    const now = Date.now();
    if (now - lastTapMs.current < 320) {
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
      lastTapMs.current = 0;
      flashHeart();
    } else {
      lastTapMs.current = now;
      tapTimer.current = setTimeout(() => { tapTimer.current = null; onPress(idx); }, 320);
    }
  }

  return (
    <View style={{ marginLeft: L_PAD, marginRight: R_PAD, marginBottom: images.length > 1 ? 4 : 10 }}>
      {/* ── Carousel strip ── */}
      <View style={{ borderRadius: CORNER, overflow: "hidden", backgroundColor: BG, width: imgW, height: imgH }}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          decelerationRate="fast"
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / imgW);
            setCurrentIdx(Math.max(0, Math.min(idx, images.length - 1)));
          }}
        >
          {images.map((uri, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.95}
              onPress={() => handleTap(i)}
              style={{ width: imgW, height: imgH }}
            >
              <ExpoImage
                source={{ uri }}
                style={{ width: imgW, height: imgH }}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority={i === 0 ? "high" : "normal"}
                transition={300}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Double-tap heart */}
        <Animated.View
          style={{ position: "absolute", alignSelf: "center", top: imgH / 2 - 44, opacity: heartOpacity, transform: [{ scale: heartScale }], pointerEvents: "none" }}
        >
          <Ionicons name="heart" size={88} color="#FF3B30" />
        </Animated.View>

        {/* Counter badge — top-right */}
        {images.length > 1 && (
          <View style={{ position: "absolute", top: 7, right: 8, backgroundColor: "rgba(0,0,0,0.52)", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{currentIdx + 1}/{images.length}</Text>
          </View>
        )}
      </View>

    </View>
  );

}

const PostCard = React.memo(function PostCard({ item, onToggleLike, onToggleBookmark, onToggleFollow, onImagePress, onRequireAuth, colWidth, onOpenComments, onDismiss, onMuteAuthor }: { item: PostItem; onToggleLike: (postId: string) => void; onToggleBookmark: (postId: string) => void; onToggleFollow: (authorId: string) => void; onImagePress?: (images: string[], index: number) => void; onRequireAuth?: () => void; colWidth?: number; onOpenComments: (postId: string, authorId: string) => void; onDismiss?: (postId: string) => void; onMuteAuthor?: (authorId: string, handle: string) => void }) {
  const { colors, isDark } = useTheme();
  const { preferredLang } = useLanguage();
  const { width: screenW } = useWindowDimensions();
  const cardInsets = useCardInsets();
  const { user: currentUser } = useAuth();
  const { isDesktop } = useIsDesktop();
  const watchedFraction = useVideoProgress(item.post_type === "video" ? item.id : "");
  const [displayContent, setDisplayContent] = useState(item.content);
  const [isTranslated, setIsTranslated] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareablePost, setShareablePost] = useState<ShareablePost | null>(null);
  const isOwnPost = currentUser?.id === item.author_id;

  const heartScale = useRef(new Animated.Value(1)).current;
  const animateHeart = useCallback(() => {
    heartScale.setValue(1);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: Platform.OS !== "web", speed: 50, bounciness: 14 }),
      Animated.spring(heartScale, { toValue: 1,   useNativeDriver: Platform.OS !== "web", speed: 22, bounciness: 4  }),
    ]).start();
  }, [heartScale]);

  const { bind: ctxBind, menuProps: ctxMenuProps } = useContextMenu([
    [
      { key: "open",    label: "Open post",                     icon: "open-outline",     onSelect: () => openPost() },
      { key: "like",    label: item.liked ? "Unlike" : "Like",  icon: item.liked ? "heart" : "heart-outline", onSelect: () => { if (!currentUser) { onRequireAuth?.(); return; } onToggleLike(item.id); } },
      { key: "save",    label: item.bookmarked ? "Unsave" : "Save", icon: item.bookmarked ? "bookmark" : "bookmark-outline", onSelect: () => { if (!currentUser) { onRequireAuth?.(); return; } onToggleBookmark(item.id); } },
      { key: "profile", label: `View @${item.profile.handle}`, icon: "person-outline",   onSelect: () => safeRouter.push({ pathname: "/contact/[id]", params: { id: item.author_id, init_name: item.profile.display_name, init_handle: item.profile.handle, init_avatar: item.profile.avatar_url ?? "", init_verified: item.is_verified ? "1" : "0", init_org_verified: item.is_organization_verified ? "1" : "0" } } as any) },
    ],
    [
      { key: "copy",  label: "Copy link", icon: "link-outline",  onSelect: () => { if (typeof window !== "undefined") navigator.clipboard?.writeText(`${window.location.origin}/p/${item.id}`); } },
      { key: "share", label: "Share",     icon: "share-outline", onSelect: () => setShowShareModal(true) },
    ],
    [
      { key: "report", label: "Report", icon: "flag-outline", destructive: true, onSelect: () => {} },
    ],
  ]);
  const showFollowBtn = !isOwnPost && !item.isFollowing;

  const allImages = item.images.length > 0 ? item.images : item.image_url ? [item.image_url] : [];
  const effectiveW = colWidth ?? screenW;
  const CONTENT_INDENT = 66;

  useEffect(() => {
    if (!preferredLang || !item.content?.trim()) { setDisplayContent(item.content); setIsTranslated(false); return; }
    if (item.language_code && item.language_code === preferredLang) return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      translateText(item.content, preferredLang).then((result) => {
        if (!cancelled && result && result !== item.content) {
          setDisplayContent(result);
          setIsTranslated(true);
        }
      });
    });
    return () => { cancelled = true; task.cancel(); };
  }, [preferredLang, item.content, item.language_code]);

  function openPost() {
    if (item.org_page_id) {
      safeRouter.push(`/company/${item.org_slug}` as any);
      return;
    }
    if (item.post_type === "article") {
      safeRouter.push({ pathname: "/article/[id]", params: { id: item.id } });
      return;
    }
    if (item.post_type === "video") {
      safeRouter.push({ pathname: "/video/[id]", params: { id: item.id } });
      return;
    }
    safeRouter.push({
      pathname: "/p/[id]",
      params: {
        id: encodeId(item.id),
        init_name: item.profile.display_name,
        init_handle: item.profile.handle,
        init_avatar: item.profile.avatar_url ?? "",
        init_content: (item.content ?? "").slice(0, 600),
        init_created_at: item.created_at,
        init_like_count: String(item.likeCount),
        init_reply_count: String(item.replyCount),
        init_view_count: String(item.view_count),
        init_verified: item.is_verified ? "1" : "0",
        init_org_verified: item.is_organization_verified ? "1" : "0",
        init_liked: item.liked ? "1" : "0",
        init_image: (item.images?.[0] ?? item.image_url) ?? "",
        init_post_type: item.post_type ?? "",
        init_article_title: item.article_title ?? "",
        init_author_id: item.author_id,
      },
    });
  }

  function capturePostImage() {
    setMenuVisible(false);
    setShareablePost({
      id: item.id,
      author_name: item.profile.display_name,
      author_handle: item.profile.handle,
      avatar_url: item.profile.avatar_url,
      is_verified: item.is_verified,
      is_org_verified: item.is_organization_verified,
      created_at: item.created_at,
      post_type: item.post_type,
      content: item.content,
      article_title: item.article_title ?? null,
      like_count: item.likeCount,
      reply_count: item.replyCount,
      view_count: item.view_count,
      bookmarked: item.bookmarked,
      accent: colors.accent,
    });
    setShowShareModal(true);
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.background, borderBottomColor: colors.border }]}
        onPress={openPost}
        activeOpacity={0.97}
        // @ts-ignore — RN Web supports onContextMenu
        onContextMenu={Platform.OS === "web" ? ctxBind.onContextMenu : undefined}
      >
          {/* X/Twitter-style thread connector line */}
          {item.showThreadLine && (
            <View
              style={{
                pointerEvents: "none",
                position: "absolute",
                left: isDesktop ? 38 : 35,
                top: isDesktop ? 70 : 64,
                bottom: -8,
                width: 2,
                backgroundColor: colors.border,
                borderRadius: 1,
                zIndex: 1,
              }}
            />
          )}
          {/* ── Header ── */}
          <View style={[styles.cardHeader, (!item.org_page_id && !item.profile.bio) && { paddingBottom: 2 }]}>
            {item.org_page_id ? (
              <TouchableOpacity
                onPress={() => safeRouter.push(`/company/${item.org_slug}` as any)}
                activeOpacity={0.8}
              >
                {item.profile.avatar_url
                  ? <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={isDesktop ? 44 : 40} square userId={item.author_id} />
                  : <View style={{ width: isDesktop ? 44 : 40, height: isDesktop ? 44 : 40, borderRadius: 8, backgroundColor: colors.accent + "20", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: isDesktop ? 18 : 16 }}>{(item.profile.display_name || "O").slice(0, 1).toUpperCase()}</Text>
                    </View>
                }
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => safeRouter.push({ pathname: "/contact/[id]", params: { id: item.author_id, init_name: item.profile.display_name, init_handle: item.profile.handle, init_avatar: item.profile.avatar_url ?? "", init_verified: item.is_verified ? "1" : "0", init_org_verified: item.is_organization_verified ? "1" : "0" } } as any)}
                activeOpacity={0.8}
              >
                <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={isDesktop ? 44 : 40} square={!!(item.is_organization_verified)} userId={item.author_id} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1, gap: 0, paddingTop: 10 }}>
              {item.org_page_id ? (
                /* ── Org page: keep display name + type badge inline ── */
                <>
                  <View style={[styles.nameRow, { flex: 1 }]}>
                    <TouchableOpacity onPress={() => safeRouter.push(`/company/${item.org_slug}` as any)} activeOpacity={0.7}>
                      <UserName userId={item.author_id} name={item.profile.display_name} style={[styles.cardHandle, { color: colors.text, fontSize: isDesktop ? 14 : 13, flexShrink: 1 }]} numberOfLines={1} />
                    </TouchableOpacity>
                    {item.org_verified ? <VerifiedBadge isVerified={false} isOrganizationVerified size={isDesktop ? 14 : 12} /> : null}
                    <View style={{ backgroundColor: colors.accent + "15", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 9.5, fontFamily: "Inter_600SemiBold", color: colors.accent, textTransform: "capitalize" }}>
                        {item.org_type?.replace(/\s*\/.*$/, "") || "Company"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                      style={[styles.followBtn, { backgroundColor: colors.accent + "15", borderWidth: 1, borderColor: colors.accent + "30", marginRight: 6 }]}
                      onPress={() => safeRouter.push(`/company/${item.org_slug}` as any)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="business-outline" size={13} color={colors.accent} />
                      <Text style={[styles.followBtnText, { color: colors.accent }]}>View Page</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMenuVisible(true); }}
                      hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    >
                      <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                /* ── Person: bold display name / @handle subtitle / bio ── */
                <>
                  <View style={[styles.nameRow, { flex: 1 }]}>
                    <UserName userId={item.author_id} name={item.profile.display_name || item.profile.handle} style={[styles.cardHandle, { color: colors.text, fontSize: isDesktop ? 14 : 13, fontFamily: "Inter_700Bold", flexShrink: 1 }]} numberOfLines={1} />
                    <VerifiedBadge isVerified={item.is_verified} isOrganizationVerified={item.is_organization_verified} size={isDesktop ? 14 : 12} />
                    <View style={{ flex: 1 }} />
                    {showFollowBtn && (
                      <TouchableOpacity
                        style={{
                          backgroundColor: isDark ? "#ffffff" : "#0f0f0f",
                          borderRadius: 20,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          marginRight: 6,
                        }}
                        onPress={() => { if (!currentUser) { onRequireAuth?.(); return; } onToggleFollow(item.author_id); }}
                        activeOpacity={0.8}
                      >
                        <Text style={{ color: isDark ? "#0f0f0f" : "#ffffff", fontSize: 12, fontFamily: "Inter_700Bold" }}>Follow</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMenuVisible(true); }}
                      hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    >
                      <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                    @{item.profile.handle}
                  </Text>
                  {item.profile.bio ? (
                    <Text style={[styles.cardBio, { color: colors.textMuted }]} numberOfLines={1}>
                      {item.profile.bio}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          </View>

          {/* ── VIDEO: thumbnail preview card ── */}
          {item.post_type === "video" && item.video_url && (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => safeRouter.push({ pathname: "/post/[id]", params: { id: item.id } })}
              style={styles.videoCard}
            >
              <View style={styles.videoThumb}>
                <VideoThumbnail
                  videoUrl={item.video_url!}
                  fallbackImageUrl={item.image_url}
                  style={StyleSheet.absoluteFill}
                  lowData={isDesktop}
                  durationSeconds={item.duration_seconds}
                  watchedFraction={isDesktop ? null : watchedFraction}
                />
                <View style={styles.playCircle}>
                  <Ionicons name="play" size={22} color="#fff" />
                </View>
                <View style={styles.videoBadge}>
                  <Ionicons name="videocam" size={11} color="#fff" />
                  <Text style={styles.videoBadgeText}>Video</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* ── ARTICLE: distinctive card ── */}
          {item.post_type === "article" ? (
            <View style={[styles.articleCard, { backgroundColor: colors.surface }]}>
              {allImages.length > 0 && (
                <ExpoImage
                  source={{ uri: allImages[0] }}
                  style={styles.articleCover}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  priority="normal"
                />
              )}
              <View style={styles.articleCardBody}>
                <View style={[styles.articleBadgeRow, { backgroundColor: colors.accent + "15" }]}>
                  <Ionicons name="document-text" size={11} color={colors.accent} />
                  <Text style={[styles.articleBadgeText, { color: colors.accent }]}>Article</Text>
                  {item.article_title && (
                    <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginLeft: 4 }}>
                      {Math.max(1, Math.round((item.article_body || item.content || "").trim().split(/\s+/).filter(Boolean).length / 200))} min read
                    </Text>
                  )}
                </View>
                {item.article_title ? (
                  <Text style={[styles.articleTitle, { color: colors.text }]} numberOfLines={2}>{item.article_title}</Text>
                ) : null}
                {(displayContent || "").trim().length > 0 && (
                  <Text style={[styles.articleExcerpt, { color: colors.textSecondary }]} numberOfLines={2}>
                    {displayContent}
                  </Text>
                )}
                <TouchableOpacity onPress={openPost} style={[styles.articleReadBtn, { backgroundColor: colors.accent }]}>
                  <Ionicons name="book-outline" size={13} color="#fff" />
                  <Text style={styles.articleReadBtnText}>Read article</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {/* ── Content text ── */}
              {(displayContent || "").trim().length > 0 && (
                <RichText style={[styles.cardContent, { color: colors.text, fontSize: isDesktop ? 17 : 15, lineHeight: isDesktop ? 27 : 23 }]}>
                  {displayContent}
                </RichText>
              )}
            </>
          )}

          {isTranslated && (
            <View style={styles.translatedBadge}>
              <Ionicons name="language" size={11} color={colors.textMuted} />
              <Text style={[styles.translatedText, { color: colors.textMuted }]}>
                {`Translated · ${LANG_LABELS[preferredLang || ""] ?? preferredLang}`}
              </Text>
            </View>
          )}

          {/* ── Images ── */}
          {allImages.length > 0 && item.post_type !== "video" && item.post_type !== "article" && (
            <PostImages
              images={allImages}
              onPress={(i) => { onImagePress?.(allImages, i); }}
              onDoubleTap={() => {
                if (!currentUser) { onRequireAuth?.(); return; }
                if (!item.liked) { animateHeart(); onToggleLike(item.id); }
              }}
              effectiveW={effectiveW}
            />
          )}

          {/* ── Date — sits between content and reaction buttons ── */}
          <Text style={[styles.cardMeta, { color: colors.textMuted, fontSize: 12, paddingLeft: 58, paddingRight: 12, marginTop: 2, marginBottom: 0 }]}>
            {formatPostDate(item.created_at)}
          </Text>

          {/* ── Footer ── */}
          <View style={styles.cardFooter}>
            {/* Likes */}
            <TouchableOpacity
              style={styles.footerStat}
              onPress={() => {
                if (!currentUser) { onRequireAuth?.(); return; }
                animateHeart();
                onToggleLike(item.id);
              }}
              activeOpacity={0.7}
            >
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons
                  name={item.liked ? "heart" : "heart-outline"}
                  size={21}
                  color={item.liked ? "#FF3B30" : colors.textMuted}
                />
              </Animated.View>
              <Text style={[styles.footerStatNum, { color: item.liked ? "#FF3B30" : colors.textMuted }]}>
                {formatNum(item.likeCount)}
              </Text>
            </TouchableOpacity>

            {/* Comments */}
            <TouchableOpacity
              style={styles.footerStat}
              onPress={() => onOpenComments(item.id, item.author_id)}
              activeOpacity={0.7}
            >
              <Ionicons name="chatbubble-outline" size={21} color={colors.textMuted} />
              <RecentCommenters postId={item.id} replyCount={item.replyCount} bgColor={colors.background} accentColor={colors.accent} />
              <Text style={[styles.footerStatNum, { color: colors.textMuted }]}>{formatNum(item.replyCount)}</Text>
            </TouchableOpacity>

            {/* Share */}
            <TouchableOpacity
              style={styles.footerStat}
              onPress={() => {
                if (!currentUser) { onRequireAuth?.(); return; }
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                item.post_type === "video"
                  ? shareVideo({ postId: item.id, authorName: item.profile.display_name, caption: item.content })
                  : sharePost({ postId: item.id, authorName: item.profile.display_name, content: item.content });
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-redo-outline" size={21} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            {/* Views */}
            <View style={styles.footerStat}>
              <Ionicons name="eye-outline" size={21} color={colors.textMuted} />
              <Text style={[styles.footerStatNum, { color: colors.textMuted }]}>{formatNum(item.view_count)}</Text>
            </View>

            {/* Bookmark */}
            <BookmarkButton bookmarked={item.bookmarked} onPress={() => { if (!currentUser) { onRequireAuth?.(); return; } onToggleBookmark(item.id); }} />
          </View>

        </TouchableOpacity>

      <PostShareCaptureModal
        post={shareablePost}
        visible={showShareModal}
        onClose={() => { setShowShareModal(false); setShareablePost(null); }}
      />

      <Modal visible={menuVisible} transparent animationType="none" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuSheet, { backgroundColor: colors.surface, paddingBottom: cardInsets.bottom + 12 }]}>
            <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuVisible(false); item.post_type === "video" ? shareVideo({ postId: item.id, authorName: item.profile.display_name, caption: item.content }) : sharePost({ postId: item.id, authorName: item.profile.display_name, content: item.content }); }}
            >
              <Ionicons name="share-outline" size={22} color={colors.accent} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Share Post</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={capturePostImage}>
              <Ionicons name="image-outline" size={22} color={colors.accent} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Save as Image</Text>
            </TouchableOpacity>
            {!isOwnPost && (
              <>
                <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => { setMenuVisible(false); setTimeout(() => onDismiss?.(item.id), 150); }}
                >
                  <Ionicons name="thumbs-down-outline" size={22} color={colors.textMuted} />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>Not interested</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setMenuVisible(false); onMuteAuthor?.(item.author_id, item.profile.handle); }}
                >
                  <Ionicons name="volume-mute-outline" size={22} color={colors.textMuted} />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>Mute @{item.profile.handle}</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
              <Ionicons name="close-outline" size={22} color={colors.textMuted} />
              <Text style={[styles.menuItemText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* desktop right-click context menu */}
      <ContextMenu {...ctxMenuProps} />
    </>
  );
}, (prev, next) =>
  prev.item.id === next.item.id &&
  prev.item.liked === next.item.liked &&
  prev.item.likeCount === next.item.likeCount &&
  prev.item.replyCount === next.item.replyCount &&
  prev.item.bookmarked === next.item.bookmarked &&
  prev.item.view_count === next.item.view_count &&
  prev.item.isFollowing === next.item.isFollowing &&
  prev.item.content === next.item.content &&
  prev.colWidth === next.colWidth &&
  prev.onDismiss === next.onDismiss &&
  prev.onMuteAuthor === next.onMuteAuthor
);

type FeedEntry =
  | { _kind: "post"; item: PostItem }
  | { _kind: "user_recs"; id: string; seed: number }
  | { _kind: "premium"; id: string; variant: "ai" | "creator" | "wallet" };

export default function DiscoverScreen() {
  "use no memo";
  const { horizontalScrollActive } = React.useContext(TabSwipeContext);
  const { colors, isDark } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { isDesktop } = useIsDesktop();
  const navigation = useNavigation();
  // Shorts now lives at /shorts (which redirects to /video/[id]). Any URL like
  // ?tab=shorts is forwarded there so existing links keep working.
  const [feedTab, setFeedTab] = useState<"for_you" | "following">(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get("tab");
      if (t === "following" || t === "for_you") return t as any;
    }
    return "for_you";
  });
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("tab") === "shorts") {
        router.replace("/shorts" as any); // replace intentional — not a user tap
      }
    }
  }, []);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreatePicker, setShowCreatePicker] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [followingEmpty, setFollowingEmpty] = useState(false);
  const [bgRefreshing, setBgRefreshing] = useState(false);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [commentPostAuthorId, setCommentPostAuthorId] = useState<string>("");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [suppressedAuthors, setSuppressedAuthors] = useState<Set<string>>(new Set());
  const [dismissTarget, setDismissTarget] = useState<PostItem | null>(null);
  const [dismissedUpsellVariants, setDismissedUpsellVariants] = useState<Set<string>>(new Set());

  type UndoEntry = { type: "post"; id: string } | { type: "author"; id: string };
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const snackAnim = useRef(new Animated.Value(0)).current;
  const snackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWeb = Platform.OS === "web";

  const showSnack = useCallback((count: number) => {
    if (snackTimerRef.current) clearTimeout(snackTimerRef.current);
    Animated.spring(snackAnim, { toValue: 1, useNativeDriver: !isWeb, tension: 140, friction: 14 }).start();
    snackTimerRef.current = setTimeout(() => {
      Animated.timing(snackAnim, { toValue: 0, duration: 260, useNativeDriver: !isWeb }).start();
    }, 4000);
  }, [snackAnim, isWeb]);

  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      if (last.type === "post") {
        setDismissedIds(d => { const n = new Set(d); n.delete(last.id); return n; });
      } else {
        setSuppressedAuthors(d => { const n = new Set(d); n.delete(last.id); return n; });
      }
      const next = prev.slice(0, -1);
      if (next.length === 0) {
        if (snackTimerRef.current) clearTimeout(snackTimerRef.current);
        Animated.timing(snackAnim, { toValue: 0, duration: 260, useNativeDriver: !isWeb }).start();
      }
      return next;
    });
  }, [snackAnim, isWeb]);
  const PAGE_SIZE = 30;
  const imgViewer = useImageViewer();

  const filteredPosts = useMemo(() => {
    const seen = new Set<string>();
    return posts.filter(p => {
      if (dismissedIds.has(p.id) || suppressedAuthors.has(p.author_id)) return false;
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [posts, dismissedIds, suppressedAuthors]);

  const PREMIUM_VARIANTS: Array<"ai" | "creator" | "wallet"> = ["ai", "creator", "wallet"];
  const augmentedFeed = useMemo<FeedEntry[]>(() => {
    const entries: FeedEntry[] = [];
    let recSeed = 0;
    let premiumIdx = 0;
    for (let i = 0; i < filteredPosts.length; i++) {
      const curr = filteredPosts[i];
      const next = filteredPosts[i + 1];
      const showThreadLine = !!(
        next &&
        next.author_id === curr.author_id &&
        new Date(curr.created_at).toDateString() === new Date(next.created_at).toDateString()
      );
      entries.push({ _kind: "post", item: showThreadLine ? { ...curr, showThreadLine: true } : curr });
      if ((i + 1) % 8 === 0) {
        entries.push({ _kind: "user_recs", id: `recs_${Math.floor(i / 8)}`, seed: recSeed++ });
      }
    }
    return entries;
  }, [filteredPosts, dismissedUpsellVariants]);

  const onDismissPost = useCallback((postId: string) => {
    const post = posts.find(p => p.id === postId);
    if (post) setDismissTarget(post);
  }, [posts]);

  const onDismissReason = useCallback((reason: DismissReason) => {
    if (!dismissTarget) return;
    const { id, author_id } = dismissTarget;
    setDismissTarget(null);
    if (reason === "mute_author") {
      setSuppressedAuthors(prev => new Set([...prev, author_id]));
      setUndoStack(prev => {
        const next = [...prev, { type: "author" as const, id: author_id }];
        showSnack(next.length);
        return next;
      });
    } else {
      setDismissedIds(prev => new Set([...prev, id]));
      setUndoStack(prev => {
        const next = [...prev, { type: "post" as const, id }];
        showSnack(next.length);
        return next;
      });
    }
  }, [dismissTarget, showSnack]);

  const onMuteAuthor = useCallback((authorId: string, _handle: string) => {
    setSuppressedAuthors(prev => new Set([...prev, authorId]));
    setUndoStack(prev => {
      const next = [...prev, { type: "author" as const, id: authorId }];
      showSnack(next.length);
      return next;
    });
  }, [showSnack]);

  const onOpenComments = useCallback((postId: string, authorId: string) => {
    setCommentPostId(postId);
    setCommentPostAuthorId(authorId);
  }, []);

  const onCommentReplyCountChange = useCallback((postId: string, delta: number) => {
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, replyCount: Math.max(0, p.replyCount + delta) } : p));
  }, []);

  const fabRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);

  const tabPostsCache = useRef<Record<"for_you" | "following", PostItem[]>>({ for_you: [], following: [] });
  const tabCacheTimestamp = useRef<Record<"for_you" | "following", number>>({ for_you: 0, following: 0 });
  const learnedWeightsRef = useRef<Record<string, number>>({});
  const postsRef = useRef<PostItem[]>([]);
  const feedTabRef = useRef<"for_you" | "following">("for_you");
  // Throwback pagination — tracks how far into the older-posts pool we've paged.
  // Reset to a random starting point on each fresh load so every session shows
  // different older content.
  const throwbackOffsetRef = useRef(0);
  const throwbackExhaustedRef = useRef(false);
  const midOffsetRef = useRef(0);
  const midExhaustedRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  const recordedViewsRef = useRef<Set<string>>(new Set());
  const pagerRef = useRef<any>(null);
  const discoverPillX = useRef(new Animated.Value(0)).current;
  const discoverPillW = useRef(new Animated.Value(0)).current;
  const discoverTabLayoutsRef = useRef<Record<number, { x: number; width: number }>>({});

  // ── Scroll-aware header ──────────────────────────────────────────────────
  // Uses Animated.event (not a plain onScroll function) so FlatList's internal
  // scroll tracking for onEndReached is never overridden.
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerOffset = useRef(new Animated.Value(0)).current;
  const scrollYAnim = useRef(new Animated.Value(0)).current;
  const prevScrollYRef = useRef(0);
  const headerVisibleRef = useRef(true);
  // useNativeDriver:false because headerOffset target changes dynamically
  // and web doesn't support native driver for transforms driven this way.
  const DRIVER = false;

  function revealHeader() {
    if (headerVisibleRef.current) return;
    headerVisibleRef.current = true;
    Animated.spring(headerOffset, {
      toValue: 0,
      useNativeDriver: DRIVER,
      tension: 220,
      friction: 28,
    }).start();
  }

  function hideHeader(height: number) {
    if (!headerVisibleRef.current || height === 0) return;
    headerVisibleRef.current = false;
    Animated.spring(headerOffset, {
      toValue: -height,
      useNativeDriver: DRIVER,
      tension: 220,
      friction: 28,
    }).start();
  }

  // Header is now permanently fixed — no scroll-hide behaviour.
  // Keep scrollYAnim listener only to track prevScrollY for future use.
  useEffect(() => {
    const id = scrollYAnim.addListener(({ value }) => {
      prevScrollYRef.current = value;
    });
    return () => scrollYAnim.removeListener(id);
  }, []);

  // The Animated.event passed to FlatList — compatible with onEndReached.
  const onFeedScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollYAnim } } }],
    { useNativeDriver: DRIVER }
  );
  // ────────────────────────────────────────────────────────────────────────
  const viewabilityConfig = useRef({ minimumViewTime: 800, itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {});
  onViewableItemsChangedRef.current = ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!user) return;
    for (const vi of viewableItems) {
      if (vi.item?._kind && vi.item._kind !== "post") continue;
      const postId = (vi.item?._kind === "post" ? vi.item.item?.id : vi.item?.id) as string | undefined;
      if (!postId || recordedViewsRef.current.has(postId)) continue;
      recordedViewsRef.current.add(postId);
      const postEntry = vi.item?._kind === "post" ? vi.item.item : vi.item;
      const authorId = postEntry?.author_id as string | undefined;
      const postType = postEntry?.post_type as string | undefined;
      supabase.from("post_views").insert({ post_id: postId, viewer_id: user.id }).then(() => {
        setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, view_count: (p.view_count || 0) + 1 } : p));
      });
      trackEvent("view_post", { post_id: postId, author_id: authorId ?? "", post_type: postType ?? "text" });
    }
  };
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    onViewableItemsChangedRef.current({ viewableItems });
  }).current;
  const [newPostAuthors, setNewPostAuthors] = useState<{ id: string; avatar_url: string | null; display_name: string }[]>([]);
  const newPostAuthorIdsRef = useRef<Set<string>>(new Set());
  const pendingPostsRef = useRef<PostItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  // Ref tracking the newest post's created_at currently shown in feed (for polling)
  const newestPostAtRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Timestamp of the last pill dismissal — poller won't show pill again until cooldown expires
  const pillDismissedAtRef = useRef<number>(0);
  const PILL_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
  // Floating "new posts" popup animation
  const popupSlide = useRef(new Animated.Value(-80)).current;
  const popupOpacity = useRef(new Animated.Value(0)).current;
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [popupSnapshot, setPopupSnapshot] = useState<{ id: string; avatar_url: string | null; display_name: string }[]>([]);

  useEffect(() => { postsRef.current = posts; }, [posts]);
  useEffect(() => { feedTabRef.current = feedTab; }, [feedTab]);

  // Keep newestPostAtRef pointed at the latest post currently rendered in the feed.
  // This is what the poller uses to ask "are there posts newer than this?"
  useEffect(() => {
    const first = posts.find(p => p.created_at);
    if (first) newestPostAtRef.current = first.created_at;
  }, [posts]);

  // Animate the floating "new posts" popup in when new authors arrive,
  // out when the list is cleared (refresh, tab switch, etc.).
  // useNativeDriver is only available on native — web uses JS-driven animation.
  const _useND = Platform.OS !== "web";
  useEffect(() => {
    if (newPostAuthors.length === 0) {
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
      Animated.parallel([
        Animated.timing(popupSlide, { toValue: -80, duration: 250, useNativeDriver: _useND }),
        Animated.timing(popupOpacity, { toValue: 0, duration: 250, useNativeDriver: _useND }),
      ]).start();
      return;
    }
    setPopupSnapshot(newPostAuthors);
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    Animated.parallel([
      Animated.spring(popupSlide, { toValue: 0, useNativeDriver: _useND, tension: 70, friction: 10 }),
      Animated.timing(popupOpacity, { toValue: 1, duration: 180, useNativeDriver: _useND }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPostAuthors.length]);

  // If the user logs out while on the Following tab, snap back to For You
  useEffect(() => {
    if (!user && feedTabRef.current === "following") {
      setFeedTab("for_you");
      pagerRef.current?.setPage(0);
    }
  }, [user]);

  // Sync the animated tab underline to the current feedTab on change.
  useEffect(() => {
    const idx = feedTab === "for_you" ? 0 : 1;
    const layout = discoverTabLayoutsRef.current[idx];
    if (!layout) return;
    Animated.spring(discoverPillX, { toValue: layout.x + 4, damping: 22, stiffness: 200, useNativeDriver: false }).start();
    Animated.spring(discoverPillW, { toValue: layout.width - 8, damping: 22, stiffness: 200, useNativeDriver: false }).start();
  }, [feedTab]);

  const handleDiscoverPageScroll = useCallback((e: any) => {
    const { position, offset } = e.nativeEvent;
    const fromLayout = discoverTabLayoutsRef.current[position];
    const toLayout = discoverTabLayoutsRef.current[position + 1];
    if (!fromLayout) return;
    if (!toLayout || offset === 0) {
      discoverPillX.setValue(fromLayout.x + 4);
      discoverPillW.setValue(fromLayout.width - 8);
      return;
    }
    discoverPillX.setValue(fromLayout.x + (toLayout.x - fromLayout.x) * offset + 4);
    discoverPillW.setValue(fromLayout.width + (toLayout.width - fromLayout.width) * offset - 8);
  }, [discoverPillX, discoverPillW]);

  const handleDiscoverPageSelected = useCallback((e: any) => {
    const idx = e.nativeEvent.position;
    setFeedTab(idx === 0 ? "for_you" : "following");
  }, []);

  useEffect(() => {
    getMergedLearnedWeights().then((w) => { learnedWeightsRef.current = w; });
  }, []);

  const fetchPosts = useCallback(async (offset: number, isRefresh: boolean, tab?: "for_you" | "following", background?: boolean) => {
    const activeTab = tab ?? feedTabRef.current;
    if (background) setBgRefreshing(true);
    try {
    if (!isOnline()) {
      if (!background) {
        // Serve from SQLite for initial load, refresh, AND load-more (offline infinite scroll).
        // For load-more (isRefresh=false, posts already in state) use cursor pagination.
        const cursor = !isRefresh && postsRef.current.length > 0
          ? postsRef.current[postsRef.current.length - 1]?.created_at
          : undefined;
        const localPosts = await getLocalFeedPosts(activeTab as LocalFeedTab, 30, cursor);
        if (localPosts.length > 0) {
          const toItem = (r: any) => ({
            ...r,
            likeCount: r.like_count,
            replyCount: r.reply_count,
            is_organization_verified: r.is_org_verified,
            profile: { display_name: r.author_name ?? "User", handle: r.author_handle ?? "user", avatar_url: r.author_avatar ?? null, bio: null },
            article_body: null,
            duration_seconds: null,
            isFollowing: activeTab === "following",
          }) as unknown as PostItem;
          if (isRefresh) {
            const p = localPosts.map(toItem);
            setPosts(p);
            tabPostsCache.current[activeTab] = p;
            tabCacheTimestamp.current[activeTab] = localPosts[0]?.stored_at ?? Date.now();
          } else {
            // Load-more: append without duplicates (same as online path)
            setPosts((prev) => {
              const ids = new Set(prev.map((p) => p.id));
              const fresh = localPosts.map(toItem).filter((p) => !ids.has(p.id));
              return fresh.length > 0 ? [...prev, ...fresh] : prev;
            });
          }
          // Signal more if we filled the page; SQLite will return fewer when exhausted
          setHasMore(localPosts.length >= 30);
        } else if (isRefresh) {
          // SQLite empty: fall back to AsyncStorage legacy cache (refresh only)
          const cached = await getCachedFeedTab(activeTab);
          if (cached?.posts?.length) {
            const p = cached.posts as PostItem[];
            setPosts(p);
            tabPostsCache.current[activeTab] = p;
            tabCacheTimestamp.current[activeTab] = cached.cachedAt;
          } else {
            const legacyCached = await getCachedMoments();
            if (legacyCached.length > 0) setPosts(legacyCached as PostItem[]);
          }
          setHasMore(false);
        } else {
          // Load-more reached end of SQLite — nothing more to show offline
          setHasMore(false);
        }
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
      return;
    }

    // --- Following tab ---
    if (activeTab === "following") {
      if (!user) { setLoading(false); setRefreshing(false); setLoadingMore(false); return; }

      const { data: followData } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id)
        .limit(1000);

      const followingIds = (followData || []).map((f: any) => f.following_id);

      if (followingIds.length === 0) {
        setFollowingEmpty(true);
        if (isRefresh) setPosts([]);
        setLoading(false); setRefreshing(false); setLoadingMore(false);
        return;
      }
      setFollowingEmpty(false);

      const followOlderThan = !isRefresh && postsRef.current.length > 0
        ? postsRef.current[postsRef.current.length - 1]?.created_at
        : null;
      // Delta sync: on refresh, only fetch posts NEWER than newest stored — never re-download existing posts
      const followNewerThan = isRefresh ? await getNewestFeedPostDate("following") : null;
      const followBaseQ = supabase
        .from("posts")
        .select(`
          id, author_id, content, image_url, created_at, view_count, like_count, visibility, language_code,
          post_type, article_title, article_body, video_url,
          profiles!posts_author_id_fkey(display_name, handle, avatar_url, bio, is_verified, is_organization_verified),
          post_images(image_url, display_order),
          video_assets!posts_video_asset_id_fkey(duration_seconds)
        `)
        .in("author_id", followingIds)
        .in("visibility", ["public", "followers"])
        .order("created_at", { ascending: false });
      const { data } = await (followOlderThan
        ? followBaseQ.lt("created_at", followOlderThan).limit(PAGE_SIZE)
        : followNewerThan
          ? followBaseQ.gt("created_at", followNewerThan).limit(PAGE_SIZE)
          : followBaseQ.limit(PAGE_SIZE));

      if (data) {
        if (data.length < PAGE_SIZE) setHasMore(false); else setHasMore(true);

        const postIds = data.map((p: any) => p.id);
        const _followLimit = PAGE_SIZE * 3;
        const [{ data: myLikes }, { data: replyCounts }, { data: myBookmarks }] = await Promise.all([
          postIds.length > 0 && user ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id).limit(_followLimit) : { data: [] },
          postIds.length > 0 ? supabase.from("post_replies").select("post_id").in("post_id", postIds).limit(_followLimit) : { data: [] },
          postIds.length > 0 && user ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id).limit(_followLimit) : { data: [] },
        ]);

        const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
        const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id));
        const replyMap: Record<string, number> = {};
        for (const r of (replyCounts || [])) { replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1; }

        const mapped: PostItem[] = data.map((p: any) => ({
          id: p.id, author_id: p.author_id, content: p.content || "",
          image_url: p.image_url,
          images: (p.post_images || []).sort((a: any, b: any) => a.display_order - b.display_order).map((i: any) => i.image_url),
          created_at: p.created_at, view_count: p.view_count || 0,
          visibility: p.visibility || "public",
          is_verified: p.profiles?.is_verified || false,
          is_organization_verified: p.profiles?.is_organization_verified || false,
          profile: { display_name: p.profiles?.display_name || "User", handle: p.profiles?.handle || "user", avatar_url: p.profiles?.avatar_url || null, bio: p.profiles?.bio || null },
          liked: myLikeSet.has(p.id), likeCount: p.like_count || 0, replyCount: replyMap[p.id] || 0, score: 0, bookmarked: myBookmarkSet.has(p.id),
          post_type: p.post_type || "post", article_title: p.article_title || null, article_body: p.article_body || null, video_url: p.video_url || null,
          duration_seconds: (() => { const arr = Array.isArray(p.video_assets) ? p.video_assets : (p.video_assets ? [p.video_assets] : []); return arr.length > 0 ? (arr[0].duration_seconds ?? null) : null; })(),
          isFollowing: true,
          language_code: p.language_code || null,
        }));

        // Seed handle→id cache — makes mention-taps to these authors instant
        for (const p of data) {
          if (p.author_id && p.profiles?.handle) setHandleId(p.profiles.handle, p.author_id);
        }

        if (isRefresh) {
          tabPostsCache.current[activeTab] = mapped;
          tabCacheTimestamp.current[activeTab] = Date.now();
          cacheFeedTab(activeTab, mapped);
          saveFeedPosts(mapped, activeTab as LocalFeedTab).catch(() => {});
          // Delta sync: prepend new posts to existing local posts (don't wipe them)
          if (background) {
            const prevIds = new Set(postsRef.current.map((p) => p.id));
            const brandNew = mapped.filter((p) => !prevIds.has(p.id));
            if (brandNew.length > 0) {
              pendingPostsRef.current = [...brandNew, ...pendingPostsRef.current.filter((p) => !prevIds.has(p.id))];
              setNewPostAuthors((prev) => {
                if (prev.length > 0) return prev;
                const seen = new Set<string>();
                const authors: { id: string; avatar_url: string | null; display_name: string }[] = [];
                for (const p of brandNew) {
                  if (!p.author_id || seen.has(p.author_id)) continue;
                  seen.add(p.author_id);
                  authors.push({ id: p.author_id, avatar_url: p.profile?.avatar_url ?? null, display_name: p.profile?.display_name || "User" });
                  if (authors.length >= 5) break;
                }
                return authors;
              });
            }
          } else if (followNewerThan && mapped.length > 0) {
            setPosts((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              const brandNew = mapped.filter((p) => !existingIds.has(p.id));
              return brandNew.length > 0 ? [...brandNew, ...prev] : prev;
            });
          } else if (!followNewerThan) {
            setPosts(mapped);
          }
        } else {
          setPosts((prev) => { const ids = new Set(prev.map((p) => p.id)); return [...prev, ...mapped.filter((i) => !ids.has(i.id))]; });
        }
      }
      if (!background) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
      return;
    }

    // --- For You tab ---
    const userInterests: string[] = profile?.interests || [];
    const userCountry: string = profile?.country || "";

    // Three-stream feed — each refresh delivers a unique mix of time ranges:
    //  1. RECENT    — newest posts (last 4 days)
    //  2. MID       — posts 4–30 days old, random window per session
    //  3. THROWBACK — posts older than 30 days, random window per session
    // Streams are shuffled before scoring so every pull-to-refresh feels different.
    const RECENT_SIZE = 12;
    const MID_SIZE = 10;
    const THROWBACK_SIZE = 8;

    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const fyOlderThan =
      !isRefresh && postsRef.current.length > 0
        ? postsRef.current[postsRef.current.length - 1]?.created_at
        : null;

    const fySelect = `
      id, author_id, content, image_url, created_at, view_count, like_count, visibility, language_code,
      post_type, article_title, article_body, video_url,
      profiles!posts_author_id_fkey(display_name, handle, avatar_url, bio, is_verified, is_organization_verified, country, interests, hide_posts_non_followers),
      post_images(image_url, display_order),
      video_assets!posts_video_asset_id_fkey(duration_seconds)
    `;

    // Delta sync: on refresh, only fetch posts NEWER than newest stored
    const fyNewerThan = isRefresh ? await getNewestFeedPostDate("for_you") : null;

    // On refresh, reset all stream offsets to new random positions so every
    // session surfaces a completely different combination of content.
    if (isRefresh) {
      throwbackOffsetRef.current = Math.floor(Math.random() * 120);
      throwbackExhaustedRef.current = false;
      midOffsetRef.current = Math.floor(Math.random() * 80);
      midExhaustedRef.current = false;
    }

    // ── Stream 1: Recent posts (last 4 days) ──
    let fyQ: any = supabase.from("posts").select(fySelect).eq("visibility", "public")
      .order("created_at", { ascending: false });
    if (fyOlderThan) {
      fyQ = fyQ.lt("created_at", fyOlderThan);
    } else if (fyNewerThan) {
      fyQ = fyQ.gt("created_at", fyNewerThan);
    } else {
      fyQ = fyQ.gte("created_at", fourDaysAgo);
    }
    fyQ = fyQ.limit(RECENT_SIZE);

    // ── Stream 2: Mid posts (4–30 days old, random window) ──
    const mdOffset = midOffsetRef.current;
    const midPromise = midExhaustedRef.current || fyOlderThan
      ? Promise.resolve({ data: [] as any[] })
      : supabase.from("posts")
          .select(fySelect)
          .eq("visibility", "public")
          .lt("created_at", fourDaysAgo)
          .gte("created_at", thirtyDaysAgo)
          .order("view_count", { ascending: false })
          .range(mdOffset, mdOffset + MID_SIZE - 1)
          .then((res) => {
            if (!res.data || res.data.length === 0) {
              midExhaustedRef.current = true;
            } else {
              midOffsetRef.current += MID_SIZE;
            }
            return res;
          });

    // ── Stream 3: Throwback posts (older than 30 days, high engagement) ──
    const tbOffset = throwbackOffsetRef.current;
    const throwbackPromise = throwbackExhaustedRef.current || fyOlderThan
      ? Promise.resolve({ data: [] as any[] })
      : supabase.from("posts")
          .select(fySelect)
          .eq("visibility", "public")
          .lt("created_at", thirtyDaysAgo)
          .order("view_count", { ascending: false })
          .range(tbOffset, tbOffset + THROWBACK_SIZE - 1)
          .then((res) => {
            if (!res.data || res.data.length === 0) {
              throwbackExhaustedRef.current = true;
            } else {
              throwbackOffsetRef.current += THROWBACK_SIZE;
            }
            return res;
          });

    const [{ data: recentData }, { data: midData }, { data: throwbackData }] = await Promise.all([fyQ, midPromise, throwbackPromise]);

    // Merge all streams, deduplicate, then Fisher-Yates shuffle so the scoring
    // algorithm picks the best content from a randomly ordered pool — making
    // every refresh feel genuinely different rather than always newest-first.
    const existingIds = new Set((postsRef.current || []).map((p) => p.id));
    const seenInBatch = new Set<string>();
    const allRaw: any[] = [];
    for (const item of [...(recentData || []), ...(midData || []), ...(throwbackData || [])]) {
      if (!seenInBatch.has(item.id) && !existingIds.has(item.id)) {
        seenInBatch.add(item.id);
        allRaw.push(item);
      }
    }
    // Fisher-Yates shuffle — seeded by Math.random() so each refresh is unique
    for (let i = allRaw.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allRaw[i], allRaw[j]] = [allRaw[j], allRaw[i]];
    }
    const data = allRaw;
    // Seed handle→id cache — makes mention-taps to these authors instant
    for (const p of allRaw) {
      if (p.author_id && p.profiles?.handle) setHandleId(p.profiles.handle, p.author_id);
    }

    if (data) {
      // hasMore if any stream still has content to page through
      const recentFull = (recentData || []).length >= RECENT_SIZE;
      setHasMore(recentFull || !midExhaustedRef.current || !throwbackExhaustedRef.current);

      const postIds = data.map((p: any) => p.id);
      const authorIds = [...new Set(data.map((p: any) => p.author_id))];

      const _fyLimit = PAGE_SIZE * 3;
      const [
        { data: myLikes },
        { data: replyCounts },
        { data: myAuthorLikes },
        { data: followingData },
        { data: myReplies },
        { data: myBookmarks },
      ] = await Promise.all([
        postIds.length > 0 && user
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id).limit(_fyLimit)
          : { data: [] },
        postIds.length > 0
          ? supabase.from("post_replies").select("post_id").in("post_id", postIds).limit(_fyLimit)
          : { data: [] },
        authorIds.length > 0 && user
          ? supabase.from("post_acknowledgments")
              .select("post_id, posts!inner(author_id)")
              .eq("user_id", user.id)
              .in("posts.author_id", authorIds)
              .limit(100)
          : { data: [] },
        authorIds.length > 0 && user
          ? supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", authorIds)
          : { data: [] },
        authorIds.length > 0 && user
          ? supabase.from("post_replies")
              .select("post_id, posts!inner(author_id)")
              .eq("author_id", user.id)
              .in("posts.author_id", authorIds)
              .limit(100)
          : { data: [] },
        postIds.length > 0 && user
          ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id).limit(_fyLimit)
          : { data: [] },
      ]);

      const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
      const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id));

      const replyMap: Record<string, number> = {};
      for (const r of (replyCounts || [])) { replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1; }

      const followingSet = new Set((followingData || []).map((f: any) => f.following_id));

      // Enforce hide_posts_non_followers: remove posts from authors who restrict
      // visibility to their followers only, when the current viewer doesn't follow them.
      const visibleData = data.filter((p: any) => {
        if (p.profiles?.hide_posts_non_followers && p.author_id !== user?.id && !followingSet.has(p.author_id)) {
          return false;
        }
        return true;
      });

      const authorInteractionMap: Record<string, number> = {};
      for (const al of (myAuthorLikes || [])) {
        const authorId = (al as any).posts?.author_id;
        if (authorId) authorInteractionMap[authorId] = (authorInteractionMap[authorId] || 0) + 1;
      }
      for (const ar of (myReplies || [])) {
        const authorId = (ar as any).posts?.author_id;
        if (authorId) authorInteractionMap[authorId] = (authorInteractionMap[authorId] || 0) + 2;
      }

      const authorPostCount: Record<string, number> = {};
      for (const p of visibleData) {
        const aid = (p as any).author_id;
        authorPostCount[aid] = (authorPostCount[aid] || 0) + 1;
      }

      // Load seen post IDs in parallel with scoring (already have data at this point)
      const seenPostIds = await getSeenPostIds();

      const scored = visibleData.map((p: any) => {
        const likeCount = p.like_count || 0;
        const replyCount = replyMap[p.id] || 0;
        const hasImages = (p.post_images?.length > 0) || !!p.image_url;
        const content = p.content || "";
        const authorCountry = p.profiles?.country || "";
        const postType = p.post_type || "post";
        const isSeen = seenPostIds.has(p.id);

        const interestMatches = matchInterestsWeighted(content, userInterests, learnedWeightsRef.current);

        const signals: FeedSignals = {
          likeCount,
          replyCount,
          viewCount: p.view_count || 0,
          createdAt: p.created_at,
          interestMatches,
          isFollowing: followingSet.has(p.author_id),
          authorInteractionCount: authorInteractionMap[p.author_id] || 0,
          isVerified: p.profiles?.is_verified || false,
          isOrgVerified: p.profiles?.is_organization_verified || false,
          hasImages,
          sameCountry: !!userCountry && !!authorCountry && userCountry === authorCountry,
          authorPostCountInFeed: authorPostCount[p.author_id] || 1,
          contentLength: content.length,
          postType,
          isSeen,
        };

        const score = computeFeedScore(signals);

        return {
          id: p.id,
          author_id: p.author_id,
          content,
          image_url: p.image_url,
          images: (p.post_images || [])
            .sort((a: any, b: any) => a.display_order - b.display_order)
            .map((i: any) => i.image_url),
          created_at: p.created_at,
          view_count: p.view_count || 0,
          visibility: p.visibility || "public",
          is_verified: p.profiles?.is_verified || false,
          is_organization_verified: p.profiles?.is_organization_verified || false,
          profile: {
            display_name: p.profiles?.display_name || "User",
            handle: p.profiles?.handle || "user",
            avatar_url: p.profiles?.avatar_url || null,
            bio: p.profiles?.bio || null,
          },
          liked: myLikeSet.has(p.id),
          likeCount,
          replyCount,
          score,
          bookmarked: myBookmarkSet.has(p.id),
          post_type: postType,
          article_title: p.article_title || null,
          article_body: p.article_body || null,
          video_url: p.video_url || null,
          duration_seconds: (() => { const arr = Array.isArray(p.video_assets) ? p.video_assets : (p.video_assets ? [p.video_assets] : []); return arr.length > 0 ? (arr[0].duration_seconds ?? null) : null; })(),
          isFollowing: followingSet.has(p.author_id),
          language_code: p.language_code || null,
        };
      });

      // Weighted random sampling from top candidates — quality still wins but
      // lower-ranked posts can surface, making every refresh genuinely different.
      const topPool = [...scored].sort((a, b) => b.score - a.score).slice(0, 60);
      const sampled = weightedSample(topPool, Math.min(topPool.length, 30));

      // Diversify: no same-author back-to-back, no 3 same post-types in a row
      const diversified = diversifyFeed(sampled.map((p) => ({ ...p, postType: p.post_type })));

      // Mark these posts as seen so they get demoted on the next refresh
      markPostsSeen(diversified.map((p) => p.id)).catch(() => {});

      // Fetch org page posts and splice into feed (1 per every ~5 regular posts)
      let orgPostItems: PostItem[] = [];
      try {
        const orgCursor = fyOlderThan;
        let orgQ: any = supabase
          .from("organization_page_posts")
          .select("id, content, image_url, created_at, author_id, likes, page_id, organization_pages!inner(id, slug, name, org_type, logo_url, is_verified)")
          .order("created_at", { ascending: false })
          .limit(6);
        if (orgCursor) orgQ = orgQ.lt("created_at", orgCursor);
        const { data: orgData } = await orgQ;
        if (orgData && orgData.length > 0) {
          orgPostItems = orgData.map((op: any) => {
            const pg = op.organization_pages;
            return {
              id: `org_${op.id}`,
              author_id: op.author_id || pg?.id || "",
              content: op.content || "",
              image_url: op.image_url || null,
              images: op.image_url ? [op.image_url] : [],
              created_at: op.created_at,
              view_count: 0,
              visibility: "public",
              is_verified: false,
              is_organization_verified: pg?.is_verified || false,
              profile: {
                display_name: pg?.name || "Organization",
                handle: pg?.slug || "",
                avatar_url: pg?.logo_url || null,
              },
              liked: false,
              likeCount: op.likes || 0,
              replyCount: 0,
              score: 50,
              bookmarked: false,
              post_type: "post",
              article_title: null,
              article_body: null,
              video_url: null,
              duration_seconds: null,
              isFollowing: false,
              org_page_id: pg?.id,
              org_slug: pg?.slug,
              org_type: pg?.org_type,
              org_verified: pg?.is_verified,
            } as PostItem;
          });
        }
      } catch (_) {}

      // Interleave: insert 1 org post for every 5 regular posts
      const merged: PostItem[] = [];
      let orgIdx = 0;
      for (let i = 0; i < diversified.length; i++) {
        merged.push(diversified[i] as PostItem);
        if ((i + 1) % 5 === 0 && orgIdx < orgPostItems.length) {
          merged.push(orgPostItems[orgIdx++]);
        }
      }
      // Append any remaining org posts at end
      while (orgIdx < orgPostItems.length) {
        merged.push(orgPostItems[orgIdx++]);
      }

      if (isRefresh) {
        tabPostsCache.current[activeTab] = merged;
        tabCacheTimestamp.current[activeTab] = Date.now();
        cacheFeedTab(activeTab, merged);
        cacheMoments(merged);
        saveFeedPosts(merged, activeTab as LocalFeedTab).catch(() => {});
        if (background) {
          const prevIds = new Set(postsRef.current.map((p) => p.id));
          const brandNew = merged.filter((p) => !prevIds.has(p.id));
          if (brandNew.length > 0) {
            pendingPostsRef.current = [...brandNew, ...pendingPostsRef.current.filter((p) => !prevIds.has(p.id))];
            setNewPostAuthors((prev) => {
              if (prev.length > 0) return prev;
              const seen = new Set<string>();
              const authors: { id: string; avatar_url: string | null; display_name: string }[] = [];
              for (const p of brandNew) {
                if (!p.author_id || seen.has(p.author_id)) continue;
                seen.add(p.author_id);
                authors.push({ id: p.author_id, avatar_url: p.profile?.avatar_url ?? null, display_name: p.profile?.display_name || "User" });
                if (authors.length >= 5) break;
              }
              return authors;
            });
          }
        } else if (fyNewerThan && merged.length > 0) {
          setPosts((prev) => {
            const prevIds = new Set(prev.map((p) => p.id));
            const brandNew = merged.filter((p) => !prevIds.has(p.id));
            return brandNew.length > 0 ? [...brandNew, ...prev] : prev;
          });
        } else if (!fyNewerThan) {
          setPosts(merged);
        }
      } else {
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newItems = merged.filter((i) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
      }
    }
    } catch (err) {
      console.error("[Discover] fetchPosts error:", err);
    } finally {
      if (!background) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
      setBgRefreshing(false);
    }
  }, [user, profile]);

  const loadPosts = useCallback(
    (tab?: "for_you" | "following", background?: boolean) => fetchPosts(0, true, tab, background),
    [fetchPosts]
  );

  const loadMoreInFlight = useRef(false);
  const loadMore = useCallback(() => {
    if (loadMoreInFlight.current || !hasMore || postsRef.current.length === 0) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    fetchPosts(0, false, feedTabRef.current).finally(() => {
      loadMoreInFlight.current = false;
    });
  }, [fetchPosts, hasMore]);

  const loadPostsRef = useRef(loadPosts);
  useEffect(() => { loadPostsRef.current = loadPosts; }, [loadPosts]);

  // Tab switch — show cached posts immediately, background-refresh if stale
  useEffect(() => {
    const dataTab = feedTab;
    const STALE_MS = 3 * 60 * 1000;
    const cached = tabPostsCache.current[dataTab];
    const cacheAge = Date.now() - tabCacheTimestamp.current[dataTab];

    // Always reveal the header when switching tabs
    revealHeader();
    prevScrollYRef.current = 0;

    setHasMore(true);
    setFollowingEmpty(false);
    // Tab switch: clear pill without starting the cooldown
    setNewPostAuthors([]);
    newPostAuthorIdsRef.current.clear();
    pendingPostsRef.current = [];
    setPendingCount(0);
    pillDismissedAtRef.current = 0;

    if (cached.length > 0) {
      setPosts(cached);
      setLoading(false);
      if (cacheAge >= STALE_MS) {
        loadPostsRef.current(dataTab, true);
      }
    } else {
      setPosts([]);
      setLoading(true);
      loadPostsRef.current(dataTab, false);
    }
  }, [feedTab]);

  // Mount: preload both tabs from SQLite first (instant), then AsyncStorage fallback,
  // then background-refresh For You from the network.
  useEffect(() => {
    (async () => {
      const [fyLocal, flLocal] = await Promise.all([
        getLocalFeedPosts("for_you", 30),
        getLocalFeedPosts("following", 30),
      ]);
      if (fyLocal.length > 0) {
        const toItem = (r: any) => ({ ...r, likeCount: r.like_count, replyCount: r.reply_count, is_organization_verified: r.is_org_verified, profile: { display_name: r.author_name ?? "User", handle: r.author_handle ?? "user", avatar_url: r.author_avatar ?? null, bio: null }, article_body: null, duration_seconds: null, isFollowing: false }) as unknown as PostItem;
        tabPostsCache.current.for_you = fyLocal.map(toItem);
        tabCacheTimestamp.current.for_you = fyLocal[0]?.stored_at ?? Date.now();
        if (feedTabRef.current === "for_you") { setPosts(tabPostsCache.current.for_you); setLoading(false); }
      }
      if (flLocal.length > 0) {
        const toItem = (r: any) => ({ ...r, likeCount: r.like_count, replyCount: r.reply_count, is_organization_verified: r.is_org_verified, profile: { display_name: r.author_name ?? "User", handle: r.author_handle ?? "user", avatar_url: r.author_avatar ?? null, bio: null }, article_body: null, duration_seconds: null, isFollowing: true }) as unknown as PostItem;
        tabPostsCache.current.following = flLocal.map(toItem);
        tabCacheTimestamp.current.following = flLocal[0]?.stored_at ?? Date.now();
        if (feedTabRef.current === "following") { setPosts(tabPostsCache.current.following); setLoading(false); }
      }
      // Only fall through to AsyncStorage if SQLite had nothing
      const [fyCache, flCache] = await Promise.all([
        fyLocal.length > 0 ? Promise.resolve(null) : getCachedFeedTab("for_you"),
        flLocal.length > 0 ? Promise.resolve(null) : getCachedFeedTab("following"),
      ]);
      if (fyCache?.posts?.length) {
        const p = fyCache.posts as PostItem[];
        tabPostsCache.current.for_you = p;
        tabCacheTimestamp.current.for_you = fyCache.cachedAt;
        if (feedTabRef.current === "for_you") {
          setPosts(p);
          setLoading(false);
        }
      }
      if (flCache?.posts?.length) {
        tabPostsCache.current.following = flCache.posts as PostItem[];
        tabCacheTimestamp.current.following = flCache.cachedAt;
      }
      const hasFyCache = (fyCache?.posts?.length ?? 0) > 0;
      if (isOnline()) {
        loadPostsRef.current("for_you", hasFyCache);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth/profile change — refresh active tab in background if posts already showing.
  // Uses a stable key (userId + interests) so this only fires when auth identity or
  // interests actually change, not on every AuthContext re-render.
  const _authKeyRef = useRef("");
  useEffect(() => {
    const key = `${user?.id ?? ""}:${JSON.stringify(profile?.interests ?? [])}`;
    if (key === _authKeyRef.current) return;
    _authKeyRef.current = key;
    if (!user?.id && !profile) return;
    const hasPosts = tabPostsCache.current[feedTabRef.current].length > 0;
    loadPostsRef.current(feedTabRef.current, hasPosts);
  }, [user, profile]);

  // Auto-refresh on reconnect
  useEffect(() => {
    const unsub = onConnectivityChange((online) => {
      if (online) {
        const hasPosts = tabPostsCache.current[feedTabRef.current].length > 0;
        loadPostsRef.current(feedTabRef.current, hasPosts);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("discover-posts-realtime")
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, (payload: any) => {
        const deletedId = payload.old?.id;
        if (deletedId) {
          setPosts((prev) => prev.filter((p) => p.id !== deletedId));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_acknowledgments" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        const evType = payload.eventType;
        if (evType !== "INSERT" && evType !== "DELETE") return;
        const isOwnAction = (evType === "INSERT" && payload.new?.user_id === user?.id) || (evType === "DELETE" && payload.old?.user_id === user?.id);
        if (isOwnAction) return;
        const delta = evType === "INSERT" ? 1 : -1;
        setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, likeCount: Math.max(0, p.likeCount + delta) } : p));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_replies" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        const evType = payload.eventType;
        const delta = evType === "INSERT" ? 1 : evType === "DELETE" ? -1 : 0;
        if (delta !== 0) {
          setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, replyCount: Math.max(0, p.replyCount + delta) } : p));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "follows" }, (payload: any) => {
        const followerId = payload.new?.follower_id;
        const followingId = payload.new?.following_id;
        if (followerId === user?.id && followingId) {
          setPosts((prev) => prev.map((p) => p.author_id === followingId ? { ...p, isFollowing: true } : p));
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "follows" }, (payload: any) => {
        const followerId = payload.old?.follower_id;
        const followingId = payload.old?.following_id;
        if (followerId === user?.id && followingId) {
          setPosts((prev) => prev.map((p) => p.author_id === followingId ? { ...p, isFollowing: false } : p));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ── Twitter/X-style background poller ──────────────────────────────────────
  // Every 60 s the poller silently queries for posts newer than the newest one
  // currently visible. If any are found they go into pendingPostsRef and the
  // floating pill appears. The feed list itself is NOT touched until the user
  // taps the pill — so the current reading position never shifts unexpectedly.
  useEffect(() => {
    const POLL_INTERVAL_MS = 60_000;

    const poll = async () => {
      if (!isOnline()) return;
      const newestAt = newestPostAtRef.current;
      if (!newestAt) return;
      // Don't stack up if a pill is already visible
      if (pendingPostsRef.current.length > 0) return;
      // Respect the cooldown after pill dismissal
      if (Date.now() - pillDismissedAtRef.current < PILL_COOLDOWN_MS) return;

      const activeTab = feedTabRef.current;
      const fySelect = `
        id, author_id, content, image_url, created_at, view_count, like_count, visibility,
        post_type, article_title, article_body, video_url,
        profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified),
        post_images(image_url, display_order),
        video_assets!posts_video_asset_id_fkey(duration_seconds)
      `;

      let newPostsData: any[] = [];

      if (activeTab === "for_you") {
        const { data } = await supabase
          .from("posts")
          .select(fySelect)
          .eq("visibility", "public")
          .gt("created_at", newestAt)
          .neq("author_id", user?.id ?? "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
          .order("created_at", { ascending: false })
          .limit(20);
        newPostsData = data ?? [];
      } else if (activeTab === "following" && user?.id) {
        const { data: followData } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id)
          .limit(500);
        const followingIds = (followData ?? []).map((f: any) => f.following_id);
        if (followingIds.length > 0) {
          const { data } = await supabase
            .from("posts")
            .select(fySelect)
            .in("author_id", followingIds)
            .in("visibility", ["public", "followers"])
            .gt("created_at", newestAt)
            .order("created_at", { ascending: false })
            .limit(20);
          newPostsData = data ?? [];
        }
      }

      if (!newPostsData.length) return;

      // Map to PostItem
      const mappedPosts: PostItem[] = newPostsData.map((p: any) => ({
        id: p.id,
        author_id: p.author_id,
        content: p.content ?? "",
        image_url: p.image_url,
        images: (p.post_images ?? [])
          .sort((a: any, b: any) => a.display_order - b.display_order)
          .map((i: any) => i.image_url),
        created_at: p.created_at,
        view_count: p.view_count ?? 0,
        visibility: p.visibility ?? "public",
        is_verified: p.profiles?.is_verified ?? false,
        is_organization_verified: p.profiles?.is_organization_verified ?? false,
        profile: {
          display_name: p.profiles?.display_name || "User",
          handle: p.profiles?.handle || "user",
          avatar_url: p.profiles?.avatar_url || null,
          bio: null,
        },
        liked: false,
        likeCount: p.like_count ?? 0,
        replyCount: 0,
        score: 0,
        bookmarked: false,
        post_type: p.post_type ?? "text",
        article_title: p.article_title ?? null,
        article_body: p.article_body ?? null,
        video_url: p.video_url ?? null,
        duration_seconds: (() => {
          const arr = Array.isArray(p.video_assets) ? p.video_assets : (p.video_assets ? [p.video_assets] : []);
          return arr.length > 0 ? (arr[0].duration_seconds ?? null) : null;
        })(),
        isFollowing: activeTab === "following",
      }));

      // Deduplicate against current feed and existing pending buffer
      const existingIds = new Set([
        ...postsRef.current.map((p) => p.id),
        ...pendingPostsRef.current.map((p) => p.id),
      ]);
      const trulyNew = mappedPosts.filter((p) => !existingIds.has(p.id));
      if (!trulyNew.length) return;

      // Buffer the new posts — they'll be prepended when the user taps the pill
      pendingPostsRef.current = [...trulyNew, ...pendingPostsRef.current];
      setPendingCount(pendingPostsRef.current.length);

      // Collect unique author profiles for the pill avatars (max 5)
      const seen = new Set(newPostAuthorIdsRef.current);
      const newAuthors: { id: string; avatar_url: string | null; display_name: string }[] = [];
      for (const post of trulyNew) {
        if (!seen.has(post.author_id)) {
          seen.add(post.author_id);
          newPostAuthorIdsRef.current.add(post.author_id);
          newAuthors.push({
            id: post.author_id,
            avatar_url: post.profile.avatar_url,
            display_name: post.profile.display_name,
          });
        }
      }
      if (newAuthors.length > 0) {
        setNewPostAuthors((prev) => {
          const combined = [...prev, ...newAuthors.filter((a) => !prev.some((p) => p.id === a.id))];
          return combined.slice(0, 5);
        });
      }
    };

    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  // Re-run when user changes so we get the right `user?.id` closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  // ─────────────────────────────────────────────────────────────────────────────

  function _resetPill(recordDismissal = true) {
    setNewPostAuthors([]);
    newPostAuthorIdsRef.current.clear();
    pendingPostsRef.current = [];
    setPendingCount(0);
    if (recordDismissal) pillDismissedAtRef.current = Date.now();
  }

  function handleShowNewPosts() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const pending = [...pendingPostsRef.current];
    // Dismiss pill and start cooldown — no feed refresh triggered here
    _resetPill(true);

    if (pending.length > 0) {
      // Silently prepend buffered posts — list position doesn't move until
      // the smooth animated scroll fires. Zero visual shake.
      setPosts((prev) => {
        const existIds = new Set(prev.map((p) => p.id));
        const fresh = pending.filter((p) => !existIds.has(p.id));
        return fresh.length > 0 ? [...fresh, ...prev] : prev;
      });
      // Smooth scroll to top — deferred one frame so the prepend settles first
      requestAnimationFrame(() => {
        setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 80);
      });
    } else {
      // Nothing buffered — just scroll to top, poller will surface new posts later
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }

  const toggleBookmark = useCallback(async (postId: string) => {
    if (!user) { setShowSignInPrompt(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const post = postsRef.current.find((p) => p.id === postId);
    if (!post) return;
    if (post.bookmarked) {
      await supabase.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", user.id);
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, bookmarked: false } : p));
    } else {
      await supabase.from("post_bookmarks").upsert({ post_id: postId, user_id: user.id }, { onConflict: "post_id,user_id" });
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, bookmarked: true } : p));
      const content = [post.content, post.article_title].filter(Boolean).join(" ");
      recordInteraction(content, "bookmark").then(async () => {
        learnedWeightsRef.current = await getMergedLearnedWeights();
      });
      trackEvent("bookmark_post", { post_id: postId, author_id: post.author_id });
    }
  }, [user, postsRef]);

  const toggleLike = useCallback(async (postId: string) => {
    if (!user) { setShowSignInPrompt(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const post = postsRef.current.find((p) => p.id === postId);
    if (!post) return;

    // Org page posts use a different table — update `likes` int column directly
    if (postId.startsWith("org_")) {
      const realId = postId.slice(4);
      if (post.liked) {
        // Optimistic update
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p)
        );
        const { error } = await supabase
          .from("organization_page_posts")
          .update({ likes: Math.max(0, post.likeCount - 1) })
          .eq("id", realId);
        if (error) {
          // Revert on failure
          setPosts((prev) =>
            prev.map((p) => p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p)
          );
        }
      } else {
        // Optimistic update
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p)
        );
        const { error } = await supabase
          .from("organization_page_posts")
          .update({ likes: post.likeCount + 1 })
          .eq("id", realId);
        if (error) {
          // Revert on failure
          setPosts((prev) =>
            prev.map((p) => p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p)
          );
        }
      }
      return;
    }

    if (post.liked) {
      // Optimistic update — flip instantly
      setPosts((prev) =>
        prev.map((p) => p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p)
      );
      const { error } = await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
      if (error) {
        // Revert on failure
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p)
        );
      }
    } else {
      // Optimistic update — flip instantly
      setPosts((prev) =>
        prev.map((p) => p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p)
      );
      const content = [post.content, post.article_title].filter(Boolean).join(" ");
      recordInteraction(content, "like").then(async () => {
        learnedWeightsRef.current = await getMergedLearnedWeights();
      });
      trackEvent("like_post", { post_id: postId, author_id: post.author_id });
      if (post.author_id !== user.id) {
        notifyPostLike({
          postAuthorId: post.author_id,
          likerName: profile?.display_name || "Someone",
          likerUserId: user.id,
          postId,
        });
      }
      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_liked"); } catch (_) {}
      const { error } = await supabase.from("post_acknowledgments").upsert({ post_id: postId, user_id: user.id }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
      if (error) {
        // Revert on failure
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p)
        );
      }
    }
  }, [user, profile, postsRef]);

  const toggleFollow = useCallback(async (authorId: string) => {
    if (!user) { setShowSignInPrompt(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await supabase.from("follows").upsert({ follower_id: user.id, following_id: authorId }, { onConflict: "follower_id,following_id" });
    if (!error) {
      setPosts((prev) => prev.map((p) => p.author_id === authorId ? { ...p, isFollowing: true } : p));
    }
  }, [user]);

  const onRequireAuth = useCallback(() => setShowSignInPrompt(true), []);

  // Re-sync isFollowing for every post whenever Discover comes back into focus
  // (handles the "follow from profile page → back to feed" stale-state case).
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id)
        .then(({ data }) => {
          if (!data) return;
          const followed = new Set(data.map((f: any) => f.following_id as string));
          setPosts((prev) =>
            prev.map((p) =>
              p.isFollowing !== followed.has(p.author_id)
                ? { ...p, isFollowing: followed.has(p.author_id) }
                : p
            )
          );
        });
    }, [user?.id])
  );

  // The dedicated Shorts experience now lives at /shorts (which redirects to
  // /video/[id]), so there is only ONE video player implementation app-wide.
  // The Shorts pill in the discover header navigates there.

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <OfflineBanner />
      <PostUploadBanner />
      <DesktopFeedLayout>

      {/* ── Fixed header ── */}
      <View
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        style={styles.headerBlock}
      >
        {/* Flat header background */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "#0F0F0F" : "#F5F0E8", zIndex: 0 }]} />

        {/* ── Row 1: centered wordmark + right actions ── */}
        <View style={[styles.headerTop, { paddingTop: insets.top + 6 }]}>
          {/* Left spacer — mirrors right actions width so wordmark is truly centred */}
          <View style={styles.headerSpacer} />

          {/* Brand wordmark — centred */}
          <View style={styles.wordmarkRow}>
            <Text style={[styles.wordmarkText, { color: colors.text }]}>Afu</Text>
            <Text style={[styles.wordmarkText, { color: colors.accent }]}>Chat</Text>
          </View>

          {/* Right actions */}
          <View style={styles.headerActions}>
            {!user && (
              <TouchableOpacity
                onPress={() => safeRouter.push("/(auth)/login")}
                style={styles.signInBtn}
                activeOpacity={0.7}
              >
                <Text style={[styles.signInText, { color: colors.textSecondary }]}>Sign in</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                safeRouter.push("/(tabs)/search");
              }}
              style={[styles.searchBtn, { backgroundColor: colors.backgroundSecondary }]}
              activeOpacity={0.7}
              hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <Ionicons name="search" size={18} color={colors.icon} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Row 2: For You / Following tabs ── */}
        <View style={[styles.tabRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.tabPill,
              feedTab === "for_you" && { borderBottomWidth: 2.5, borderBottomColor: colors.accent },
            ]}
            onPress={() => {
              setFeedTab("for_you");
              pagerRef.current?.setPage(0);
            }}
          >
            <Text style={[
              styles.tabPillText,
              { color: feedTab === "for_you" ? colors.accent : colors.textMuted },
            ]}>
              For You
            </Text>
          </TouchableOpacity>
          {user && (
            <TouchableOpacity
              style={[
                styles.tabPill,
                feedTab === "following" && { borderBottomWidth: 2.5, borderBottomColor: colors.accent },
              ]}
              onPress={() => {
                setFeedTab("following");
                pagerRef.current?.setPage(1);
              }}
            >
              <Text style={[
                styles.tabPillText,
                { color: feedTab === "following" ? colors.accent : colors.textMuted },
              ]}>
                Following
              </Text>
            </TouchableOpacity>
          )}
        </View>


        {/* Background refresh indicator */}
        {bgRefreshing && newPostAuthors.length === 0 && (
          <View style={[styles.bgRefreshBar, { backgroundColor: colors.accent + "18" }]}>
            <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
              {[0, 1, 2].map(i => (
                <Animated.View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />
              ))}
            </View>
            <Text style={[styles.bgRefreshText, { color: colors.accent }]}>Updating feed…</Text>
          </View>
        )}
      </View>
      {/* ────────────────────────────────────────────────────────────────── */}

      {_PagerView && !isDesktop ? (
        <_PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={0}
          onPageScroll={handleDiscoverPageScroll}
          onPageSelected={handleDiscoverPageSelected}
          overdrag={false}
          scrollEnabled={false}
        >
          {/* Page 0: For You */}
          <View key="for_you" style={{ flex: 1 }}>
            {feedTab === "for_you" ? (
              loading ? (
                <View style={{ padding: 8, paddingTop: headerHeight + 8, gap: 8 }}>
                  {[1,2,3,4,5,6,7,8].map(i => <PostSkeleton key={i} />)}
                </View>
              ) : (
                <FlatList
                  ref={flatListRef}
                  data={augmentedFeed}
                  keyExtractor={(entry) => entry._kind === "post" ? entry.item.id : entry.id}
                  renderItem={({ item: entry }) => {
                    if (entry._kind === "user_recs") return <UserRecsCard seed={entry.seed} onRequireAuth={onRequireAuth} />;
                    if (entry._kind === "premium") return null;
                    return (
                      <PostCard item={entry.item} onToggleLike={toggleLike} onToggleBookmark={toggleBookmark} onToggleFollow={toggleFollow} onImagePress={imgViewer.openViewer} onRequireAuth={onRequireAuth} colWidth={isDesktop ? FEED_COLUMN_MAX_WIDTH : undefined} onOpenComments={onOpenComments} onDismiss={onDismissPost} onMuteAuthor={onMuteAuthor} />
                    );
                  }}
                  ListHeaderComponent={user ? <SuggestedUsers compact maxCards={8} /> : null}
                  contentContainerStyle={{ gap: 8, paddingTop: headerHeight + 8, paddingBottom: insets.bottom + 100 }}
                  showsVerticalScrollIndicator={false}
                  onScroll={onFeedScroll}
                  scrollEventThrottle={16}
                  onEndReached={loadMore}
                  onEndReachedThreshold={0.5}
                  onViewableItemsChanged={onViewableItemsChanged}
                  viewabilityConfig={viewabilityConfig}
                  initialNumToRender={15}
                  maxToRenderPerBatch={10}
                  windowSize={8}
                  updateCellsBatchingPeriod={50}
                  removeClippedSubviews={Platform.OS !== "web"}
                  refreshControl={
                    <RefreshControl refreshing={refreshing} progressViewOffset={headerHeight} onRefresh={() => { revealHeader(); setRefreshing(true); setHasMore(true); _resetPill(false); loadPosts(feedTab); }} tintColor={colors.accent} />
                  }
                  ListFooterComponent={
                    !hasMore && filteredPosts.length > 0 ? (
                      <View style={[styles.endOfFeed, { borderTopColor: colors.border }]}>
                        <View style={[styles.endOfFeedDot, { backgroundColor: colors.border }]} />
                        <Text style={[styles.endOfFeedText, { color: colors.textMuted }]}>You're all caught up</Text>
                        <View style={[styles.endOfFeedDot, { backgroundColor: colors.border }]} />
                      </View>
                    ) : loadingMore ? (
                      <View style={styles.footerSpinnerRow}>
                        <ActivityIndicator size="small" color={colors.accent} />
                      </View>
                    ) : null
                  }
                />
              )
            ) : (
              <View style={{ flex: 1, paddingTop: headerHeight }} />
            )}
          </View>
          {/* Page 1: Following */}
          <View key="following" style={{ flex: 1 }}>
            {feedTab === "following" ? (
              !user ? (
                <View style={[styles.center, { paddingTop: headerHeight + 80 }]}>
                  <Ionicons name="lock-closed-outline" size={56} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>Sign in to see Following</Text>
                  <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Follow people to see their posts here</Text>
                  <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.accent }]} onPress={() => safeRouter.push("/(auth)/login")}>
                    <Text style={styles.createBtnText}>Sign In</Text>
                  </TouchableOpacity>
                </View>
              ) : followingEmpty ? (
                <View style={[styles.center, { paddingTop: headerHeight + 80 }]}>
                  <Ionicons name="people-outline" size={56} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No one followed yet</Text>
                  <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Follow people to see their posts here</Text>
                  <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.accent }]} onPress={() => { setFeedTab("for_you"); pagerRef.current?.setPage(0); }}>
                    <Text style={styles.createBtnText}>Browse For You</Text>
                  </TouchableOpacity>
                </View>
              ) : loading ? (
                <View style={{ padding: 8, paddingTop: headerHeight + 8, gap: 8 }}>
                  {[1,2,3,4,5,6,7,8].map(i => <PostSkeleton key={i} />)}
                </View>
              ) : (
                <FlatList
                  ref={flatListRef}
                  data={augmentedFeed}
                  keyExtractor={(entry) => entry._kind === "post" ? entry.item.id : entry.id}
                  renderItem={({ item: entry }) => {
                    if (entry._kind === "user_recs") return <UserRecsCard seed={entry.seed} onRequireAuth={onRequireAuth} />;
                    if (entry._kind === "premium") return null;
                    return (
                      <PostCard item={entry.item} onToggleLike={toggleLike} onToggleBookmark={toggleBookmark} onToggleFollow={toggleFollow} onImagePress={imgViewer.openViewer} onRequireAuth={onRequireAuth} colWidth={isDesktop ? FEED_COLUMN_MAX_WIDTH : undefined} onOpenComments={onOpenComments} onDismiss={onDismissPost} onMuteAuthor={onMuteAuthor} />
                    );
                  }}
                  contentContainerStyle={{ gap: 8, paddingTop: headerHeight + 8, paddingBottom: insets.bottom + 100 }}
                  showsVerticalScrollIndicator={false}
                  onScroll={onFeedScroll}
                  scrollEventThrottle={16}
                  onEndReached={loadMore}
                  onEndReachedThreshold={0.5}
                  onViewableItemsChanged={onViewableItemsChanged}
                  viewabilityConfig={viewabilityConfig}
                  initialNumToRender={15}
                  maxToRenderPerBatch={10}
                  windowSize={8}
                  updateCellsBatchingPeriod={50}
                  removeClippedSubviews={Platform.OS !== "web"}
                  refreshControl={
                    <RefreshControl refreshing={refreshing} progressViewOffset={headerHeight} onRefresh={() => { revealHeader(); setRefreshing(true); setHasMore(true); _resetPill(false); loadPosts(feedTab); }} tintColor={colors.accent} />
                  }
                  ListFooterComponent={
                    !hasMore && filteredPosts.length > 0 ? (
                      <View style={[styles.endOfFeed, { borderTopColor: colors.border }]}>
                        <View style={[styles.endOfFeedDot, { backgroundColor: colors.border }]} />
                        <Text style={[styles.endOfFeedText, { color: colors.textMuted }]}>You're all caught up</Text>
                        <View style={[styles.endOfFeedDot, { backgroundColor: colors.border }]} />
                      </View>
                    ) : loadingMore ? (
                      <View style={styles.footerSpinnerRow}>
                        <ActivityIndicator size="small" color={colors.accent} />
                      </View>
                    ) : null
                  }
                />
              )
            ) : (
              <View style={{ padding: 8, paddingTop: headerHeight + 8, gap: 8 }}>
                {[1,2,3,4,5,6,7,8].map(i => <PostSkeleton key={i} />)}
              </View>
            )}
          </View>
        </_PagerView>
      ) : (
        feedTab === "following" && !user ? (
          <View style={[styles.center, { paddingTop: headerHeight + 80 }]}>
            <Ionicons name="lock-closed-outline" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Sign in to see Following</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Follow people to see their posts here</Text>
            <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.accent }]} onPress={() => safeRouter.push("/(auth)/login")}>
              <Text style={styles.createBtnText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : feedTab === "following" && followingEmpty ? (
          <View style={[styles.center, { paddingTop: headerHeight + 80 }]}>
            <Ionicons name="people-outline" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No one followed yet</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Follow people to see their posts here</Text>
            <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.accent }]} onPress={() => setFeedTab("for_you")}>
              <Text style={styles.createBtnText}>Browse For You</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <View style={{ padding: 8, paddingTop: headerHeight + 8, gap: 8 }}>{[1,2,3,4,5,6,7,8].map(i => <PostSkeleton key={i} />)}</View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={augmentedFeed}
            keyExtractor={(entry) => entry._kind === "post" ? entry.item.id : entry.id}
            renderItem={({ item: entry }) => {
              if (entry._kind === "user_recs") return <UserRecsCard seed={entry.seed} onRequireAuth={onRequireAuth} />;
              if (entry._kind === "premium") return null;
              return (
                <PostCard item={entry.item} onToggleLike={toggleLike} onToggleBookmark={toggleBookmark} onToggleFollow={toggleFollow} onImagePress={imgViewer.openViewer} onRequireAuth={onRequireAuth} colWidth={isDesktop ? FEED_COLUMN_MAX_WIDTH : undefined} onOpenComments={onOpenComments} onDismiss={onDismissPost} onMuteAuthor={onMuteAuthor} />
              );
            }}
            ListHeaderComponent={user && feedTab === "for_you" ? <SuggestedUsers compact maxCards={8} /> : null}
            contentContainerStyle={{ gap: 8, paddingTop: headerHeight + 8, paddingBottom: insets.bottom + 100 }}
            showsVerticalScrollIndicator={false}
            onScroll={onFeedScroll}
            scrollEventThrottle={16}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={8}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS !== "web"}
            refreshControl={
              <RefreshControl refreshing={refreshing} progressViewOffset={headerHeight} onRefresh={() => { revealHeader(); setRefreshing(true); setHasMore(true); _resetPill(false); loadPosts(feedTab); }} tintColor={colors.accent} />
            }
            ListFooterComponent={
              !hasMore && filteredPosts.length > 0 ? (
                <View style={[styles.endOfFeed, { borderTopColor: colors.border }]}>
                  <View style={[styles.endOfFeedDot, { backgroundColor: colors.border }]} />
                  <Text style={[styles.endOfFeedText, { color: colors.textMuted }]}>You're all caught up</Text>
                  <View style={[styles.endOfFeedDot, { backgroundColor: colors.border }]} />
                </View>
              ) : loadingMore ? (
                <View style={styles.footerSpinnerRow}>
                  <ActivityIndicator size="small" color={colors.accent} />
                </View>
              ) : null
            }
          />
        )
      )}
      </DesktopFeedLayout>
      {/* Sticky "loading more" pill — always visible regardless of scroll position */}
      {loadingMore && (
        <View
          pointerEvents="none"
          style={[styles.loadMorePill, { bottom: insets.bottom + (Platform.OS === "web" ? 108 : 90) }]}
        >
          <View style={styles.loadMorePillInner}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.loadMorePillText}>Loading more…</Text>
          </View>
        </View>
      )}

      {user && (
        <TouchableOpacity
          ref={fabRef}
          style={[styles.fab, { backgroundColor: colors.accent, bottom: insets.bottom + (Platform.OS === "web" ? 108 : 90) }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCreatePicker(true);
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Create type picker */}
      <Modal
        visible={showCreatePicker}
        transparent
        animationType="none"
        onRequestClose={() => setShowCreatePicker(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setShowCreatePicker(false)}
        >
          <View style={[styles.createPickerSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.createPickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.createPickerTitle, { color: colors.text }]}>What would you like to create?</Text>
            {[
              { icon: "create-outline", label: "Post", desc: "Share a thought, photo, or link", route: "/moments/create", color: colors.accent },
              { icon: "videocam-outline", label: "Video", desc: "Share a short video clip", route: "/moments/create-video", color: "#FF3B30" },
              { icon: "document-text-outline", label: "Article", desc: "Write a long-form article", route: "/moments/create-article", color: "#007AFF" },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={[styles.createPickerOption, { backgroundColor: colors.backgroundTertiary }]}
                onPress={() => { setShowCreatePicker(false); setTimeout(() => safeRouter.push(opt.route as any), 150); }}
              >
                <View style={[styles.createPickerIconBox, { backgroundColor: opt.color + "18" }]}>
                  <Ionicons name={opt.icon as any} size={24} color={opt.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.createPickerLabel, { color: colors.text }]}>{opt.label}</Text>
                  <Text style={[styles.createPickerDesc, { color: colors.textMuted }]}>{opt.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      <ImageViewer
        images={imgViewer.images}
        initialIndex={imgViewer.index}
        visible={imgViewer.visible}
        onClose={imgViewer.closeViewer}
      />

      <SignInPromptModal visible={showSignInPrompt} onDismiss={() => setShowSignInPrompt(false)} />

      <VideoCommentsSheet
        visible={!!commentPostId}
        postId={commentPostId ?? ""}
        postAuthorId={commentPostAuthorId}
        onClose={() => { setCommentPostId(null); setCommentPostAuthorId(""); }}
        onReplyCountChange={onCommentReplyCountChange}
      />

      <DismissSheet
        visible={!!dismissTarget}
        authorHandle={dismissTarget?.profile.handle ?? ""}
        onSelect={onDismissReason}
        onClose={() => setDismissTarget(null)}
      />

      {/* ── Dismiss undo snackbar ── */}
      <Animated.View
        style={[
          snackStyles.snack,
          {
            bottom: insets.bottom + 80,
            backgroundColor: isDark ? "#2C2C2E" : "#1C1C1E",
            opacity: snackAnim,
            transform: [
              {
                translateY: snackAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
            pointerEvents: undoStack.length > 0 ? "auto" : "none",
          } as any,
        ]}
      >
        <Text style={snackStyles.label}>
          {undoStack.length} post{undoStack.length !== 1 ? "s" : ""} dismissed
        </Text>
        <TouchableOpacity onPress={handleUndo} style={snackStyles.undoBtn} hitSlop={8}>
          <Text style={[snackStyles.undoText, { color: colors.accent }]}>Undo</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Floating "new posts" pill ── */}
      <Animated.View
        style={[
          styles.newPostsFloatingWrap,
          {
            top: headerHeight + 10,
            transform: [{ translateY: popupSlide }],
            opacity: popupOpacity,
            pointerEvents: popupSnapshot.length > 0 ? "auto" : "none",
          } as any,
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.newPostsPillBtn,
            { backgroundColor: colors.accent, opacity: pressed ? 0.75 : 1 },
          ]}
          onPress={handleShowNewPosts}
        >
          <Ionicons name="arrow-up" size={14} color="#fff" />
          {/* Up to 3 plain avatar circles — no Avatar component, no rings */}
          <View style={styles.newPostsAvatars}>
            {popupSnapshot.slice(0, 3).map((a, i) => (
              <View
                key={a.id}
                style={[styles.newPostsAvatarCircle, { marginLeft: i > 0 ? -10 : 0, zIndex: 10 - i }]}
              >
                {a.avatar_url ? (
                  <ExpoImage
                    source={{ uri: a.avatar_url }}
                    style={{ width: 28, height: 28, borderRadius: 14 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View style={styles.newPostsAvatarFallback}>
                    <Text style={styles.newPostsAvatarInitial}>
                      {(a.display_name?.[0] ?? "?").toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
          <Text style={styles.newPostsPillLabel}>
            {pendingCount > 1 ? `${pendingCount} new posts` : "new posts"}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBlock: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: "hidden",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  headerSpacer: {
    flex: 1,
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  wordmarkText: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  headerActions: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  signInBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  signInText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 4,
  },
  loadMorePill: {
    position: "absolute",
    alignSelf: "center",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    zIndex: 50,
    pointerEvents: "none" as any,
  },
  loadMorePillInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 24,
  },
  loadMorePillText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#fff",
  },
  footerSpinnerRow: {
    alignItems: "center",
    paddingVertical: 24,
  },
  endOfFeed: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  endOfFeedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
  },
  endOfFeedText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.1,
  },
  tabPill: { paddingVertical: 12, paddingHorizontal: 22, alignItems: "center" },
  tabPillText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  card: {
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 10,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "nowrap" },
  cardHandle: { fontSize: 13.5, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  cardName: { fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: -0.1 },
  cardMeta: { fontSize: 11, fontFamily: "Inter_400Regular", letterSpacing: 0.1 },
  cardBio: { fontSize: 11, fontFamily: "Inter_400Regular", letterSpacing: 0.1, marginTop: 2, opacity: 0.6 },
  followBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 9, paddingVertical: 2, borderRadius: 20 },
  followBtnText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardContent: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingLeft: 66,
    paddingRight: 16,
    paddingBottom: 8,
    lineHeight: 23,
  },
  translatedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 66, paddingRight: 16, marginBottom: 8 },
  translatedText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  images: { marginBottom: 8 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 58,
    paddingRight: 12,
    paddingTop: 2,
    paddingBottom: 10,
    gap: 0,
  },
  footerStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
  },
  footerStatNum: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.1,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  viewCount: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  videoCard: { marginLeft: 66, marginRight: 16, marginBottom: 2 },
  videoThumb: {
    height: 220,
    backgroundColor: "#0a0a0a",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  playCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoBadge: {
    position: "absolute",
    bottom: 10,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  videoBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  articleCard: {
    marginLeft: 66,
    marginRight: 16,
    marginVertical: 4,
    borderRadius: 14,
    overflow: "hidden",
  },
  articleCover: {
    width: "100%",
    height: 140,
  },
  articleCardBody: {
    padding: 14,
    gap: 8,
  },
  articleBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  articleBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  articleExcerpt: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  articleReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  articleReadBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  createBtn: { backgroundColor: Colors.brand, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  createBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  ellipsisBtn: { padding: 4 },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    paddingHorizontal: 8,
  },
  menuSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 8,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
    borderRadius: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  menuDivider: {
    height: 0.5,
    marginVertical: 4,
    marginHorizontal: 16,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { boxShadow: "0 4px 8px rgba(0,0,0,0.25)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 },
    }),
  },
  postTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    marginHorizontal: 13,
    marginBottom: 6,
    marginTop: 6,
  },
  postTypeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  articleTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    lineHeight: 23,
  },
  readArticleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginHorizontal: 13,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  readArticleText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  createPickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 10,
  },
  createPickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 10,
  },
  createPickerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  createPickerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
  },
  createPickerIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  createPickerLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  createPickerDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  bgRefreshBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 5,
  },
  bgRefreshText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  newPostsPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    marginVertical: 8,
    gap: 6,
    ...Platform.select({
      web: { boxShadow: "0 2px 6px rgba(0,0,0,0.2)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
    }),
  },
  newPostsPillText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  // Floating pill (X / Twitter style)
  newPostsFloatingWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 200,
  },
  newPostsPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 16,
    gap: 7,
    ...Platform.select({
      web: { boxShadow: "0 4px 18px rgba(0,0,0,0.30)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.30, shadowRadius: 12, elevation: 8 },
    }),
  },
  newPostsAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  newPostsAvatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#fff",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  newPostsAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  newPostsAvatarInitial: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  newPostsAvatarWrap: {
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: "#fff",
    overflow: "hidden",
  },
  newPostsExtraCount: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  newPostsExtraText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  newPostsBgIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  newPostsPillLabel: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
});

const snackStyles = StyleSheet.create({
  snack: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 12,
    zIndex: 999,
    ...Platform.select({
      web: { boxShadow: "0 4px 20px rgba(0,0,0,0.28)" } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  label: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
  undoBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  undoText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.1,
  },
});


