import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SysNotifData = {
  _sys_notif: true;
  _is_welcome?: boolean;
  notif_id?: string;
  type: string;
  title: string;
  body: string;
  actor_id?: string;
  actor_name?: string;
  actor_handle?: string;
  actor_avatar?: string;
  entity_id?: string;
  entity_type?: string;
  post_id?: string;
  post_thumbnail?: string;
  data?: {
    actions?: Array<{ label: string; icon: string; route: string }>;
    orderId?: string;
    url?: string;
    actorId?: string;
    chatId?: string;
    callId?: string;
    callType?: string;
    callerName?: string;
    channelId?: string;
    notifType?: string;
    amount?: number;
    rating?: number;
    [key: string]: any;
  };
  created_at?: string;
};

export type GroupedSysNotifData = SysNotifData & {
  _grouped: true;
  actors: Array<{ id?: string; name?: string; handle?: string; avatar?: string }>;
  totalCount: number;
};

function tryParseSysNotif(raw: string): SysNotifData | null {
  if (!raw || !raw.startsWith("{")) return null;
  try {
    const p = JSON.parse(raw);
    if (p?._sys_notif) return p as SysNotifData;
  } catch {}
  return null;
}

export { tryParseSysNotif };

// ─── Notification type config ─────────────────────────────────────────────────

type TypeConfig = {
  accent: string;
  badgeIcon: string;
  badgeBg: string;
  primaryRoute?: (data: SysNotifData) => string | null;
};

function getTypeConfig(type: string): TypeConfig {
  switch (type) {
    case "new_follower":
      return { accent: "#007AFF", badgeIcon: "person-add", badgeBg: "#007AFF", primaryRoute: (d) => d.actor_handle ? `/@${d.actor_handle}` : d.actor_id ? `/contact/${d.actor_id}` : null };
    case "new_like":
      return { accent: "#FF2D55", badgeIcon: "heart", badgeBg: "#FF2D55", primaryRoute: (d) => d.post_id ? `/post/${d.post_id}` : null };
    case "new_reply":
      return { accent: "#34C759", badgeIcon: "chatbubble-ellipses", badgeBg: "#34C759", primaryRoute: (d) => d.post_id ? `/post/${d.post_id}` : null };
    case "new_mention":
      return { accent: "#34C759", badgeIcon: "at-circle", badgeBg: "#34C759", primaryRoute: (d) => d.post_id ? `/post/${d.post_id}` : null };
    case "gift":
      return { accent: "#AF52DE", badgeIcon: "gift", badgeBg: "#AF52DE", primaryRoute: () => "/gifts" };
    case "missed_call":
      return { accent: "#FF3B30", badgeIcon: "call", badgeBg: "#FF3B30", primaryRoute: () => "/call-history" };
    case "order_placed":
      return { accent: "#FF9500", badgeIcon: "bag-handle", badgeBg: "#FF9500", primaryRoute: (d) => d.data?.orderId ? `/shop/order/${d.data.orderId}` : null };
    case "order_shipped":
      return { accent: "#007AFF", badgeIcon: "cube", badgeBg: "#007AFF", primaryRoute: (d) => d.data?.orderId ? `/shop/order/${d.data.orderId}` : null };
    case "escrow_released":
      return { accent: "#34C759", badgeIcon: "cash", badgeBg: "#34C759", primaryRoute: (d) => d.data?.orderId ? `/shop/order/${d.data.orderId}` : null };
    case "dispute_raised":
      return { accent: "#FF3B30", badgeIcon: "warning", badgeBg: "#FF3B30", primaryRoute: (d) => d.data?.orderId ? `/shop/order/${d.data.orderId}` : null };
    case "refund_issued":
      return { accent: "#34C759", badgeIcon: "return-down-back", badgeBg: "#34C759", primaryRoute: (d) => d.data?.orderId ? `/shop/order/${d.data.orderId}` : null };
    case "shop_review":
      return { accent: "#FF9500", badgeIcon: "star", badgeBg: "#FF9500", primaryRoute: (d) => d.data?.orderId ? `/shop/order/${d.data.orderId}` : null };
    case "acoin_received":
      return { accent: "#F5A623", badgeIcon: "logo-bitcoin", badgeBg: "#F5A623", primaryRoute: () => "/wallet" };
    case "acoin_sent":
      return { accent: "#8E8E93", badgeIcon: "arrow-up-circle", badgeBg: "#8E8E93", primaryRoute: () => "/wallet" };
    case "subscription_activated":
      return { accent: "#007AFF", badgeIcon: "star", badgeBg: "#007AFF", primaryRoute: () => "/monetize" };
    case "seller_approved":
      return { accent: "#34C759", badgeIcon: "checkmark-circle", badgeBg: "#34C759", primaryRoute: () => "/shop/manage" };
    case "seller_rejected":
      return { accent: "#FF3B30", badgeIcon: "close-circle", badgeBg: "#FF3B30", primaryRoute: () => "/shop/apply" };
    case "verification_approved":
      return { accent: "#007AFF", badgeIcon: "shield-checkmark", badgeBg: "#007AFF", primaryRoute: () => "/me" };
    case "verification_update":
      return { accent: "#FF9500", badgeIcon: "shield", badgeBg: "#FF9500", primaryRoute: () => "/me" };
    case "live_started":
      return { accent: "#FF2D55", badgeIcon: "radio", badgeBg: "#FF2D55", primaryRoute: (d) => d.data?.channelId ? `/channel/${d.data.channelId}` : null };
    case "channel_post":
      return { accent: "#5856D6", badgeIcon: "megaphone", badgeBg: "#5856D6", primaryRoute: (d) => d.data?.channelId ? `/channel/${d.data.channelId}` : null };
    case "system_welcome":
      return { accent: "#007AFF", badgeIcon: "sparkles", badgeBg: "#007AFF", primaryRoute: () => "/discover" };
    default:
      return { accent: "#636366", badgeIcon: "notifications", badgeBg: "#636366", primaryRoute: (d) => d.data?.url || null };
  }
}

