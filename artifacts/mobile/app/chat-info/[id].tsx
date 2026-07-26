import React, { useCallback, useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { GlassHeader } from "@/components/ui/GlassHeader";
import Colors from "@/constants/colors";

const MUTE_OPTIONS: { label: string; hours: number | null }[] = [
  { label: "For 1 hour",  hours: 1 },
  { label: "For 8 hours", hours: 8 },
  { label: "For 1 week",  hours: 24 * 7 },
  { label: "Forever",     hours: null },
];

const DISAPPEAR_OPTIONS = [
  { label: "Off",       seconds: 0 },
  { label: "5 minutes", seconds: 300 },
  { label: "1 hour",   seconds: 3600 },
  { label: "24 hours", seconds: 86400 },
  { label: "7 days",   seconds: 604800 },
  { label: "4 weeks",  seconds: 2419200 },
];

type ChatMeta = {
  is_group: boolean;
  is_channel: boolean;
  name: string;
  avatar_url: string | null;
  other_id: string | null;
  other_name: string | null;
  other_avatar: string | null;
  other_is_verified: boolean;
  other_is_organization_verified: boolean;
};

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

  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [meta, setMeta]                         = useState<ChatMeta | null>(null);
  const [muteUntil, setMuteUntil]               = useState<string | null | undefined>(undefined);
  const [showMutePicker, setShowMutePicker]     = useState(false);
  const [disappearingEnabled, setDisappearingEnabled] = useState(false);
  const [disappearingTimer,   setDisappearingTimer]   = useState(86400);
  const [showDisappearPicker, setShowDisappearPicker] = useState(false);

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
  const BRAND = accent ?? Colors.brand;

  const load = useCallback(async () => {
    if (!id || !user) return;
    const [chatRes, muteRes, disappearOn, disappearTimer] = await Promise.all([
      supabase
        .from("conversations")
        .select("is_group, is_channel, name, avatar_url, chat_members!inner(user_id, profiles(display_name, avatar_url, id, is_verified, is_organization_verified))")
        .eq("id", id).single(),
      supabase.from("chat_mutes").select("muted_until")
        .eq("user_id", user.id).eq("chat_id", id).maybeSingle(),
      AsyncStorage.getItem(`afu_disappearing_${id}`).catch(() => null),
      AsyncStorage.getItem(`afu_disappearing_timer_${id}`).catch(() => null),
    ]);

    if (chatRes.data) {
      const c = chatRes.data as any;
      const members: any[] = c.chat_members ?? [];
      const other = members.find((m: any) => m.user_id !== user.id);
      const op = other?.profiles ?? null;
      setMeta({
        is_group: !!c.is_group, is_channel: !!c.is_channel,
        name: c.name ?? "Chat", avatar_url: c.avatar_url ?? null,
        other_id: op?.id ?? null, other_name: op?.display_name ?? null,
        other_avatar: op?.avatar_url ?? null,
        other_is_verified: !!op?.is_verified,
        other_is_organization_verified: !!op?.is_organization_verified,
      });
    }
    if (muteRes.data) setMuteUntil(muteRes.data.muted_until ?? null);
    else setMuteUntil(undefined);
    setDisappearingEnabled(disappearOn === "1");
    if (disappearTimer) setDisappearingTimer(Number(disappearTimer));
  }, [id, user]);

  useEffect(() => { load(); }, [load]);

  function muteLabel(): string {
    if (!isMuted || muteUntil === undefined) return "";
    if (muteUntil === null) return "Muted forever";
    const diff = new Date(muteUntil).getTime() - Date.now();
    if (diff <= 0) return "";
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h >= 24 * 6) return `Muted for ${Math.floor(h / 24)}d`;
    if (h > 0) return `Muted for ${h}h ${m}m`;
    return `Muted for ${m}m`;
  }

  const disappearLabel = disappearingEnabled
    ? (DISAPPEAR_OPTIONS.find((o) => o.seconds === disappearingTimer)?.label ?? "On")
    : "Off";

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
    await supabase.from("chat_mutes").delete().eq("user_id", user.id).eq("chat_id", id);
  }

  async function handleDisappear(seconds: number) {
    setShowDisappearPicker(false);
    if (seconds === 0) {
      setDisappearingEnabled(false);
      setDisappearingTimer(86400);
      await AsyncStorage.setItem(`afu_disappearing_${id}`, "0");
      await AsyncStorage.removeItem(`afu_disappearing_timer_${id}`);
    } else {
      setDisappearingEnabled(true);
      setDisappearingTimer(seconds);
      await AsyncStorage.setItem(`afu_disappearing_${id}`, "1");
      await AsyncStorage.setItem(`afu_disappearing_timer_${id}`, String(seconds));
    }
  }

  const dangerParams = {
    id,
    displayName,
    otherId: otherId ?? "",
    isGroup: isGroup ? "1" : "0",
    isChannel: isChannel ? "1" : "0",
  };

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Chat Info" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile banner ── */}
        <View style={[s.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Avatar uri={avatarUri} name={displayName} size={56} square={!!(meta?.other_is_organization_verified)} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
              <Text style={[s.bannerName, { color: colors.text }]} numberOfLines={1}>{displayName}</Text>
              {(meta?.other_is_verified || meta?.other_is_organization_verified) && (
                <VerifiedBadge
                  isVerified={meta.other_is_verified}
                  isOrganizationVerified={meta.other_is_organization_verified}
                  size={16}
                />
              )}
            </View>
            <Text style={[s.bannerSub, { color: colors.textMuted }]}>
              {isChannel ? "Channel" : isGroup ? "Group" : "Direct Message"}
            </Text>
          </View>
          {isDM && otherId && (
            <TouchableOpacity
              style={[s.viewProfileBtn, { backgroundColor: BRAND + "18", borderColor: BRAND + "44" }]}
              onPress={() => router.push({ pathname: "/contact/[id]", params: { id: otherId } })}
              activeOpacity={0.7}
            >
              <Text style={[s.viewProfileText, { color: BRAND }]}>View Profile</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── GENERAL ── */}
        <SectionTitle label="GENERAL" colors={colors} />
        <View style={[s.group, { backgroundColor: colors.surface }]}>
          <Row
            colors={colors} icon="star" bg="#FF9500"
            label="Starred Messages"
            onPress={() => router.push({ pathname: "/saved-posts", params: { tab: "messages" } } as any)}
          />
          <Sep color={colors.border} />
          <Row
            colors={colors} icon="color-palette" bg={BRAND}
            label="Chat Appearance"
            sub="Wallpaper & bubble style"
            onPress={() => router.push({ pathname: "/chat-info/appearance/[id]", params: { id, displayName } } as any)}
          />
        </View>

        {/* ── NOTIFICATIONS ── */}
        <SectionTitle label="NOTIFICATIONS" colors={colors} />
        <View style={[s.group, { backgroundColor: colors.surface }]}>
          <Row
            colors={colors}
            icon={isMuted ? "notifications-off" : "notifications"}
            bg={isMuted ? "#8E8E93" : "#007AFF"}
            label={isMuted ? "Unmute Notifications" : "Mute Notifications"}
            sub={muteLabel() || undefined}
            chevron={!isMuted}
            onPress={() => { if (isMuted) { handleUnmute(); } else { setShowMutePicker((v) => !v); } }}
          />
          {showMutePicker && !isMuted && (
            <View style={[s.subGroup, { borderTopColor: colors.border }]}>
              {MUTE_OPTIONS.map((o) => (
                <SubRow key={o.label} colors={colors} icon="time" label={o.label} onPress={() => handleMute(o.hours)} />
              ))}
            </View>
          )}
        </View>

        {/* ── PRIVACY ── */}
        {!isChannel && (
          <>
            <SectionTitle label="PRIVACY" colors={colors} />
            <View style={[s.group, { backgroundColor: colors.surface }]}>
              <Row
                colors={colors} icon="timer" bg="#34C759"
                label="Disappearing Messages"
                sub={disappearLabel}
                chevron
                onPress={() => setShowDisappearPicker((v) => !v)}
              />
              {showDisappearPicker && (
                <View style={[s.subGroup, { borderTopColor: colors.border }]}>
                  {DISAPPEAR_OPTIONS.map((o) => {
                    const active = o.seconds === 0
                      ? !disappearingEnabled
                      : (disappearingEnabled && disappearingTimer === o.seconds);
                    return (
                      <SubRow
                        key={o.seconds} colors={colors} icon="time"
                        label={o.label} checked={active}
                        onPress={() => handleDisappear(o.seconds)}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}

        {/* ── DANGER ZONE (sub-page) ── */}
        <SectionTitle label="SAFETY & PRIVACY" colors={colors} />
        <View style={[s.group, { backgroundColor: colors.surface }]}>
          <Row
            colors={colors} icon="shield" bg="#FF3B30"
            label="Block, Report & Delete"
            sub="Manage safety options for this chat"
            onPress={() => router.push({ pathname: "/chat-info/danger/[id]", params: dangerParams } as any)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ label, colors }: { label: string; colors: any }) {
  return <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{label}</Text>;
}

function Sep({ color }: { color: string }) {
  return <View style={[s.sep, { backgroundColor: color }]} />;
}

function Row({
  colors, icon, bg, label, sub, chevron, onPress,
}: {
  colors: any; icon: string; bg: string; label: string;
  sub?: string; chevron?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.6}>
      <View style={[s.iconBadge, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={17} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, { color: colors.text }]}>{label}</Text>
        {sub ? <Text style={[s.rowSub, { color: colors.textMuted }]}>{sub}</Text> : null}
      </View>
      <Ionicons
        name={chevron ? "chevron-down" : "chevron-forward"}
        size={14}
        color={colors.textMuted}
      />
    </TouchableOpacity>
  );
}

function SubRow({ colors, icon, label, checked, onPress }: {
  colors: any; icon: string; label: string; checked?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.subRow} onPress={onPress} activeOpacity={0.6}>
      <Ionicons name={icon as any} size={15} color={colors.textMuted} style={{ width: 20 }} />
      <Text style={[s.subRowLabel, { color: colors.text }]}>{label}</Text>
      {checked && <Ionicons name="checkmark" size={14} color="#34C759" />}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.9,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 6,
  },

  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bannerName: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  bannerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  viewProfileBtn: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  viewProfileText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },

  group: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    overflow: "hidden",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
    minHeight: 52,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  rowSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },

  sep: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 62,
  },

  subGroup: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  subRowLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
