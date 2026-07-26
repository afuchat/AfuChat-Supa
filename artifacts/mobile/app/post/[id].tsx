import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
// expo-av: lazy-load to avoid "Cannot find native module 'ExponentAV'" on web
let Audio: typeof import("expo-av").Audio | null = null;
type AudioSound = import("expo-av/build/Audio/Sound").Sound;
type AudioRecording = import("expo-av/build/Audio/Recording").Recording;
try { Audio = require("expo-av").Audio; } catch {}
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { PostDetailSkeleton } from "@/components/ui/Skeleton";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { sharePost } from "@/lib/share";
import { isUuid, isEncodedId, decodeId, encodeId } from "@/lib/shortId";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { RichText } from "@/components/ui/RichText";
import { Avatar } from "@/components/ui/Avatar";
import UserName from "@/components/ui/UserName";
import { ImageViewer, useImageViewer } from "@/components/ImageViewer";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { notifyPostLike, notifyPostReply } from "@/lib/notifyUser";
import { useAutoTranslate } from "@/context/LanguageContext";
import { LANG_LABELS } from "@/lib/translate";
import { aiSummarizeThread, askAi } from "@/lib/aiHelper";
import { AFUAI_BOT_ID } from "@/lib/afuAiBot";
import * as Haptics from "@/lib/haptics";
import { getLocalFeedPost } from "@/lib/storage/localFeed";
import { uploadToStorage } from "@/lib/mediaUpload";

// ─── Constants ────────────────────────────────────────────────────────────────
const USE_NATIVE = true;
const MAX_CHARS = 500;
const MAX_VOICE_SECS = 60;
const WAVEFORM_BARS = 30;
const QUICK_EMOJIS = ["🔥", "❤️", "😂", "😮", "👏", "💯", "🙌", "😍"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatSecs(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = Math.floor(totalSecs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function genWaveHeights(seed: string): number[] {
  const n = seed.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 7);
  return Array.from({ length: WAVEFORM_BARS }, (_, i) => {
    const v = Math.abs(Math.sin(n * 0.0013 + i * 0.71) * Math.cos(i * 0.43 + n * 0.007));
    return 0.15 + v * 0.85;
  });
}

function parseCommentText(text: string, accent: string): React.ReactNode {
  return text.split(/(@\w[\w.]*|#\w+)/g).map((p, i) => {
    if (/^@\w/.test(p)) return <Text key={i} style={{ color: accent, fontFamily: "Inter_600SemiBold" }}>{p}</Text>;
    if (/^#\w/.test(p)) return <Text key={i} style={{ color: accent + "BB" }}>{p}</Text>;
    return <Text key={i}>{p}</Text>;
  });
}

// ─── WaveformBars ─────────────────────────────────────────────────────────────
function WaveformBars({ heights, progress, accent, animating }: { heights: number[]; progress: number; accent: string; animating: boolean }) {
  const pulseAnims = useRef(heights.map(() => new Animated.Value(1))).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (animating) {
      loopRef.current = Animated.loop(
        Animated.stagger(40, pulseAnims.map((a) =>
          Animated.sequence([
            Animated.timing(a, { toValue: 1.5 + Math.random() * 0.5, duration: 200 + Math.random() * 200, useNativeDriver: true }),
            Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: true }),
          ]),
        )),
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      pulseAnims.forEach((a) => a.setValue(1));
    }
    return () => { loopRef.current?.stop(); };
  }, [animating]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2, height: 28 }}>
      {heights.map((h, i) => {
        const isPlayed = progress > 0 && (i + 1) / heights.length <= progress;
        return (
          <Animated.View key={i} style={{
            width: 2.5, height: Math.max(4, h * 26), borderRadius: 2,
            backgroundColor: isPlayed ? accent : accent + "44",
            transform: animating ? [{ scaleY: pulseAnims[i] }] : [],
          }} />
        );
      })}
    </View>
  );
}

// ─── VoicePlayer ──────────────────────────────────────────────────────────────
function VoicePlayer({ uri, durationSecs, accent, colors }: { uri: string; durationSecs: number; accent: string; colors: any }) {
  const [sound, setSound] = useState<AudioSound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(Math.max(1000, durationSecs * 1000));
  const containerWidth = useRef(200);
  const heights = useMemo(() => genWaveHeights(uri), [uri]);
  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  useEffect(() => {
    let mounted = true;
    async function loadVoice() {
      try {
        if (!Audio || !Audio.Sound) return;
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false }).catch(() => {});
        const { sound: s } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
        if (!mounted) { s.unloadAsync().catch(() => {}); return; }
        s.setOnPlaybackStatusUpdate((st) => {
          if (!st.isLoaded) return;
          setPositionMs(st.positionMillis);
          if (st.durationMillis) setDurationMs(st.durationMillis);
          if (st.didJustFinish) { setPlaying(false); setPositionMs(0); s.setPositionAsync(0).catch(() => {}); }
        });
        setSound(s);
      } catch {}
    }
    loadVoice();
    return () => { mounted = false; setSound((prev) => { prev?.unloadAsync().catch(() => {}); return null; }); };
  }, [uri]);

  async function togglePlay() {
    if (!sound) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (playing) { await sound.pauseAsync(); setPlaying(false); }
    else { if (Audio?.setAudioModeAsync) await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false }).catch(() => {}); await sound.playAsync(); setPlaying(true); }
  }

  function handleSeek(x: number) {
    if (!sound || durationMs <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / containerWidth.current));
    setPositionMs(ratio * durationMs);
    sound.setPositionAsync(ratio * durationMs).catch(() => {});
  }

  const displayTime = positionMs > 100 ? formatSecs(Math.floor(positionMs / 1000)) : formatSecs(Math.ceil(durationMs / 1000));

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.inputBg, marginTop: 6, maxWidth: 260, alignSelf: "flex-start" }}>
      <TouchableOpacity onPress={togglePlay} activeOpacity={0.8} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: accent, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={playing ? "pause" : "play"} size={12} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1, gap: 3 }}>
        <TouchableOpacity activeOpacity={0.95} onLayout={(e) => { containerWidth.current = e.nativeEvent.layout.width; }} onPress={(e) => handleSeek(e.nativeEvent.locationX)}>
          <WaveformBars heights={heights} progress={progress} accent={accent} animating={playing} />
        </TouchableOpacity>
        <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: "Inter_500Medium" }}>{displayTime}</Text>
      </View>
    </View>
  );
}