// ─── Relative timestamp ───────────────────────────────────────────────────────

function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days[d.getDay()];
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── Body text builder ────────────────────────────────────────────────────────

function buildBodyParts(data: SysNotifData): { bold: string; rest: string } | null {
  const name = data.actor_name || data.actor_handle || "Someone";
  const d = data.data || {};

  switch (data.type) {
    case "new_follower":
      return { bold: name, rest: " started following you" };
    case "new_like":
      return { bold: name, rest: " liked your post" };
    case "new_reply":
      return { bold: name, rest: d.preview ? ` replied: "${d.preview}"` : " replied to your post" };
    case "new_mention":
      return { bold: name, rest: " mentioned you" };
    case "gift":
      return { bold: name, rest: ` sent you ${data.body.replace(/^.*sent you /i, "") || "a gift"}` };
    case "missed_call": {
      const ct = d.callType === "video" ? "video" : "voice";
      return { bold: name || "Someone", rest: ` missed ${ct} call` };
    }
    case "order_placed":
      return { bold: name, rest: ` placed a new order` };
    case "order_shipped":
      return { bold: "Your order", rest: " has shipped — tap to confirm delivery" };
    case "escrow_released":
      return { bold: "Payment released", rest: ` — ${data.body.match(/\d+ AC/)?.[0] || ""} added to wallet` };
    case "dispute_raised":
      return { bold: name, rest: " raised a dispute on their order" };
    case "refund_issued":
      return { bold: "Refund issued", rest: ` — ${data.body.match(/\d+ AC/)?.[0] || ""} returned to wallet` };
    case "shop_review":
      return { bold: name, rest: ` left a review${d.rating ? ` — ${"★".repeat(d.rating)}` : ""}` };
    case "acoin_received":
      return { bold: data.body.match(/\+?\d+ AC/)?.[0] || "ACoins received", rest: ` — ${data.body.replace(/\+?\d+ AC[^—]*/, "").trim() || "added to your wallet"}` };
    case "acoin_sent":
      return { bold: data.body.match(/\d+ AC/)?.[0] || "ACoins sent", rest: " — sent from your wallet" };
    case "live_started":
      return { bold: name, rest: " is live now 🔴" };
    case "channel_post":
      return { bold: name || "Channel", rest: " posted something new" };
    case "subscription_activated":
      return { bold: "Subscription active", rest: " — enjoy premium features!" };
    case "seller_approved":
      return { bold: "Seller approved!", rest: " — you can now list products" };
    case "seller_rejected":
      return { bold: "Seller application", rest: " needs more information" };
    case "verification_approved":
      return { bold: "Verified!", rest: " — badge is now on your profile" };
    case "system_welcome":
      return { bold: "Welcome to AfuChat!", rest: " — your social universe starts here" };
    default:
      return null;
  }
}

