import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "@/lib/haptics";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { showAlert } from "@/lib/alert";
import { uploadChatMedia } from "@/lib/mediaUpload";

const PURPLE = "#5856D6";

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

type Channel = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  subscriber_count: number;
  is_verified: boolean;
  is_public: boolean;
  created_at: string;
  owner_id: string | null;
  owner: {
    id: string;
    display_name: string;
    handle: string;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
};

type Post = {
  id: string;
  content: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  like_count: number;
  myLike?: boolean;
};

export default function ChannelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const flatListRef = useRef<FlatList>(null);

  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subLoading, setSubLoading] = useState(false);

  // Composer state (owner only)
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachImage, setAttachImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isOwner = !!(user && channel?.owner_id === user.id);

  // ─── Load channel info ─────────────────────────────────────────────────────
  const loadChannel = useCallback(async () => {
    if (!id) { setNotFound(true); setLoading(false); return; }

    const { data, error } = await supabase
      .from("channels")
      .select(
        "id, name, description, avatar_url, subscriber_count, is_verified, is_public, created_at, owner_id, profiles!channels_owner_id_fkey(id, display_name, handle, avatar_url, is_verified)"
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !data) { setNotFound(true); setLoading(false); return; }

    const owner = (data as any).profiles;
    setChannel({
      id: data.id,
      name: data.name,
      description: data.description,
      avatar_url: data.avatar_url,
      subscriber_count: data.subscriber_count || 0,
      is_verified: !!(data as any).is_verified,
      is_public: data.is_public ?? true,
      created_at: data.created_at,
      owner_id: data.owner_id,
      owner: owner
        ? { id: owner.id, display_name: owner.display_name, handle: owner.handle, avatar_url: owner.avatar_url, is_verified: !!owner.is_verified }
        : null,
    });
    setLoading(false);
  }, [id]);

  // ─── Load posts as messages ────────────────────────────────────────────────
  const loadPosts = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("posts")
      .select("id, content, image_url, video_url, created_at, like_count")
      .eq("channel_id", id)
      .order("created_at", { ascending: false })
      .limit(60);

    if (!data) return;

    let likedSet = new Set<string>();
    if (user) {
      const { data: likesData } = await supabase
        .from("post_likes")
        .select("post_id")
        .eq("user_id", user.id)
        .in("post_id", data.map((p) => p.id));
      if (likesData) likedSet = new Set(likesData.map((l) => l.post_id));
    }

    setPosts(data.map((p) => ({ ...p, myLike: likedSet.has(p.id) })));
  }, [id, user]);

  // ─── Check subscription ────────────────────────────────────────────────────
  const checkSubscription = useCallback(async () => {
    if (!user || !id) return;
    const { data } = await supabase
      .from("channel_subscriptions")
      .select("id")
      .eq("channel_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    setIsSubscribed(!!data);
  }, [user, id]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadChannel(), loadPosts(), checkSubscription()]);
    setRefreshing(false);
  }, [loadChannel, loadPosts, checkSubscription]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Realtime new posts ────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`ch_posts_${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts", filter: `channel_id=eq.${id}` },
        (payload) => {
          const p = payload.new as Post;
          setPosts((prev) => [{ ...p, myLike: false }, ...prev]);
        }
      )
      .subscribe();
    realtimeRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // ─── Subscribe / unsubscribe ───────────────────────────────────────────────
  async function toggleSubscribe() {
    if (!user) { router.push("/(auth)/login" as any); return; }
    if (!channel) return;
    setSubLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (isSubscribed) {
        await supabase.from("channel_subscriptions").delete().eq("channel_id", channel.id).eq("user_id", user.id);
        await supabase.rpc("decrement_channel_subscriber", { p_channel_id: channel.id });
        setChannel((c) => c ? { ...c, subscriber_count: Math.max(0, c.subscriber_count - 1) } : c);
        setIsSubscribed(false);
      } else {
        await supabase.from("channel_subscriptions").upsert({ channel_id: channel.id, user_id: user.id }, { onConflict: "channel_id,user_id" });
        await supabase.rpc("increment_channel_subscriber", { p_channel_id: channel.id });
        setChannel((c) => c ? { ...c, subscriber_count: c.subscriber_count + 1 } : c);
        setIsSubscribed(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      showAlert("Error", "Could not update subscription.");
    }
    setSubLoading(false);
  }

  // ─── Like / unlike ────────────────────────────────────────────────────────
  async function toggleLike(postId: string) {
    if (!user) { router.push("/(auth)/login" as any); return; }
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const nowLiked = !post.myLike;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, myLike: nowLiked, like_count: nowLiked ? p.like_count + 1 : Math.max(0, p.like_count - 1) }
          : p
      )
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (nowLiked) {
      await supabase.from("post_likes").upsert({ post_id: postId, user_id: user.id }, { onConflict: "post_id,user_id" });
      await supabase.rpc("increment_post_like", { p_post_id: postId });
    } else {
      await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
      await supabase.rpc("decrement_post_like", { p_post_id: postId });
    }
  }

  // ─── Pick image to attach ──────────────────────────────────────────────────
  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingImage(true);
    try {
      if (!user || !id) return;
      const result = await uploadChatMedia("channel-media", id, user.id, asset.uri);
      if (result.error || !result.publicUrl) throw new Error(result.error || "Upload failed");
      setAttachImage(result.publicUrl);
    } catch {
      showAlert("Error", "Could not attach image.");
    }
    setUploadingImage(false);
  }

  // ─── Send broadcast message ────────────────────────────────────────────────
  async function sendMessage() {
    if (!user || !channel || (!text.trim() && !attachImage)) return;
    setSending(true);
    try {
      const { error } = await supabase.from("posts").insert({
        user_id: user.id,
        channel_id: channel.id,
        content: text.trim() || null,
        image_url: attachImage || null,
        like_count: 0,
        view_count: 0,
      });
      if (error) throw error;
      setText("");
      setAttachImage(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      showAlert("Error", "Could not send message.");
    }
    setSending(false);
  }

  async function shareChannel() {
    if (!channel) return;
    await Share.share({
      message: `Follow ${channel.name} on AfuChat! https://afuchat.com/channel/${channel.id}`,
      title: channel.name,
    });
  }

  // ─── Loading / not found ───────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[st.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={st.center}><ActivityIndicator color={PURPLE} size="large" /></View>
      </View>
    );
  }

  if (notFound || !channel) {
    return (
      <View style={[st.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <TouchableOpacity style={[st.topBarBtn, { margin: 8 }]} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={st.center}>
          <Ionicons name="megaphone" size={64} color={colors.textMuted} />
          <Text style={[st.notFoundTitle, { color: colors.text }]}>Channel Not Found</Text>
          <Text style={[st.notFoundSub, { color: colors.textMuted }]}>
            This channel may have been deleted or is no longer available.
          </Text>
          <TouchableOpacity style={[st.subBtn, { backgroundColor: PURPLE }]} onPress={() => router.back()}>
            <Text style={st.subBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Message bubble ────────────────────────────────────────────────────────
  function MessageBubble({ post }: { post: Post }) {
    const fromMe = isOwner;
    return (
      <View style={[st.row, fromMe ? st.rowRight : st.rowLeft]}>
        {!fromMe && (
          <View style={st.avatarCol}>
            {channel?.avatar_url ? (
              <Image source={{ uri: channel.avatar_url }} style={st.bubbleAvatar} />
            ) : (
              <LinearGradient colors={[PURPLE, "#A855F7"]} style={st.bubbleAvatarGrad}>
                <Ionicons name="megaphone" size={12} color="#fff" />
              </LinearGradient>
            )}
          </View>
        )}

        <View style={{ maxWidth: "78%", gap: 2 }}>
          {!fromMe && (
            <Text style={[st.senderName, { color: PURPLE }]} numberOfLines={1}>
              {channel?.name ?? "Channel"}
            </Text>
          )}

          <View style={[
            st.bubble,
            fromMe
              ? { backgroundColor: PURPLE, borderBottomRightRadius: 4 }
              : { backgroundColor: colors.surface, borderBottomLeftRadius: 4, borderWidth: 0.5, borderColor: colors.border },
          ]}>
            {post.image_url && (
              <Image
                source={{ uri: post.image_url }}
                style={st.bubbleImage}
                contentFit="cover"
              />
            )}
            {post.content ? (
              <Text style={[st.bubbleText, { color: fromMe ? "#fff" : colors.text }]}>
                {post.content}
              </Text>
            ) : null}
          </View>

          <View style={[st.bubbleMeta, fromMe ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
            <Text style={[st.bubbleTime, { color: colors.textMuted }]}>{fmtTime(post.created_at)}</Text>
            <TouchableOpacity onPress={() => toggleLike(post.id)} hitSlop={8} style={st.likeBtn}>
              <Ionicons
                name={post.myLike ? "heart" : "heart"}
                size={13}
                color={post.myLike ? "#FF2D55" : colors.textMuted}
              />
              {post.like_count > 0 && (
                <Text style={[st.likeCount, { color: post.myLike ? "#FF2D55" : colors.textMuted }]}>
                  {fmtNum(post.like_count)}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ─── Channel info banner (pinned above messages) ───────────────────────────
  const ListHeader = () => (
    <View style={[st.infoBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={st.infoBannerAvatar}>
        {channel.avatar_url ? (
          <Image source={{ uri: channel.avatar_url }} style={st.infoBannerAvatarImg} />
        ) : (
          <LinearGradient colors={[PURPLE, "#A855F7"]} style={st.infoBannerAvatarGrad}>
            <Ionicons name="megaphone" size={22} color="#fff" />
          </LinearGradient>
        )}
      </View>
      <Text style={[st.infoBannerName, { color: colors.text }]}>{channel.name}</Text>
      {channel.description ? (
        <Text style={[st.infoBannerDesc, { color: colors.textMuted }]}>{channel.description}</Text>
      ) : null}
      <View style={st.infoBannerStats}>
        <Ionicons name="people" size={14} color={colors.textMuted} />
        <Text style={[st.infoBannerStatText, { color: colors.textMuted }]}>
          {fmtNum(channel.subscriber_count)} subscribers
        </Text>
        {channel.owner && (
          <>
            <Text style={[{ color: colors.border }]}>·</Text>
            <Text style={[st.infoBannerStatText, { color: colors.textMuted }]}>
              by @{channel.owner.handle}
            </Text>
          </>
        )}
      </View>
      {!isOwner && (
        <TouchableOpacity
          style={[
            st.subBtn,
            isSubscribed
              ? { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border }
              : { backgroundColor: PURPLE },
          ]}
          onPress={toggleSubscribe}
          disabled={subLoading}
          activeOpacity={0.8}
        >
          {subLoading ? (
            <ActivityIndicator color={isSubscribed ? colors.textMuted : "#fff"} size="small" />
          ) : (
            <>
              <Ionicons
                name={isSubscribed ? "notifications" : "notifications"}
                size={15}
                color={isSubscribed ? colors.textMuted : "#fff"}
              />
              <Text style={[st.subBtnText, { color: isSubscribed ? colors.textMuted : "#fff" }]}>
                {isSubscribed ? "Subscribed" : "Subscribe"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
      <Text style={[st.infoBannerCreated, { color: colors.textMuted }]}>
        Channel created {new Date(channel.created_at).toLocaleDateString([], { year: "numeric", month: "long" })}
      </Text>
    </View>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[st.root, { backgroundColor: colors.background, paddingBottom: keyboardHeight }]}>
      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={st.topBarBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={st.headerCenter}
          onPress={() => {}}
          activeOpacity={0.7}
        >
          {channel.avatar_url ? (
            <Image source={{ uri: channel.avatar_url }} style={st.headerAvatar} />
          ) : (
            <LinearGradient colors={[PURPLE, "#A855F7"]} style={st.headerAvatarGrad}>
              <Ionicons name="megaphone" size={14} color="#fff" />
            </LinearGradient>
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[st.headerName, { color: colors.text }]} numberOfLines={1}>
                {channel.name}
              </Text>
              {channel.is_verified && <VerifiedBadge isVerified size={14} />}
            </View>
            <Text style={[st.headerSub, { color: colors.textMuted }]}>
              {fmtNum(channel.subscriber_count)} subscribers
            </Text>
          </View>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", gap: 2, alignItems: "center" }}>
          <TouchableOpacity onPress={shareChannel} hitSlop={12} style={st.topBarBtn}>
            <Ionicons name="share" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Message list — newest first (feed order, no inversion needed) */}
      <FlatList
        ref={flatListRef}
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble post={item} />}
        contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 12 }}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={
          <View style={st.emptyWrap}>
            <Ionicons name="megaphone" size={44} color={colors.textMuted} />
            <Text style={[st.emptyTitle, { color: colors.text }]}>
              {isOwner ? "Start broadcasting" : "No messages yet"}
            </Text>
            <Text style={[st.emptySub, { color: colors.textMuted }]}>
              {isOwner
                ? "Type a message below to broadcast to your subscribers."
                : "Subscribe to get notified when this channel posts."}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadAll(); }}
            tintColor={PURPLE}
          />
        }
      />

      {/* Composer (owner) or read-only notice (subscriber) */}
      {isOwner ? (
        <View style={[st.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {attachImage && (
            <View style={st.attachPreviewWrap}>
              <Image source={{ uri: attachImage }} style={st.attachPreview} contentFit="cover" />
              <TouchableOpacity style={st.attachRemove} onPress={() => setAttachImage(null)}>
                <Ionicons name="close-circle" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
          <View style={st.composerRow}>
            <TouchableOpacity
              style={[st.composerIcon, { backgroundColor: colors.background }]}
              onPress={pickImage}
              disabled={uploadingImage || sending}
            >
              {uploadingImage
                ? <ActivityIndicator size="small" color={PURPLE} />
                : <Ionicons name="image" size={22} color={PURPLE} />
              }
            </TouchableOpacity>

            <View style={[st.composerPill, { backgroundColor: colors.inputBg, borderColor: colors.border, ...Platform.select({ web: { boxShadow: "0 2px 14px rgba(0,0,0,0.13)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.13, shadowRadius: 8, elevation: 4 } }) }]}>
              <TextInput
                style={[st.composerInput, { color: colors.text }]}
                placeholder="Broadcast a message…"
                placeholderTextColor={colors.textMuted}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={2000}
              />
            </View>

            <TouchableOpacity
              style={[st.sendBtn, { backgroundColor: (text.trim() || attachImage) && !sending ? PURPLE : colors.border }]}
              onPress={sendMessage}
              disabled={sending || (!text.trim() && !attachImage)}
              activeOpacity={0.8}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={18} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[st.readOnlyBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Ionicons name="megaphone" size={15} color={colors.textMuted} />
          <Text style={[st.readOnlyText, { color: colors.textMuted }]}>
            {isSubscribed
              ? "You're subscribed — only the owner can broadcast."
              : "Subscribe to follow this channel's updates."}
          </Text>
          {!isSubscribed && (
            <TouchableOpacity
              style={[st.readOnlySubBtn, { backgroundColor: PURPLE }]}
              onPress={toggleSubscribe}
              disabled={subLoading}
            >
              {subLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={st.readOnlySubBtnText}>Subscribe</Text>
              }
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingBottom: 10,
    
    gap: 4,
  },
  topBarBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19 },
  headerAvatarGrad: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Message rows
  row: { marginBottom: 10, flexDirection: "row", alignItems: "flex-end", gap: 8 },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },
  avatarCol: { width: 28, alignItems: "center", marginBottom: 2 },
  bubbleAvatar: { width: 28, height: 28, borderRadius: 14 },
  bubbleAvatarGrad: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  senderName: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginLeft: 2, marginBottom: 1 },

  bubble: {
    borderRadius: 16,
    overflow: "hidden",
    maxWidth: "100%",
  },
  bubbleText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleImage: {
    width: 220,
    height: 160,
    borderRadius: 0,
  },
  bubbleMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  bubbleTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 3 },
  likeCount: { fontSize: 11, fontFamily: "Inter_500Medium" },

  // Info banner (pinned at top = FlatList footer when inverted)
  infoBanner: {
    alignItems: "center",
    padding: 24,
    marginHorizontal: 8,
    marginVertical: 12,
    borderRadius: 16,
    borderWidth: 0.5,
    gap: 6,
  },
  infoBannerAvatar: { marginBottom: 4 },
  infoBannerAvatarImg: { width: 72, height: 72, borderRadius: 36 },
  infoBannerAvatarGrad: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  infoBannerName: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  infoBannerDesc: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18, paddingHorizontal: 8, marginBottom: 2 },
  infoBannerStats: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoBannerStatText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoBannerCreated: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },

  // Subscribe button
  subBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 22,
    marginTop: 4,
  },
  subBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },

  // Empty
  emptyWrap: { alignItems: "center", gap: 10, paddingVertical: 48, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },

  // Not found
  notFoundTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  notFoundSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  // Composer
  composer: {
    
    paddingTop: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  composerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  composerPill: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    borderRadius: 999,
    borderWidth: 0.5,
    overflow: "hidden",
    justifyContent: "center",
  },
  composerInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  attachPreviewWrap: {
    position: "relative",
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 4,
  },
  attachPreview: { width: "100%", height: "100%" },
  attachRemove: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
  },

  // Read-only bar
  readOnlyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    
    flexWrap: "wrap",
  },
  readOnlyText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  readOnlySubBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  readOnlySubBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
