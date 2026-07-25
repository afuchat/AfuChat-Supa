import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
// PagerView gives true native 1:1 finger-tracking on Android/iOS.
const _PagerView: any = (() => { try { return require("react-native-pager-view").default; } catch { return null; } })();
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import AfuLogo from "@/components/ui/AfuLogo";
const SafeFlashList: typeof import("react-native").FlatList =
  (require("@shopify/flash-list").FlashList as any);
import { LinearGradient } from "@/components/ui/SafeGradient";
import { Redirect, router, useFocusEffect, useNavigation, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { AFUCHAT_SYSTEM_ID } from "@/lib/afuSystemChat";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import UserName from "@/components/ui/UserName";
import { StoryRing } from "@/components/ui/StoryRing";
import { Separator } from "@/components/ui/Separator";
import Colors from "@/constants/colors";
import { ChatRowSkeleton } from "@/components/ui/Skeleton";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { HomeBanner } from "@/components/ui/HomeBanner";
import { SuggestedUsers } from "@/components/ui/SuggestedUsers";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { getLocalConversations, saveConversations, deleteLocalConversation, pruneConversations, clearUnread } from "@/lib/storage/localConversations";
import { getPreloadedConversations, hasPreloadedConversations, invalidateConversationsPreload } from "@/lib/conversationsPreload";
import { AFUAI_CONV_ID, AFUAI_BOT_ID, getAIChatSnapshot } from "@/lib/aiChatStore";
import { useSuperApp } from "@/lib/superapp/MiniAppRuntime";
import { addOnlineListener, preloadConversationMessages } from "@/lib/offlineSync";
import { wasChatRecentlyVisited, clearChatVisited, getActiveChatId, markChatVisited } from "@/lib/chatVisited";
import { showAlert, confirmAlert } from "@/lib/alert";
import { showToast, showActionToast } from "@/lib/toast";
import { useChatPreferences } from "@/context/ChatPreferencesContext";
import { useAdvancedFeatures } from "@/context/AdvancedFeaturesContext";
import {
  loadFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  type ChatFolder,
} from "@/lib/storage/chatFolders";
import { FolderModal } from "@/components/chat/FolderModal";
import {
  getStoryUploadState,
  subscribeStoryUpload,
} from "@/lib/storyUploadStore";
import PostUploadBannerShared from "@/components/ui/PostUploadBanner";
import {
  getViewedUserIds,
  subscribeStoryViewed,
} from "@/lib/storyViewedStore";
import { usePhonebookNames } from "@/hooks/usePhonebookNames";
import { setTotalUnread } from "@/lib/chatUnreadEvents";

type StoryUser = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  hasUnseen: boolean;
  storyCount: number;
  seenCount: number;
  latestAt: string;
};