// ─── RecordingBar ─────────────────────────────────────────────────────────────
function RecordingBar({ elapsed, onStop, accent, colors }: { elapsed: number; onStop: () => void; accent: string; colors: any }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pct = elapsed / MAX_VOICE_SECS;
  const isNearEnd = elapsed >= MAX_VOICE_SECS - 10;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Animated.View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: isNearEnd ? "#FF3B30" : "#FF2D55", transform: [{ scale: pulseAnim }] }} />
      <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${pct * 100}%` as any, borderRadius: 2, backgroundColor: isNearEnd ? "#FF3B30" : accent }} />
      </View>
      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: isNearEnd ? "#FF3B30" : colors.textMuted, minWidth: 64, textAlign: "right" }}>
        {formatSecs(elapsed)}<Text style={{ color: colors.textMuted }}>/{formatSecs(MAX_VOICE_SECS)}</Text>
      </Text>
      <TouchableOpacity onPress={onStop} activeOpacity={0.7} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: accent + "80", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="stop" size={12} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

// ─── VoicePreviewBar ──────────────────────────────────────────────────────────
function VoicePreviewBar({ uri, durationSecs, onDiscard, accent, colors }: { uri: string; durationSecs: number; onDiscard: () => void; accent: string; colors: any }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderTopColor: colors.border }}>
      <Ionicons name="mic" size={13} color={accent} />
      <Text style={{ color: accent, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Voice note</Text>
      <View style={{ flex: 1 }}>
        <VoicePlayer uri={uri} durationSecs={durationSecs} accent={accent} colors={colors} />
      </View>
      <TouchableOpacity onPress={onDiscard} hitSlop={8}>
        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type RecordState = "idle" | "recording" | "recorded";

type Reply = {
  id: string;
  content: string;
  created_at: string;
  parent_reply_id: string | null;
  like_count: number;
  voice_url: string | null;
  voice_duration: number | null;
  image_url: string | null;
  author: { id: string; display_name: string; avatar_url: string | null; handle: string; is_verified: boolean; is_organization_verified: boolean };
  children?: Reply[];
};

type PostData = {
  id: string;
  content: string;
  image_url: string | null;
  images: string[];
  post_type: string | null;
  article_title: string | null;
  created_at: string;
  view_count: number;
  visibility: string;
  author: { id: string; display_name: string; avatar_url: string | null; handle: string; is_verified: boolean; is_organization_verified: boolean };
  liked: boolean;
  likeCount: number;
  replyCount: number;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function readingTime(text: string): number {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200));
}

function ImageGrid({ images, onPress }: { images: string[]; onPress: (i: number) => void }) {
  if (images.length === 1) {
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => onPress(0)}>
        <Image source={{ uri: images[0] }} style={styles.imgSingle} resizeMode="cover" />
      </TouchableOpacity>
    );
  }
  return (
    <View style={{ gap: 4 }}>
      {/* First image — full width, tall */}
      <TouchableOpacity activeOpacity={0.9} onPress={() => onPress(0)}>
        <Image source={{ uri: images[0] }} style={styles.imgSingle} resizeMode="cover" />
      </TouchableOpacity>
      {/* Remaining images — horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 4 }}
      >
        {images.slice(1).map((uri, i) => (
          <TouchableOpacity
            key={i + 1}
            activeOpacity={0.9}
            onPress={() => onPress(i + 1)}
          >
            <Image source={{ uri }} style={styles.imgThumb} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const THREAD_COLORS = ["#1f95ff", "#5C6BC0", "#26A69A", "#EF6C00", "#8E24AA"];

function ReplyCard({
  item,
  colors,
  accent,
  depth,
  onReplyTo,
}: {
  item: Reply;
  colors: any;
  accent: string;
  depth: number;
  onReplyTo: (reply: Reply) => void;
}) {
  const { displayText, isTranslated, lang } = useAutoTranslate(item.content);
  const [collapsed, setCollapsed] = useState(false);
  const [liked, setLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(item.like_count || 0);
  const [imgExpanded, setImgExpanded] = useState(false);
  const likeScale = useRef(new Animated.Value(1)).current;
  const indent = Math.min(depth, 4) * 18;
  const hasChildren = (item.children?.length ?? 0) > 0;
  const threadColor = THREAD_COLORS[depth % THREAD_COLORS.length];
  const isTopLevel = depth === 0;
  const avatarSize = isTopLevel ? 34 : 26;

  function handleLike() {
    const next = !liked;
    setLiked(next);
    setLocalLikes((c) => (next ? c + 1 : Math.max(0, c - 1)));
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.5, tension: 350, friction: 7, useNativeDriver: USE_NATIVE }),
      Animated.spring(likeScale, { toValue: 1, tension: 350, friction: 7, useNativeDriver: USE_NATIVE }),
    ]).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  return (
    <>
      <View style={{ flexDirection: "row", paddingLeft: 16 + indent, paddingRight: 16, paddingTop: isTopLevel ? 12 : 7, paddingBottom: 2 }}>
        {depth > 0 && (
          <View style={{ width: 2, borderRadius: 1, backgroundColor: threadColor + "50", position: "absolute", left: 16 + indent - 10, top: 0, bottom: 0 }} />
        )}

        {/* Avatar */}
        <TouchableOpacity onPress={() => router.push(`/@${item.author.handle}` as any)} activeOpacity={0.8} style={{ marginRight: 9, marginTop: 1 }}>
          <Avatar uri={item.author.avatar_url} name={item.author.display_name} size={avatarSize} square={!!(item.author.is_organization_verified)} />
        </TouchableOpacity>

        {/* Body */}
        <View style={{ flex: 1 }}>
          {/* Header row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 2 }}>
            <TouchableOpacity onPress={() => router.push(`/@${item.author.handle}` as any)} activeOpacity={0.8}>
              <UserName userId={item.author.id} name={item.author.display_name} style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_700Bold" }} numberOfLines={1} />
            </TouchableOpacity>
            {item.author.is_organization_verified && <Ionicons name="checkmark-circle" size={12} color={Colors.gold} />}
            {!item.author.is_organization_verified && item.author.is_verified && <Ionicons name="checkmark-circle" size={12} color={colors.accent} />}
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>@{item.author.handle}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>· {timeAgo(item.created_at)}</Text>
          </View>

          {/* Content with mention/hashtag highlighting */}
          {item.content.length > 0 && (
            <Text style={{ color: colors.text, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 }}>
              {parseCommentText(displayText, accent)}
            </Text>
          )}

          {isTranslated && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 }}>
              <Ionicons name="language" size={10} color={colors.textMuted} />
              <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.textMuted }}>{`Translated · ${LANG_LABELS[lang || ""] ?? lang}`}</Text>
            </View>
          )}

          {/* Voice note */}
          {item.voice_url && (
            <VoicePlayer uri={item.voice_url} durationSecs={item.voice_duration ?? 0} accent={accent} colors={colors} />
          )}

          {/* Image attachment */}
          {item.image_url && (
            <>
              <TouchableOpacity activeOpacity={0.88} onPress={() => setImgExpanded(true)} style={{ marginTop: 7, borderRadius: 10, overflow: "hidden", alignSelf: "flex-start" }}>
                <Image source={{ uri: item.image_url }} style={{ width: 200, height: 140, borderRadius: 10 }} resizeMode="cover" />
              </TouchableOpacity>
              <Modal visible={imgExpanded} transparent animationType="none" onRequestClose={() => setImgExpanded(false)}>
                <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" }} onPress={() => setImgExpanded(false)}>
                  <Image source={{ uri: item.image_url }} style={{ width: "92%", height: "70%", borderRadius: 14 }} resizeMode="contain" />
                  <TouchableOpacity onPress={() => setImgExpanded(false)} style={{ position: "absolute", top: 52, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="close" size={20} color="#fff" />
                  </TouchableOpacity>
                </Pressable>
              </Modal>
            </>
          )}

          {/* Action row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 6, marginBottom: 3 }}>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 3 }} onPress={handleLike} activeOpacity={0.7}>
              <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                <Ionicons name={liked ? "heart" : "heart"} size={13} color={liked ? "#FF2D55" : colors.textMuted} />
              </Animated.View>
              <Text style={{ color: liked ? "#FF2D55" : colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                {localLikes > 0 ? localLikes : "Like"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 3 }} onPress={() => onReplyTo(item)} activeOpacity={0.7}>
              <Ionicons name="arrow-undo" size={13} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Reply</Text>
            </TouchableOpacity>

            {hasChildren && (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 3 }} onPress={() => setCollapsed((c) => !c)} activeOpacity={0.7}>
                <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={12} color={threadColor} />
                <Text style={{ color: threadColor, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {collapsed ? `${item.children!.length} ${item.children!.length === 1 ? "reply" : "replies"}` : "Hide"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {isTopLevel && !hasChildren && (
        <View style={{ height: 0.5, backgroundColor: colors.border, marginLeft: 16 + indent + avatarSize + 9, marginRight: 16, marginTop: 3 }} />
      )}

      {!collapsed && item.children?.map((child) => (
        <ReplyCard key={child.id} item={child} colors={colors} accent={accent} depth={depth + 1} onReplyTo={onReplyTo} />
      ))}

      {isTopLevel && hasChildren && !collapsed && (
        <View style={{ height: 0.5, backgroundColor: colors.border, marginLeft: 16, marginRight: 16, marginTop: 4, marginBottom: 2 }} />
      )}
    </>
  );
}

function buildReplyTree(flatReplies: Reply[]): Reply[] {
  const map = new Map<string, Reply>();
  const roots: Reply[] = [];
  for (const r of flatReplies) {
    map.set(r.id, { ...r, children: [] });
  }
  for (const r of flatReplies) {
    const node = map.get(r.id)!;
    if (r.parent_reply_id && map.has(r.parent_reply_id)) {
      map.get(r.parent_reply_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export default function PostDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();

  const id = useMemo(() => {
    if (!rawId) return rawId;
    if (isUuid(rawId)) return rawId;
    if (isEncodedId(rawId)) return decodeId(rawId);
    return rawId;
  }, [rawId]);

  useEffect(() => {
    if (!rawId) return;
    const shortCode = isUuid(rawId) ? encodeId(rawId) : rawId;
    router.replace({ pathname: "/p/[id]", params: { id: shortCode } });
  }, [rawId]);

  const { user, profile: myProfile } = useAuth();
  const { colors, isDark } = useTheme();
  const { accent } = useAppAccent();
  const insets = useSafeAreaInsets();

  const [post, setPost] = useState<PostData | null>(null);
  const [authorGoldNameplate, setAuthorGoldNameplate] = useState(false);
  const [authorVerifiedStar, setAuthorVerifiedStar] = useState(false);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [hasMoreReplies, setHasMoreReplies] = useState(false);
  const [loadingMoreReplies, setLoadingMoreReplies] = useState(false);
  const repliesOffsetRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Reply | null>(null);
  const replyInputRef = useRef<TextInput>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportOtherText, setReportOtherText] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const imgViewer = useImageViewer();
  const { displayText: postDisplayText, isTranslated: postIsTranslated, lang: postLang } = useAutoTranslate(post?.content);

  // Voice recording state
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [recordingObj, setRecordingObj] = useState<AudioRecording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Image attachment state
  const [attachedImage, setAttachedImage] = useState<{ uri: string; width: number; height: number } | null>(null);

  // Animated send button
  const sendScale = useRef(new Animated.Value(1)).current;

  const isOwner = user && post && post.author.id === user.id;
  const charLeft = MAX_CHARS - replyText.length;
  const canSend = !sending && (replyText.trim().length > 0 || (recordState === "recorded" && !!recordedUri) || !!attachedImage);

  const loadPost = useCallback(async () => {
    if (!id) return;

    // ── 1. Offline-first: show from local SQLite cache immediately ─────────────
    const local = await getLocalFeedPost(id);
    if (local) {
      // Video posts should open in the video screen — redirect even offline
      if (local.post_type === "video" && local.video_url) {
        router.replace({ pathname: "/video/[id]", params: { id: local.id } });
        return;
      }
      setPost({
        id: local.id,
        content: local.content ?? "",
        image_url: local.image_url,
        images: local.images,
        post_type: local.post_type ?? null,
        article_title: local.article_title ?? null,
        created_at: local.created_at,
        view_count: local.view_count,
        visibility: "public",
        author: {
          id: local.author_id,
          display_name: local.author_name ?? "User",
          avatar_url: local.author_avatar ?? null,
          handle: local.author_handle ?? "user",
          is_verified: local.is_verified,
          is_organization_verified: local.is_org_verified,
        },
        liked: local.liked,
        likeCount: local.like_count,
        replyCount: local.reply_count,
      });
      setLoading(false);
      // Fall through — continue network fetch in background to refresh counts
    }

    // ── 2. Network fetch (primary or background refresh) ──────────────────────
    const [postRes, likeCountRes, replyCountRes, myLikeRes, myViewRes] = await Promise.all([
      supabase
        .from("posts")
        .select(`id, content, image_url, article_title, created_at, view_count, visibility, post_type, video_url,
          profiles!posts_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified),
          post_images(image_url, display_order)`)
        .eq("id", id)
        .single(),
      supabase
        .from("post_acknowledgments")
        .select("id", { count: "exact", head: true })
        .eq("post_id", id),
      supabase
        .from("post_replies")
        .select("id", { count: "exact", head: true })
        .eq("post_id", id),
      user
        ? supabase
            .from("post_acknowledgments")
            .select("id")
            .eq("post_id", id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase
            .from("post_views")
            .select("id")
            .eq("post_id", id)
            .eq("viewer_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const data = postRes.data;
    if (!data) {
      // Network failed — if we showed from local cache, keep it; otherwise show error
      if (!local) setLoading(false);
      return;
    }

    if ((data as any).post_type === "video" && (data as any).video_url) {
      router.replace({ pathname: "/video/[id]", params: { id: data.id } });
      return;
    }

    const viewCount = data.view_count || 0;

    const authorData = (data as any).profiles;
    setPost({
      id: data.id,
      content: data.content,
      image_url: data.image_url,
      images: ((data as any).post_images || [])
        .sort((a: any, b: any) => a.display_order - b.display_order)
        .map((i: any) => i.image_url),
      post_type: (data as any).post_type || null,
      article_title: (data as any).article_title || null,
      created_at: data.created_at,
      view_count: viewCount,
      visibility: (data as any).visibility || "public",
      author: authorData,
      liked: !!(myLikeRes as any).data,
      likeCount: likeCountRes.count || 0,
      replyCount: replyCountRes.count || 0,
    });
    setLoading(false);

    if (authorData?.id) {
      supabase
        .from("status_goods_purchases")
        .select("good_id")
        .eq("user_id", authorData.id)
        .in("good_id", ["sg4", "sg5"])
        .eq("equipped", true)
        .then(({ data: goods }) => {
          if (!goods) return;
          setAuthorGoldNameplate(goods.some((g: any) => g.good_id === "sg4"));
          setAuthorVerifiedStar(goods.some((g: any) => g.good_id === "sg5"));
        });
    }

    // Track view in background — non-blocking so it never delays the UI
    if (user && !(myViewRes as any).data) {
      supabase
        .from("post_views")
        .insert({ post_id: id, viewer_id: user.id })
        .then(() =>
          supabase
            .from("posts")
            .update({ view_count: viewCount + 1 })
            .eq("id", id)
        );
    }
  }, [id, user]);

  const mapReply = (r: any): Reply => ({
    id: r.id,
    content: r.content || "",
    created_at: r.created_at,
    parent_reply_id: r.parent_reply_id || null,
    like_count: r.like_count || 0,
    voice_url: r.voice_url || null,
    voice_duration: r.voice_duration ?? null,
    image_url: r.image_url || null,
    author: r.profiles,
  });

  const loadReplies = useCallback(async () => {
    if (!id) return;
    repliesOffsetRef.current = 0;
    const { data, error } = await supabase
      .from("post_replies")
      .select("id, content, created_at, parent_reply_id, voice_url, voice_duration, image_url, profiles!post_replies_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)")
      .eq("post_id", id)
      .order("created_at", { ascending: true })
      .range(0, 49);

    if (error) console.error("[PostDetails] loadReplies:", error.message, error.code);
    if (data) {
      setReplies(data.map(mapReply));
      setHasMoreReplies(data.length === 50);
      repliesOffsetRef.current = data.length;
    }
  }, [id]);

  const loadMoreReplies = useCallback(async () => {
    if (!id || loadingMoreReplies || !hasMoreReplies) return;
    setLoadingMoreReplies(true);
    const offset = repliesOffsetRef.current;
    const { data } = await supabase
      .from("post_replies")
      .select("id, content, created_at, parent_reply_id, voice_url, voice_duration, image_url, profiles!post_replies_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)")
      .eq("post_id", id)
      .order("created_at", { ascending: true })
      .range(offset, offset + 49);
    if (data) {
      setReplies(prev => [...prev, ...data.map(mapReply)]);
      setHasMoreReplies(data.length === 50);
      repliesOffsetRef.current = offset + data.length;
    }
    setLoadingMoreReplies(false);
  }, [id, loadingMoreReplies, hasMoreReplies]);

  useEffect(() => { loadPost(); loadReplies(); }, [loadPost, loadReplies]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`post-detail:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_replies", filter: `post_id=eq.${id}` }, () => loadReplies())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "post_replies", filter: `post_id=eq.${id}` }, () => loadReplies())
      .on("postgres_changes", { event: "*", schema: "public", table: "post_acknowledgments", filter: `post_id=eq.${id}` }, (payload: any) => {
        const evType = payload.eventType;
        if (evType !== "INSERT" && evType !== "DELETE") return;
        const isOwnAction = (evType === "INSERT" && payload.new?.user_id === user?.id) || (evType === "DELETE" && payload.old?.user_id === user?.id);
        if (isOwnAction) return;
        const delta = evType === "INSERT" ? 1 : -1;
        setPost((p) => p ? { ...p, likeCount: Math.max(0, p.likeCount + delta) } : p);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_views", filter: `post_id=eq.${id}` }, (payload: any) => {
        if (payload.new?.viewer_id === user?.id) return;
        setPost((p) => p ? { ...p, view_count: (p.view_count || 0) + 1 } : p);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, user, loadReplies]);

  async function toggleLike() {
    if (!post) return;
    if (!user) { router.push("/(auth)/login"); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const wasLiked = post.liked;
    const prevCount = post.likeCount;
    if (wasLiked) {
      setPost({ ...post, liked: false, likeCount: Math.max(0, post.likeCount - 1) });
      const { error } = await supabase.from("post_acknowledgments").delete().eq("post_id", post.id).eq("user_id", user.id);
      if (error) setPost({ ...post, liked: wasLiked, likeCount: prevCount });
    } else {
      setPost({ ...post, liked: true, likeCount: post.likeCount + 1 });
      const { error } = await supabase.from("post_acknowledgments").upsert(
        { post_id: post.id, user_id: user.id },
        { onConflict: "post_id,user_id", ignoreDuplicates: true }
      );
      if (error) {
        setPost({ ...post, liked: wasLiked, likeCount: prevCount });
      } else {
        if (post.author.id !== user.id) {
          notifyPostLike({ postAuthorId: post.author.id, likerName: myProfile?.display_name || "Someone", likerUserId: user.id, postId: post.id });
        }
        try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_liked"); } catch (_) {}
      }
    }
  }

  function handleReplyTo(reply: Reply) {
    setReplyingTo(reply);
    setReplyText(`@${reply.author.handle} `);
    setTimeout(() => replyInputRef.current?.focus(), 100);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function discardRecording() {
    stopTimer();
    if (recordingObj) { recordingObj.stopAndUnloadAsync().catch(() => {}); setRecordingObj(null); }
    setRecordState("idle");
    setRecordedUri(null);
    setRecordedDuration(0);
    setRecordElapsed(0);
  }

  async function startRecording() {
    if (!Audio?.requestPermissionsAsync) return;
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) {
      showAlert("Microphone access needed", "Please enable microphone access in Settings to record voice notes.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecordingObj(recording);
      setRecordElapsed(0);
      setRecordState("recording");
      timerRef.current = setInterval(async () => {
        setRecordElapsed((prev) => {
          const next = prev + 1;
          if (next >= MAX_VOICE_SECS) { stopRecording(recording, next); }
          return next;
        });
      }, 1000);
    } catch (e: any) {
      showAlert("Could not start recording", e?.message || "Please try again.");
    }
  }

  async function stopRecording(rec?: AudioRecording | null, elapsed?: number) {
    stopTimer();
    const activeRec = rec ?? recordingObj;
    if (!activeRec) { setRecordState("idle"); return; }
    try {
      const status = await activeRec.getStatusAsync();
      await activeRec.stopAndUnloadAsync();
      const uri = activeRec.getURI();
      const durationMs = (status as any).durationMillis as number | undefined;
      const durationS = durationMs ? Math.ceil(durationMs / 1000) : (elapsed ?? recordElapsed);
      setRecordingObj(null);
      if (uri && durationS > 0) {
        setRecordedUri(uri);
        setRecordedDuration(durationS);
        setRecordState("recorded");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setRecordState("idle");
        setRecordElapsed(0);
      }
    } catch {
      setRecordState("idle");
      setRecordElapsed(0);
    }
    if (Audio?.setAudioModeAsync) await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
  }

  async function pickImage() {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) { showAlert("Photos access needed", "Please enable photo library access in Settings."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.82, allowsEditing: false });
    if (!result.canceled && result.assets.length > 0) {
      const a = result.assets[0];
      setAttachedImage({ uri: a.uri, width: a.width, height: a.height });
    }
  }

  async function sendReply() {
    const hasText = replyText.trim().length > 0;
    const hasVoice = recordState === "recorded" && !!recordedUri;
    const hasImage = !!attachedImage;
    if (!user || (!hasText && !hasVoice && !hasImage) || sending) return;
    if (replyText.trim().length > MAX_CHARS) { showAlert("Too long", `Replies are limited to ${MAX_CHARS} characters.`); return; }

    setSending(true);
    Animated.sequence([
      Animated.spring(sendScale, { toValue: 0.78, tension: 400, friction: 8, useNativeDriver: USE_NATIVE }),
      Animated.spring(sendScale, { toValue: 1, tension: 400, friction: 8, useNativeDriver: USE_NATIVE }),
    ]).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    let finalVoiceUrl: string | null = null;
    let finalImageUrl: string | null = null;

    if (hasVoice && recordedUri) {
      const path = `${user.id}/comment_${Date.now()}.m4a`;
      const { publicUrl, error } = await uploadToStorage("voice-messages", path, recordedUri, "audio/mp4");
      if (error || !publicUrl) {
        showAlert("Upload failed", "Could not upload voice note. Please try again.");
        setSending(false);
        return;
      }
      finalVoiceUrl = publicUrl;
    }

    if (hasImage && attachedImage) {
      const uriLower = attachedImage.uri.toLowerCase();
      const ext = uriLower.includes(".png") ? "png" : uriLower.includes(".webp") ? "webp" : "jpg";
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const path = `${user.id}/comment_${id}_${Date.now()}.${ext}`;
      const { publicUrl, error } = await uploadToStorage("post-images", path, attachedImage.uri, mime);
      if (error || !publicUrl) {
        showAlert("Upload failed", "Could not upload image. Please try again.");
        setSending(false);
        return;
      }
      finalImageUrl = publicUrl;
    }

    const content = replyText.trim();
    const insertData: any = { post_id: id, author_id: user.id, content };
    if (replyingTo) insertData.parent_reply_id = replyingTo.id;
    if (finalVoiceUrl) { insertData.voice_url = finalVoiceUrl; insertData.voice_duration = recordedDuration; }
    if (finalImageUrl) insertData.image_url = finalImageUrl;

    const { data: insertedRows, error } = await supabase.from("post_replies").insert(insertData).select("id").single();
    if (error) {
      showAlert("Error", "Could not post reply.");
    } else {
      setReplyText("");
      setReplyingTo(null);
      discardRecording();
      setAttachedImage(null);
      setPost((p) => p ? { ...p, replyCount: p.replyCount + 1 } : p);
      loadReplies();
      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_reply"); } catch (_) {}
      if (post && post.author.id !== user.id) {
        notifyPostReply({ postAuthorId: post.author.id, replierName: myProfile?.display_name || "Someone", replierUserId: user.id, postId: post.id, replyPreview: content || (finalVoiceUrl ? "\uD83C\uDF99\uFE0F Voice note" : finalImageUrl ? "\uD83D\uDDBC\uFE0F Image" : "") });
      }
      // Auto-reply from AfuAI when @afuai is mentioned in the comment
      if (content && /@afuai/i.test(content) && post) {
        (async () => {
          try {
            const promptText = content.replace(/@afuai/gi, "").trim() || content;
            const aiReply = await askAi(
              `A user commented on a post with the text: "${post.content.slice(0, 300)}"\n\nThey tagged @afuai and wrote: "${promptText}"\n\nReply naturally and helpfully as AfuAI in 1-3 sentences. No markdown, no lists.`,
              "You are AfuAI, AfuChat's AI assistant. You are replying to a comment on a social media post. Be concise, friendly, and helpful.",
              { fast: true, maxTokens: 150 }
            );
            if (!aiReply) return;
            const parentId = insertedRows?.id ?? null;
            await supabase.from("post_replies").insert({
              post_id: id,
              author_id: AFUAI_BOT_ID,
              content: aiReply,
              parent_reply_id: parentId,
            });
            loadReplies();
          } catch (_) {}
        })();
      }
    }
    setSending(false);
  }

  async function handleEdit() {
    if (!post || !user || editSaving) return;
    if (!editContent.trim()) { showAlert("Error", "Post content cannot be empty."); return; }
    setEditSaving(true);
    const { error } = await supabase.from("posts").update({ content: editContent.trim(), updated_at: new Date().toISOString() }).eq("id", post.id).eq("author_id", user.id);
    if (error) { showAlert("Error", "Could not update post."); }
    else {
      setPost({ ...post, content: editContent.trim() });
      setEditMode(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setEditSaving(false);
  }

  async function handleDelete() {
    if (!post || !user) return;
    setMenuVisible(false);
    showAlert("Delete Post", "Are you sure you want to delete this post? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        const { error } = await supabase.from("posts").delete().eq("id", post.id).eq("author_id", user.id);
        if (error) { showAlert("Error", "Could not delete post."); }
        else { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/discover" as any); }
      }},
    ]);
  }

  async function handleReport() {
    if (!post || !user || reportSending) return;
    const finalReason = reportReason === "Other" ? reportOtherText.trim() : reportReason.trim();
    if (!finalReason) { showAlert("Required", "Please select or describe a reason."); return; }
    setReportSending(true);
    const { error } = await supabase.from("user_reports").insert({ reporter_id: user.id, reported_user_id: post.author.id, reason: `Post report (${post.id})`, additional_info: finalReason });
    setReportSending(false);
    if (error) { showAlert("Error", "Could not submit report. Please try again."); return; }
    setReportVisible(false); setReportReason(""); setReportOtherText("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Reported", "Thank you for your report. Our team will review it.");
  }

  const REPORT_REASONS = ["Spam", "Harassment", "Hate speech", "Violence", "Misinformation", "Inappropriate content", "Other"];

  if (loading) return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <GlassHeader title="Post" />
      <PostDetailSkeleton />
    </View>
  );
  if (!post) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.text }}>Post not found</Text></View>;

  const allImages = post.images.length > 0 ? post.images : post.image_url ? [post.image_url] : [];

  function renderEngagementBar() {
    return (
      <View style={[styles.engagementBar, { borderColor: colors.border }]}>
        <TouchableOpacity style={styles.engagementBtn} onPress={toggleLike} activeOpacity={0.7}>
          <Ionicons
            name={post!.liked ? "heart" : "heart"}
            size={22}
            color={post!.liked ? "#FF3B30" : colors.textSecondary}
          />
          <Text style={[styles.engagementCount, { color: post!.liked ? "#FF3B30" : colors.textSecondary }]}>
            {post!.likeCount}
          </Text>
        </TouchableOpacity>

        <View style={[styles.engagementDivider, { backgroundColor: colors.border }]} />

        <View style={styles.engagementBtn}>
          <Ionicons name="chatbubble" size={20} color={colors.textSecondary} />
          <Text style={[styles.engagementCount, { color: colors.textSecondary }]}>{post!.replyCount}</Text>
        </View>

        <View style={[styles.engagementDivider, { backgroundColor: colors.border }]} />

        <View style={styles.engagementBtn}>
          <Ionicons name="eye" size={20} color={colors.textSecondary} />
          <Text style={[styles.engagementCount, { color: colors.textSecondary }]}>{post!.view_count}</Text>
        </View>

        <View style={[styles.engagementDivider, { backgroundColor: colors.border }]} />

        <TouchableOpacity
          style={styles.engagementBtn}
          onPress={() => sharePost({ postId: post!.id, authorName: post!.author.display_name, content: post!.content })}
          activeOpacity={0.7}
        >
          <Ionicons name="share" size={20} color={colors.textSecondary} />
          <Text style={[styles.engagementCount, { color: colors.textSecondary }]}>Share</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderAiSection() {
    if (replies.length < 2) return null;
    return !aiSummary ? (
      <TouchableOpacity
        style={[styles.aiBtn, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "30" }]}
        onPress={async () => {
          setAiSummarizing(true); setAiSummary(null);
          try {
            const summary = await aiSummarizeThread(post!.content, replies.map(r => ({ author: r.author.display_name, content: r.content })));
            setAiSummary(summary);
          } catch { showAlert("AI Error", "Could not summarize. Try again."); }
          setAiSummarizing(false);
        }}
        disabled={aiSummarizing}
      >
        {aiSummarizing
          ? <ActivityIndicator size="small" color={colors.accent} />
          : <Ionicons name="sparkles" size={15} color={colors.accent} />}
        <Text style={[styles.aiBtnText, { color: colors.accent }]}>
          {aiSummarizing ? "Summarizing discussion…" : "AI Summarize Discussion"}
        </Text>
      </TouchableOpacity>
    ) : (
      <View style={[styles.aiCard, { backgroundColor: colors.accent + "0D", borderColor: colors.accent + "22" }]}>
        <View style={styles.aiCardHeader}>
          <Ionicons name="sparkles" size={14} color={colors.accent} />
          <Text style={[styles.aiCardTitle, { color: colors.accent }]}>AI Summary</Text>
          <TouchableOpacity onPress={() => setAiSummary(null)} hitSlop={8} style={{ marginLeft: "auto" }}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.aiCardText, { color: colors.text }]}>{aiSummary}</Text>
      </View>
    );
  }

  function renderRepliesHeader() {
    if (replies.length === 0) return null;
    return (
      <View style={[styles.repliesHeader, { borderColor: colors.border }]}>
        <View style={[styles.repliesHeaderLine, { backgroundColor: colors.border }]} />
        <View style={[styles.repliesHeaderBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="chatbubble" size={13} color={colors.textMuted} />
          <Text style={[styles.repliesHeaderText, { color: colors.textMuted }]}>
            {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
          </Text>
        </View>
        <View style={[styles.repliesHeaderLine, { backgroundColor: colors.border }]} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <GlassHeader
        title={post.post_type === "article" ? "Article" : "Post"}
        right={
          <TouchableOpacity onPress={() => setMenuVisible(true)} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          data={buildReplyTree(replies)}
          keyExtractor={(item) => item.id}
          ListFooterComponent={hasMoreReplies ? (
            <TouchableOpacity onPress={loadMoreReplies} disabled={loadingMoreReplies} style={{ paddingVertical: 16, alignItems: "center" as const }}>
              {loadingMoreReplies ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Text style={{ color: colors.accent, fontSize: 14 }}>Load more replies</Text>}
            </TouchableOpacity>
          ) : null}
          ListHeaderComponent={
            <View>
              {post.post_type === "article" ? (
                /* ── Article Layout ── */
                <View style={{ backgroundColor: colors.surface }}>
                  {/* Hero image with gradient overlay */}
                  {allImages.length > 0 ? (
                    <TouchableOpacity activeOpacity={0.95} onPress={() => imgViewer.openViewer(allImages, 0)} style={styles.heroWrap}>
                      <Image source={{ uri: allImages[0] }} style={styles.articleHero} resizeMode="cover" />
                      <LinearGradient
                        colors={["transparent", isDark ? "rgba(13,17,23,0.95)" : "rgba(255,255,255,0.92)"]}
                        style={[StyleSheet.absoluteFill, { pointerEvents: "none" } as any]}
                        start={{ x: 0, y: 0.35 }}
                        end={{ x: 0, y: 1 }}
                      />
                      <View style={styles.heroOverlayContent}>
                        <View style={styles.articleBadgeRow}>
                          <Ionicons name="document-text" size={12} color={colors.accent} />
                          <Text style={[styles.articleBadgeTxt, { color: colors.accent }]}>ARTICLE</Text>
                          <Text style={[styles.readingTime, { color: colors.textSecondary }]}>
                            · {readingTime(post.content)} min read
                          </Text>
                        </View>
                        {post.article_title && !editMode && (
                          <Text style={[styles.articleHeadingOnHero, { color: colors.text }]}>{post.article_title}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.articleNoHeroPad}>
                      <View style={styles.articleBadgeRow}>
                        <Ionicons name="document-text" size={12} color={colors.accent} />
                        <Text style={[styles.articleBadgeTxt, { color: colors.accent }]}>ARTICLE</Text>
                        <Text style={[styles.readingTime, { color: colors.textSecondary }]}>
                          · {readingTime(post.content)} min read
                        </Text>
                      </View>
                      {post.article_title && !editMode && (
                        <Text style={[styles.articleHeading, { color: colors.text }]}>{post.article_title}</Text>
                      )}
                    </View>
                  )}

                  <View style={styles.articleContentPad}>
                    {/* Author byline */}
                    <View style={[styles.authorByline, { borderColor: colors.border }]}>
                      <TouchableOpacity onPress={() => router.push(`/@${post.author.handle}` as any)}>
                        <Avatar uri={post.author.avatar_url} name={post.author.display_name} size={32} square={!!(post.author.is_organization_verified)} />
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        <View style={styles.nameRow}>
                          <TouchableOpacity onPress={() => router.push(`/@${post.author.handle}` as any)}>
                            <Text style={[styles.authorName, { color: authorGoldNameplate ? "#D4A853" : colors.text }]}>{post.author.display_name}{authorVerifiedStar ? " ⭐" : ""}</Text>
                          </TouchableOpacity>
                          {post.author.is_organization_verified && <Ionicons name="checkmark-circle" size={14} color={Colors.gold} style={{ marginLeft: 4 }} />}
                          {!post.author.is_organization_verified && post.author.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.accent} style={{ marginLeft: 4 }} />}
                        </View>
                        <Text style={[styles.authorMeta, { color: colors.textMuted }]}>
                          {new Date(post.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} · {post.view_count.toLocaleString()} views
                        </Text>
                      </View>
                    </View>

                    {/* Body */}
                    {editMode ? (
                      <View style={{ gap: 10 }}>
                        <TextInput
                          style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                          value={editContent} onChangeText={setEditContent} multiline autoFocus maxLength={2000}
                        />
                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.border }]} onPress={() => setEditMode(false)}>
                            <Text style={[styles.editBtnText, { color: colors.text }]}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.accent }]} onPress={handleEdit} disabled={editSaving}>
                            {editSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.editBtnText, { color: "#fff" }]}>Save</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <>
                        <RichText style={[styles.articleBodyText, { color: colors.text }]}>{postDisplayText || post.content}</RichText>
                        {postIsTranslated && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 8 }}>
                            <Ionicons name="language" size={11} color={colors.textMuted} />
                            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted }}>
                              {`Translated · ${LANG_LABELS[postLang || ""] ?? postLang}`}
                            </Text>
                          </View>
                        )}
                      </>
                    )}

                    {renderEngagementBar()}
                    {renderAiSection()}
                    {renderRepliesHeader()}
                  </View>
                </View>
              ) : (
                /* ── Regular Post Layout ── */
                <View style={[styles.postSection, { backgroundColor: colors.surface }]}>
                  {/* Author row */}
                  <View style={styles.postHeader}>
                    <TouchableOpacity onPress={() => router.push(`/@${post.author.handle}` as any)}>
                      <Avatar uri={post.author.avatar_url} name={post.author.display_name} size={36} square={!!(post.author.is_organization_verified)} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <TouchableOpacity onPress={() => router.push(`/@${post.author.handle}` as any)}>
                          <Text style={[styles.authorName, { color: authorGoldNameplate ? "#D4A853" : colors.text }]}>{post.author.display_name}{authorVerifiedStar ? " ⭐" : ""}</Text>
                        </TouchableOpacity>
                        {post.author.is_organization_verified && <Ionicons name="checkmark-circle" size={14} color={Colors.gold} style={{ marginLeft: 4 }} />}
                        {!post.author.is_organization_verified && post.author.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.accent} style={{ marginLeft: 4 }} />}
                      </View>
                      <Text style={[styles.authorHandle, { color: colors.textMuted }]}>
                        @{post.author.handle} · {timeAgo(post.created_at)}
                      </Text>
                    </View>
                  </View>

                  {editMode ? (
                    <View style={{ gap: 10 }}>
                      <TextInput
                        style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                        value={editContent} onChangeText={setEditContent} multiline autoFocus maxLength={2000}
                      />
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.border }]} onPress={() => setEditMode(false)}>
                          <Text style={[styles.editBtnText, { color: colors.text }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.accent }]} onPress={handleEdit} disabled={editSaving}>
                          {editSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.editBtnText, { color: "#fff" }]}>Save</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <>
                      <RichText style={[styles.postContent, { color: colors.text }]}>{postDisplayText || post.content}</RichText>
                      {postIsTranslated && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 4 }}>
                          <Ionicons name="language" size={11} color={colors.textMuted} />
                          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted }}>
                            {`Translated · ${LANG_LABELS[postLang || ""] ?? postLang}`}
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  {allImages.length > 0 && (
                    <ImageGrid images={allImages} onPress={(i) => imgViewer.openViewer(allImages, i)} />
                  )}

                  <Text style={[styles.postTimestamp, { color: colors.textMuted }]}>
                    {new Date(post.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </Text>

                  {renderEngagementBar()}
                  {renderAiSection()}
                  {renderRepliesHeader()}
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <ReplyCard item={item} colors={colors} accent={accent} depth={0} onReplyTo={handleReplyTo} />
          )}
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        />

        {/* Reply composer */}
        {user ? (
          <>
            {/* Replying-to banner */}
            {replyingTo && (
              <View style={[styles.replyingBanner, { backgroundColor: colors.backgroundSecondary, borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.replyingText, { color: colors.textMuted }]}>
                    Replying to{" "}
                    <Text style={{ color: accent, fontFamily: "Inter_600SemiBold" }}>@{replyingTo.author.handle}</Text>
                  </Text>
                </View>
                <TouchableOpacity onPress={() => { setReplyingTo(null); setReplyText(""); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Image preview bar */}
            {attachedImage && (
              <View style={[styles.mediaPreviewBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={{ position: "relative" }}>
                  <Image source={{ uri: attachedImage.uri }} style={styles.mediaThumb} resizeMode="cover" />
                  <TouchableOpacity onPress={() => setAttachedImage(null)} style={styles.mediaRemoveBtn}>
                    <Ionicons name="close-circle" size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" }}>Tap × to remove</Text>
              </View>
            )}

            {/* Voice preview bar */}
            {recordState === "recorded" && recordedUri && (
              <VoicePreviewBar uri={recordedUri} durationSecs={recordedDuration} onDiscard={discardRecording} accent={accent} colors={colors} />
            )}

            {/* Quick emoji bar */}
            <View style={[styles.emojiBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
              {QUICK_EMOJIS.map((e) => (
                <TouchableOpacity key={e} onPress={() => setReplyText((t) => t + e)} style={styles.emojiBtn} activeOpacity={0.6}>
                  <Text style={styles.emojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Input row */}
            <View style={[styles.composerBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 4, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
              <Avatar uri={myProfile?.avatar_url ?? null} name={myProfile?.display_name ?? ""} size={30} />

              {recordState === "recording" ? (
                <RecordingBar elapsed={recordElapsed} onStop={() => stopRecording()} accent={accent} colors={colors} />
              ) : (
                <View style={{ flex: 1, position: "relative" }}>
                  <TextInput
                    ref={replyInputRef}
                    style={[styles.composerInput, { color: colors.text }]}
                    placeholder={recordState === "recorded" ? "Add a caption… (optional)" : replyingTo ? `Reply to @${replyingTo.author.handle}…` : "Write a reply…"}
                    placeholderTextColor={colors.textMuted}
                    value={replyText}
                    onChangeText={setReplyText}
                    maxLength={MAX_CHARS}
                    multiline
                  />
                  {replyText.length > MAX_CHARS - 100 && (
                    <Text style={[styles.charCount, { color: charLeft < 20 ? "#FF3B30" : colors.textMuted }]}>
                      {charLeft}
                    </Text>
                  )}
                </View>
              )}

              {/* Attachment buttons */}
              {recordState !== "recording" && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <TouchableOpacity onPress={pickImage} activeOpacity={0.7} hitSlop={6}
                    style={[styles.attachBtn, attachedImage && { backgroundColor: accent + "25" }]}>
                    <Ionicons name="image" size={19} color={attachedImage ? accent : colors.textMuted} />
                  </TouchableOpacity>
                  {recordState === "idle" && (
                    <TouchableOpacity onPress={startRecording} activeOpacity={0.7} hitSlop={6} style={styles.attachBtn}>
                      <Ionicons name="mic" size={19} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                <TouchableOpacity
                  onPress={sendReply}
                  disabled={!canSend}
                  style={[styles.sendBtn, { backgroundColor: canSend ? accent : colors.border }]}
                >
                  {sending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Ionicons name="arrow-up" size={16} color={canSend ? "#fff" : colors.textMuted} />}
                </TouchableOpacity>
              </Animated.View>
            </View>
          </>
        ) : (
          <View style={[styles.signInBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <TouchableOpacity
              onPress={() => router.push("/(auth)/login")}
              style={[styles.signInBtn, { backgroundColor: accent }]}
            >
              <Ionicons name="log-in" size={18} color="#fff" />
              <Text style={styles.signInBtnText}>Sign in to reply</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Context menu */}
      <Modal visible={menuVisible} transparent animationType="none" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); sharePost({ postId: post.id, authorName: post.author.display_name, content: post.content }); }}>
              <View style={[styles.menuIconWrap, { backgroundColor: colors.accent + "15" }]}><Ionicons name="share" size={20} color={colors.accent} /></View>
              <Text style={[styles.menuText, { color: colors.text }]}>Share Post</Text>
            </TouchableOpacity>

            {isOwner && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setEditContent(post.content); setEditMode(true); }}>
                <View style={[styles.menuIconWrap, { backgroundColor: colors.accent + "15" }]}><Ionicons name="create" size={20} color={colors.accent} /></View>
                <Text style={[styles.menuText, { color: colors.text }]}>Edit Post</Text>
              </TouchableOpacity>
            )}

            {isOwner && (
              <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                <View style={[styles.menuIconWrap, { backgroundColor: "#FF3B3015" }]}><Ionicons name="trash" size={20} color="#FF3B30" /></View>
                <Text style={[styles.menuText, { color: "#FF3B30" }]}>Delete Post</Text>
              </TouchableOpacity>
            )}

            {!isOwner && user && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setReportVisible(true); }}>
                <View style={[styles.menuIconWrap, { backgroundColor: "#FF950015" }]}><Ionicons name="flag" size={20} color="#FF9500" /></View>
                <Text style={[styles.menuText, { color: "#FF9500" }]}>Report Post</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.menuItem, { marginTop: 4 }]} onPress={() => setMenuVisible(false)}>
              <View style={[styles.menuIconWrap, { backgroundColor: colors.border }]}><Ionicons name="close" size={20} color={colors.textMuted} /></View>
              <Text style={[styles.menuText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report modal */}
      <Modal visible={reportVisible} transparent animationType="none" onRequestClose={() => setReportVisible(false)}>
        <View style={styles.menuOverlay}>
          <View style={[styles.reportSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.reportTitle, { color: colors.text }]}>Report Post</Text>
            <Text style={[styles.reportSubtitle, { color: colors.textMuted }]}>Why are you reporting this post?</Text>
            <View style={styles.reportReasons}>
              {REPORT_REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.reportChip, { borderColor: reportReason === r ? colors.accent : colors.border, backgroundColor: reportReason === r ? colors.accent + "12" : "transparent" }]}
                  onPress={() => setReportReason(r)}
                >
                  <Text style={[styles.reportChipText, { color: reportReason === r ? colors.accent : colors.text }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {reportReason === "Other" && (
              <TextInput
                style={[styles.reportInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                placeholder="Describe the issue…"
                placeholderTextColor={colors.textMuted}
                value={reportOtherText}
                onChangeText={setReportOtherText}
                multiline
                maxLength={500}
              />
            )}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={[styles.editBtn, { flex: 1, backgroundColor: colors.border }]} onPress={() => { setReportVisible(false); setReportReason(""); setReportOtherText(""); }}>
                <Text style={[styles.editBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editBtn, { flex: 1, backgroundColor: "#FF9500" }]}
                onPress={handleReport}
                disabled={reportSending || !reportReason.trim() || (reportReason === "Other" && !reportOtherText.trim())}
              >
                {reportSending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.editBtnText, { color: "#fff" }]}>Submit Report</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ImageViewer
        images={imgViewer.images}
        initialIndex={imgViewer.index}
        visible={imgViewer.visible}
        onClose={imgViewer.closeViewer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },

  /* Article hero */
  heroWrap: { position: "relative" },
  articleHero: { width: "100%", height: 200 },
  heroOverlayContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 18,
    paddingBottom: 20,
  },
  articleNoHeroPad: { padding: 18, paddingBottom: 4 },
  articleHeadingOnHero: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    lineHeight: 26,
    marginTop: 6,
  },
  articleHeading: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    lineHeight: 28,
    marginTop: 8,
  },

  /* Article content */
  articleContentPad: { padding: 12, paddingTop: 10 },
  articleBadgeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  articleBadgeTxt: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  readingTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  articleBodyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
    marginBottom: 14,
  },

  /* Author byline */
  authorByline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    marginBottom: 12,
    
    
    marginHorizontal: -12,
    paddingHorizontal: 12,
  },
  authorName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  authorMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  /* Regular post */
  postSection: { padding: 12, gap: 8 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  authorHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  postContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  postTimestamp: { fontSize: 13, fontFamily: "Inter_400Regular" },

  /* Image grid */
  imgSingle: { width: "100%", height: 260, borderRadius: 14 },
  imgThumb: { width: 110, height: 110, borderRadius: 10 },
  imgGrid2: { flexDirection: "row", gap: 4, height: 220, borderRadius: 14, overflow: "hidden" },
  imgGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, borderRadius: 14, overflow: "hidden" },
  imgGridItem: { width: "49.5%", height: 160, position: "relative" },
  imgGridCell: { width: "100%", height: "100%" },
  imgMoreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  imgMoreText: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },

  /* Engagement bar */
  engagementBar: {
    flexDirection: "row",
    
    
    marginVertical: 8,
    paddingVertical: 1,
  },
  engagementBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 7,
  },
  engagementDivider: { width: 0.5, marginVertical: 6 },
  engagementCount: { fontSize: 14, fontFamily: "Inter_500Medium" },

  /* AI section */
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 12,
  },
  aiBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  aiCard: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 12 },
  aiCardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  aiCardTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  aiCardText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },

  /* Replies section header */
  repliesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
    marginTop: 4,
    marginHorizontal: -12,
    paddingHorizontal: 0,
  },
  repliesHeaderLine: { flex: 1, height: 0.5 },
  repliesHeaderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 0.5,
  },
  repliesHeaderText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  /* Reply card */
  replyRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingRight: 16,
    gap: 10,
    position: "relative",
  },
  replyDepthLine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },
  replyBubble: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  replyHeader: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  replyName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  replyTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  replyContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  replyBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start" },
  replyBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  /* Reply composer */
  replyingBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    
  },
  replyingText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emojiBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    
    gap: 0,
  },
  emojiBtn: { flex: 1, alignItems: "center", paddingVertical: 5 },
  emojiText: { fontSize: 18 },
  mediaPreviewBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    
  },
  mediaThumb: { width: 48, height: 48, borderRadius: 8 },
  mediaRemoveBtn: { position: "absolute", top: -6, right: -6 },
  composerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 7,
    
  },
  composerInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    borderWidth: 0,
    outlineStyle: "none" as any,
    maxHeight: 90,
    paddingVertical: 2,
    textAlignVertical: "top",
  },
  charCount: { fontSize: 11, fontFamily: "Inter_500Medium" },
  attachBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  signInBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    
  },
  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 24,
  },
  signInBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  /* Edit mode */
  editInput: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
    minHeight: 100,
    textAlignVertical: "top",
  },
  editBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  editBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  /* Menu & report */
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  menuSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 20 },
  menuHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
  menuIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  menuText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  reportSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 20, maxHeight: "80%" },
  reportTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 4 },
  reportSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 16, color: "gray" },
  reportReasons: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  reportChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  reportChipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  reportInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 80, textAlignVertical: "top" },
});
