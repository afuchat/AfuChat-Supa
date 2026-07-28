/**
 * Post Detail Page — text / image posts only.
 * Articles have their own dedicated reader at /article/[id].
 * Videos have their own full-screen player at /video/[id].
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { Avatar } from "@/components/ui/Avatar";
import CachedImage from "@/components/ui/CachedImage";
import { RichText } from "@/components/ui/RichText";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import UserName from "@/components/ui/UserName";
import { VideoCommentsSheet } from "@/components/ui/VideoCommentsSheet";
import { ImageViewer, useImageViewer } from "@/components/ImageViewer";
import { sharePost } from "@/lib/share";
import Colors from "@/constants/colors";
import { notifyPostLike } from "@/lib/notifyUser";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (!n || n < 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, "") + "M";
  if (n >= 10_000)   return Math.round(n / 1_000) + "K";
  if (n >= 1_000)    return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function compactTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff) || diff < 0) return "";
  const m = Math.floor(diff / 60_000);
  if (m < 1)   return "now";
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 4)   return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y`;
}

const URL_RE = /https?:\/\/[^\s<)"'\]]+/g;
function extractFirstUrl(text: string): string | null {
  return text.match(URL_RE)?.[0] ?? null;
}

// ─── OG link preview ──────────────────────────────────────────────────────────
type OgData = { image: string | null; title: string | null };
const ogCache: Record<string, OgData> = {};
async function fetchOgData(url: string): Promise<OgData> {
  if (url in ogCache) return ogCache[url];
  const empty: OgData = { image: null, title: null };
  try {
    const res  = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AfuChatBot/1.0)" } });
    const html = await res.text();
    const img  = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
    const ttl  = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim()
              ?? html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim()
              ?? null;
    const data: OgData = { image: img, title: ttl };
    ogCache[url] = data;
    return data;
  } catch {
    ogCache[url] = empty;
    return empty;
  }
}

function LinkPreviewCard({ url, colors }: { url: string; colors: any }) {
  const [ogImage, setOgImage] = useState<string | null>(null);
  const [ogTitle, setOgTitle] = useState<string | null>(null);
  let domain = url;
  try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  const faviconUri = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  useEffect(() => {
    fetchOgData(url).then((d) => { setOgImage(d.image); setOgTitle(d.title); });
  }, [url]);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[st.linkCard, { backgroundColor: colors.card }]}
      onPress={() => {}}
    >
      <View style={[st.linkThumb, { backgroundColor: colors.backgroundSecondary }]}>
        {ogImage ? (
          <CachedImage uri={ogImage} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <CachedImage uri={faviconUri} style={{ width: 36, height: 36 }} contentFit="contain" />
        )}
      </View>
      <View style={st.linkBody}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <CachedImage uri={faviconUri} style={{ width: 13, height: 13, borderRadius: 2 }} contentFit="contain" />
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted, flex: 1 }} numberOfLines={1}>{domain}</Text>
        </View>
        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text, lineHeight: 18 }} numberOfLines={2}>
          {ogTitle || domain}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Image carousel ───────────────────────────────────────────────────────────
const IMG_RATIO_MIN = 9 / 16;
const IMG_RATIO_MAX = 5 / 4;

function PostImageCarousel({
  images,
  width,
  onPress,
  onDoubleTap,
}: {
  images: string[];
  width: number;
  onPress: (index: number) => void;
  onDoubleTap: () => void;
}) {
  const { isDark } = useTheme();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [imgRatio, setImgRatio]     = useState<number | null>(null);

  const ratio = imgRatio ?? IMG_RATIO_MIN;
  const imgH  = Math.round(width * ratio);

  const heartOpacity = useRef(new Animated.Value(0)).current;
  const heartScale   = useRef(new Animated.Value(0.3)).current;
  const lastTap      = useRef(0);
  const tapTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashHeart() {
    heartOpacity.setValue(0); heartScale.setValue(0.3);
    Animated.parallel([
      Animated.timing(heartOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.spring(heartScale,   { toValue: 1, speed: 50, bounciness: 14, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => Animated.timing(heartOpacity, { toValue: 0, duration: 380, useNativeDriver: true }).start(), 500);
    });
    onDoubleTap();
  }

  function handleTap(idx: number) {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
      lastTap.current = 0;
      flashHeart();
    } else {
      lastTap.current = now;
      tapTimer.current = setTimeout(() => { tapTimer.current = null; onPress(idx); }, 320);
    }
  }

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ borderRadius: 14, overflow: "hidden", width, height: imgH, backgroundColor: isDark ? "#1a1a1a" : "#e8e0d0" }}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentIdx(Math.max(0, Math.min(idx, images.length - 1)));
          }}
        >
          {images.map((uri, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.95}
              onPress={() => handleTap(i)}
              style={{ width, height: imgH }}
            >
              <CachedImage
                uri={uri}
                style={{ width, height: imgH }}
                contentFit="contain"
                priority={i === 0 ? "high" : "normal"}
                onLoad={i === 0 ? (e) => {
                  const { width: sw, height: sh } = (e as any).source ?? {};
                  if (sw > 0 && sh > 0) setImgRatio(Math.min(Math.max(sh / sw, IMG_RATIO_MIN), IMG_RATIO_MAX));
                } : undefined}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Double-tap heart */}
        <Animated.View style={{ position: "absolute", alignSelf: "center", top: imgH / 2 - 44, opacity: heartOpacity, transform: [{ scale: heartScale }], pointerEvents: "none" } as any}>
          <Ionicons name="heart" size={88} color="#FF3B30" />
        </Animated.View>

        {/* Counter badge */}
        {images.length > 1 && (
          <View style={{ position: "absolute", top: 8, right: 10, backgroundColor: "rgba(0,0,0,0.52)", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{currentIdx + 1}/{images.length}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Bookmark button ──────────────────────────────────────────────────────────
function BookmarkButton({ bookmarked, onPress }: { bookmarked: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  function handle() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.7, duration: 100, useNativeDriver: true }),
      Animated.spring(scale,  { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
    ]).start();
    onPress();
  }
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity onPress={handle} hitSlop={8} style={st.footerBtn}>
        <Ionicons name="bookmark" size={22} color={bookmarked ? Colors.gold : "#888"} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Post = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  like_count: number;
  post_type: string;
  is_verified: boolean;
  is_organization_verified: boolean;
  profile: { display_name: string; handle: string; avatar_url: string | null };
};

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();
  const { accent } = useAppAccent();
  const { user } = useAuth();
  const insets  = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();

  const [post,       setPost]       = useState<Post | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [liked,      setLiked]      = useState(false);
  const [likeCount,  setLikeCount]  = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const heartScale = useRef(new Animated.Value(1)).current;
  const { images: viewerImages, initialIndex: viewerIndex, isOpen: viewerOpen, open: openViewer, close: closeViewer } = useImageViewer();

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("posts")
        .select(`
          id, author_id, content, image_url, created_at, view_count, like_count, post_type,
          profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified),
          post_images(image_url, display_order)
        `)
        .eq("id", id)
        .single();

      if (!data) { setLoading(false); return; }

      const imgs: string[] = ((data.post_images as any[]) ?? [])
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .map((r) => r.image_url);
      const prof = (data.profiles as any) ?? {};

      setPost({
        id: data.id,
        author_id: data.author_id,
        content: data.content ?? "",
        image_url: (data as any).image_url ?? null,
        images: imgs,
        created_at: data.created_at,
        view_count: (data as any).view_count ?? 0,
        like_count: data.like_count ?? 0,
        post_type: data.post_type ?? "text",
        is_verified: prof.is_verified ?? false,
        is_organization_verified: prof.is_organization_verified ?? false,
        profile: {
          display_name: prof.display_name ?? "",
          handle: prof.handle ?? "",
          avatar_url: prof.avatar_url ?? null,
        },
      });
      setLikeCount(data.like_count ?? 0);

      // Like / bookmark state for current user
      if (user) {
        const [likeRes, bmRes] = await Promise.all([
          supabase.from("post_likes").select("id").eq("post_id", id).eq("user_id", user.id).maybeSingle(),
          supabase.from("bookmarks").select("id").eq("post_id", id).eq("user_id", user.id).maybeSingle(),
        ]);
        setLiked(!!likeRes.data);
        setBookmarked(!!bmRes.data);
      }

      setLoading(false);
    })();
  }, [id, user]);

  // ── Like toggle ───────────────────────────────────────────────────────────
  const toggleLike = useCallback(async () => {
    if (!user || !post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    heartScale.setValue(1);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: true, speed: 50, bounciness: 14 }),
      Animated.spring(heartScale, { toValue: 1,   useNativeDriver: true, speed: 22, bounciness: 4  }),
    ]).start();

    if (liked) {
      setLiked(false); setLikeCount((n) => Math.max(0, n - 1));
      await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
    } else {
      setLiked(true); setLikeCount((n) => n + 1);
      await supabase.from("post_likes").insert({ post_id: post.id, user_id: user.id });
      if (post.author_id !== user.id) {
        notifyPostLike({ postAuthorId: post.author_id, likerName: "", likerUserId: user.id, postId: post.id });
      }
    }
  }, [user, post, liked, heartScale]);

  // ── Bookmark toggle ───────────────────────────────────────────────────────
  const toggleBookmark = useCallback(async () => {
    if (!user || !post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (bookmarked) {
      setBookmarked(false);
      await supabase.from("bookmarks").delete().eq("post_id", post.id).eq("user_id", user.id);
    } else {
      setBookmarked(true);
      await supabase.from("bookmarks").insert({ post_id: post.id, user_id: user.id });
    }
  }, [user, post, bookmarked]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const allImages = post ? (post.images.length > 0 ? post.images : post.image_url ? [post.image_url] : []) : [];
  const previewUrl = post && allImages.length === 0 ? extractFirstUrl(post.content ?? "") : null;
  const imgWidth   = screenW - 32; // 16px padding each side

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[st.header, { paddingTop: insets.top + 6, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={st.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: colors.text }]}>Post</Text>
        <TouchableOpacity
          onPress={() => post && sharePost({ postId: post.id, authorName: post.profile.display_name, content: post.content })}
          hitSlop={10}
          style={st.headerBtn}
        >
          <Ionicons name="share-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* ── Body ── */}
      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={accent} size="large" />
        </View>
      ) : !post ? (
        <View style={st.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, marginTop: 12, fontFamily: "Inter_400Regular", fontSize: 15 }}>Post not found</Text>
        </View>
      ) : (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 80 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Author row */}
            <View style={st.authorRow}>
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/contact/[id]", params: { id: post.author_id } } as any)}
                activeOpacity={0.8}
              >
                <Avatar uri={post.profile.avatar_url} name={post.profile.display_name} size={44} userId={post.author_id} />
              </TouchableOpacity>
              <View style={{ flex: 1, gap: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <UserName
                    userId={post.author_id}
                    name={post.profile.display_name || post.profile.handle}
                    style={[st.authorName, { color: colors.text }]}
                    numberOfLines={1}
                  />
                  <VerifiedBadge isVerified={post.is_verified} isOrganizationVerified={post.is_organization_verified} size={13} />
                </View>
                <Text style={[st.authorMeta, { color: colors.textMuted }]}>
                  @{post.profile.handle} · {compactTime(post.created_at)}
                </Text>
              </View>
            </View>

            {/* Full content */}
            {(post.content || "").trim().length > 0 && (
              <View style={st.contentWrap}>
                <RichText style={[st.content, { color: colors.text }]} linkColor={accent}>
                  {post.content}
                </RichText>
              </View>
            )}

            {/* Images */}
            {allImages.length > 0 && (
              <View style={{ paddingHorizontal: 16 }}>
                <PostImageCarousel
                  images={allImages}
                  width={imgWidth}
                  onPress={(idx) => openViewer(allImages, idx)}
                  onDoubleTap={toggleLike}
                />
              </View>
            )}

            {/* Link preview */}
            {previewUrl && <LinkPreviewCard url={previewUrl} colors={colors} />}
          </ScrollView>

          {/* ── Footer action bar (sticky) ── */}
          <View style={[st.footer, {
            paddingBottom: Math.max(insets.bottom, 8),
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          }]}>
            {/* Like */}
            <TouchableOpacity style={st.footerBtn} onPress={toggleLike} activeOpacity={0.7}>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons name="heart" size={22} color={liked ? "#FF9500" : colors.textMuted} />
              </Animated.View>
              <Text style={[st.footerCount, { color: liked ? "#FF9500" : colors.textMuted }]}>{formatNum(likeCount)}</Text>
            </TouchableOpacity>

            {/* Comment */}
            <TouchableOpacity style={st.footerBtn} onPress={() => setCommentsOpen(true)} activeOpacity={0.7}>
              <Ionicons name="chatbubble" size={22} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Views */}
            <View style={st.footerBtn}>
              <Ionicons name="eye" size={22} color={colors.textMuted} />
              <Text style={[st.footerCount, { color: colors.textMuted }]}>{formatNum(post.view_count)}</Text>
            </View>

            {/* Share */}
            <TouchableOpacity
              style={st.footerBtn}
              onPress={() => sharePost({ postId: post.id, authorName: post.profile.display_name, content: post.content })}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-redo" size={22} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Bookmark */}
            <BookmarkButton bookmarked={bookmarked} onPress={toggleBookmark} />
          </View>
        </>
      )}

      {/* Comments sheet */}
      {post && (
        <VideoCommentsSheet
          visible={commentsOpen}
          postId={post.id}
          authorId={post.author_id}
          onClose={() => setCommentsOpen(false)}
        />
      )}

      {/* Image viewer */}
      <ImageViewer images={viewerImages} initialIndex={viewerIndex} visible={viewerOpen} onClose={closeViewer} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  root:          { flex: 1 },
  center:        { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn:     { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle:   { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },
  scrollContent: { paddingTop: 16 },
  authorRow:     { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, marginBottom: 14 },
  authorName:    { fontSize: 15, fontFamily: "Inter_700Bold", flexShrink: 1 },
  authorMeta:    { fontSize: 12, fontFamily: "Inter_400Regular" },
  contentWrap:   { paddingHorizontal: 16, marginBottom: 14 },
  content:       { fontSize: 17, lineHeight: 26, fontFamily: "Inter_400Regular" },
  footer:        { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  footerBtn:     { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8 },
  footerCount:   { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  linkCard:      { flexDirection: "row", alignItems: "stretch", marginHorizontal: 16, marginBottom: 10, borderRadius: 14, overflow: "hidden", minHeight: 80 },
  linkThumb:     { width: 90, minHeight: 80, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  linkBody:      { flex: 1, paddingHorizontal: 10, paddingVertical: 10, gap: 4, justifyContent: "center" },
});