function stripMdPreview(s: string): string {
  return s
    .replace(/\[ACTION:[^\]]+\]/g, "")
    .replace(/\[SUGGEST:[^\]]+\]/g, "")
    .replace(/\[INVOICE:[\s\S]*?\]/g, "")
    .replace(/\[EXEC:\w+:[\s\S]*?\]/g, "")
    .replace(/\*\*([^*\n]*)\*\*/g, "$1")
    .replace(/~~([^~\n]*)~~/g, "$1")
    .replace(/\|\|([^|\n]*)\|\|/g, "$1")
    .replace(/__([^_\n]*)__/g, "$1")
    .replace(/_([^_\n]*)_/g, "$1")
    .replace(/\*{1,3}([^*\n]*)\*{1,3}/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeSysNotifPreview(raw: string): string | null {
  if (!raw.startsWith("{")) return null;
  try {
    const p = JSON.parse(raw);
    // Helper: resolve actor name from either format
    const actor: string =
      p.actor_name || p.actor_handle ||
      (p.data as any)?.actorName || (p.data as any)?.actor_name ||
      "Someone";

    // ── Format 1: _sys_notif (SystemNotificationCard format) ──────────────────
    if (p?._sys_notif) {
      const type: string = p.type || "";
      switch (type) {
        case "new_follower":           return `👤 ${actor} started following you`;
        case "new_like":               return `❤️ ${actor} liked your post`;
        case "new_reply":              return `💬 ${actor} replied to your post`;
        case "new_mention":            return `💬 ${actor} mentioned you`;
        case "gift":                   return `🎁 ${actor} sent you a gift`;
        case "missed_call":            return `📞 Missed call from ${actor}`;
        case "order_placed":           return `🛍️ New order from ${actor}`;
        case "order_shipped":          return `📦 Your order has shipped`;
        case "escrow_released":        return `💰 Payment released to your wallet`;
        case "dispute_raised":         return `⚠️ Dispute opened by ${actor}`;
        case "refund_issued":          return `✅ Refund issued to your wallet`;
        case "shop_review":            return `⭐ ${actor} left you a review`;
        case "acoin_received":         return `💰 ${p.body || "AC received"}`;
        case "acoin_sent":             return `💸 ${p.body || "AC sent"}`;
        case "live_started":           return `🔴 ${actor} is live now`;
        case "channel_post":           return `📢 New post from ${actor}`;
        case "subscription_activated": return `⭐ Premium subscription activated`;
        case "seller_approved":        return `✅ Seller account approved`;
        case "verification_approved":  return `✅ Your account is now verified`;
        case "system_welcome":         return `👋 Welcome to AfuChat!`;
        default:                       return p.title || p.body || "Notification";
      }
    }

    // ── Format 2: raw notification / push-payload format ─────────────────────
    // Shape: { body: string, data: {...}, type: string, title?: string }
    // This is what the DB trigger stores when routing notifications to the
    // system chat. body is often empty so we fall back to a type-based label.
    if (p?.type && typeof p.type === "string") {
      const body: string = typeof p.body === "string" ? p.body.trim() : "";
      const title: string = typeof p.title === "string" ? p.title.trim() : "";
      if (body) return body;
      if (title) return title;
      const t: string = p.type;
      switch (t) {
        case "new_follower":           return `👤 ${actor} started following you`;
        case "new_like":               return `❤️ ${actor} liked your post`;
        case "new_reply":              return `💬 ${actor} replied to your post`;
        case "new_mention":            return `💬 ${actor} mentioned you`;
        case "gift":                   return `🎁 ${actor} sent you a gift`;
        case "missed_call":
        case "call":                   return `📞 Missed call from ${actor}`;
        case "message":                return `💬 New message`;
        case "order_placed":           return `🛍️ New order from ${actor}`;
        case "order_shipped":          return `📦 Your order has shipped`;
        case "escrow_released":        return `💰 Payment released`;
        case "dispute_raised":         return `⚠️ Dispute opened`;
        case "refund_issued":          return `✅ Refund issued`;
        case "shop_review":            return `⭐ ${actor} left a review`;
        case "acoin_received":         return `💰 AfuCoins received`;
        case "acoin_sent":             return `💸 AfuCoins sent`;
        case "live_started":           return `🔴 ${actor} is live`;
        case "channel_post":           return `📢 New post from ${actor}`;
        case "subscription_activated": return `⭐ Premium activated`;
        case "seller_approved":        return `✅ Seller account approved`;
        case "verification_approved":  return `✅ Account verified`;
        case "system_welcome":
        case "system":                 return `📬 AfuChat notification`;
        default:                       return `📬 Notification`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function buildMsgPreview(encrypted_content: string | null, attachment_type: string | null): string {
  const raw = encrypted_content || "";
  if (attachment_type === "story_reply") {
    let preview = raw;
    if (preview.startsWith("storyUserId:")) {
      const pipeIdx = preview.indexOf("|");
      preview = pipeIdx >= 0 ? preview.slice(pipeIdx + 1) : "Shared a story";
    }
    return `📸 ${preview || "Story"}`;
  }
  if (attachment_type === "image") return raw ? `📷 ${stripMdPreview(raw)}` : "📷 Photo";
  if (attachment_type === "video") return "🎥 Video";
  if (attachment_type === "audio") return "🎤 Voice message";
  if (attachment_type === "file") return raw ? `📎 ${stripMdPreview(raw)}` : "📎 File";
  if (attachment_type === "payment") {
    try {
      const pay = JSON.parse(raw);
      const coinLabel = pay.currency === "nexa" ? "Nexa" : "ACoin";
      const amt = pay.amount != null ? `${pay.amount} ${coinLabel}` : coinLabel;
      return `💸 ${amt} sent`;
    } catch { return "💸 Payment"; }
  }
  // Red envelope: strip internal UUID from "🧧 Red Envelope [uuid] - note"
  if (raw.startsWith("🧧")) {
    return raw.replace(/\[[0-9a-f-]{36}\]\s*-?\s*/i, "").trim() || "🧧 Red Envelope";
  }
  const sysPreview = decodeSysNotifPreview(raw);
  if (sysPreview) return sysPreview;
  return stripMdPreview(raw);
}

type ChatItem = {
  id: string;
  name: string | null;
  is_group: boolean;
  is_channel: boolean;
  /** "notes" = My Notes self-chat (always pinned first); "channel_broadcast" = subscribed broadcast channel */
  kind?: "notes" | "channel_broadcast";
  /** For kind === "channel_broadcast": the real ID in the `channels` table */
  channel_id?: string;
  other_display_name: string;
  other_avatar: string | null;
  other_id: string;
  last_message: string;
  last_message_at: string;
  last_message_is_mine: boolean;
  last_message_status: "sent" | "delivered" | "read";
  is_pinned: boolean;
  is_archived: boolean;
  avatar_url: string | null;
  unread_count: number;
  is_verified: boolean;
  is_organization_verified: boolean;
  other_last_seen: string | null;
  other_show_online: boolean;
  /** Unsent draft text for this chat (empty string = no draft) */
  draft?: string;
  /** null = muted forever; ISO string = muted until that time; undefined = not muted */
  muted_until?: string | null;
};

function TypingDots({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: -4, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0,  duration: 280, useNativeDriver: true }),
          Animated.delay(300),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, []);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 2 }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: color,
            opacity: 0.75,
            transform: [{ translateY: dot }],
          }}
        />
      ))}
    </View>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function isUserOnline(lastSeen: string | null, showOnline: boolean): boolean {
  if (!showOnline || !lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
}

function ChatRow({
  item,
  onPress,
  onAction,
  isActive,
  isTyping,
  phonebookName,
  selectMode = false,
  isSelected = false,
  onEnterSelectMode,
  onToggleSelect,
}: {
  item: ChatItem;
  onPress: () => void;
  onAction?: (
    action: "togglePin" | "toggleArchive" | "delete" | "open" | "mute" | "unmute",
    item: ChatItem,
  ) => void;
  isActive?: boolean;
  isTyping?: boolean;
  phonebookName?: string;
  selectMode?: boolean;
  isSelected?: boolean;
  onEnterSelectMode?: () => void;
  onToggleSelect?: () => void;
}) {
  const { colors } = useTheme();
  const isSpecial = item.kind === "notes" || item.kind === "channel_broadcast";
  const isChatMuted = item.muted_until !== undefined && (item.muted_until === null || new Date(item.muted_until) > new Date());
  const displayName = item.kind === "notes"
    ? "My Notes"
    : item.is_group || item.is_channel
      ? item.name
      : (phonebookName || item.other_display_name);
  const avatar = item.kind === "notes" ? null : item.is_group || item.is_channel ? item.avatar_url : item.other_avatar;
  const hasUnread = item.unread_count > 0 && !wasChatRecentlyVisited(item.id);
  const isOnlineDot = !item.is_group && !item.is_channel && (item.other_id === AFUCHAT_SYSTEM_ID || isUserOnline(item.other_last_seen, item.other_show_online));

  return (
    <View>
    <TouchableOpacity
      style={[styles.row, { backgroundColor: isSelected ? colors.accent + "18" : isActive ? colors.backgroundSecondary : colors.surface }]}
      onPress={selectMode ? onToggleSelect : onPress}
      onLongPress={selectMode ? undefined : onEnterSelectMode}
      delayLongPress={320}
      activeOpacity={0.7}
    >
      {selectMode && (
        <View style={[
          selStyles.circle,
          { borderColor: isSelected ? colors.accent : colors.textMuted + "66" },
          isSelected && { backgroundColor: colors.accent },
        ]}>
          {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
        </View>
      )}
      <View style={{ position: "relative" }}>
        {item.kind === "notes" ? (
          <LinearGradient
            colors={["#7B61FF", "#00C2CB"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="bookmark" size={24} color="#fff" />
          </LinearGradient>
        ) : (
          <Avatar uri={avatar} name={displayName || "Chat"} size={50} square={!!(item.is_organization_verified)} userId={!item.is_group && !item.is_channel ? item.other_id : undefined} />
        )}
        {isOnlineDot && (
          <View style={[styles.onlineDot, { borderColor: colors.surface }]} />
        )}
      </View>
      <View style={[styles.rowContent, item.is_archived && { opacity: 0.65 }]}>
        <View style={styles.rowTop}>
          <View style={styles.nameRow}>
            {item.is_pinned && (
              <Ionicons name="pin" size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
            )}
            {item.is_archived && (
              <Ionicons name="archive" size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
            )}
            {(!item.is_group && !item.is_channel && item.other_id) ? (
              <UserName
                userId={item.other_id}
                name={displayName || "Chat"}
                style={[styles.name, { color: colors.text, fontFamily: hasUnread ? "Inter_700Bold" : "Inter_600SemiBold" }]}
                numberOfLines={1}
              />
            ) : (
              <Text
                style={[styles.name, { color: colors.text, fontFamily: hasUnread ? "Inter_700Bold" : "Inter_600SemiBold" }]}
                numberOfLines={1}
              >
                {displayName || "Chat"}
              </Text>
            )}
            {!item.is_group && (
              <VerifiedBadge isVerified={item.is_verified} isOrganizationVerified={item.is_organization_verified} size={14} />
            )}
            {item.is_channel && (
              <Ionicons name="megaphone" size={12} color={colors.accent} style={{ marginLeft: 4 }} />
            )}
            {isChatMuted && (
              <Ionicons name="notifications-off" size={12} color={colors.textMuted} style={{ marginLeft: 4 }} />
            )}
          </View>
          <View style={styles.rowTopRight}>
            {item.last_message_is_mine && !hasUnread && (
              <Ionicons
                name={item.last_message_status === "read" ? "checkmark-done" : item.last_message_status === "delivered" ? "checkmark-done" : "checkmark"}
                size={14}
                color={item.last_message_status === "read" ? "#53BDEB" : colors.textMuted}
                style={{ marginRight: 2 }}
              />
            )}
            <Text style={[styles.time, { color: hasUnread ? colors.accent : colors.textMuted }]}>
              {item.last_message_at ? formatTime(item.last_message_at) : ""}
            </Text>
          </View>
        </View>
        <View style={styles.rowBottom}>
          {isTyping ? (
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[styles.preview, { color: colors.accent, fontFamily: "Inter_500Medium" }]}>
                typing
              </Text>
              <TypingDots color={colors.accent} />
            </View>
          ) : item.draft ? (
            <Text style={[styles.preview, { flex: 1 }]} numberOfLines={1}>
              <Text style={{ color: "#FF3B30", fontFamily: "Inter_600SemiBold" }}>Draft: </Text>
              <Text style={{ color: colors.textSecondary as string }}>{stripMdPreview(item.draft)}</Text>
            </Text>
          ) : (
          <Text
            style={[styles.preview, { color: hasUnread ? colors.text : colors.textSecondary, fontFamily: hasUnread ? "Inter_500Medium" : "Inter_400Regular", flex: 1 }]}
            numberOfLines={1}
          >
            {item.last_message || "No messages yet"}
          </Text>
          )}
          {hasUnread && (
            <View style={[styles.unreadBadge, { backgroundColor: colors.accent }]}>
              <Text style={styles.unreadBadgeText}>
                {item.unread_count > 99 ? "99+" : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
    </View>
  );
}

function useStoryUpload() {
  return useSyncExternalStore(subscribeStoryUpload, getStoryUploadState, getStoryUploadState);
}

function StoryUploadBanner({ colors }: { colors: any }) {
  const upload = useStoryUpload();
  if (!upload) return null;

  const isDone = upload.done;
  const isFailed = upload.failed;
  const pct = Math.round(upload.progress * 100);

  return (
    <View style={[uploadBannerStyles.wrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={uploadBannerStyles.row}>
        <View style={[uploadBannerStyles.iconCircle, { backgroundColor: isDone ? "#22C55E20" : isFailed ? "#EF444420" : colors.accent + "22" }]}>
          <Ionicons
            name={isDone ? "checkmark-circle" : isFailed ? "alert-circle" : "camera"}
            size={16}
            color={isDone ? "#22C55E" : isFailed ? "#EF4444" : colors.accent}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[uploadBannerStyles.label, { color: colors.text }]}>
            {isDone ? "Story posted!" : isFailed ? "Story upload failed" : "Posting your story…"}
          </Text>
          {isFailed && upload.errorMessage ? (
            <Text style={[uploadBannerStyles.caption, { color: "#EF4444" }]} numberOfLines={2}>
              {upload.errorMessage}
            </Text>
          ) : upload.caption ? (
            <Text style={[uploadBannerStyles.caption, { color: colors.textMuted }]} numberOfLines={1}>
              {upload.caption}
            </Text>
          ) : null}
        </View>
        {!isDone && !isFailed && (
          <Text style={[uploadBannerStyles.pct, { color: colors.accent }]}>{pct}%</Text>
        )}
      </View>
      {!isDone && !isFailed && (
        <View style={[uploadBannerStyles.track, { backgroundColor: colors.border }]}>
          <View style={[uploadBannerStyles.fill, { width: `${pct}%` as any, backgroundColor: colors.accent }]} />
        </View>
      )}
    </View>
  );
}

function PostUploadBanner({ colors: _colors }: { colors?: any }) {
  return <PostUploadBannerShared />;
}

const uploadBannerStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  iconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, fontWeight: "600" },
  caption: { fontSize: 11, marginTop: 1 },
  pct: { fontSize: 12, fontWeight: "600", minWidth: 30, textAlign: "right" },
  track: { height: 3, borderRadius: 2, overflow: "hidden" },
  fill: { height: 3, borderRadius: 2 },
});

function StoriesBar({ userId, colors }: { userId: string; colors: any }) {
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  // Used to force re-render when storyViewedStore fires
  const [_viewedTick, setViewedTick] = useState(0);

  const loadStories = useCallback(async () => {
    if (!isOnline()) return;
    const now = new Date().toISOString();
    let storiesData: any[] | null = null;
    try {
      const { data } = await supabase
        .from("stories")
        .select("id, user_id, caption, privacy, created_at, profiles!stories_user_id_fkey(display_name, avatar_url)")
        .gt("expires_at", now)
        .order("created_at", { ascending: true })
        .limit(100);
      storiesData = data;
    } catch {}

    if (!storiesData || storiesData.length === 0) {
      setStoryUsers([]);
      return;
    }

    const filtered = storiesData.filter((s: any) => {
      const p = s.privacy || "everyone";
      if (p === "only_me" && s.user_id !== userId) return false;
      if (p === "close_friends" && s.user_id !== userId) return false;
      return true;
    });

    if (filtered.length === 0) {
      setStoryUsers([]);
      return;
    }

    const storyIds = filtered.map((s: any) => s.id);
    const { data: viewsData } = await supabase
      .from("story_views")
      .select("story_id")
      .eq("viewer_id", userId)
      .in("story_id", storyIds);

    const viewedSet = new Set((viewsData || []).map((v: any) => v.story_id));
    const sessionViewed = getViewedUserIds();

    const userMap = new Map<string, StoryUser>();
    for (const s of filtered as any[]) {
      const existing = userMap.get(s.user_id);
      // Own stories are always "seen" — you created them
      // Also mark as seen if the session store says this userId was visited
      const isOwnStory = s.user_id === userId;
      const sessionSeen = sessionViewed.has(s.user_id);
      const isSeen = isOwnStory || sessionSeen || viewedSet.has(s.id);
      if (existing) {
        existing.storyCount += 1;
        if (isSeen) existing.seenCount += 1;
        if (!isSeen) existing.hasUnseen = true;
        if (s.created_at > existing.latestAt) existing.latestAt = s.created_at;
      } else {
        userMap.set(s.user_id, {
          userId: s.user_id,
          displayName: s.profiles?.display_name || "User",
          avatarUrl: s.profiles?.avatar_url || null,
          hasUnseen: !isSeen,
          storyCount: 1,
          seenCount: isSeen ? 1 : 0,
          latestAt: s.created_at,
        });
      }
    }

    const users = Array.from(userMap.values());
    users.sort((a, b) => {
      if (a.hasUnseen && !b.hasUnseen) return -1;
      if (!a.hasUnseen && b.hasUnseen) return 1;
      return new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime();
    });

    setStoryUsers(users);
  }, [userId]);

  // Refresh ring immediately when the view screen marks stories as viewed
  useEffect(() => {
    return subscribeStoryViewed(() => {
      setViewedTick((t) => t + 1);
      setStoryUsers((prev) =>
        prev.map((u) => {
          if (getViewedUserIds().has(u.userId)) {
            return { ...u, seenCount: u.storyCount, hasUnseen: false };
          }
          return u;
        })
      );
    });
  }, []);

  useFocusEffect(useCallback(() => { loadStories(); }, [loadStories]));

  useEffect(() => {
    const channel = supabase
      .channel("stories-bar-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stories" }, () => {
        loadStories();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadStories]);

  // Reload when our own story finishes uploading (in-process backup to Supabase realtime)
  useEffect(() => {
    let wasDone = false;
    return subscribeStoryUpload(() => {
      const s = getStoryUploadState();
      if (s?.done && !wasDone) {
        wasDone = true;
        // Small delay to let the DB propagate before fetching
        setTimeout(() => loadStories(), 500);
      }
      if (!s) wasDone = false;
    });
  }, [loadStories]);

  if (storyUsers.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={storyBarStyles.list} nestedScrollEnabled>
      {(
        <TouchableOpacity
          style={storyBarStyles.item}
          onPress={() => router.push("/stories/camera")}
          activeOpacity={0.75}
        >
          <View style={[storyBarStyles.addCircle, { borderColor: colors.accent }]}>
            <Ionicons name="add" size={26} color={colors.accent} />
          </View>
          <Text style={[storyBarStyles.name, { color: colors.textSecondary }]}>Your Story</Text>
        </TouchableOpacity>
      )}
      {storyUsers.map((u) => (
        <TouchableOpacity
          key={u.userId}
          style={storyBarStyles.item}
          onPress={() => router.push({ pathname: "/stories/view", params: { userId: u.userId } })}
        >
          <StoryRing size={52} storyCount={u.storyCount} seenCount={u.seenCount}>
            <Avatar uri={u.avatarUrl} name={u.displayName} size={52} />
          </StoryRing>
          <Text style={[storyBarStyles.name, { color: colors.textSecondary }]} numberOfLines={1}>{u.displayName}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const storyBarStyles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingVertical: 10, gap: 14 },
  item: { alignItems: "center", width: 68 },
  addCircle: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.brand, borderStyle: "dashed" },
  name: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "center" },
});

// ─── Compact Story Avatars for Header ────────────────────────────────────────
function CompactStoryHeader({ userId, colors, onExpand }: { userId: string; colors: any; onExpand: () => void }) {
  const [previews, setPreviews] = useState<Array<{ id: string; avatarUrl: string | null; displayName: string; hasUnseen: boolean }>>([]);

  useEffect(() => {
    const now = new Date().toISOString();
    supabase.from("stories")
      .select("user_id, profiles!stories_user_id_fkey(display_name, avatar_url)")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!data?.length) { setPreviews([]); return; }
        const seen = new Set<string>();
        const list: Array<{ id: string; avatarUrl: string | null; displayName: string; hasUnseen: boolean }> = [];
        for (const s of data as any[]) {
          if (seen.has(s.user_id)) continue;
          seen.add(s.user_id);
          list.push({
            id: s.user_id,
            avatarUrl: s.profiles?.avatar_url || null,
            displayName: s.profiles?.display_name || "User",
            hasUnseen: s.user_id !== userId,
          });
          if (list.length >= 3) break;
        }
        setPreviews(list);
      });
  }, [userId]);

  if (previews.length === 0) {
    return (
      <TouchableOpacity
        onPress={() => router.push("/stories/camera")}
        style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.accent, borderStyle: "dashed" }}
        activeOpacity={0.7}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <Ionicons name="add" size={20} color={colors.accent} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onExpand} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 2 }} activeOpacity={0.75}>
      {previews.map((p, i) => (
        <View
          key={p.id}
          style={{
            marginLeft: i === 0 ? 0 : -9,
            zIndex: 3 - i,
            width: 32, height: 32, borderRadius: 16,
            borderWidth: 2,
            borderColor: colors.background,
            overflow: "hidden",
          }}
        >
          <Avatar uri={p.avatarUrl} name={p.displayName} size={28} />
          {p.hasUnseen && (
            <View style={{ position: "absolute", bottom: 0, right: 0, width: 9, height: 9, borderRadius: 5, backgroundColor: "#1f95ff", borderWidth: 1.5, borderColor: colors.background }} />
          )}
        </View>
      ))}
    </TouchableOpacity>
  );
}