// ─── Action builder ───────────────────────────────────────────────────────────

type Action = { label: string; icon: string; route: string; primary?: boolean };

function buildActions(data: SysNotifData): Action[] {
  const d = data.data || {};

  if (d.actions && Array.isArray(d.actions) && d.actions.length > 0) {
    return d.actions.map((a, i) => ({ ...a, primary: i === 0 }));
  }

  const actions: Action[] = [];

  switch (data.type) {
    case "new_follower":
      if (data.actor_handle) {
        actions.push({ label: "Follow Back", icon: "person-add-outline", route: `/@${data.actor_handle}?followBack=1`, primary: true });
        actions.push({ label: "View Profile", icon: "person-outline", route: `/@${data.actor_handle}` });
      }
      break;
    case "new_like":
    case "new_reply":
    case "new_mention":
      if (data.post_id) {
        actions.push({ label: "View Post", icon: "document-text-outline", route: `/post/${data.post_id}`, primary: true });
      }
      if (data.actor_handle) {
        actions.push({ label: "View Profile", icon: "person-outline", route: `/@${data.actor_handle}` });
      }
      break;
    case "missed_call":
      if (data.actor_id || d.actorId) {
        const actorId = data.actor_id || d.actorId;
        actions.push({ label: "Call Back", icon: "call-outline", route: `/contact/${actorId}?call=1`, primary: true });
      }
      actions.push({ label: "Call History", icon: "time-outline", route: "/call-history" });
      break;
    case "gift":
      actions.push({ label: "View Gifts", icon: "gift-outline", route: "/gifts", primary: true });
      break;
    case "order_placed":
    case "order_shipped":
    case "dispute_raised":
    case "shop_review": {
      const orderId = d.orderId || data.entity_id;
      if (orderId) actions.push({ label: "View Order", icon: "bag-outline", route: `/shop/order/${orderId}`, primary: true });
      if (data.type === "order_shipped") {
        if (orderId) actions.push({ label: "Confirm Delivery", icon: "checkmark-circle-outline", route: `/shop/order/${orderId}?confirm=1` });
      }
      break;
    }
    case "escrow_released":
    case "refund_issued": {
      const orderId = d.orderId || data.entity_id;
      if (orderId) actions.push({ label: "View Order", icon: "bag-outline", route: `/shop/order/${orderId}` });
      actions.push({ label: "View Wallet", icon: "wallet-outline", route: "/wallet", primary: true });
      break;
    }
    case "acoin_received":
    case "acoin_sent":
      actions.push({ label: "View Wallet", icon: "wallet-outline", route: "/wallet", primary: true });
      break;
    case "live_started":
    case "channel_post": {
      const channelId = d.channelId || data.entity_id;
      if (channelId) actions.push({ label: data.type === "live_started" ? "Watch Now" : "View Post", icon: data.type === "live_started" ? "play-circle-outline" : "radio-outline", route: `/channel/${channelId}`, primary: true });
      break;
    }
    case "subscription_activated":
      actions.push({ label: "Explore Premium", icon: "star-outline", route: "/monetize", primary: true });
      break;
    case "seller_approved":
      actions.push({ label: "Go to Shop", icon: "storefront-outline", route: "/shop/manage", primary: true });
      break;
    case "seller_rejected":
      actions.push({ label: "Update Application", icon: "create-outline", route: "/shop/apply", primary: true });
      break;
    case "verification_approved":
      actions.push({ label: "View Profile", icon: "person-outline", route: "/me", primary: true });
      break;
    case "system_welcome":
      actions.push({ label: "Discover People", icon: "search-outline", route: "/discover", primary: true });
      actions.push({ label: "Edit Profile", icon: "create-outline", route: "/profile/edit" });
      break;
    default:
      if (d.url) actions.push({ label: "View", icon: "arrow-forward-circle-outline", route: d.url, primary: true });
      break;
  }

  return actions;
}

// ─── Actor profile resolver (fallback when DB trigger omits actor fields) ─────

