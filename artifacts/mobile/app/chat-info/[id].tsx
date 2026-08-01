import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "@/lib/supabase";
import { useCall } from "@/context/CallContext";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";
import { showAlert } from "@/lib/alert";
import { generateGroupInviteLink } from "@/lib/groupInvite";

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get("window");
const CELL = Math.floor((SW - 3) / 3);

const MUTE_OPTIONS: { label: string; hours: number | null }[] = [
  { label: "For 1 hour",  hours: 1 },
  { label: "For 8 hours", hours: 8 },
  { label: "For 1 week",  hours: 24 * 7 },
  { label: "Forever",     hours: null },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatMeta = {
  is_group: boolean;
  is_channel: boolean;
  name: string;
  description: string | null;
  avatar_url: string | null;
  other_id: string | null;
  other_name: string | null;
  other_avatar: string | null;
  other_is_verified: boolean;
  other_is_organization_verified: boolean;
};

type Member = {
  user_id: string;
  is_admin: boolean;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  last_seen: string | null;
};

type DMProfile = {
  bio: string | null;
  handle: string;
  last_seen: string | null;
  show_online_status: boolean;
  phone: string | null;
};

type ChannelStats = {
  subscriber_count: number;
  admin_count: number;
};

type GridPost = {
  id: string;
  image_url: string | null;
  video_url: string | null;
  post_type: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lastSeenLabel(ts: string | null, show: boolean) {
  if (!show || !ts) return "last seen recently";
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 2 * 60_000)  return "online";
  if (ms < 3_600_000)   return "last seen recently";
  if (ms < 86_400_000)  return `last seen ${Math.floor(ms / 3_600_000)}h ago`;
  return `last seen ${Math.floor(ms / 86_400_000)}d ago`;
}

function isOnline(ts: string | null) {
  if (!ts) return false;
  return Date.now() - new Date(ts).getTime() < 2 * 60_000;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActionBtn({
  icon, label, onPress, accent, colors,
}: {
  icon: string; label: string; onPress: () => void;
  accent: string; colors: any;
}) {
  return (
    <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.surface }]} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon as any} size={22} color={accent} />
      <Text style={[s.actionLabel, { color: colors.text }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function InfoRow({
  icon, label, value, valueColor, onPress, rightIcon, colors, last,
}: {
  icon?: string; label: string; value?: string | number; valueColor?: string;
  onPress?: () => void; rightIcon?: string; colors: any; last?: boolean;
}) {
  const inner = (
    <View style={[s.infoRow, last && s.infoRowLast]}>
      {icon ? (
        <View style={[s.infoIconWrap, { backgroundColor: colors.background }]}>
          <Ionicons name={icon as any} size={17} color={colors.textMuted} />
        </View>
      ) : <View style={{ width: 8 }} />}
      <Text style={[s.infoRowLabel, { color: colors.text }]}>{label}</Text>
      {value !== undefined && (
        <Text style={[s.infoRowValue, { color: valueColor ?? colors.accent }]} numberOfLines={1}>{value}</Text>
      )}
      {rightIcon && <Ionicons name={rightIcon as any} size={18} color={colors.textMuted} />}
    </View>
  );
  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.65}>{inner}</TouchableOpacity>;
  return inner;
}

function InfoCard({ children, colors }: { children: React.ReactNode; colors: any }) {
  return <View style={[s.infoCard, { backgroundColor: colors.surface }]}>{children}</View>;
}

function MemberRow({ member, accent, colors, isMe }: { member: Member; accent: string; colors: any; isMe: boolean }) {
  const online = isOnline(member.last_seen);
  const status = online ? "online" : member.last_seen ? lastSeenLabel(member.last_seen, true) : "last seen recently";
  return (
    <TouchableOpacity
      style={s.memberRow}
      onPress={() => router.push({ pathname: "/contact/[id]", params: { id: member.user_id } })}
      activeOpacity={0.6}
    >
      <View style={s.memberAvatarWrap}>
        <Avatar uri={member.avatar_url} name={member.display_name} size={46} />
        {online && <View style={[s.onlineDot, { backgroundColor: "#34C759", borderColor: colors.background }]} />}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={[s.memberName, { color: colors.text }]} numberOfLines={1}>{member.display_name}</Text>
          {(member.is_verified || member.is_organization_verified) && (
            <VerifiedBadge isVerified={member.is_verified} isOrganizationVerified={member.is_organization_verified} size={13} />
          )}
        </View>
        <Text style={[s.memberStatus, { color: online ? "#34C759" : colors.textMuted }]} numberOfLines={1}>
          {isMe ? "You" : status}
        </Text>
      </View>
      {member.is_admin && (
        <View style={[s.adminBadge, { backgroundColor: accent + "22" }]}>
          <Text style={[s.adminBadgeText, { color: accent }]}>Admin</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function PostCell({ post }: { post: GridPost }) {
  const uri = post.image_url ?? post.video_url;
  if (!uri) return <View style={[s.postCell, { backgroundColor: "#1C1C1E" }]} />;
  return (
    <TouchableOpacity
      style={s.postCell}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: "/video/[id]", params: { id: post.id } } as any)}
    >
      <Image source={{ uri }} style={{ width: CELL, height: CELL }} contentFit="cover" />
      {post.post_type === "video" && (
        <View style={s.videoBadge}>
          <Ionicons name="play" size={11} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ChatInfoScreen() {
  const {
    id,
    name: nameParam,
    avatar: avatarParam,
    otherId: otherIdParam,
    isGroup: isGroupParam,
    isChannel: isChannelParam,
  } = useLocalSearchParams<{
    id: string; name?: string; avatar?: string;
    otherId?: string; isGroup?: string; isChannel?: string;
  }>();

  const { colors, accent, isDark } = useTheme();
  const { user } = useAuth();
  const { startCall } = useCall();
  const insets = useSafeAreaInsets();
  const BRAND = accent ?? Colors.brand;

  // ── Core state ──────────────────────────────────────────────────────────────
  const [meta,          setMeta]         = useState<ChatMeta | null>(null);
  const [muteUntil,     setMuteUntil]    = useState<string | null | undefined>(undefined);
  const [showMutePicker,setShowMutePicker] = useState(false);

  // ── Type-specific state ──────────────────────────────────────────────────────
  const [dmProfile,    setDmProfile]    = useState<DMProfile | null>(null);
  const [members,      setMembers]      = useState<Member[]>([]);
  const [channelStats, setChannelStats] = useState<ChannelStats | null>(null);
  const [gridPosts,    setGridPosts]    = useState<GridPost[]>([]);

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(0);

  // Derived
  const isMuted   = muteUntil === null || (muteUntil !== undefined && new Date(muteUntil) > new Date());
  const isGroup   = meta?.is_group   ?? isGroupParam   === "1";
  const isChannel = meta?.is_channel ?? isChannelParam === "1";
  const isDM      = !isGroup && !isChannel;
  const otherId   = meta?.other_id   ?? otherIdParam ?? null;

  const displayName = meta
    ? (isGroup || isChannel ? meta.name : meta.other_name ?? meta.name)
    : (nameParam ?? "Chat");
  const avatarUri = meta
    ? (isGroup || isChannel ? meta.avatar_url : meta.other_avatar)
    : (avatarParam ?? null);

  // Tab definitions by type
  const TABS = isChannel
    ? ["Posts", "Media", "Files", "Links"]
    : isGroup
    ? ["Members", "Media", "Links"]
    : ["Posts", "Media", "Links", "Groups"];

  // ── Data loading ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!id || !user) return;

    const [chatRes, muteRes] = await Promise.all([
      supabase
        .from("conversations")
        .select("is_group, is_channel, name, description, avatar_url, chat_members!inner(user_id, is_admin, profiles(display_name, avatar_url, id, handle, is_verified, is_organization_verified, last_seen, show_online_status))")
        .eq("id", id).single(),
      supabase.from("chat_mutes").select("muted_until")
        .eq("user_id", user.id).eq("chat_id", id).maybeSingle(),
    ]);

    if (chatRes.data) {
      const c = chatRes.data as any;
      const mems: any[] = c.chat_members ?? [];
      const other = mems.find((m: any) => m.user_id !== user.id);
      const op = other?.profiles ?? null;

      setMeta({
        is_group: !!c.is_group, is_channel: !!c.is_channel,
        name: c.name ?? "Chat",
        description: c.description ?? null,
        avatar_url: c.avatar_url ?? null,
        other_id: op?.id ?? null,
        other_name: op?.display_name ?? null,
        other_avatar: op?.avatar_url ?? null,
        other_is_verified: !!op?.is_verified,
        other_is_organization_verified: !!op?.is_organization_verified,
      });

      // Members for group/channel
      if (c.is_group || c.is_channel) {
        const mapped: Member[] = mems.map((m: any) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          return {
            user_id: m.user_id,
            is_admin: !!m.is_admin,
            display_name: p?.display_name ?? "Unknown",
            handle: p?.handle ?? "",
            avatar_url: p?.avatar_url ?? null,
            is_verified: !!p?.is_verified,
            is_organization_verified: !!p?.is_organization_verified,
            last_seen: p?.last_seen ?? null,
          };
        });
        setMembers(mapped);

        // Channel: compute admin count + subscriber count
        if (c.is_channel) {
          const adminCount = mapped.filter((m) => m.is_admin).length;
          const { count: subCount } = await supabase
            .from("channel_subscriptions")
            .select("id", { count: "exact", head: true })
            .eq("channel_id", id);
          setChannelStats({ subscriber_count: subCount ?? 0, admin_count: adminCount });
        }
      }

      // DM: load full profile
      if (!c.is_group && !c.is_channel && op?.id) {
        const [pRes, postsRes] = await Promise.all([
          supabase.from("profiles")
            .select("bio, handle, last_seen, show_online_status, phone")
            .eq("id", op.id).maybeSingle(),
          supabase.from("posts")
            .select("id, image_url, video_url, post_type")
            .eq("author_id", op.id)
            .in("visibility", ["public", "followers"])
            .order("created_at", { ascending: false })
            .limit(30),
        ]);
        if (pRes.data) setDmProfile(pRes.data as DMProfile);
        if (postsRes.data) setGridPosts(postsRes.data as GridPost[]);
      }
    }

    if (muteRes.data) setMuteUntil(muteRes.data.muted_until ?? null);
    else setMuteUntil(undefined);
  }, [id, user]);

  useEffect(() => { load(); }, [load]);

  // ── Mute handlers ────────────────────────────────────────────────────────────

  async function handleMute(hours: number | null) {
    if (!user) return;
    const val = hours === null ? null : new Date(Date.now() + hours * 3_600_000).toISOString();
    setMuteUntil(val);
    setShowMutePicker(false);
    await supabase.from("chat_mutes").upsert(
      { user_id: user.id, chat_id: id, muted_until: val, created_at: new Date().toISOString() },
      { onConflict: "user_id,chat_id" },
    );
  }

  async function handleUnmute() {
    if (!user) return;
    setMuteUntil(undefined);
    setShowMutePicker(false);
    await supabase.from("chat_mutes").delete().eq("user_id", user.id).eq("chat_id", id);
  }

  async function handleLeaveGroup() {
    if (!user) return;
    showAlert(
      `Leave ${isChannel ? "Channel" : "Group"}`,
      `Are you sure you want to leave "${displayName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave", style: "destructive",
          onPress: async () => {
            await supabase.from("chat_members").delete().eq("chat_id", id).eq("user_id", user.id);
            router.replace("/(tabs)/chats");
          },
        },
      ]
    );
  }

  async function handleShareInvite() {
    const link = generateGroupInviteLink(id);
    await Share.share({ message: `Join "${displayName}" on AfuChat:\n${link}`, url: link });
  }

  function openChat() {
    router.back();
  }

  function openCall() {
    if (!otherId) return;
    startCall({
      calleeId: otherId,
      calleeName: meta?.other_name ?? displayName,
      calleeAvatar: meta?.other_avatar ?? null,
      chatId: id,
    });
  }

  function openVideoCall() {
    // Video calls use the same voice engine for now
    if (!otherId) return;
    startCall({
      calleeId: otherId,
      calleeName: meta?.other_name ?? displayName,
      calleeAvatar: meta?.other_avatar ?? null,
      chatId: id,
    });
  }

  // ── Subtitle ─────────────────────────────────────────────────────────────────

  const subtitle = React.useMemo(() => {
    if (isChannel) return "public channel";
    if (isGroup) {
      const total   = members.length;
      const online  = members.filter((m) => isOnline(m.last_seen)).length;
      if (total === 0) return "group";
      return online > 0
        ? `${fmtNum(total)} members, ${fmtNum(online)} online`
        : `${fmtNum(total)} members`;
    }
    if (dmProfile) return lastSeenLabel(dmProfile.last_seen, dmProfile.show_online_status);
    return "last seen recently";
  }, [isChannel, isGroup, members, dmProfile]);

  const dmOnline = isDM && dmProfile
    ? isOnline(dmProfile.last_seen) && dmProfile.show_online_status
    : false;

  // ── Action buttons ───────────────────────────────────────────────────────────

  const actionBtns = React.useMemo(() => {
    if (isChannel) return [
      { icon: "radio",            label: "Live Stream", action: () => {} },
      { icon: isMuted ? "notifications" : "notifications-off", label: isMuted ? "Unmute" : "Mute",
        action: () => { if (isMuted) handleUnmute(); else setShowMutePicker(v => !v); } },
      { icon: "chatbubbles",      label: "Discuss",    action: () => router.back() },
      { icon: "add-circle",       label: "Add Story",  action: () => router.push("/stories/camera" as any) },
    ];
    if (isGroup) return [
      { icon: "chatbubble",       label: "Message",  action: openChat },
      { icon: isMuted ? "notifications" : "notifications-off", label: isMuted ? "Unmute" : "Mute",
        action: () => { if (isMuted) handleUnmute(); else setShowMutePicker(v => !v); } },
      { icon: "exit",             label: "Leave",    action: handleLeaveGroup },
    ];
    // DM
    return [
      { icon: "chatbubble",       label: "Message",  action: openChat },
      { icon: isMuted ? "notifications" : "notifications-off", label: isMuted ? "Unmute" : "Mute",
        action: () => { if (isMuted) handleUnmute(); else setShowMutePicker(v => !v); } },
      { icon: "call",             label: "Call",     action: openCall },
      { icon: "videocam",         label: "Video",    action: openVideoCall },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChannel, isGroup, isMuted, otherId]);

  // ── List data (members or posts for FlatList) ────────────────────────────────

  const listData = React.useMemo<any[]>(() => {
    if ((isGroup || isChannel) && activeTab === 0) return members;
    if (isDM && activeTab === 0) return gridPosts;
    return [];
  }, [isGroup, isChannel, isDM, activeTab, members, gridPosts]);

  const numColumns = isDM && activeTab === 0 ? 3 : 1;

  // ── Render list item ─────────────────────────────────────────────────────────

  function renderItem({ item }: { item: any }) {
    if ((isGroup || isChannel) && activeTab === 0) {
      return (
        <MemberRow
          member={item as Member}
          accent={BRAND}
          colors={colors}
          isMe={item.user_id === user?.id}
        />
      );
    }
    if (isDM && activeTab === 0) {
      return <PostCell post={item as GridPost} />;
    }
    return null;
  }

  // ── List header (everything above the tab content) ───────────────────────────

  const ListHeader = () => (
    <View style={{ backgroundColor: colors.backgroundSecondary }}>

      {/* ── Top bar ── */}
      <View style={[s.topBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.topBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => router.push({
            pathname: "/chat-info/danger/[id]",
            params: { id, displayName, otherId: otherId ?? "", isGroup: isGroup ? "1" : "0", isChannel: isChannel ? "1" : "0" },
          } as any)}
          hitSlop={12} style={s.topBtn}
        >
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* ── Avatar + name ── */}
      <View style={s.heroSection}>
        <View style={s.avatarWrap}>
          <Avatar uri={avatarUri} name={displayName} size={88}
            square={!!(meta?.other_is_organization_verified)} />
          {dmOnline && (
            <View style={[s.heroOnlineDot, { backgroundColor: "#34C759", borderColor: colors.backgroundSecondary }]} />
          )}
        </View>
        <View style={s.heroNameRow}>
          <Text style={[s.heroName, { color: colors.text }]}>{displayName}</Text>
          {(meta?.other_is_verified || meta?.other_is_organization_verified) && (
            <VerifiedBadge
              isVerified={!!meta?.other_is_verified}
              isOrganizationVerified={!!meta?.other_is_organization_verified}
              size={18}
            />
          )}
        </View>
        <Text style={[s.heroSub, { color: dmOnline ? "#34C759" : colors.textMuted }]}>
          {subtitle}
        </Text>
      </View>

      {/* ── Action buttons ── */}
      <View style={[s.actionRow, { paddingHorizontal: isGroup && actionBtns.length === 3 ? 32 : 16 }]}>
        {actionBtns.map((btn) => (
          <ActionBtn
            key={btn.label}
            icon={btn.icon}
            label={btn.label}
            onPress={btn.action}
            accent={BRAND}
            colors={colors}
          />
        ))}
      </View>

      {/* ── Mute duration picker ── */}
      {showMutePicker && (
        <View style={[s.mutePicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {MUTE_OPTIONS.map((o) => (
            <TouchableOpacity key={o.label} style={s.muteOption} onPress={() => handleMute(o.hours)} activeOpacity={0.7}>
              <Text style={[s.muteOptionText, { color: colors.text }]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── DM info cards ── */}
      {isDM && (
        <View style={s.cardsSection}>
          {/* Description / bio */}
          {dmProfile?.bio ? (
            <InfoCard colors={colors}>
              <View style={s.bioRow}>
                <Text style={[s.bioText, { color: colors.text }]}>{dmProfile.bio}</Text>
                <Text style={[s.bioLabel, { color: colors.textMuted }]}>Bio</Text>
              </View>
            </InfoCard>
          ) : null}

          {/* Phone */}
          {dmProfile?.phone ? (
            <InfoCard colors={colors}>
              <View style={s.bioRow}>
                <Text style={[s.bioText, { color: colors.text }]}>{dmProfile.phone}</Text>
                <Text style={[s.bioLabel, { color: colors.textMuted }]}>Mobile</Text>
              </View>
            </InfoCard>
          ) : null}

          {/* Username */}
          {dmProfile?.handle ? (
            <InfoCard colors={colors}>
              <View style={[s.inviteRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.inviteLink, { color: colors.text }]}>@{dmProfile.handle}</Text>
                  <Text style={[s.inviteLabel, { color: colors.textMuted }]}>Username</Text>
                </View>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/contact/[id]", params: { id: otherId ?? "" } })}
                  style={[s.qrBtn, { backgroundColor: colors.background }]}
                >
                  <Ionicons name="qr-code" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </InfoCard>
          ) : null}

          {/* Chat settings row */}
          <InfoCard colors={colors}>
            <TouchableOpacity
              style={s.settingsRow}
              onPress={() => router.push({ pathname: "/chat-info/appearance/[id]", params: { id, displayName } } as any)}
              activeOpacity={0.65}
            >
              <Ionicons name="color-palette-outline" size={20} color={BRAND} />
              <Text style={[s.settingsLabel, { color: colors.text }]}>Chat Appearance</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </InfoCard>
        </View>
      )}

      {/* ── Group info cards ── */}
      {isGroup && (
        <View style={s.cardsSection}>
          {/* Invite link */}
          <InfoCard colors={colors}>
            <View style={[s.inviteRow, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.inviteLink, { color: colors.text }]}>
                  {generateGroupInviteLink(id)}
                </Text>
                <Text style={[s.inviteLabel, { color: colors.textMuted }]}>Invite Link</Text>
              </View>
              <TouchableOpacity onPress={handleShareInvite} style={[s.qrBtn, { backgroundColor: colors.background }]}>
                <Ionicons name="qr-code" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </InfoCard>

          {/* Add members */}
          {members.some(m => m.user_id === user?.id && m.is_admin) && (
            <InfoCard colors={colors}>
              <TouchableOpacity
                style={s.settingsRow}
                onPress={() => showAlert("Add Members", "Invite people to this group from the chat screen.")}
                activeOpacity={0.65}
              >
                <Ionicons name="person-add-outline" size={20} color={BRAND} />
                <Text style={[s.settingsLabel, { color: colors.text }]}>Add Members</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </InfoCard>
          )}
        </View>
      )}

      {/* ── Channel info cards ── */}
      {isChannel && (
        <View style={s.cardsSection}>
          {/* Description + invite */}
          <InfoCard colors={colors}>
            {meta?.description ? (
              <>
                <View style={s.bioRow}>
                  <Text style={[s.bioText, { color: colors.text }]}>{meta.description}</Text>
                  <Text style={[s.bioLabel, { color: colors.textMuted }]}>Description</Text>
                </View>
                <View style={[s.cardDivider, { backgroundColor: colors.border }]} />
              </>
            ) : null}
            <View style={[s.inviteRow, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.inviteLink, { color: colors.text }]}>
                  {generateGroupInviteLink(id)}
                </Text>
                <Text style={[s.inviteLabel, { color: colors.textMuted }]}>Invite Link</Text>
              </View>
              <TouchableOpacity onPress={handleShareInvite} style={[s.qrBtn, { backgroundColor: colors.background }]}>
                <Ionicons name="qr-code" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </InfoCard>

          {/* Stats */}
          <InfoCard colors={colors}>
            <InfoRow
              icon="people-outline"
              label="Subscribers"
              value={channelStats ? fmtNum(channelStats.subscriber_count) : "—"}
              valueColor={BRAND}
              colors={colors}
            />
            <View style={[s.cardDivider, { backgroundColor: colors.border }]} />
            <InfoRow
              icon="shield-outline"
              label="Administrators"
              value={channelStats ? fmtNum(channelStats.admin_count) : "—"}
              valueColor={BRAND}
              colors={colors}
            />
            <View style={[s.cardDivider, { backgroundColor: colors.border }]} />
            <InfoRow
              icon="settings-outline"
              label="Channel Settings"
              onPress={() => router.push({ pathname: "/chat-info/danger/[id]", params: { id, displayName, otherId: "", isGroup: "0", isChannel: "1" } } as any)}
              rightIcon="chevron-forward"
              colors={colors}
              last
            />
          </InfoCard>
        </View>
      )}

      {/* ── Tab bar ── */}
      <View style={[s.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.backgroundSecondary }]}>
        {TABS.map((tab, i) => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === i && { borderBottomColor: BRAND, borderBottomWidth: 2 }]}
            onPress={() => { Haptics.selectionAsync(); setActiveTab(i); }}
            activeOpacity={0.7}
          >
            <Text style={[s.tabLabel, { color: activeTab === i ? BRAND : colors.textMuted }]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Empty state for non-data tabs ── */}
      {listData.length === 0 && (
        <View style={s.emptyTab}>
          <Ionicons
            name={activeTab === 0 && (isGroup || isChannel) ? "people-outline" : "images-outline"}
            size={40}
            color={colors.textMuted}
          />
          <Text style={[s.emptyTabText, { color: colors.textMuted }]}>
            {activeTab === 0 && (isGroup || isChannel) ? "No members found" :
             activeTab === 0 && isDM ? "No posts yet" : "Nothing here yet"}
          </Text>
        </View>
      )}
    </View>
  );

  // ── Root render ───────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <FlatList
        key={`${activeTab}-${numColumns}`}
        data={listData}
        keyExtractor={(item) => item.id ?? item.user_id}
        renderItem={renderItem}
        numColumns={numColumns}
        ListHeaderComponent={<ListHeader />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={numColumns > 1 ? { gap: 1.5 } : undefined}
        ItemSeparatorComponent={
          numColumns === 1 && (isGroup || isChannel) && activeTab === 0
            ? () => <View style={[s.memberSep, { backgroundColor: colors.border }]} />
            : undefined
        }
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  topBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  heroSection: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  avatarWrap: {
    position: "relative",
    marginBottom: 14,
  },
  heroOnlineDot: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
  },
  heroNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 5,
  },
  heroName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  heroSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
    justifyContent: "center",
  },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    gap: 5,
    maxWidth: 90,
  },
  actionLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },

  mutePicker: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  muteOption: {
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  muteOptionText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },

  cardsSection: {
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  infoCard: {
    borderRadius: 14,
    overflow: "hidden",
  },
  bioRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 2,
  },
  bioText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  bioLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  inviteLink: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  inviteLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  qrBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  settingsLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
    minHeight: 50,
  },
  infoRowLast: {},
  infoIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  infoRowLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  infoRowValue: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },

  emptyTab: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyTabText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  // Member rows
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    minHeight: 60,
  },
  memberAvatarWrap: { position: "relative" },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  memberName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  memberStatus: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  adminBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
  },
  adminBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  memberSep: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 74,
  },

  // Posts grid
  postCell: {
    width: CELL,
    height: CELL,
    position: "relative",
  },
  videoBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    padding: 3,
  },
});