type ChatTabKey = "all" | "unread" | "personal" | "groups" | "channels";

const NOTES_CACHE_KEY = "notes_chat_id_v2";
// In-memory cache so Notes opens instantly on the second+ press (skips AsyncStorage round-trip)
let _notesChatIdMem: string | null = null;

async function findOrCreateNotesChatId(userId: string): Promise<string | null> {
  if (_notesChatIdMem) return _notesChatIdMem;
  let id = await AsyncStorage.getItem(NOTES_CACHE_KEY).catch(() => null);
  if (id) {
    const { data } = await supabase.from("chats").select("id").eq("id", id).maybeSingle();
    if (!data) id = null;
  }
  if (!id) {
    const { data: found } = await supabase
      .from("chats").select("id").eq("name", `notes:${userId}`).maybeSingle();
    if (found) {
      id = found.id;
    } else {
      const { data: newChat } = await supabase
        .from("chats")
        .insert({ name: `notes:${userId}`, is_group: false, is_channel: false })
        .select("id").single();
      if (newChat) {
        id = newChat.id;
        await supabase.from("chat_members").insert({ chat_id: id, user_id: userId });
      }
    }
    if (id) await AsyncStorage.setItem(NOTES_CACHE_KEY, id).catch(() => {});
  }
  if (id) _notesChatIdMem = id;
  return id;
}

/**
 * The chats screen. By default this renders as a full-page route (chats tab).
 * When mounted with `panelMode`, it renders as a fixed-width 360px column
 * suitable for a WhatsApp/Telegram-style master-detail layout (the chat list
 * stays sticky on the left, the chat conversation is rendered to its right).
 *
 * `DesktopShell` mounts `<ChatsListPanel />` (which is `<ChatsScreen panelMode />`)
 * for any `/chat/[id]` route so the chats list is persistent while a chat is
 * open. On the chats tab itself, `panelMode` is false and the list takes the
 * full route width as usual.
 */