function useActorProfile(data: SysNotifData) {
  const needsFetch = !!(data.actor_id && !data.actor_name && !data.actor_handle && !data.actor_avatar);
  const [resolved, setResolved] = useState<{
    name?: string; handle?: string; avatar?: string;
  } | null>(null);

  useEffect(() => {
    if (!needsFetch || !data.actor_id) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("display_name, handle, avatar_url")
      .eq("id", data.actor_id)
      .maybeSingle()
      .then(({ data: p }) => {
        if (cancelled || !p) return;
        setResolved({ name: p.display_name || undefined, handle: p.handle || undefined, avatar: p.avatar_url || undefined });
      }, () => {});
    return () => { cancelled = true; };
  }, [data.actor_id, needsFetch]);

  if (!needsFetch) return data;
  return {
    ...data,
    actor_name: resolved?.name || data.actor_name,
    actor_handle: resolved?.handle || data.actor_handle,
    actor_avatar: resolved?.avatar || data.actor_avatar,
  };
}

// ─── Read state hook ──────────────────────────────────────────────────────────

const STORAGE_PREFIX = "notif_read_";

function useNotifRead(notifId: string | undefined) {
  const [read, setRead] = useState(true); // default true until we know otherwise

  useEffect(() => {
    if (!notifId) return;
    AsyncStorage.getItem(STORAGE_PREFIX + notifId).then((v) => {
      setRead(v === "1");
    }).catch(() => setRead(true));
  }, [notifId]);

  const markRead = useCallback(() => {
    if (!notifId) return;
    setRead(true);
    AsyncStorage.setItem(STORAGE_PREFIX + notifId, "1").catch(() => {});
  }, [notifId]);

  return { read, markRead };
}

// ─── Post content fetcher (short description) ─────────────────────────────────

const POST_PREVIEW_TYPES = new Set(["new_like", "new_reply", "new_mention", "channel_post"]);

function usePostContent(postId: string | undefined, type: string) {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    if (!postId || !POST_PREVIEW_TYPES.has(type)) return;
    let cancelled = false;
    supabase
      .from("posts")
      .select("content")
      .eq("id", postId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.content) return;
        const text = typeof data.content === "string" ? data.content.trim() : "";
        if (text) setContent(text.slice(0, 100));
      }, () => {});
    return () => { cancelled = true; };
  }, [postId, type]);

  return content;
}

// ─── Post thumbnail fetcher ───────────────────────────────────────────────────

function usePostThumbnail(postId: string | undefined, provided: string | undefined) {
  const [thumb, setThumb] = useState<string | null>(provided || null);

  useEffect(() => {
    if (provided) { setThumb(provided); return; }
    if (!postId) return;
    supabase
      .from("posts")
      .select("media_url, video_thumbnail_url")
      .eq("id", postId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const url = data.video_thumbnail_url || data.media_url;
        if (url && typeof url === "string") setThumb(url);
      }, () => {});
  }, [postId, provided]);

  return thumb;
}

// ─── Avatar with badge overlay ────────────────────────────────────────────────

function ActorAvatar({ uri, name, badgeIcon, badgeBg, size = 46 }: {
  uri?: string; name?: string; badgeIcon: string; badgeBg: string; size?: number;
}) {
  const initials = (name || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <ExpoImage
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[avs.placeholder, { width: size, height: size, borderRadius: size / 2, backgroundColor: badgeBg + "33" }]}>
          <Text style={[avs.initials, { color: badgeBg, fontSize: size * 0.35 }]}>{initials}</Text>
        </View>
      )}
      <View style={[avs.badge, { backgroundColor: badgeBg, bottom: -2, right: -2 }]}>
        <Ionicons name={badgeIcon as any} size={9} color="#fff" />
      </View>
    </View>
  );
}

const avs = StyleSheet.create({
  placeholder: { alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: "Inter_700Bold" },
  badge: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
});

// ─── Stacked avatar group (for grouped notifications) ─────────────────────────