export function ChatsScreen({ panelMode = false, onOpenChat }: { panelMode?: boolean; onOpenChat?: (item: ChatItem, chatId: string) => void } = {}) {
  const { colors, isDark } = useTheme();
  const { user, profile, linkedAccounts, switchAccount, loading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const pathname = usePathname() || "/";
  const activeChatMatch = pathname.match(/^\/chat\/([^/]+)/);
  const activeChatId = activeChatMatch ? activeChatMatch[1] : null;

  // Phone-book name overrides: show the name the user saved in their contacts
  // inside chat rows instead of the registered display_name.
  const phonebookNames = usePhonebookNames();

  // Initialize from the in-memory preload cache if available (populated by _layout.tsx
  // before this component ever mounts). This makes the chat list appear instantly
  // for returning users — no skeleton, no SQLite wait on first render.
  const [chats, setChats] = useState<ChatItem[]>(() => getPreloadedConversations() as any);
  const [loading, setLoading] = useState(() => !hasPreloadedConversations());
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [tabFilter, setTabFilter] = useState<ChatTabKey>("all");
  const [typingChatIds, setTypingChatIds] = useState<Record<string, boolean>>({});
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const realtimeReconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When the device goes offline the realtime channel may replay buffered
  // INSERT events on reconnect, causing every chat to appear unread. We
  // suppress the +1 increment until loadChats() has finished reconciling
  // the correct unread counts from Supabase.
  const suppressUnreadIncrementRef = useRef(false);
  const { prefs: chatPrefs } = useChatPreferences();
  const { features: advancedFeatures } = useAdvancedFeatures();
  const { width: windowWidth } = useWindowDimensions();

  // ── Folder state ────────────────────────────────────────────────────────────
  const [folders, setFolders]           = useState<ChatFolder[]>([]);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder]     = useState<ChatFolder | null>(null);
  const [pageIdx, setPageIdx]           = useState(0);
  const pagerRef        = useRef<any>(null);
  const folderScrollRef = useRef<ScrollView>(null);
  const tabLayoutsRef   = useRef<Record<number, { x: number; width: number }>>({});
  const folderPillX     = useRef(new Animated.Value(6)).current;
  const folderPillW     = useRef(new Animated.Value(52)).current;

  // ── Multi-select state ────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── FAB hide-on-scroll ──────────────────────────────────────────────────────
  const fabAnim     = useRef(new Animated.Value(1)).current;
  const lastScrollY = useRef(0);
  const fabHidden   = useRef(false);

  // ── Collapsible stories bar (hard pull-down to reveal) ──────────────────
  const [storiesExpanded, setStoriesExpanded] = useState(false);
  const storiesExpandedRef = useRef(false);
  const storiesHeightAnim  = useRef(new Animated.Value(0)).current;
  // Drives compact avatar opacity/scale in header (1=visible, 0=hidden)
  const compactAvatarAnim  = useRef(new Animated.Value(1)).current;
  const pullRevealFiredRef  = useRef(false);

  const expandStories = useCallback(() => {
    if (storiesExpandedRef.current) return;
    storiesExpandedRef.current = true;
    setStoriesExpanded(true);
    Animated.parallel([
      Animated.spring(storiesHeightAnim, { toValue: 1, useNativeDriver: false, speed: 18, bounciness: 4 }),
      Animated.timing(compactAvatarAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [storiesHeightAnim, compactAvatarAnim]);

  const collapseStories = useCallback(() => {
    Animated.parallel([
      Animated.spring(storiesHeightAnim, { toValue: 0, useNativeDriver: false, speed: 24, bounciness: 0 }),
      Animated.timing(compactAvatarAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      storiesExpandedRef.current = false;
      setStoriesExpanded(false);
    });
  }, [storiesHeightAnim, compactAvatarAnim]);

  const handleFabScroll = useCallback((e: any) => {
    const y  = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    lastScrollY.current = y;

    // Hard pull-down past threshold → expand stories bar
    if (y < -50 && !storiesExpandedRef.current && !pullRevealFiredRef.current) {
      pullRevealFiredRef.current = true;
      expandStories();
    }
    if (y >= 0) pullRevealFiredRef.current = false;

    if (dy > 6 && y > 60 && !fabHidden.current) {
      fabHidden.current = true;
      Animated.spring(fabAnim, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 0 }).start();
      if (storiesExpandedRef.current) collapseStories();
    } else if (dy < -4 && fabHidden.current) {
      fabHidden.current = false;
      Animated.spring(fabAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
    }
  }, [fabAnim, expandStories, collapseStories]);

  const loadChats = useCallback(async (background = false) => {
    if (!user) return;

    if (!background) {
      // If the preload already populated initial state, skip the redundant SQLite
      // read — the user already sees the cached list. Otherwise (first install or
      // cache miss) fall back to reading SQLite so we still show something fast.
      if (!hasPreloadedConversations()) {
        const cached = await getLocalConversations();
        if (cached.length > 0) {
          setChats(cached as any);
          setLoading(false);
        }
      }
    }

    if (!isOnline()) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    let memberRows: { chat_id: string }[] | null = null;
    let memberFetchFailed = false;
    try {
      const { data, error } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", user.id);
      if (error) {
        memberFetchFailed = true;
      } else {
        memberRows = data;
      }
    } catch {
      memberFetchFailed = true;
    }

    // Query failed (network blip, transient error) — keep showing whatever
    // the user already sees rather than wiping the list to "No chats yet".
    if (memberFetchFailed) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Genuinely no chats (new account, left all chats, etc.)
    if (!memberRows || memberRows.length === 0) {
      setChats([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const chatIds = memberRows.map((m: any) => m.chat_id);

    // Pre-compute which chats need unread counting — skip currently-open and recently-visited chats.
    // This resolves the race condition where mark-as-read writes from the chat screen haven't
    // landed in message_status yet by the time loadChats(true) fires.
    const activeChatId = getActiveChatId();
    const unreadCheckIds = chatIds.filter(
      (id) => id !== activeChatId && !wasChatRecentlyVisited(id),
    );

    const [chatResult, lastMsgsResult, unreadMsgsResult, mutesResult] = await Promise.all([
      supabase
        .from("chats")
        .select(`
          id, name, is_group, is_channel, is_pinned, is_archived, avatar_url, updated_at,
          chat_members(user_id, profiles(id, display_name, avatar_url, is_verified, is_organization_verified, last_seen, show_online_status))
        `)
        .in("id", chatIds)
        .order("updated_at", { ascending: false })
        .limit(200),
      // Fetch with a generous limit — one very active chat (e.g. AfuAI) can
      // consume many rows and crowd out quieter ones. We take the larger of
      // (chatIds.length * 15) or 300, capped at 1000, so every conversation
      // is almost certain to get at least one message row in this batch.
      supabase
        .from("messages")
        .select("id, chat_id, encrypted_content, sent_at, attachment_type, sender_id")
        .in("chat_id", chatIds)
        .order("sent_at", { ascending: false })
        .limit(Math.min(Math.max(chatIds.length * 15, 300), 1000)),
      unreadCheckIds.length > 0
        ? supabase
            .from("messages")
            .select("id, chat_id")
            .in("chat_id", unreadCheckIds)
            .neq("sender_id", user.id)
            .order("sent_at", { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] }),
      supabase
        .from("chat_mutes")
        .select("chat_id, muted_until")
        .eq("user_id", user.id)
        .in("chat_id", chatIds),
    ]);

    // Build a map of chatId → muted_until (null = forever; string = ISO expiry; missing = not muted)
    const now = new Date().toISOString();
    const muteMap: Record<string, string | null> = {};
    for (const row of ((mutesResult as any)?.data ?? [])) {
      if (row.muted_until === null || row.muted_until > now) {
        muteMap[row.chat_id] = row.muted_until ?? null;
      }
    }

    const chatRows = chatResult.data;
    if (!chatRows) { setLoading(false); setRefreshing(false); return; }

    const lastMsgMap: Record<string, { lastMessage: string; lastMessageAt: string; isFromMe: boolean; lastMsgId: string }> = {};

    function applyMsgRow(m: { id: string; chat_id: string; encrypted_content: string | null; sent_at: string; attachment_type: string | null; sender_id: string }) {
      if (lastMsgMap[m.chat_id]) return;
      lastMsgMap[m.chat_id] = {
        lastMessage: buildMsgPreview(m.encrypted_content, m.attachment_type),
        lastMessageAt: m.sent_at,
        isFromMe: m.sender_id === user?.id,
        lastMsgId: m.id,
      };
    }

    for (const m of (lastMsgsResult.data || [])) {
      applyMsgRow(m);
    }

    // Phase 2: any chat still missing a preview after the batch query gets its
    // own targeted fetch. This handles edge cases where one very active chat
    // exhausts the batch limit and crowds out quieter conversations.
    const uncoveredIds = chatIds.filter((id) => !lastMsgMap[id]);
    if (uncoveredIds.length > 0) {
      const fallbacks = await Promise.all(
        uncoveredIds.map((id) =>
          supabase
            .from("messages")
            .select("id, chat_id, encrypted_content, sent_at, attachment_type, sender_id")
            .eq("chat_id", id)
            .order("sent_at", { ascending: false })
            .limit(1)
        )
      );
      for (const r of fallbacks) {
        if (r.data?.[0]) applyMsgRow(r.data[0]);
      }
    }

    const myLastMsgIds = Object.values(lastMsgMap).filter(v => v.isFromMe).map(v => v.lastMsgId);
    const lastMsgStatusMap: Record<string, "read" | "delivered" | "sent"> = {};
    if (myLastMsgIds.length > 0) {
      const { data: statusRows } = await supabase
        .from("message_status")
        .select("message_id, read_at, delivered_at")
        .in("message_id", myLastMsgIds);
      for (const s of (statusRows || []) as any[]) {
        lastMsgStatusMap[s.message_id] = s.read_at ? "read" : s.delivered_at ? "delivered" : "sent";
      }
    }

    const unreadMsgRows = unreadMsgsResult.data || [];
    const unreadMsgIds = unreadMsgRows.map((m: any) => m.id);
    let readSet = new Set<string>();
    if (unreadMsgIds.length > 0) {
      const batchSize = 200;
      const readPromises = [];
      for (let i = 0; i < unreadMsgIds.length; i += batchSize) {
        readPromises.push(
          supabase
            .from("message_status")
            .select("message_id")
            .eq("user_id", user.id)
            .not("read_at", "is", null)
            .in("message_id", unreadMsgIds.slice(i, i + batchSize))
        );
      }
      const readResults = await Promise.all(readPromises);
      for (const { data: readRows } of readResults) {
        for (const r of (readRows || [])) {
          readSet.add(r.message_id);
        }
      }
    }

    // unreadMsgRows is already pre-filtered to only non-visited, non-active chats
    // (see unreadCheckIds above) — no need to re-check activeChatId here.
    const unreadMap: Record<string, number> = {};
    for (const msg of unreadMsgRows) {
      if (!readSet.has(msg.id)) {
        unreadMap[msg.chat_id] = (unreadMap[msg.chat_id] || 0) + 1;
      }
    }

    const items: ChatItem[] = chatRows.map((c: any) => {
      const allMembers = (c.chat_members || []) as any[];
      const others = allMembers.filter((m: any) => m.user_id !== user.id);
      // Self-chat ("My Notes"): no other members — use own profile
      const isSelfChat = !c.is_group && !c.is_channel && others.length === 0;
      const otherRaw = isSelfChat
        ? allMembers.find((m: any) => m.user_id === user.id)
        : others[0];
      const otherProfile = Array.isArray(otherRaw?.profiles) ? otherRaw.profiles[0] : otherRaw?.profiles;
      const lm = lastMsgMap[c.id];
      return {
        id: c.id,
        name: c.name,
        is_group: !!c.is_group,
        is_channel: !!c.is_channel,
        other_display_name: isSelfChat ? "My Notes" : (otherProfile?.display_name || "Unknown"),
        other_avatar: isSelfChat ? null : (otherProfile?.avatar_url || null),
        other_id: isSelfChat ? user.id : (otherProfile?.id || ""),
        last_message: lm?.lastMessage || "",
        last_message_at: lm?.lastMessageAt || c.updated_at || "",
        last_message_is_mine: lm?.isFromMe ?? false,
        last_message_status: lm?.isFromMe ? (lastMsgStatusMap[lm.lastMsgId] || "sent") : "sent",
        is_pinned: !!c.is_pinned,
        is_archived: !!c.is_archived,
        avatar_url: c.avatar_url,
        unread_count: unreadMap[c.id] || 0,
        is_verified: isSelfChat ? false : !!otherProfile?.is_verified,
        is_organization_verified: isSelfChat ? false : !!otherProfile?.is_organization_verified,
        other_last_seen: isSelfChat ? null : (otherProfile?.last_seen || null),
        other_show_online: isSelfChat ? false : (otherProfile?.show_online_status !== false),
        muted_until: muteMap[c.id] !== undefined ? muteMap[c.id] : undefined,
      };
    });

    // Extract self-chat (My Notes) from items so we can always pin it at position 0
    const selfChatItem = items.find(
      (item) => !item.is_group && !item.is_channel && item.other_id === user.id
    );
    const regularItems = items.filter(
      (item) => !((!item.is_group && !item.is_channel && item.other_id === user.id))
    );

    regularItems.sort((a, b) => {
      // Pinned floats to top; archived sinks to bottom; otherwise newest-first
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      if (a.is_archived && !b.is_archived) return 1;
      if (!a.is_archived && b.is_archived) return -1;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });

    // ── Deduplicate DMs: one chat per other_id ────────────────────────────────
    // The list is already newest-first, so the FIRST occurrence of each other_id
    // is the canonical (most recent) chat. Stale duplicates are filtered out and
    // the user is silently removed from their chat_members so they never resurface.
    {
      const seenOtherIds = new Set<string>();
      const staleIds: string[] = [];
      const dedupedItems: ChatItem[] = [];
      for (const item of regularItems) {
        // Groups, channels, and self-chat are never duplicated — pass through.
        if (item.is_group || item.is_channel || !item.other_id || item.other_id === user.id) {
          dedupedItems.push(item);
          continue;
        }
        if (seenOtherIds.has(item.other_id)) {
          staleIds.push(item.id);
        } else {
          seenOtherIds.add(item.other_id);
          dedupedItems.push(item);
        }
      }
      regularItems.length = 0;
      regularItems.push(...dedupedItems);

      // Silently leave stale duplicate chats so they can't come back
      if (staleIds.length > 0) {
        Promise.all(
          staleIds.map((chatId) =>
            supabase.from("chat_members").delete().eq("chat_id", chatId).eq("user_id", user.id)
          )
        ).catch(() => {});
      }
    }

    // ── Fetch subscribed broadcast channels ──────────────────────────────────
    const { data: subRows } = await supabase
      .from("channel_subscriptions")
      .select("channel_id, channels(id, name, avatar_url, is_verified)")
      .eq("user_id", user.id);

    const channelIds = (subRows || []).map((s: any) => s.channel_id).filter(Boolean);
    const latestPostMap: Record<string, any> = {};
    if (channelIds.length > 0) {
      const { data: latestPosts } = await supabase
        .from("posts")
        .select("id, channel_id, content, created_at")
        .in("channel_id", channelIds)
        .order("created_at", { ascending: false })
        .limit(Math.max(channelIds.length * 3, 50));
      for (const p of (latestPosts || []) as any[]) {
        if (!latestPostMap[p.channel_id]) latestPostMap[p.channel_id] = p;
      }
    }

    const channelItems: ChatItem[] = (subRows || []).flatMap((s: any) => {
      const ch = Array.isArray(s.channels) ? s.channels[0] : s.channels;
      if (!ch) return [];
      const lp = latestPostMap[s.channel_id];
      return [{
        id: `channel_broadcast:${ch.id}`,
        channel_id: ch.id,
        kind: "channel_broadcast" as const,
        name: ch.name || "Channel",
        is_group: false,
        is_channel: true,
        other_display_name: ch.name || "Channel",
        other_avatar: null,
        other_id: "",
        last_message: lp?.content ? stripMdPreview(lp.content) : "No posts yet",
        last_message_at: lp?.created_at || "",
        last_message_is_mine: false,
        last_message_status: "sent" as const,
        is_pinned: false,
        is_archived: false,
        avatar_url: ch.avatar_url || null,
        unread_count: 0,
        is_verified: !!ch.is_verified,
        is_organization_verified: false,
        other_last_seen: null,
        other_show_online: false,
      }];
    });

    // ── Load local unsent drafts ──────────────────────────────────────────────
    // Read all draft keys at once so we can (a) show "Draft:" labels and
    // (b) sort drafted chats above non-drafted ones.
    const combined = [...regularItems, ...channelItems];
    const allCombinedIds = combined.map((c) => c.id).filter(Boolean);
    let draftMap: Record<string, string> = {};
    try {
      const draftPairs = await AsyncStorage.multiGet(
        allCombinedIds.map((cid) => `chat_draft_${cid}`)
      );
      for (const [key, val] of draftPairs) {
        if (val && val.trim()) {
          draftMap[key.replace("chat_draft_", "")] = val;
        }
      }
    } catch {}

    // Sort: pinned → drafted (non-pinned, non-archived) → normal → archived
    combined.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      if (a.is_archived && !b.is_archived) return 1;
      if (!a.is_archived && b.is_archived) return -1;
      const aD = !a.is_pinned && !a.is_archived && !!draftMap[a.id];
      const bD = !b.is_pinned && !b.is_archived && !!draftMap[b.id];
      if (aD && !bD) return -1;
      if (!aD && bD) return 1;
      if (!a.last_message_at && b.last_message_at) return 1;
      if (a.last_message_at && !b.last_message_at) return -1;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });

    // Build My Notes item — always at position 0 regardless of activity
    const notesItem: ChatItem = {
      id: selfChatItem?.id || "MY_NOTES_VIRTUAL",
      kind: "notes" as const,
      name: "My Notes",
      is_group: false,
      is_channel: false,
      other_display_name: "My Notes",
      other_avatar: null,
      other_id: user.id,
      last_message: selfChatItem?.last_message || "",
      last_message_at: selfChatItem?.last_message_at || "",
      last_message_is_mine: selfChatItem?.last_message_is_mine ?? true,
      last_message_status: "sent" as const,
      is_pinned: false,
      is_archived: false,
      avatar_url: null,
      unread_count: selfChatItem?.unread_count || 0,
      is_verified: false,
      is_organization_verified: false,
      other_last_seen: null,
      other_show_online: false,
      draft: draftMap[selfChatItem?.id || ""] || "",
    };

    const finalItems: ChatItem[] = [
      notesItem,
      ...combined.map((item) => ({ ...item, draft: draftMap[item.id] || "" })),
    ];

    finalItems.forEach((item) => {
      if (item.unread_count === 0 && item.kind !== "notes" && item.kind !== "channel_broadcast") {
        clearChatVisited(item.id);
      }
    });

    setChats(finalItems);
    // Reconciliation complete — allow realtime events to increment unread again.
    suppressUnreadIncrementRef.current = false;
    // Discard the in-memory preload — SQLite is now fresh so next app launch
    // will re-read it cleanly via preloadConversations().
    invalidateConversationsPreload();
    // Only persist real chat/group items locally (not synthetic notes or channel items)
    const regularIds = regularItems.map((c) => c.id);
    saveConversations(regularItems).catch(() => {});
    // Remove any locally-cached conversations that are no longer returned by
    // Supabase (e.g. deleted chats, chats the user left on another device).
    // This is the primary guard against stale deleted chats reappearing.
    pruneConversations(regularIds).catch(() => {});
    // Proactively pre-cache messages for all visible chats so they open offline
    // even if the user has never tapped into that conversation before.
    // Fire-and-forget — skips any chat that already has local messages.
    preloadConversationMessages(regularItems.map((c) => c.id)).catch(() => {});
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadChats(); }, [loadChats]);
  useFocusEffect(useCallback(() => { loadChats(true); }, [loadChats]));

  // Pre-warm the Notes chat ID in the background so the first tap on "My Notes"
  // is instant (avoids an AsyncStorage + Supabase round-trip on press).
  useEffect(() => {
    if (user?.id) findOrCreateNotesChatId(user.id).catch(() => {});
  }, [user?.id]);

  // Push the latest total unread into the shared in-memory store so the tab
  // bar badge updates instantly without waiting for a SQLite round-trip.
  useEffect(() => {
    const total = chats.reduce((s, c) => s + (c.unread_count ?? 0), 0);
    setTotalUnread(total);
  }, [chats]);

  // Right-click context-menu actions on chat list rows.
  const handleChatAction = useCallback(
    async (
      action: "togglePin" | "toggleArchive" | "delete" | "open" | "mute" | "unmute",
      item: ChatItem,
    ) => {
      if (action === "open") {
        Haptics.selectionAsync();
        if (item.kind === "channel_broadcast" && item.channel_id) {
          router.push({ pathname: "/channel/[id]", params: { id: item.channel_id } } as any);
          return;
        }
        let chatId = item.id;
        if (item.kind === "notes" && chatId === "MY_NOTES_VIRTUAL") {
          chatId = (await findOrCreateNotesChatId(user?.id || "")) || "";
          if (!chatId) return;
        }
        router.push({
          pathname: "/chat/[id]",
          params: {
            id: chatId,
            otherName: item.kind === "notes" ? "My Notes" : (item.other_display_name || ""),
            otherAvatar: item.other_avatar || "",
            otherId: item.other_id || "",
            isGroup: item.is_group ? "true" : "false",
            isChannel: item.is_channel ? "true" : "false",
            chatName: item.name || "",
            chatAvatar: item.avatar_url || "",
          },
        });
        return;
      }
      // Don't allow pin/archive/delete on special items
      if (item.kind === "notes" || item.kind === "channel_broadcast") return;
      if (action === "togglePin") {
        const next = !item.is_pinned;
        setChats((prev) =>
          prev.map((c) => (c.id === item.id ? { ...c, is_pinned: next } : c)),
        );
        const { error } = await supabase
          .from("chats")
          .update({ is_pinned: next })
          .eq("id", item.id);
        if (error) {
          showAlert("Couldn't update pin", error.message);
          loadChats(true);
        } else {
          showActionToast(
            next ? "Chat pinned" : "Chat unpinned",
            "Undo",
            async () => {
              setChats((prev) =>
                prev.map((c) => (c.id === item.id ? { ...c, is_pinned: !next } : c)),
              );
              await supabase.from("chats").update({ is_pinned: !next }).eq("id", item.id);
            },
            { type: "info", icon: next ? "pin" : "pin-outline" },
          );
        }
        return;
      }
      if (action === "toggleArchive") {
        const next = !item.is_archived;
        setChats((prev) =>
          prev.map((c) => c.id === item.id ? { ...c, is_archived: next } : c),
        );
        const { error } = await supabase
          .from("chats")
          .update({ is_archived: next })
          .eq("id", item.id);
        if (error) {
          showAlert("Couldn't archive chat", error.message);
          loadChats(true);
        } else {
          showActionToast(
            next ? "Chat archived" : "Chat unarchived",
            "Undo",
            async () => {
              setChats((prev) =>
                prev.map((c) => (c.id === item.id ? { ...c, is_archived: !next } : c)),
              );
              await supabase.from("chats").update({ is_archived: !next }).eq("id", item.id);
            },
            { type: "info", icon: next ? "archive" : "archive-outline" },
          );
        }
        return;
      }
      if (action === "delete") {
        const isGroup = item.is_group && !item.is_channel;
        const ok = await confirmAlert(
          isGroup ? "Leave group?" : "Delete chat?",
          isGroup
            ? "You will leave this group. You can be added back by an admin."
            : "This will permanently delete this conversation for everyone.",
          { confirmText: isGroup ? "Leave" : "Delete", destructive: true },
        );
        if (!ok) return;
        setChats((prev) => prev.filter((c) => c.id !== item.id));
        deleteLocalConversation(item.id).catch(() => {});
        if (isGroup) {
          // Leave the group — remove only this user's membership
          const { error } = await supabase
            .from("chat_members")
            .delete()
            .eq("chat_id", item.id)
            .eq("user_id", user!.id);
          if (error) {
            showAlert("Couldn't leave group", error.message);
            loadChats(true);
          }
        } else {
          const { error } = await supabase
            .from("chats")
            .delete()
            .eq("id", item.id);
          if (error) {
            showAlert("Couldn't delete chat", error.message);
            loadChats(true);
          }
        }
        return;
      }
      if (action === "mute" || action === "unmute") {
        if (!user) return;
        if (action === "unmute") {
          setChats((prev) => prev.map((c) => c.id === item.id ? { ...c, muted_until: undefined } : c));
          await supabase.from("chat_mutes").delete().eq("user_id", user.id).eq("chat_id", item.id);
          showToast("Notifications unmuted", { type: "info", icon: "notifications-outline" });
        } else {
          // Quick mute: 8 hours by default from the list; full duration picker is inside the chat
          const until = new Date(Date.now() + 8 * 3600_000).toISOString();
          setChats((prev) => prev.map((c) => c.id === item.id ? { ...c, muted_until: until } : c));
          await supabase.from("chat_mutes").upsert(
            { user_id: user.id, chat_id: item.id, muted_until: until, created_at: new Date().toISOString() },
            { onConflict: "user_id,chat_id" },
          );
          showActionToast("Muted for 8 hours", "Undo", async () => {
            setChats((prev) => prev.map((c) => c.id === item.id ? { ...c, muted_until: undefined } : c));
            await supabase.from("chat_mutes").delete().eq("user_id", user.id).eq("chat_id", item.id);
          }, { type: "info", icon: "notifications-off-outline" });
        }
        return;
      }
    },
    [loadChats, user],
  );

  // ── Multi-select handlers ─────────────────────────────────────────────────
  const enterSelectMode = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback((items: ChatItem[]) => {
    Haptics.selectionAsync();
    setSelectedIds(new Set(items.map((c) => c.id)));
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const ok = await confirmAlert(
      `Delete ${count} chat${count !== 1 ? "s" : ""}?`,
      "This will permanently delete the selected conversations for everyone.",
      { confirmText: "Delete", destructive: true },
    );
    if (!ok) return;
    const ids = Array.from(selectedIds);
    const chatMap = new Map(chats.map((c) => [c.id, c]));
    setChats((prev) => prev.filter((c) => !ids.includes(c.id)));
    exitSelectMode();
    await Promise.all([
      ...ids.map((id) => {
        const c = chatMap.get(id);
        if (c?.is_group && !c?.is_channel) {
          // Leave the group — remove only this user's membership
          return supabase.from("chat_members").delete().eq("chat_id", id).eq("user_id", user!.id);
        }
        return supabase.from("chats").delete().eq("id", id);
      }),
      ...ids.map((id) => deleteLocalConversation(id)),
    ]);
  }, [selectedIds, exitSelectMode, chats, user]);

  useEffect(() => {
    if (!user) return;
    import("../../lib/rewardXp").then(({ rewardXp }) => rewardXp("daily_login")).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // Listen for new chats being created (new chat_member rows for this user)
    const memberChannel = supabase
      .channel(`chatlist-member-inserts:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_members", filter: `user_id=eq.${user.id}` },
        () => loadChats(true)
      )
      .subscribe();
    return () => { supabase.removeChannel(memberChannel); };
  }, [user, loadChats]);

  useEffect(() => {
    if (!user) return;
    return addOnlineListener(() => loadChats());
  }, [user, loadChats]);

  // Suppress realtime unread increments while offline / reconnecting so that
  // replayed buffered messages don't mark every chat as unread. The flag is
  // cleared by loadChats() after it has reconciled correct counts from Supabase.
  useEffect(() => {
    return onConnectivityChange((online) => {
      if (!online) suppressUnreadIncrementRef.current = true;
    });
  }, []);


  const chatIdsKey = chats.map((c) => c.id).sort().join(",");

  useEffect(() => {
    if (!user || !chatIdsKey) return;

    const chatIds = chatIdsKey.split(",");

    // Subscribe to new messages in each known chat
    const msgChannel = supabase.channel(`chatlist-messages:${user.id}`);
    chatIds.forEach((chatId) => {
      msgChannel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (payload: any) => {
          const msg = payload.new as {
            id: string;
            chat_id: string;
            encrypted_content: string | null;
            sent_at: string;
            attachment_type: string | null;
            sender_id: string;
          } | null;

          if (msg?.chat_id) {
            const preview = buildMsgPreview(msg.encrypted_content, msg.attachment_type);
            const isFromMe = msg.sender_id === user.id;
            const activeChatId = getActiveChatId();

            // Instantly patch the matching conversation in state — no network call needed.
            setChats((prev) => {
              const updated = prev.map((c) => {
                if (c.id !== msg.chat_id) return c;
                return {
                  ...c,
                  last_message: preview,
                  last_message_at: msg.sent_at,
                  last_message_is_mine: isFromMe,
                  // Increment unread only when the message is from someone else,
                  // this chat isn't the one currently open, and we are not in
                  // the suppression window (offline / reconnecting). Realtime
                  // replays buffered messages on reconnect which would otherwise
                  // mark every chat unread; loadChats() clears the suppression
                  // after it reconciles the correct counts from Supabase.
                  unread_count:
                    !isFromMe && msg.chat_id !== activeChatId && !wasChatRecentlyVisited(msg.chat_id) && !suppressUnreadIncrementRef.current
                      ? c.unread_count + 1
                      : c.unread_count,
                };
              });

              // Re-sort: pinned first, then archived last, then by latest message.
              // My Notes (kind === "notes") always stays at index 0.
              const notes = updated.filter((c) => c.kind === "notes");
              const rest  = updated.filter((c) => c.kind !== "notes");
              rest.sort((a, b) => {
                if (a.is_pinned && !b.is_pinned) return -1;
                if (!a.is_pinned && b.is_pinned) return 1;
                if (a.is_archived && !b.is_archived) return 1;
                if (!a.is_archived && b.is_archived) return -1;
                if (!a.last_message_at && b.last_message_at) return 1;
                if (a.last_message_at && !b.last_message_at) return -1;
                return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
              });
              return [...notes, ...rest];
            });
          }

          // Debounced full reconciliation (unread counts, read receipts, deleted messages, etc.)
          if (realtimeReconcileTimer.current) clearTimeout(realtimeReconcileTimer.current);
          realtimeReconcileTimer.current = setTimeout(() => loadChats(true), 2000);
        }
      );
    });
    // The status callback fires synchronously when the WebSocket closes —
    // BEFORE Supabase replays any buffered events. This closes the race window
    // where NetInfo fires `offline` too late and buffered INSERTs slip through
    // and falsely mark every chat as unread.
    msgChannel.subscribe((status: string) => {
      if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        suppressUnreadIncrementRef.current = true;
      }
    });

    // Also subscribe to chat-level updates (pinning, archiving, name changes)
    // We filter client-side since Supabase realtime doesn't support IN filters
    const chatChannel = supabase
      .channel(`chatlist-chats:${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chats" },
        (payload: any) => {
          if (chatIds.includes(payload.new?.id)) {
            loadChats(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(chatChannel);
    };
  }, [user, chatIdsKey, loadChats]);

  useEffect(() => {
    if (!user || !chatPrefs.typing_indicators) return;
    const ch = supabase.channel(`user-typing-${user.id}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "typing" }, (payload) => {
      const { chat_id: chatId, user_id: uid, is_typing } = (payload.payload || {}) as any;
      if (!uid || uid === user.id || !chatId) return;
      if (is_typing) {
        if (typingTimersRef.current[chatId]) clearTimeout(typingTimersRef.current[chatId]);
        setTypingChatIds((prev) => ({ ...prev, [chatId]: true }));
        typingTimersRef.current[chatId] = setTimeout(() => {
          setTypingChatIds((prev) => { const next = { ...prev }; delete next[chatId]; return next; });
        }, 6000);
      } else {
        if (typingTimersRef.current[chatId]) { clearTimeout(typingTimersRef.current[chatId]); delete typingTimersRef.current[chatId]; }
        setTypingChatIds((prev) => { const next = { ...prev }; delete next[chatId]; return next; });
      }
    }).subscribe();
    return () => {
      supabase.removeChannel(ch);
      Object.values(typingTimersRef.current).forEach((t) => clearTimeout(t));
      typingTimersRef.current = {};
      setTypingChatIds({});
    };
  }, [user, chatPrefs.typing_indicators]);

  const tabFiltered = chats.filter((c) => {
    if (tabFilter === "unread") return c.unread_count > 0;
    if (tabFilter === "personal") return !c.is_group && !c.is_channel && c.kind !== "channel_broadcast";
    if (tabFilter === "groups") return c.is_group && !c.is_channel;
    if (tabFilter === "channels") return c.is_channel || c.kind === "channel_broadcast";
    return true;
  });

  const filtered = search
    ? tabFiltered.filter((c) => {
        const name = c.is_group || c.is_channel ? c.name : c.other_display_name;
        return name?.toLowerCase().includes(search.toLowerCase());
      })
    : tabFiltered;

  const totalUnread = chats.reduce((sum, c) => sum + c.unread_count, 0);
  const personalCount = chats.filter((c) => !c.is_group && !c.is_channel && c.kind !== "channel_broadcast").length;
  const groupsCount = chats.filter((c) => c.is_group && !c.is_channel).length;
  const channelsCount = chats.filter((c) => c.is_channel || c.kind === "channel_broadcast").length;

  const TABS: { key: ChatTabKey; label: string; icon: keyof typeof Ionicons.glyphMap; count: number }[] = [
    { key: "all", label: "All chats", icon: "chatbubbles-outline", count: chats.length },
    { key: "unread", label: "Unread", icon: "mail-unread-outline", count: totalUnread },
    { key: "personal", label: "Personal", icon: "person-outline", count: personalCount },
    { key: "groups", label: "Groups", icon: "people-outline", count: groupsCount },
    { key: "channels", label: "Channels", icon: "megaphone-outline", count: channelsCount },
  ];

  // ── Folder system ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadFolders().then(setFolders);
  }, [user?.id]);

  // ── Folder pill animation + tab-bar auto-scroll ───────────────────────────
  // Fires on tap-to-switch; for swipe, the pill tracks in real-time via onPageScroll.
  useEffect(() => {
    const layout = tabLayoutsRef.current[pageIdx];
    if (!layout) return;
    Animated.spring(folderPillX, { toValue: layout.x - 4, damping: 22, stiffness: 200, useNativeDriver: false }).start();
    Animated.spring(folderPillW, { toValue: layout.width + 8, damping: 22, stiffness: 200, useNativeDriver: false }).start();
    folderScrollRef.current?.scrollTo({ x: Math.max(0, layout.x - 40), animated: true });
  }, [pageIdx]);

  // Real-time pill tracking during a PagerView swipe (position=int, offset=0..1)
  const handlePageScroll = useCallback((e: any) => {
    const { position, offset } = e.nativeEvent;
    const fromLayout = tabLayoutsRef.current[position];
    const toLayout   = tabLayoutsRef.current[position + 1];
    if (!fromLayout) return;
    if (!toLayout || offset === 0) {
      folderPillX.setValue(fromLayout.x - 4);
      folderPillW.setValue(fromLayout.width + 8);
      return;
    }
    folderPillX.setValue(fromLayout.x + (toLayout.x - fromLayout.x) * offset - 4);
    folderPillW.setValue(fromLayout.width + (toLayout.width - fromLayout.width) * offset + 8);
    folderScrollRef.current?.scrollTo({
      x: Math.max(0, fromLayout.x + (toLayout.x - fromLayout.x) * offset - 40),
      animated: false,
    });
  }, [folderPillX, folderPillW]);

  const handlePageSelected = useCallback((e: any) => {
    setPageIdx(e.nativeEvent.position);
  }, []);

  // Show the folder tab bar on mobile only when the feature is enabled or
  // the user already has folders (so their data is never hidden).
  const showFolderUI = !panelMode && (advancedFeatures.chat_folders || folders.length > 0);
  const hasFolders   = folders.length > 0;

  type AllPage = { key: "all" };
  const pages: (AllPage | ChatFolder)[] = [{ key: "all" }, ...folders];

  const getPageChats = useCallback(
    (page: AllPage | ChatFolder): ChatItem[] => {
      let result = chats;
      if ("filter" in page) {
        if (page.filter === "unread")   result = chats.filter((c) => c.unread_count > 0);
        else if (page.filter === "personal") result = chats.filter((c) => !c.is_group && !c.is_channel && c.kind !== "channel_broadcast");
        else if (page.filter === "groups")   result = chats.filter((c) => c.is_group && !c.is_channel);
        else if (page.filter === "channels") result = chats.filter((c) => c.is_channel || c.kind === "channel_broadcast");
      }
      if (search) {
        result = result.filter((c) => {
          const name = c.is_group || c.is_channel ? c.name : c.other_display_name;
          return name?.toLowerCase().includes(search.toLowerCase());
        });
      }
      return result;
    },
    [chats, search],
  );

  useEffect(() => {
    if (panelMode) return;
    navigation.setOptions({
      tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? "99+" : totalUnread) : undefined,
    });
  }, [navigation, totalUnread, panelMode]);

  // Chats currently visible — used by "Select All" to know what to select.
  const currentPageChats: ChatItem[] = showFolderUI && hasFolders
    ? getPageChats(pages[pageIdx] ?? { key: "all" })
    : filtered;

  if (!user) {
    // Auth is still resolving — don't redirect yet. Avoids a race on desktop
    // where ChatsScreen mounts before the auth context has set the user.
    if (authLoading) return null;

    if (panelMode) {
      // Inside the desktop master-detail panel (or any desktop context) — keep
      // the layout intact and show a tasteful "sign in" placeholder instead of
      // redirecting to Discover and breaking the desktop shell layout.
      return (
        <View style={[styles.root, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 24 }]}>
          <AfuLogo size={88} />
          <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 12 }]}>Sign in to chat</Text>
        </View>
      );
    }
    // Mobile / non-desktop only — safe to redirect away to discover.
    return <Redirect href="/discover" />;
  }

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          width: panelMode ? 360 : undefined,
          borderRightWidth: panelMode ? 0.5 : 0,
          borderRightColor: colors.border,
        },
      ]}
    >
      <OfflineBanner />
      {panelMode ? (
        <View style={[styles.panelHeader, { backgroundColor: colors.background }]}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Chats</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <TouchableOpacity
              onPress={() => router.push("/chat/new" as any)}
              style={[styles.panelHeaderBtn, { backgroundColor: colors.backgroundSecondary }]}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8 },
        ]}
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, zIndex: 0 }]} />
        {/* Compact story previews — left side (hidden in select mode) */}
        {selectMode ? (
          <TouchableOpacity
            onPress={exitSelectMode}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Text style={[selStyles.cancelText, { color: colors.accent }]}>Cancel</Text>
          </TouchableOpacity>
        ) : user ? (
          <Animated.View style={{ opacity: compactAvatarAnim, transform: [{ scale: compactAvatarAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }}>
            <CompactStoryHeader userId={user.id} colors={colors} onExpand={expandStories} />
          </Animated.View>
        ) : null}

        {/* Title — absolutely centered so it stays in the middle
            regardless of how wide the left/right elements are */}
        <View
          style={{ position: "absolute", left: 0, right: 0, bottom: 12, alignItems: "center", pointerEvents: "none" }}
        >
          {selectMode ? (
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select chats"}
            </Text>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Afu</Text>
              <Text style={[styles.headerTitle, { color: colors.accent }]}>Chat</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {selectMode ? (
            <TouchableOpacity
              onPress={() => selectAll(currentPageChats)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              disabled={selectedIds.size === currentPageChats.length && currentPageChats.length > 0}
            >
              <Text style={[selStyles.selectAllText, { color: selectedIds.size === currentPageChats.length && currentPageChats.length > 0 ? colors.textMuted : colors.accent }]}>
                All
              </Text>
            </TouchableOpacity>
          ) : !panelMode ? (
            <TouchableOpacity
              onPress={() => router.push("/chat-search" as any)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" }}
              activeOpacity={0.7}
            >
              <Ionicons name="search-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      )}

      {!panelMode && !selectMode && <HomeBanner />}

      {/* Stories expansion area — slides in on hard pull-down, above search bar */}
      {!panelMode && !selectMode && (
        <Animated.View style={{
          height: storiesHeightAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }),
          overflow: "hidden",
          opacity: storiesHeightAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.6, 1] }),
        }}>
          {user && (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <StoriesBar userId={user.id} colors={colors} />
              </View>
              {/* Collapse chevron — tap to close stories bar */}
              <TouchableOpacity
                onPress={collapseStories}
                style={{ paddingRight: 12, paddingLeft: 4, alignSelf: "center", paddingVertical: 8 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.65}
              >
                <Ionicons name="chevron-up" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      )}



      <View style={styles.body}>

        {/* ── Mobile swipeable pager (only when folders exist) ──────────── */}
        {showFolderUI && hasFolders ? (
          _PagerView ? (
            /* Native PagerView — true 1:1 finger tracking, content visible while swiping */
            <_PagerView
              ref={pagerRef}
              style={{ flex: 1 }}
              initialPage={0}
              onPageScroll={handlePageScroll}
              onPageSelected={handlePageSelected}
              overdrag={false}
            >
              {pages.map((page) => {
                const isAll     = !("filter" in page);
                const pageKey   = isAll ? "all" : (page as any).id;
                const pageChats = getPageChats(page);
                return (
                  <View key={pageKey} style={{ flex: 1, paddingTop: showFolderUI ? 54 : 0 }}>
                    {loading ? (
                      <View style={{ padding: 8 }}>{[1,2,3,4,5,6].map(i => <ChatRowSkeleton key={i} />)}</View>
                    ) : pageChats.length === 0 ? (
                      <View style={styles.center}>
                        <AfuLogo size={80} />
                        <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 12 }]}>
                          {isAll ? "No chats yet" : `No ${"filter" in page ? page.name : ""} chats`}
                        </Text>
                        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                          {isAll ? "Start a conversation from Contacts" : "Try another filter"}
                        </Text>
                      </View>
                    ) : (
                      <SafeFlashList
                        data={pageChats}
                        keyExtractor={(item) => item.id}
                        estimatedItemSize={74}
                        renderItem={({ item }) => (
                          <ChatRow
                            item={item}
                            phonebookName={!item.is_group && !item.is_channel ? phonebookNames.get(item.other_id) : undefined}
                            isTyping={chatPrefs.typing_indicators && !!typingChatIds[item.id]}
                            selectMode={selectMode}
                            isSelected={selectedIds.has(item.id)}
                            onEnterSelectMode={() => enterSelectMode(item.id)}
                            onToggleSelect={() => toggleSelect(item.id)}
                            onPress={() => {
                              Haptics.selectionAsync();
                              if (item.unread_count > 0) {
                                markChatVisited(item.id);
                                setChats((prev) =>
                                  prev.map((c) => c.id === item.id ? { ...c, unread_count: 0 } : c)
                                );
                                clearUnread(item.id).catch(() => {});
                              }
                              if (item.kind === "channel_broadcast" && item.channel_id) {
                                router.push({ pathname: "/channel/[id]", params: { id: item.channel_id } } as any);
                                return;
                              }
                              if (item.kind === "notes" && item.id === "MY_NOTES_VIRTUAL") {
                                const cached = _notesChatIdMem;
                                if (cached) {
                                  if (onOpenChat) { onOpenChat(item, cached); return; }
                                  router.push({ pathname: "/chat/[id]", params: { id: cached, otherName: "My Notes", otherAvatar: "", otherId: "", isGroup: "false", isChannel: "false", chatName: "", chatAvatar: "" } });
                                } else {
                                  findOrCreateNotesChatId(user.id).then((chatId) => {
                                    if (!chatId) return;
                                    if (onOpenChat) { onOpenChat(item, chatId); return; }
                                    router.push({ pathname: "/chat/[id]", params: { id: chatId, otherName: "My Notes", otherAvatar: "", otherId: "", isGroup: "false", isChannel: "false", chatName: "", chatAvatar: "" } });
                                  }).catch(() => {});
                                }
                                return;
                              }
                              if (onOpenChat) { onOpenChat(item, item.id); return; }
                              router.push({
                                pathname: "/chat/[id]",
                                params: {
                                  id: item.id,
                                  otherName: ((!item.is_group && !item.is_channel && phonebookNames.get(item.other_id)) || item.other_display_name || ""),
                                  otherAvatar: item.other_avatar || "",
                                  otherId: item.other_id || "",
                                  isGroup: item.is_group ? "true" : "false",
                                  isChannel: item.is_channel ? "true" : "false",
                                  chatName: item.name || "",
                                  chatAvatar: item.avatar_url || "",
                                },
                              });
                            }}
                          onAction={handleChatAction}
                          />
                        )}
                        ItemSeparatorComponent={() => <Separator indent={74} />}
                        ListHeaderComponent={isAll && !search && user ? (
                          <>
                            <StoryUploadBanner colors={colors} />
                            <PostUploadBanner colors={colors} />
                            {chats.length < 8 && <SuggestedUsers compact maxCards={10} />}
                          </>
                        ) : null}
                        refreshControl={
                          <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => { setRefreshing(true); loadChats(); }}
                            tintColor={colors.accent}
                          />
                        }
                        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                        showsVerticalScrollIndicator={false}
                        onScroll={handleFabScroll}
                        scrollEventThrottle={16}
                      />
                    )}
                  </View>
                );
              })}
            </_PagerView>
          ) : (
            /* Web / PagerView-unavailable fallback — horizontal FlatList pager */
            <FlatList
              ref={pagerRef}
              data={pages}
              keyExtractor={(p) => ("filter" in p ? p.id : "all")}
              horizontal
              pagingEnabled
              scrollEnabled
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              getItemLayout={(_, index) => ({ length: windowWidth, offset: windowWidth * index, index })}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
                setPageIdx(idx);
              }}
              renderItem={({ item: page }) => {
                const isAll     = !("filter" in page);
                const pageChats = getPageChats(page);
                return (
                  <View style={{ width: windowWidth, flex: 1, paddingTop: showFolderUI ? 54 : 0 }}>
                    {loading ? (
                      <View style={{ padding: 8 }}>{[1,2,3,4,5,6].map(i => <ChatRowSkeleton key={i} />)}</View>
                    ) : pageChats.length === 0 ? (
                      <View style={styles.center}>
                        <AfuLogo size={80} />
                        <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 12 }]}>
                          {isAll ? "No chats yet" : `No ${"filter" in page ? page.name : ""} chats`}
                        </Text>
                        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                          {isAll ? "Start a conversation from Contacts" : "Try another filter"}
                        </Text>
                      </View>
                    ) : (
                      <SafeFlashList
                        data={pageChats}
                        keyExtractor={(item) => item.id}
                        estimatedItemSize={74}
                        renderItem={({ item }) => (
                          <ChatRow
                            item={item}
                            phonebookName={!item.is_group && !item.is_channel ? phonebookNames.get(item.other_id) : undefined}
                            isTyping={chatPrefs.typing_indicators && !!typingChatIds[item.id]}
                            selectMode={selectMode}
                            isSelected={selectedIds.has(item.id)}
                            onEnterSelectMode={() => enterSelectMode(item.id)}
                            onToggleSelect={() => toggleSelect(item.id)}
                            onPress={() => {
                              Haptics.selectionAsync();
                              if (item.unread_count > 0) {
                                markChatVisited(item.id);
                                setChats((prev) =>
                                  prev.map((c) => c.id === item.id ? { ...c, unread_count: 0 } : c)
                                );
                                clearUnread(item.id).catch(() => {});
                              }
                              if (item.kind === "channel_broadcast" && item.channel_id) {
                                router.push({ pathname: "/channel/[id]", params: { id: item.channel_id } } as any);
                                return;
                              }
                              if (item.kind === "notes" && item.id === "MY_NOTES_VIRTUAL") {
                                const cached = _notesChatIdMem;
                                if (cached) {
                                  if (onOpenChat) { onOpenChat(item, cached); return; }
                                  router.push({ pathname: "/chat/[id]", params: { id: cached, otherName: "My Notes", otherAvatar: "", otherId: "", isGroup: "false", isChannel: "false", chatName: "", chatAvatar: "" } });
                                } else {
                                  findOrCreateNotesChatId(user.id).then((chatId) => {
                                    if (!chatId) return;
                                    if (onOpenChat) { onOpenChat(item, chatId); return; }
                                    router.push({ pathname: "/chat/[id]", params: { id: chatId, otherName: "My Notes", otherAvatar: "", otherId: "", isGroup: "false", isChannel: "false", chatName: "", chatAvatar: "" } });
                                  }).catch(() => {});
                                }
                                return;
                              }
                              if (onOpenChat) { onOpenChat(item, item.id); return; }
                              router.push({
                                pathname: "/chat/[id]",
                                params: {
                                  id: item.id,
                                  otherName: ((!item.is_group && !item.is_channel && phonebookNames.get(item.other_id)) || item.other_display_name || ""),
                                  otherAvatar: item.other_avatar || "",
                                  otherId: item.other_id || "",
                                  isGroup: item.is_group ? "true" : "false",
                                  isChannel: item.is_channel ? "true" : "false",
                                  chatName: item.name || "",
                                  chatAvatar: item.avatar_url || "",
                                },
                              });
                            }}
                          onAction={handleChatAction}
                          />
                        )}
                        ItemSeparatorComponent={() => <Separator indent={74} />}
                        ListHeaderComponent={isAll && !search && user ? (
                          <>
                            <StoryUploadBanner colors={colors} />
                            <PostUploadBanner colors={colors} />
                            {chats.length < 8 && <SuggestedUsers compact maxCards={10} />}
                          </>
                        ) : null}
                        refreshControl={
                          <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => { setRefreshing(true); loadChats(); }}
                            tintColor={colors.accent}
                          />
                        }
                        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                        showsVerticalScrollIndicator={false}
                        onScroll={handleFabScroll}
                        scrollEventThrottle={16}
                      />
                    )}
                  </View>
                );
              }}
            />
          )
        ) : (
          /* ── Single-page list (no folders, or desktop/panel mode) ──── */
          <View style={{ flex: 1, paddingTop: showFolderUI ? 54 : 0 }}>
            {loading ? (
              <View style={{ padding: 8 }}>{[1,2,3,4,5,6].map(i => <ChatRowSkeleton key={i} />)}</View>
            ) : filtered.length === 0 ? (
              <View style={styles.center}>
                <AfuLogo size={80} />
                <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 12 }]}>
                  {tabFilter === "all" ? "No chats yet" : `No ${TABS.find(t => t.key === tabFilter)?.label.toLowerCase()}`}
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  {tabFilter === "all" ? "Start a conversation from Contacts" : "Try another filter"}
                </Text>
              </View>
            ) : (
              <SafeFlashList
                data={filtered}
                keyExtractor={(item) => item.id}
                estimatedItemSize={74}
                renderItem={({ item }) => (
                  <ChatRow
                    item={item}
                    phonebookName={!item.is_group && !item.is_channel ? phonebookNames.get(item.other_id) : undefined}
                    isActive={panelMode && item.id === activeChatId}
                    isTyping={chatPrefs.typing_indicators && !!typingChatIds[item.id]}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(item.id)}
                    onEnterSelectMode={() => enterSelectMode(item.id)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onPress={() => {
                      Haptics.selectionAsync();
                      // Instantly clear unread badge before navigation
                      if (item.unread_count > 0) {
                        markChatVisited(item.id);
                        setChats((prev) =>
                          prev.map((c) => c.id === item.id ? { ...c, unread_count: 0 } : c)
                        );
                        clearUnread(item.id).catch(() => {});
                      }
                      if (item.kind === "channel_broadcast" && item.channel_id) {
                        router.push({ pathname: "/channel/[id]", params: { id: item.channel_id } } as any);
                        return;
                      }
                      // Notes: use memory cache for instant navigation; fall back to async resolve
                      if (item.kind === "notes" && item.id === "MY_NOTES_VIRTUAL") {
                        const cached = _notesChatIdMem;
                        if (cached) {
                          if (onOpenChat) { onOpenChat(item, cached); return; }
                          router.push({ pathname: "/chat/[id]", params: { id: cached, otherName: "My Notes", otherAvatar: "", otherId: "", isGroup: "false", isChannel: "false", chatName: "", chatAvatar: "" } });
                        } else {
                          findOrCreateNotesChatId(user.id).then((chatId) => {
                            if (!chatId) return;
                            if (onOpenChat) { onOpenChat(item, chatId); return; }
                            router.push({ pathname: "/chat/[id]", params: { id: chatId, otherName: "My Notes", otherAvatar: "", otherId: "", isGroup: "false", isChannel: "false", chatName: "", chatAvatar: "" } });
                          }).catch(() => {});
                        }
                        return;
                      }
                      if (onOpenChat) { onOpenChat(item, item.id); return; }
                      router.push({
                        pathname: "/chat/[id]",
                        params: {
                          id: item.id,
                          otherName: ((!item.is_group && !item.is_channel && phonebookNames.get(item.other_id)) || item.other_display_name || ""),
                          otherAvatar: item.other_avatar || "",
                          otherId: item.other_id || "",
                          isGroup: item.is_group ? "true" : "false",
                          isChannel: item.is_channel ? "true" : "false",
                          chatName: item.name || "",
                          chatAvatar: item.avatar_url || "",
                        },
                      });
                    }}
                    onAction={handleChatAction}
                  />
                )}
                ItemSeparatorComponent={() => <Separator indent={74} />}
                ListHeaderComponent={user && tabFilter === "all" && !search ? (
                  <>
                    <StoryUploadBanner colors={colors} />
                    <PostUploadBanner colors={colors} />
                    {chats.length < 8 && <SuggestedUsers compact maxCards={10} />}
                  </>
                ) : null}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => { setRefreshing(true); loadChats(); }}
                    tintColor={colors.accent}
                  />
                }
                contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                showsVerticalScrollIndicator={false}
                onScroll={handleFabScroll}
                scrollEventThrottle={16}
              />
            )}
          </View>
        )}

        {/* ── Floating folder tab bar ──────────────────────────────────────── */}
        {showFolderUI && (
          <View
            style={[
              styles.folderBarFloat,
              {
                backgroundColor: isDark ? "rgba(20,20,26,0.93)" : "rgba(252,252,255,0.93)",
                borderColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)",
                ...{ shadowColor: "#000" },
              },
            ]}
          >
            <ScrollView
              ref={folderScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.folderTabBarContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Sliding pill highlight — follows active tab */}
              <Animated.View
                style={{
                  position: "absolute",
                  top: 5,
                  bottom: 5,
                  borderRadius: 20,
                  backgroundColor: colors.accent + "38",
                  left: folderPillX,
                  width: folderPillW,
                  zIndex: 0,
                  pointerEvents: "none",
                }}
              />

              {pages.map((page, idx) => {
                const isAll  = !("filter" in page);
                const label  = isAll ? "All" : page.name;
                const icon   = isAll ? null : page.icon;
                const active = pageIdx === idx;
                const count  = isAll ? chats.length : getPageChats(page).length;
                return (
                  <TouchableOpacity
                    key={isAll ? "all" : page.id}
                    style={[styles.folderTab, { zIndex: 1 }]}
                    onLayout={(e) => {
                      tabLayoutsRef.current[idx] = {
                        x: e.nativeEvent.layout.x,
                        width: e.nativeEvent.layout.width,
                      };
                      if (idx === pageIdx) {
                        folderPillX.setValue(e.nativeEvent.layout.x - 4);
                        folderPillW.setValue(e.nativeEvent.layout.width + 8);
                      }
                    }}
                    onPress={() => {
                      setPageIdx(idx);
                      if (hasFolders) {
                        _PagerView
                          ? pagerRef.current?.setPage(idx)
                          : pagerRef.current?.scrollToIndex({ index: idx, animated: true });
                      }
                    }}
                    onLongPress={() => {
                      if (!isAll) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setEditingFolder(page as ChatFolder);
                        setShowFolderModal(true);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.folderTabInner}>
                      {icon && <Text style={styles.folderTabIcon}>{icon}</Text>}
                      <Text
                        style={[
                          styles.folderTabLabel,
                          { color: active ? colors.accent : colors.textMuted,
                            fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" },
                        ]}
                      >
                        {label}
                      </Text>
                      {count > 0 && (
                        <View
                          style={[
                            styles.folderTabBadge,
                            { backgroundColor: active ? colors.accent + "22" : colors.backgroundSecondary },
                          ]}
                        >
                          <Text style={[styles.folderTabBadgeText, { color: active ? colors.accent : colors.textMuted }]}>
                            {count > 99 ? "99+" : count}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}

              {advancedFeatures.chat_folders && (
                <TouchableOpacity
                  style={[styles.folderAddBtn, { backgroundColor: colors.backgroundSecondary, zIndex: 1 }]}
                  onPress={() => {
                    setEditingFolder(null);
                    setShowFolderModal(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* ── Folder create / edit modal ────────────────────────────────────── */}
      <FolderModal
        visible={showFolderModal}
        initial={editingFolder}
        onClose={() => { setShowFolderModal(false); setEditingFolder(null); }}
        onSave={async (data) => {
          if (editingFolder) {
            await updateFolder(editingFolder.id, data);
          } else {
            await createFolder(data);
          }
          const updated = await loadFolders();
          setFolders(updated);
          setShowFolderModal(false);
          setEditingFolder(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        onDelete={editingFolder ? async () => {
          await deleteFolder(editingFolder.id);
          const updated = await loadFolders();
          setFolders(updated);
          const newIdx = Math.min(pageIdx, updated.length);
          setPageIdx(newIdx);
          if (newIdx < updated.length + 1) {
            _PagerView
              ? pagerRef.current?.setPage(newIdx)
              : pagerRef.current?.scrollToIndex({ index: newIdx, animated: false });
          }
          setShowFolderModal(false);
          setEditingFolder(null);
        } : undefined}
      />

      {/* ── Multi-select bulk-delete action bar ─────────────────────────────── */}
      {selectMode && !panelMode && (
        <View
          style={[
            selStyles.actionBar,
            {
              bottom: insets.bottom + 90,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              ...{ shadowColor: "#000" },
              pointerEvents: "box-none",
            },
          ]}
        >
          <TouchableOpacity
            style={[selStyles.deleteBtn, { backgroundColor: selectedIds.size > 0 ? "#FF3B30" : colors.backgroundSecondary }]}
            onPress={handleBulkDelete}
            disabled={selectedIds.size === 0}
            activeOpacity={0.82}
          >
            <Ionicons name="trash-outline" size={18} color={selectedIds.size > 0 ? "#fff" : colors.textMuted} />
            <Text style={[selStyles.deleteBtnText, { color: selectedIds.size > 0 ? "#fff" : colors.textMuted }]}>
              {selectedIds.size > 0
                ? `Delete ${selectedIds.size} chat${selectedIds.size !== 1 ? "s" : ""}`
                : "Select chats to delete"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {user && panelMode && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.accent, bottom: 24, right: 24 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/chat/new" as any); }}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {user && !panelMode && !selectMode && (
        <Animated.View
          style={[
            styles.fab,
            {
              backgroundColor: colors.accent,
              bottom: (insets.bottom > 0 ? insets.bottom : 14) + 6 + 64 + 20,
              opacity: fabAnim,
              transform: [
                {
                  translateY: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [28, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <TouchableOpacity
            style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/chat/new" as any); }}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

/**
 * Default route export — the chats screen as it appears at /(tabs).
 *
 * On desktop (web ≥ 1024px or ?view=desktop), renders a two-pane layout:
 *   Left  (360px) — persistent chats list in panel mode
 *   Right (flex 1) — tabbed conversation area; clicking a chat opens it
 *                    in a tab instead of navigating to /chat/[id].
 * On mobile, renders the full-screen chats list as usual.
 */
export default function ChatsRoute() {
  return <Redirect href="/(tabs)/chats" />;
}

/**
 * Named export used by `DesktopShell` to render the chats list as a sticky
 * 360px column on the left of any /(tabs) or /chat/* route. Includes its
 * own data fetching, search, filter rail, and active-chat highlighting.
 */
export function ChatsListPanel() {
  return <ChatsScreen panelMode />;
}

const selStyles = StyleSheet.create({
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  selectAllText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 4,
  },
  actionBar: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 16,
    borderWidth: 0.5,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    width: "100%",
    justifyContent: "center",
  },
  deleteBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  body: { flex: 1 },
  bodyRow: { flexDirection: "row" },

  // ── Floating folder tab bar ──────────────────────────────────────────────
  folderBarFloat: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
    zIndex: 20,
    borderRadius: 16,
    borderWidth: 0.5,
  },
  folderTabBarContent: {
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 2,
  },
  folderTab: {
    paddingHorizontal: 10,
    alignItems: "center",
    minWidth: 52,
  },
  folderTabInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 10,
  },
  folderTabIcon: {
    fontSize: 14,
    lineHeight: 18,
  },
  folderTabLabel: {
    fontSize: 14,
    letterSpacing: 0.1,
  },
  folderTabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  folderTabBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    lineHeight: 12,
  },
  folderTabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 10,
    right: 10,
    height: 2.5,
    borderRadius: 2,
  },
  folderAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginHorizontal: 6,
  },
  rail: {
    width: 88,
    paddingTop: 4,
    paddingHorizontal: 4,
    gap: 2,
  },
  railTab: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    gap: 4,
  },
  railIconWrap: {
    width: 36,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  railLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
    textAlign: "center",
  },
  railBadge: {
    position: "absolute",
    top: -4,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  railBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    lineHeight: 12,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", fontWeight: "700" },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  panelTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  panelHeaderBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  headerIcon: { padding: 4, position: "relative" },
  notifBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#FF3B30",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notifBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  searchWrap: { paddingHorizontal: 14, paddingVertical: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 40,
    gap: 9,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 40, letterSpacing: 0.1 },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  aiBtn: {
    borderRadius: 8,
    overflow: "hidden",
  },
  aiBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 3,
    borderRadius: 8,
  },
  aiBtnText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowContent: { flex: 1 },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  nameRow: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  rowTopRight: { flexDirection: "row", alignItems: "center", gap: 2 },
  time: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: 6 },
  preview: { fontSize: 14, fontFamily: "Inter_400Regular" },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold", lineHeight: 14 },
  onlineDot: { position: "absolute", bottom: 1, right: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: "#34C759", borderWidth: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular" },
  fab: {
    position: "absolute",
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraFab: {
    position: "absolute",
    right: 24,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  accountStack: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
  },
  stackAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  stackAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: "hidden",
  },
  stackExtra: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  stackExtraText: { fontSize: 10, fontFamily: "Inter_700Bold" },
});