function GroupedAvatarStack({ actors, badgeIcon, badgeBg, cardBg }: {
  actors: GroupedSysNotifData["actors"];
  badgeIcon: string;
  badgeBg: string;
  cardBg: string;
}) {
  const AVATAR_SIZE = 26;
  const OVERLAP = 8;
  const shown = actors.slice(0, 3);
  const stackW = AVATAR_SIZE + (shown.length - 1) * (AVATAR_SIZE - OVERLAP);

  return (
    <View style={{ width: 46, height: 46, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "relative", width: stackW, height: AVATAR_SIZE }}>
        {shown.map((a, i) => {
          const initials = ((a.name || a.handle || "?")
            .split(" ").map((w: string) => w[0] || "").join("").toUpperCase().slice(0, 2));
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                left: i * (AVATAR_SIZE - OVERLAP),
                zIndex: shown.length - i,
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                borderRadius: AVATAR_SIZE / 2,
                borderWidth: 1.5,
                borderColor: cardBg,
                overflow: "hidden",
              }}
            >
              {a.avatar ? (
                <ExpoImage
                  source={{ uri: a.avatar }}
                  style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={{ flex: 1, backgroundColor: badgeBg + "33", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: "Inter_700Bold", color: badgeBg, fontSize: AVATAR_SIZE * 0.32 }}>{initials}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
      <View style={[avs.badge, { backgroundColor: badgeBg, position: "absolute", bottom: 0, right: 0 }]}>
        <Ionicons name={badgeIcon as any} size={9} color="#fff" />
      </View>
    </View>
  );
}

// ─── Brand avatar (for system/payment messages) ───────────────────────────────

function BrandAvatar({ icon, color, size = 46 }: { icon: string; color: string; size?: number }) {
  return (
    <View style={[brs.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: color + "18" }]}>
      <Ionicons name={icon as any} size={size * 0.48} color={color} />
    </View>
  );
}

const brs = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
});

// ─── Live badge ───────────────────────────────────────────────────────────────

function LiveBadge() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.2, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={lbs.wrap}>
      <Animated.View style={[lbs.dot, { transform: [{ scale: pulse }] }]} />
      <Text style={lbs.text}>LIVE</Text>
    </View>
  );
}

const lbs = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", backgroundColor: "#FF2D55", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#fff" },
  text: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
});

// ─── Grouped body text suffix builder ────────────────────────────────────────

function buildGroupedBodySuffix(
  actors: GroupedSysNotifData["actors"],
  totalCount: number,
  type: string
): string {
  const rest = Math.max(0, totalCount - actors.length);
  const others = actors.slice(1).map((a) => a.name || a.handle || "Someone");

  let suffix = "";
  if (others.length === 1 && rest === 0) {
    suffix = ` and ${others[0]}`;
  } else if (others.length === 2 && rest === 0) {
    suffix = `, ${others[0]} and ${others[1]}`;
  } else if (others.length > 0 && rest > 0) {
    suffix = `, ${others.join(", ")} and ${rest} other${rest > 1 ? "s" : ""}`;
  } else if (rest === 1) {
    suffix = ` and 1 other`;
  } else if (rest > 1) {
    suffix = ` and ${rest} others`;
  }

  const verb = (() => {
    switch (type) {
      case "new_like":     return " liked your post";
      case "new_reply":    return " replied to your post";
      case "new_mention":  return " mentioned you";
      case "new_follower": return " started following you";
      default:             return "";
    }
  })();

  return suffix + verb;
}

// ─── Grouped notification card ────────────────────────────────────────────────

export function GroupedSystemNotificationCard({ data, sentAt }: { data: GroupedSysNotifData; sentAt: string }) {
  const { colors, isDark } = useTheme();
  const cfg = getTypeConfig(data.type);
  const { read, markRead } = useNotifRead(data.notif_id);
  const postThumb = usePostThumbnail(data.post_id, data.post_thumbnail);
  const postContent = usePostContent(data.post_id, data.type);
  const actions = buildActions(data);
  const primaryRoute = cfg.primaryRoute?.(data);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, delay: 40, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 280, delay: 40, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleCardPress = useCallback(() => {
    markRead();
    if (primaryRoute) { try { router.push(primaryRoute as any); } catch {} }
  }, [primaryRoute, markRead]);

  const cardBg   = isDark ? "rgba(26,26,30,0.98)" : "rgba(255,255,255,0.99)";
  const borderCol = isDark ? "rgba(52,52,58,0.7)"  : "rgba(216,216,224,0.8)";
  const firstActor = data.actors[0];

  return (
    <Animated.View style={[sn.wrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity
        activeOpacity={primaryRoute ? 0.7 : 1}
        onPress={handleCardPress}
        style={[sn.card, { backgroundColor: cardBg, borderColor: borderCol }]}
      >
        <View style={[sn.accentStripe, { backgroundColor: cfg.accent }]} />
        {!read && <View style={[sn.unreadDot, { backgroundColor: cfg.accent }]} />}

        <View style={sn.mainRow}>
          {/* Stacked avatars */}
          <View style={sn.avatarCol}>
            <GroupedAvatarStack
              actors={data.actors}
              badgeIcon={cfg.badgeIcon}
              badgeBg={cfg.badgeBg}
              cardBg={cardBg}
            />
          </View>

          {/* Text column */}
          <View style={sn.textCol}>
            {/* Count pill */}
            <View style={[gn.countPill, { backgroundColor: cfg.accent + "1A" }]}>
              <Ionicons name={cfg.badgeIcon as any} size={10} color={cfg.accent} />
              <Text style={[gn.countText, { color: cfg.accent }]}>{data.totalCount}</Text>
            </View>

            {/* Body — first actor name bold, rest normal */}
            <Text style={[sn.bodyText, { color: colors.text }]} numberOfLines={3}>
              <Text style={sn.boldName}>
                {firstActor?.name || firstActor?.handle || "Someone"}
              </Text>
              <Text style={{ color: colors.textSecondary }}>
                {buildGroupedBodySuffix(data.actors, data.totalCount, data.type)}
              </Text>
            </Text>

            {/* Post content preview */}
            {postContent ? (
              <View style={[sn.postPreviewBox, { borderLeftColor: cfg.accent + "60" }]}>
                <Text style={[sn.postPreviewText, { color: colors.textMuted }]} numberOfLines={2}>
                  {postContent}
                </Text>
              </View>
            ) : null}

            <Text style={[sn.time, { color: colors.textMuted }]}>{relTime(sentAt)}</Text>
          </View>

          {/* Post thumbnail */}
          {postThumb ? (
            <ExpoImage
              source={{ uri: postThumb }}
              style={sn.postThumb}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : null}
        </View>

        {/* Action buttons */}
        {actions.length > 0 && (
          <View style={sn.actionsRow}>
            {actions.map((a, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  sn.actionBtn,
                  a.primary
                    ? { backgroundColor: cfg.accent, borderColor: cfg.accent }
                    : { backgroundColor: "transparent", borderColor: borderCol },
                ]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  markRead();
                  try { router.push(a.route as any); } catch {}
                }}
                activeOpacity={0.75}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons
                  name={a.icon as any}
                  size={12}
                  color={a.primary ? "#fff" : colors.textSecondary}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[sn.actionBtnText, { color: a.primary ? "#fff" : colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

interface Props {
  data: SysNotifData;
  sentAt: string;
}

const SYSTEM_TYPES = new Set(["acoin_received", "acoin_sent", "subscription_activated", "seller_approved", "seller_rejected", "verification_approved", "verification_update", "order_shipped", "escrow_released", "refund_issued", "system_welcome", "system"]);

export function SystemNotificationCard({ data, sentAt }: Props) {
  const { colors, isDark } = useTheme();
  const enrichedData = useActorProfile(data);
  const cfg = getTypeConfig(enrichedData.type);
  const bodyParts = buildBodyParts(enrichedData);
  const actions = buildActions(enrichedData);
  const { read, markRead } = useNotifRead(enrichedData.notif_id);
  const postThumb = usePostThumbnail(data.post_id, data.post_thumbnail);
  const postContent = usePostContent(data.post_id, data.type);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, delay: 40, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 280, delay: 40, useNativeDriver: true }),
    ]).start();
  }, []);

  const isSystemType = SYSTEM_TYPES.has(enrichedData.type);
  const hasActor = !!(enrichedData.actor_avatar || enrichedData.actor_name || enrichedData.actor_id);
  const showActorAvatar = hasActor && !isSystemType;
  const primaryRoute = cfg.primaryRoute?.(enrichedData);

  const handleCardPress = useCallback(() => {
    markRead();
    if (primaryRoute) {
      try { router.push(primaryRoute as any); } catch {}
    }
  }, [primaryRoute, markRead]);

  const cardBg = isDark ? "rgba(26,26,30,0.98)" : "rgba(255,255,255,0.99)";
  const borderCol = isDark ? "rgba(52,52,58,0.7)" : "rgba(216,216,224,0.8)";

  return (
    <Animated.View style={[sn.wrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity
        activeOpacity={primaryRoute ? 0.7 : 1}
        onPress={handleCardPress}
        style={[sn.card, { backgroundColor: cardBg, borderColor: borderCol }]}
      >
        {/* Accent stripe */}
        <View style={[sn.accentStripe, { backgroundColor: cfg.accent }]} />

        {/* Unread dot */}
        {!read && <View style={[sn.unreadDot, { backgroundColor: cfg.accent }]} />}

        {/* Main content row */}
        <View style={sn.mainRow}>

          {/* Avatar column */}
          <View style={sn.avatarCol}>
            {showActorAvatar ? (
              <View>
                <ActorAvatar
                  uri={enrichedData.actor_avatar}
                  name={enrichedData.actor_name}
                  badgeIcon={cfg.badgeIcon}
                  badgeBg={cfg.badgeBg}
                />
                {enrichedData.type === "live_started" && (
                  <View style={{ position: "absolute", bottom: -8, alignSelf: "center" }}>
                    <LiveBadge />
                  </View>
                )}
              </View>
            ) : (
              <BrandAvatar icon={cfg.badgeIcon} color={cfg.accent} />
            )}
          </View>

          {/* Text column */}
          <View style={sn.textCol}>
            {/* Body text */}
            {bodyParts ? (
              <Text style={[sn.bodyText, { color: colors.text }]} numberOfLines={3}>
                <Text style={sn.boldName}>{bodyParts.bold}</Text>
                <Text style={{ color: colors.textSecondary }}>{bodyParts.rest}</Text>
              </Text>
            ) : (
              <Text style={[sn.bodyText, { color: colors.text }]} numberOfLines={3}>
                {data.body || data.title}
              </Text>
            )}

            {/* Special inline content */}
            {(data.type === "acoin_received" || data.type === "acoin_sent") && (
              <View style={sn.coinRow}>
                <Ionicons name="logo-bitcoin" size={14} color={cfg.accent} />
                <Text style={[sn.coinAmount, { color: cfg.accent }]}>
                  {data.body.match(/[+-]?\d+ AC/)?.[0] || data.title}
                </Text>
              </View>
            )}

            {data.type === "shop_review" && (data.data?.rating || 0) > 0 && (
              <Text style={sn.stars}>{"★".repeat(data.data?.rating ?? 0)}{"☆".repeat(5 - (data.data?.rating ?? 0))}</Text>
            )}

            {/* Post content preview */}
            {postContent ? (
              <View style={[sn.postPreviewBox, { borderLeftColor: cfg.accent + "60" }]}>
                <Text style={[sn.postPreviewText, { color: colors.textMuted }]} numberOfLines={2}>
                  {postContent}
                </Text>
              </View>
            ) : null}

            {/* Timestamp */}
            <Text style={[sn.time, { color: colors.textMuted }]}>{relTime(sentAt)}</Text>
          </View>

          {/* Right thumbnail */}
          {postThumb ? (
            <ExpoImage
              source={{ uri: postThumb }}
              style={sn.postThumb}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : data.type === "gift" ? (
            <View style={[sn.giftBox, { backgroundColor: cfg.accent + "18" }]}>
              <Text style={{ fontSize: 28 }}>🎁</Text>
            </View>
          ) : null}
        </View>

        {/* Action buttons */}
        {actions.length > 0 && (
          <View style={sn.actionsRow}>
            {actions.map((a, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  sn.actionBtn,
                  a.primary
                    ? { backgroundColor: cfg.accent, borderColor: cfg.accent }
                    : { backgroundColor: "transparent", borderColor: borderCol },
                ]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  markRead();
                  try { router.push(a.route as any); } catch {}
                }}
                activeOpacity={0.75}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons
                  name={a.icon as any}
                  size={12}
                  color={a.primary ? "#fff" : colors.textSecondary}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[sn.actionBtnText, { color: a.primary ? "#fff" : colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sn = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
    paddingLeft: 16,
    gap: 10,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 1px 4px rgba(0,0,0,0.06)" } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  accentStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  unreadDot: {
    position: "absolute",
    top: 13,
    right: 13,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  avatarCol: {
    paddingTop: 2,
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  bodyText: {
    fontSize: 13.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  boldName: {
    fontFamily: "Inter_600SemiBold",
  },
  time: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  postThumb: {
    width: 54,
    height: 54,
    borderRadius: 10,
    flexShrink: 0,
  },
  giftBox: {
    width: 54,
    height: 54,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  coinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  coinAmount: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  stars: {
    fontSize: 13,
    color: "#FF9500",
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  postPreviewBox: {
    borderLeftWidth: 2,
    paddingLeft: 7,
    marginTop: 3,
  },
  postPreviewText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    fontStyle: "italic",
  },
});

const gn = StyleSheet.create({
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
    marginBottom: 2,
  },
  countText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
});
