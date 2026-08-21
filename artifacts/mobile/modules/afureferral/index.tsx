/**
 * AfuReferral mini app — full referral system with milestone rewards,
 * contacts integration, QR code sharing, and live Supabase data.
 * Adapted from app/referral.tsx for the MiniAppWindow container.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Contacts from "expo-contacts";
import QRCode from "@/components/ui/QRCode";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import * as Clipboard from "expo-clipboard";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { Image as ExpoImage } from "expo-image";
import { showToast } from "@/lib/toast";

// ── Types ─────────────────────────────────────────────────────────────────────
type ReferralEntry = {
  id: string;
  referred_id: string;
  referred_display_name: string;
  referred_handle: string;
  referred_avatar_url: string | null;
  reward_given: boolean;
  created_at: string;
  joined_days_ago: number;
};

type RewardStep = {
  step: number; invites: number; title: string; role: string;
  nexaBase: number; bonusNexa: number; icon: string;
  color: string; description: string;
};

const REWARD_STEPS: RewardStep[] = [
  { step: 1, invites: 1,   title: "First Invite",  role: "Newcomer",         nexaBase: 2000,   bonusNexa: 0,      icon: "hand-right-outline",  color: "#34C759", description: "Your first friend joins AfuChat" },
  { step: 2, invites: 3,   title: "Connector",     role: "Social Starter",   nexaBase: 6000,   bonusNexa: 1500,   icon: "people-outline",      color: "#007AFF", description: "3 friends have signed up with your link" },
  { step: 3, invites: 5,   title: "Ambassador",    role: "Rising Star",      nexaBase: 10000,  bonusNexa: 3000,   icon: "ribbon-outline",      color: "#5856D6", description: "5 friends joined — you're on a roll" },
  { step: 4, invites: 10,  title: "Champion",      role: "Top Recruiter",    nexaBase: 20000,  bonusNexa: 7500,   icon: "trophy-outline",      color: "#FF9F0A", description: "10 friends — the crowd is growing" },
  { step: 5, invites: 25,  title: "Influencer",    role: "Community Builder", nexaBase: 50000, bonusNexa: 18000,  icon: "megaphone-outline",   color: "#FF375F", description: "25 friends — you're building a movement" },
  { step: 6, invites: 50,  title: "Legend",        role: "Elite Referrer",   nexaBase: 100000, bonusNexa: 40000,  icon: "diamond-outline",     color: "#BF5AF2", description: "50 friends — a true AfuChat legend" },
  { step: 7, invites: 100, title: "Hall of Fame",  role: "AfuChat Icon",     nexaBase: 200000, bonusNexa: 125000, icon: "flash",               color: "#FFD60A", description: "100 friends — your name is in the history books" },
];

const NEXA_PER_INVITE = 2000;

function getStepStatus(total: number, step: RewardStep): "done" | "active" | "locked" {
  if (total >= step.invites) return "done";
  const prev = REWARD_STEPS.find(s => s.step === step.step - 1);
  if (!prev || total >= prev.invites) return "active";
  return "locked";
}

function getNextStep(total: number): RewardStep | null {
  return REWARD_STEPS.find(s => total < s.invites) ?? null;
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function AvatarInitial({ name, uri, size = 40 }: { name: string; uri?: string | null; size?: number }) {
  const initial = (name || "U").slice(0, 1).toUpperCase();
  const hue = (name.charCodeAt(0) * 37) % 360;
  const bg = `hsl(${hue}, 55%, 52%)`;
  return uri ? (
    <ExpoImage source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontFamily: "Inter_700Bold" }}>{initial}</Text>
    </View>
  );
}

// ── Animated progress bar ─────────────────────────────────────────────────────
function AnimatedBar({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 1000, useNativeDriver: false }).start();
  }, [pct]);
  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  return (
    <View style={{ height: 5, borderRadius: 3, backgroundColor: "#00000012", overflow: "hidden" }}>
      <Animated.View style={{ height: "100%", width, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

// ── Reward step row ───────────────────────────────────────────────────────────
function StepRow({
  step, total, isLast, accent, colors, claimed, claiming, onClaim,
}: {
  step: RewardStep; total: number; isLast: boolean; accent: string; colors: any;
  claimed?: boolean; claiming?: boolean; onClaim?: () => void;
}) {
  const status   = getStepStatus(total, step);
  const isDone   = status === "done";
  const isActive = status === "active";
  const isLocked = status === "locked";
  const circleColor  = isDone ? step.color : isActive ? accent : colors.backgroundTertiary;
  const circleBorder = isDone ? step.color : isActive ? accent : colors.border;
  const moreNeeded   = step.invites - total;

  const showClaimBtn = isDone && step.bonusNexa > 0;

  return (
    <View style={stepStyles.row}>
      <View style={stepStyles.left}>
        <View style={[stepStyles.circle, { backgroundColor: circleColor, borderColor: circleBorder }]}>
          {isDone ? <Ionicons name="checkmark" size={14} color="#fff" />
            : isActive ? <Ionicons name={step.icon as any} size={13} color="#fff" />
            : <Ionicons name="lock-closed" size={11} color={colors.textMuted} />}
        </View>
        {!isLast && <View style={[stepStyles.line, { backgroundColor: isDone ? step.color + "60" : colors.border }]} />}
      </View>

      <View style={[stepStyles.content, {
        backgroundColor: isDone ? step.color + "10" : isActive ? accent + "08" : colors.surface,
        borderColor: isDone ? step.color + "30" : isActive ? accent + "25" : colors.border,
        opacity: isLocked ? 0.55 : 1,
      }]}>
        <View style={stepStyles.header}>
          <View style={stepStyles.titleRow}>
            <Text style={[stepStyles.title, { color: isDone ? step.color : isActive ? colors.text : colors.textMuted }]}>{step.title}</Text>
            {isDone && !claimed && step.bonusNexa === 0 && <View style={[stepStyles.badge, { backgroundColor: step.color + "20" }]}><Text style={[stepStyles.badgeText, { color: step.color }]}>Unlocked</Text></View>}
            {isDone && claimed && <View style={[stepStyles.badge, { backgroundColor: "#34C75920" }]}><Text style={[stepStyles.badgeText, { color: "#34C759" }]}>✓ Claimed</Text></View>}
            {isActive && <View style={[stepStyles.badge, { backgroundColor: accent + "18" }]}><Text style={[stepStyles.badgeText, { color: accent }]}>In Progress</Text></View>}
          </View>
          <Text style={[stepStyles.role, { color: colors.textMuted }]}>{step.invites} invite{step.invites !== 1 ? "s" : ""} · {step.role}</Text>
        </View>

        <View style={stepStyles.rewards}>
          <View style={stepStyles.rewardRow}>
            <Ionicons name="flash" size={13} color="#FFD60A" />
            <Text style={[stepStyles.rewardText, { color: colors.text }]}>+{step.nexaBase.toLocaleString()} Nexa base</Text>
          </View>
          {step.bonusNexa > 0 && (
            <View style={stepStyles.rewardRow}>
              <Ionicons name="gift-outline" size={13} color={step.color} />
              <Text style={[stepStyles.rewardText, { color: step.color }]}>
                +{step.bonusNexa.toLocaleString()} milestone bonus
                {claimed ? " · Collected" : isDone ? " · Ready to claim!" : ""}
              </Text>
            </View>
          )}
        </View>

        {isActive && (
          <View style={{ marginTop: 10, gap: 5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[stepStyles.progressLabel, { color: colors.textMuted }]}>{total} / {step.invites} invites</Text>
              <Text style={[stepStyles.progressLabel, { color: accent }]}>{moreNeeded} more to unlock</Text>
            </View>
            <AnimatedBar pct={step.invites > 0 ? Math.min(total / step.invites, 1) : 0} color={accent} />
          </View>
        )}

        <Text style={[stepStyles.desc, { color: colors.textMuted }]}>{step.description}</Text>

        {showClaimBtn && (
          claimed ? (
            <View style={[stepStyles.claimedRow]}>
              <Ionicons name="checkmark-circle" size={14} color="#34C759" />
              <Text style={[stepStyles.claimedText]}>Bonus collected</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[stepStyles.claimBtn, { backgroundColor: step.color, opacity: claiming ? 0.7 : 1 }]}
              onPress={onClaim}
              disabled={claiming}
              activeOpacity={0.82}
            >
              {claiming ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="gift" size={14} color="#fff" />
                  <Text style={stepStyles.claimBtnText}>Claim +{step.bonusNexa.toLocaleString()} Nexa</Text>
                </>
              )}
            </TouchableOpacity>
          )
        )}
      </View>
    </View>
  );
}

// ── Milestone Claim Modal ─────────────────────────────────────────────────────
function MilestoneClaimModal({ step, onClose }: { step: RewardStep | null; onClose: () => void }) {
  const { colors } = useTheme();
  const cardScale   = useRef(new Animated.Value(0.78)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const flashScale  = useRef(new Animated.Value(0)).current;
  const flashOpac   = useRef(new Animated.Value(0)).current;
  const nexaY       = useRef(new Animated.Value(30)).current;
  const nexaOpac    = useRef(new Animated.Value(0)).current;

  const visible = !!step;

  useEffect(() => {
    if (!visible) {
      cardScale.setValue(0.78);
      cardOpacity.setValue(0);
      flashScale.setValue(0);
      flashOpac.setValue(0);
      nexaY.setValue(30);
      nexaOpac.setValue(0);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(cardScale,   { toValue: 1, damping: 12, stiffness: 100, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(flashScale, { toValue: 1, damping: 9, stiffness: 120, useNativeDriver: true }),
        Animated.timing(flashOpac,  { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    }, 200);
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(nexaY,    { toValue: 0, damping: 11, stiffness: 100, useNativeDriver: true }),
        Animated.timing(nexaOpac, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }, 380);
  }, [visible]);

  if (!step) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={claimModalS.overlay}>
        <Animated.View style={[claimModalS.card, { backgroundColor: colors.surface, transform: [{ scale: cardScale }], opacity: cardOpacity }]}>

          <LinearGradient
            colors={[step.color + "EE", step.color + "99"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={claimModalS.header}
          >
            <Animated.View style={{ transform: [{ scale: flashScale }], opacity: flashOpac }}>
              <View style={claimModalS.iconRing}>
                <Ionicons name={step.icon as any} size={36} color="#fff" />
              </View>
            </Animated.View>
            <Text style={claimModalS.headerTitle}>{step.title}</Text>
            <Text style={claimModalS.headerSub}>{step.role}</Text>
          </LinearGradient>

          <View style={claimModalS.body}>
            <Text style={[claimModalS.congrats, { color: colors.text }]}>Milestone Bonus Collected! 🎉</Text>
            <Text style={[claimModalS.desc, { color: colors.textMuted }]}>{step.description}</Text>

            <Animated.View style={[claimModalS.nexaCard, { borderColor: "#FFD60A40", transform: [{ translateY: nexaY }], opacity: nexaOpac }]}>
              <LinearGradient colors={["#FFD60A18", "#FF9F0A10"]} style={claimModalS.nexaGradient}>
                <View style={claimModalS.nexaIconWrap}>
                  <Ionicons name="flash" size={28} color="#FFD60A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[claimModalS.nexaLabel, { color: colors.textMuted }]}>Bonus Nexa added to your wallet</Text>
                  <Text style={[claimModalS.nexaAmount, { color: "#FFD60A" }]}>+{step.bonusNexa.toLocaleString()} Nexa</Text>
                </View>
                <Ionicons name="checkmark-circle" size={24} color="#34C759" />
              </LinearGradient>
            </Animated.View>
          </View>

          <View style={claimModalS.footer}>
            <TouchableOpacity style={[claimModalS.doneBtn, { backgroundColor: step.color }]} onPress={onClose} activeOpacity={0.85}>
              <Text style={claimModalS.doneBtnText}>Awesome!</Text>
              <Ionicons name="checkmark" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Contact types ─────────────────────────────────────────────────────────────
type PhoneContact = { key: string; name: string; phone: string; rawPhone: string };

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.length === 9 || digits.length === 10) return "+254" + digits.slice(-9);
  return "+" + digits;
}

function smsUrl(phone: string, body: string): string {
  return `sms:${phone}?body=${encodeURIComponent(body)}`;
}

// ── QR Modal ──────────────────────────────────────────────────────────────────
function QRModal({ visible, link, accent, onClose }: { visible: boolean; link: string; accent: string; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={qrS.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[qrS.card, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
          <Text style={[qrS.title, { color: colors.text }]}>Scan to Join AfuChat</Text>
          <Text style={[qrS.sub, { color: colors.textMuted }]}>Point any camera at this code to open your referral link</Text>
          <View style={[qrS.qrWrap, { borderColor: colors.border, backgroundColor: "#fff" }]}>
            <QRCode value={link} size={200} color="#111" backgroundColor="#fff" />
          </View>
          <Text style={[qrS.link, { color: accent }]} numberOfLines={1}>{link}</Text>
          <TouchableOpacity
            style={[qrS.shareQrBtn, { borderColor: accent }]}
            onPress={async () => { try { await Share.share({ message: link, url: link }); } catch {} }}
          >
            <Ionicons name="share-outline" size={16} color={accent} />
            <Text style={[qrS.shareQrBtnText, { color: accent }]}>Share Link</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[qrS.closeBtn, { backgroundColor: accent }]} onPress={onClose}>
            <Text style={qrS.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Invite contacts ───────────────────────────────────────────────────────────
function InviteContactsSection({ referralLink, accent, colors }: { referralLink: string; accent: string; colors: any }) {
  const [state,    setState]    = useState<"idle" | "loading" | "done" | "denied">("idle");
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [query,    setQuery]    = useState("");

  const inviteMsg = `Join me on AfuChat! Sign up with my link and get 1 week of free Platinum: ${referralLink}`;

  const loadContacts = useCallback(async () => {
    setState("loading");
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") { setState("denied"); return; }
    const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name] });
    const seen = new Set<string>(); const list: PhoneContact[] = [];
    for (const c of data) {
      for (const pn of c.phoneNumbers || []) {
        if (!pn.number) continue;
        const norm = normalizePhone(pn.number);
        if (norm.length < 8 || seen.has(norm)) continue;
        seen.add(norm);
        list.push({ key: norm, name: c.name || "Unknown", phone: norm, rawPhone: pn.number });
      }
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    setContacts(list); setState("done");
  }, []);

  const filtered = query.trim()
    ? contacts.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) || c.rawPhone.includes(query))
    : contacts;

  function initials(name: string) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  }

  return (
    <View style={[invS.card, { backgroundColor: colors.surface }]}>
      <View style={invS.cardHeader}>
        <View style={[invS.iconWrap, { backgroundColor: accent + "18" }]}>
          <Ionicons name="people" size={18} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[invS.cardTitle, { color: colors.text }]}>Invite Your Contacts</Text>
          <Text style={[invS.cardSub, { color: colors.textMuted }]}>Invite by WhatsApp or SMS using the contact's number</Text>
        </View>
      </View>

      {state === "idle" && (
        <TouchableOpacity style={[invS.loadBtn, { backgroundColor: accent }]} onPress={loadContacts} activeOpacity={0.85}>
          <Ionicons name="person-add-outline" size={16} color="#fff" />
          <Text style={invS.loadBtnText}>Load Contacts</Text>
        </TouchableOpacity>
      )}
      {state === "loading" && (
        <View style={invS.center}><ActivityIndicator color={accent} /><Text style={[invS.loadingText, { color: colors.textMuted }]}>Scanning contacts…</Text></View>
      )}
      {state === "denied" && (
        <View style={invS.center}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.textMuted} />
          <Text style={[invS.deniedText, { color: colors.textMuted }]}>Enable contacts in Settings to invite people.</Text>
          <TouchableOpacity style={[invS.loadBtn, { backgroundColor: accent, marginTop: 4 }]} onPress={() => Linking.openSettings()} activeOpacity={0.85}>
            <Text style={invS.loadBtnText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      )}
      {state === "done" && (
        <>
          <View style={[invS.searchRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[invS.searchInput, { color: colors.text }]}
              placeholder="Search contacts…" placeholderTextColor={colors.textMuted}
              value={query} onChangeText={setQuery} returnKeyType="search"
            />
            {query.length > 0 && <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}><Ionicons name="close-circle" size={16} color={colors.textMuted} /></TouchableOpacity>}
          </View>
          <Text style={[invS.countLabel, { color: colors.textMuted }]}>{filtered.length} contact{filtered.length !== 1 ? "s" : ""}</Text>
          {filtered.slice(0, 50).map((c) => (
            <View key={c.key} style={[invS.contactRow, { borderTopColor: colors.border }]}>
              <View style={[invS.avatar, { backgroundColor: accent + "22" }]}>
                <Text style={[invS.avatarText, { color: accent }]}>{initials(c.name).toUpperCase() || "?"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[invS.contactName, { color: colors.text }]} numberOfLines={1}>{c.name}</Text>
                <Text style={[invS.contactPhone, { color: colors.textMuted }]}>{c.rawPhone}</Text>
              </View>
              <View style={invS.inviteActions}>
                <TouchableOpacity
                  style={[invS.inviteBtn, { backgroundColor: "#25D366" }]}
                  onPress={() => {
                    const n = c.phone.replace(/\D/g, "");
                    const message = encodeURIComponent(inviteMsg);
                    Linking.openURL(`whatsapp://send?phone=${n}&text=${message}`)
                      .catch(() => Linking.openURL(`https://wa.me/${n}?text=${message}`).catch(() => {}));
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="logo-whatsapp" size={15} color="#fff" />
                  <Text style={invS.inviteBtnText}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[invS.inviteBtn, { backgroundColor: "#007AFF" }]}
                  onPress={() => Linking.openURL(smsUrl(c.phone, inviteMsg)).catch(() => {})}
                  activeOpacity={0.8}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={15} color="#fff" />
                  <Text style={invS.inviteBtnText}>SMS</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {filtered.length > 50 && <Text style={[invS.countLabel, { color: colors.textMuted, textAlign: "center", paddingVertical: 8 }]}>Showing first 50 — search to narrow down</Text>}
        </>
      )}
    </View>
  );
}

// ── Leaderboard types ─────────────────────────────────────────────────────────
type LeaderEntry = {
  referrer_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  total_referrals: number;
  total_platinum_days_given: number;
  last_referral_at: string;
};

function rankBadge(rank: number): { icon: string; color: string } | null {
  if (rank === 1) return { icon: "🥇", color: "#FFD60A" };
  if (rank === 2) return { icon: "🥈", color: "#C0C0C0" };
  if (rank === 3) return { icon: "🥉", color: "#CD7F32" };
  return null;
}

function tierLabel(referrals: number): { label: string; color: string } | null {
  if (referrals >= 100) return { label: "Icon",       color: "#FFD60A" };
  if (referrals >= 50)  return { label: "Legend",     color: "#BF5AF2" };
  if (referrals >= 25)  return { label: "Influencer", color: "#FF375F" };
  if (referrals >= 10)  return { label: "Platinum",   color: "#007AFF" };
  return null;
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────
function LeaderboardTab({ accent, currentUserId }: { accent: string; currentUserId?: string }) {
  const { colors } = useTheme();
  const [entries,  setEntries]  = useState<LeaderEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [myRank,   setMyRank]   = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase.rpc("get_referral_leaderboard");

        if (data) {
          setEntries(data as LeaderEntry[]);
          const idx = data.findIndex((e: any) => e.referrer_id === currentUserId);
          setMyRank(idx >= 0 ? idx + 1 : null);
        }
      } catch {}
      setLoading(false);
    })();
  }, [currentUserId]);

  if (loading) {
    return (
      <View style={{ paddingTop: 32, gap: 12, paddingHorizontal: 16 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, opacity: 1 - i * 0.08 }}>
            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surface }} />
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface }} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ height: 13, width: "55%", borderRadius: 6, backgroundColor: colors.surface }} />
              <View style={{ height: 10, width: "35%", borderRadius: 5, backgroundColor: colors.surface }} />
            </View>
            <View style={{ height: 12, width: 60, borderRadius: 5, backgroundColor: colors.surface }} />
          </View>
        ))}
      </View>
    );
  }

  if (!entries.length) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 60, gap: 12 }}>
        <Ionicons name="trophy-outline" size={48} color={colors.textMuted} />
        <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.text }}>No entries yet</Text>
        <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center", paddingHorizontal: 32 }}>
          Be the first to invite friends and claim the top spot!
        </Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
      {myRank && myRank > 3 && (
        <View style={[lb.myRankBanner, { backgroundColor: accent + "15", borderColor: accent + "40" }]}>
          <Ionicons name="person-circle-outline" size={18} color={accent} />
          <Text style={[lb.myRankText, { color: accent }]}>Your rank: #{myRank}</Text>
        </View>
      )}

      <View style={[lb.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {entries.map((entry, i) => {
          const rank   = i + 1;
          const badge  = rankBadge(rank);
          const tier   = tierLabel(entry.total_referrals);
          const isMe   = entry.referrer_id === currentUserId;

          return (
            <View key={entry.referrer_id}>
              {i > 0 && <View style={[lb.divider, { backgroundColor: colors.border }]} />}
              <View style={[lb.row, isMe && { backgroundColor: accent + "0A" }]}>

                {/* Rank */}
                <View style={lb.rankCol}>
                  {badge
                    ? <Text style={lb.medalEmoji}>{badge.icon}</Text>
                    : <Text style={[lb.rankNum, { color: rank <= 10 ? colors.text : colors.textMuted }]}>#{rank}</Text>
                  }
                </View>

                {/* Avatar */}
                <AvatarInitial name={entry.display_name} uri={entry.avatar_url} size={40} />

                {/* Name + handle */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <Text style={[lb.name, { color: colors.text }]} numberOfLines={1}>{entry.display_name}</Text>
                    {isMe && (
                      <View style={[lb.youBadge, { backgroundColor: accent + "22" }]}>
                        <Text style={[lb.youBadgeText, { color: accent }]}>You</Text>
                      </View>
                    )}
                    {tier && (
                      <View style={[lb.tierBadge, { backgroundColor: tier.color + "18" }]}>
                        <Text style={[lb.tierText, { color: tier.color }]}>{tier.label}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[lb.handle, { color: colors.textMuted }]} numberOfLines={1}>
                    @{entry.handle} · {entry.total_referrals} invite{entry.total_referrals !== 1 ? "s" : ""}
                  </Text>
                </View>

                {/* Nexa earned via referrals (2,000 × rewarded invites) */}
                <View style={lb.acoinCol}>
                  <Ionicons name="flash" size={12} color="#FFD60A" />
                  <Text style={[lb.acoinVal, { color: colors.text }]}>
                    {(entry.total_referrals * 2000).toLocaleString()}
                  </Text>
                  <Text style={[lb.acoinLabel, { color: colors.textMuted }]}>Nexa</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <Text style={[lb.footer, { color: colors.textMuted }]}>
        Top 50 inviters · updates in real time
      </Text>
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AfuReferralApp() {
  const { colors, accent } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [referrals,     setReferrals]     = useState<ReferralEntry[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [copied,        setCopied]        = useState(false);
  const [showQRModal,   setShowQRModal]   = useState(false);
  const [activeShare,   setActiveShare]   = useState<"link" | "code">("link");
  const [activeView,    setActiveView]    = useState<"me" | "leaderboard">("me");
  const [claimedSteps,  setClaimedSteps]  = useState<Set<number>>(new Set());
  const [claimingStep,  setClaimingStep]  = useState<number | null>(null);
  const [claimSuccess,  setClaimSuccess]  = useState<RewardStep | null>(null);
  const [enteredCode,   setEnteredCode]   = useState("");
  const [claimingCode,  setClaimingCode]  = useState(false);
  const [codeMsg,       setCodeMsg]       = useState<{ ok: boolean; text: string } | null>(null);
  const [alreadyReferred, setAlreadyReferred] = useState(false);

  const referralLink = `https://afuchat.com/${profile?.handle || ""}`;
  const referralCode = (profile?.handle || "").toUpperCase();

  const totalReferrals = referrals.length;
  const rewardedCount  = referrals.filter(r => r.reward_given).length;
  const nexaEarned     = rewardedCount * NEXA_PER_INVITE;
  const doneSteps      = REWARD_STEPS.filter(s => totalReferrals >= s.invites);
  const currentStep    = doneSteps[doneSteps.length - 1] ?? null;
  const nextStep       = getNextStep(totalReferrals);

  const loadReferrals = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("referrals")
        .select("id, reward_given, created_at, referred_id")
        .eq("referrer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error || !data?.length) { setReferrals([]); setLoading(false); return; }

      const referredIds = data.map((r: any) => r.referred_id);
      const { data: profiles } = await supabase
        .from("profiles").select("id, display_name, handle, avatar_url").in("id", referredIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const now = Date.now();
      setReferrals(data.map((r: any) => {
        const p = profileMap.get(r.referred_id);
        return {
          id: r.id, referred_id: r.referred_id,
          referred_display_name: p?.display_name || "User",
          referred_handle: p?.handle || "",
          referred_avatar_url: p?.avatar_url || null,
          reward_given: r.reward_given ?? true,
          created_at: r.created_at,
          joined_days_ago: Math.floor((now - new Date(r.created_at).getTime()) / 86400000),
        };
      }));
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => { loadReferrals(); }, [loadReferrals]);

  const loadClaimedMilestones = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("referral_milestone_claims")
        .select("milestone_step")
        .eq("user_id", user.id);
      if (data) {
        setClaimedSteps(new Set(data.map((r: any) => Number(r.milestone_step))));
      }
    } catch {}
  }, [user]);

  useEffect(() => { loadClaimedMilestones(); }, [loadClaimedMilestones]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("referrals")
      .select("id")
      .eq("referred_id", user.id)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setAlreadyReferred(true); }, () => {});
  }, [user]);

  async function handleClaimMilestone(step: RewardStep) {
    if (!user || claimingStep !== null) return;
    setClaimingStep(step.step);
    try {
      const { error: claimError } = await supabase
        .from("referral_milestone_claims")
        .insert({ user_id: user.id, milestone_step: step.step, bonus_nexa: step.bonusNexa });

      if (claimError) {
        if (claimError.code === "23505") {
          setClaimedSteps(prev => new Set([...prev, step.step]));
          showToast("Already claimed!");
        } else {
          showToast("Could not claim. Try again shortly.");
        }
        setClaimingStep(null);
        return;
      }

      await supabase.rpc("reward_activity_xp", {
        p_activity_type: "milestone_bonus",
        p_xp_amount: step.bonusNexa,
        p_cooldown_seconds: 0,
        p_metadata: { milestone_step: step.step, milestone_title: step.title },
      });

      setClaimedSteps(prev => new Set([...prev, step.step]));
      setClaimSuccess(step);
    } catch {
      showToast("Something went wrong. Please try again.");
    }
    setClaimingStep(null);
  }

  async function copyToClipboard(text: string) {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    showToast("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareReferral() {
    const msg = `🚀 Join me on AfuChat — Africa's super app!\n\nUse my link: ${referralLink}\n\nYou'll get 1 week of free Platinum when you sign up!`;
    try { await Share.share({ message: msg, url: referralLink, title: "Join AfuChat" }); } catch {}
  }

  async function handleClaimCode() {
    const code = enteredCode.trim().toLowerCase();
    if (!code || !user) return;
    if (code === (profile?.handle || "").toLowerCase()) {
      setCodeMsg({ ok: false, text: "You can't use your own referral code." });
      return;
    }
    setClaimingCode(true);
    setCodeMsg(null);
    try {
      const { data, error } = await supabase.rpc("claim_referral_code", { p_referrer_handle: code });
      if (error) {
        setCodeMsg({ ok: false, text: "Could not apply code. Please try again." });
      } else if (data?.ok) {
        setCodeMsg({ ok: true, text: "Referral applied! You've earned 1 week of free Platinum." });
        setAlreadyReferred(true);
        setEnteredCode("");
        await loadReferrals();
      } else {
        const reason = data?.reason ?? "unknown";
        if (reason === "already_referred") {
          setCodeMsg({ ok: false, text: "You've already used a referral code." });
          setAlreadyReferred(true);
        } else if (reason === "referrer_not_found") {
          setCodeMsg({ ok: false, text: "Handle not found. Double-check the code." });
        } else if (reason === "self_referral") {
          setCodeMsg({ ok: false, text: "You can't use your own referral code." });
        } else {
          setCodeMsg({ ok: false, text: `Could not apply: ${reason}` });
        }
      }
    } catch {
      setCodeMsg({ ok: false, text: "Something went wrong. Please try again." });
    }
    setClaimingCode(false);
  }

  const progressToNext = nextStep
    ? Math.min(totalReferrals / nextStep.invites, 1)
    : 1;

  return (
    <ScrollView
      style={[s.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <QRModal visible={showQRModal} link={referralLink} accent={accent} onClose={() => setShowQRModal(false)} />
      <MilestoneClaimModal step={claimSuccess} onClose={() => setClaimSuccess(null)} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <LinearGradient colors={["#0A2E1F", "#062218"]} style={s.hero}>
        <View style={s.heroStats}>
          {[
            { label: "Invited",     value: totalReferrals,            icon: "person-add"      as const, color: accent },
            { label: "Nexa",        value: nexaEarned,                icon: "flash"           as const, color: "#FFD60A" },
            { label: "Rank",        value: currentStep?.role || "—",  icon: "ribbon"          as const, color: "#BF5AF2" },
          ].map(stat => (
            <View key={stat.label} style={s.heroStat}>
              <Ionicons name={stat.icon} size={18} color={stat.color} />
              <Text style={s.heroStatValue}>{loading ? "—" : typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}</Text>
              <Text style={s.heroStatLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {nextStep && (
          <View style={s.progressWrap}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={s.progressLabel}>Next: {nextStep.title}</Text>
              <Text style={s.progressLabel}>{totalReferrals}/{nextStep.invites} invites</Text>
            </View>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)" }}>
              <View style={{ height: "100%", width: `${progressToNext * 100}%`, backgroundColor: accent, borderRadius: 3 }} />
            </View>
          </View>
        )}
      </LinearGradient>

      {/* ── View switcher: My Referrals | Leaderboard ────────────────────── */}
      <View style={[s.viewSwitcher, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {(["me", "leaderboard"] as const).map(view => (
          <TouchableOpacity
            key={view}
            onPress={() => setActiveView(view)}
            activeOpacity={0.75}
            style={[s.viewTab, activeView === view && { backgroundColor: accent }]}
          >
            <Ionicons
              name={view === "me" ? "person-outline" : "trophy-outline"}
              size={15}
              color={activeView === view ? "#fff" : colors.textMuted}
            />
            <Text style={[s.viewTabText, { color: activeView === view ? "#fff" : colors.textMuted }]}>
              {view === "me" ? "My Referrals" : "Leaderboard"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Leaderboard view ─────────────────────────────────────────────── */}
      {activeView === "leaderboard" && (
        <LeaderboardTab accent={accent} currentUserId={user?.id} />
      )}

      {/* ── My Referrals view ────────────────────────────────────────────── */}
      {activeView === "me" && (<>

      {/* ── Share tabs ───────────────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={[s.shareTabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(["link", "code"] as const).map(tab => (
            <TouchableOpacity
              key={tab} onPress={() => setActiveShare(tab)} activeOpacity={0.75}
              style={[s.shareTab, activeShare === tab && { backgroundColor: accent + "18" }]}
            >
              <Ionicons name={tab === "link" ? "link-outline" : "key-outline"} size={15} color={activeShare === tab ? accent : colors.textMuted} />
              <Text style={[s.shareTabText, { color: activeShare === tab ? accent : colors.textMuted }]}>
                {tab === "link" ? "Link" : "Code"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[s.shareCard, { backgroundColor: colors.surface, borderColor: accent + "30" }]}>
          <Text style={[s.shareValue, { color: accent }]} numberOfLines={1}>
            {activeShare === "link" ? referralLink : referralCode}
          </Text>
          <TouchableOpacity
            style={[s.copyBtn, { backgroundColor: copied ? "#34C759" : accent }]}
            onPress={() => copyToClipboard(activeShare === "link" ? referralLink : referralCode)}
          >
            <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={s.actionRow}>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: accent }]} onPress={shareReferral} activeOpacity={0.85}>
            <Ionicons name="share-social" size={18} color="#fff" />
            <Text style={s.actionBtnText}>Share Invite</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: accent + "40" }]} onPress={() => setShowQRModal(true)} activeOpacity={0.85}>
            <Ionicons name="qr-code-outline" size={18} color={accent} />
            <Text style={[s.actionBtnText, { color: accent }]}>QR Code</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Contacts ─────────────────────────────────────────────────────── */}
      <View style={s.section}>
        <InviteContactsSection referralLink={referralLink} accent={accent} colors={colors} />
      </View>

      {/* ── Enter referral code (for existing users) ──────────────────────── */}
      {!alreadyReferred && (
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>HAVE A REFERRAL CODE?</Text>
          <View style={[s.shareCard, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: "column", gap: 10 }]}>
            <Text style={[{ color: colors.textMuted, fontSize: 13 }]}>
              Got someone's invite link? Enter their handle to give them credit and claim your Platinum reward.
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={enteredCode}
                onChangeText={v => { setEnteredCode(v); setCodeMsg(null); }}
                placeholder="their_handle"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[{
                  flex: 1, height: 42, borderRadius: 10, paddingHorizontal: 12,
                  backgroundColor: colors.background, borderWidth: 1,
                  borderColor: colors.border, color: colors.text, fontSize: 14,
                }]}
              />
              <TouchableOpacity
                onPress={handleClaimCode}
                disabled={claimingCode || !enteredCode.trim()}
                activeOpacity={0.8}
                style={[{
                  height: 42, paddingHorizontal: 16, borderRadius: 10,
                  backgroundColor: accent, justifyContent: "center", alignItems: "center",
                  opacity: claimingCode || !enteredCode.trim() ? 0.5 : 1,
                }]}
              >
                {claimingCode
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Apply</Text>
                }
              </TouchableOpacity>
            </View>
            {codeMsg && (
              <Text style={{ fontSize: 13, color: codeMsg.ok ? "#34C759" : "#FF453A" }}>
                {codeMsg.ok ? "✓ " : "✗ "}{codeMsg.text}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* ── Reward steps ─────────────────────────────────────────────────── */}
      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>REWARD MILESTONES</Text>
        <View style={[s.stepsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {REWARD_STEPS.map((step, i) => (
            <StepRow
              key={step.step}
              step={step}
              total={totalReferrals}
              isLast={i === REWARD_STEPS.length - 1}
              accent={accent}
              colors={colors}
              claimed={claimedSteps.has(step.step)}
              claiming={claimingStep === step.step}
              onClaim={() => handleClaimMilestone(step)}
            />
          ))}
        </View>
      </View>

      {/* ── Recent referrals ─────────────────────────────────────────────── */}
      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: "center" }}><ActivityIndicator color={accent} /></View>
      ) : referrals.length > 0 ? (
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>RECENT REFERRALS</Text>
          <View style={[s.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {referrals.slice(0, 20).map((r, i) => (
              <View key={r.id}>
                {i > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
                <View style={s.referralRow}>
                  <AvatarInitial name={r.referred_display_name} uri={r.referred_avatar_url} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.referralName, { color: colors.text }]}>{r.referred_display_name}</Text>
                    <Text style={[s.referralHandle, { color: colors.textMuted }]}>
                      @{r.referred_handle} · {r.joined_days_ago === 0 ? "Today" : `${r.joined_days_ago}d ago`}
                    </Text>
                  </View>
                  <View style={[s.rewardBadge, { backgroundColor: r.reward_given ? "#34C75918" : "#FF9F0A18" }]}>
                    <Ionicons name="flash" size={12} color={r.reward_given ? "#34C759" : "#FF9F0A"} />
                    <Text style={[s.rewardBadgeText, { color: r.reward_given ? "#34C759" : "#FF9F0A" }]}>
                      {r.reward_given ? `+${NEXA_PER_INVITE.toLocaleString()} NX` : "Pending"}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={s.emptyState}>
          <Ionicons name="people-outline" size={48} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.text }]}>No referrals yet</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>Share your link above to start earning Nexa</Text>
        </View>
      )}

      </>)}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  hero: { margin: 16, borderRadius: 20, padding: 20 },
  heroStats: { flexDirection: "row", justifyContent: "space-around", marginBottom: 16 },
  heroStat: { alignItems: "center", gap: 4 },
  heroStatValue: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  heroStatLabel: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontFamily: "Inter_400Regular" },
  progressWrap: { marginTop: 4 },
  progressLabel: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontFamily: "Inter_400Regular" },
  viewSwitcher: { flexDirection: "row", marginHorizontal: 16, borderRadius: 14, borderWidth: 0.5, padding: 4, gap: 4 },
  viewTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  viewTabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 10 },
  shareTabs: { flexDirection: "row", borderRadius: 12, borderWidth: 0.5, padding: 4, marginBottom: 10 },
  shareTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 9 },
  shareTabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  shareCard: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12 },
  shareValue: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  copyBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 13 },
  actionBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  stepsCard: { borderRadius: 16, borderWidth: 0.5, padding: 16, gap: 0 },
  listCard: { borderRadius: 16, borderWidth: 0.5, overflow: "hidden" },
  divider: { height: 0.5 },
  referralRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  referralName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  referralHandle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rewardBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  rewardBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emptyState: { alignItems: "center", gap: 10, paddingVertical: 48, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
});

const lb = StyleSheet.create({
  myRankBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
  myRankText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 16, borderWidth: 0.5, overflow: "hidden", marginBottom: 8 },
  divider: { height: 0.5 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  rankCol: { width: 32, alignItems: "center" },
  medalEmoji: { fontSize: 22 },
  rankNum: { fontSize: 13, fontFamily: "Inter_700Bold" },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  handle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  youBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  youBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  tierBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  tierText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  acoinCol: { alignItems: "center", minWidth: 54 },
  acoinVal: { fontSize: 13, fontFamily: "Inter_700Bold", marginTop: 1 },
  acoinLabel: { fontSize: 9, fontFamily: "Inter_500Medium", marginTop: 1 },
  footer: { textAlign: "center", fontSize: 11, fontFamily: "Inter_400Regular", paddingVertical: 16 },
});

const stepStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, marginBottom: 2 },
  left: { alignItems: "center", width: 28 },
  circle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  line: { width: 2, flex: 1, marginVertical: 4 },
  content: { flex: 1, borderRadius: 12, borderWidth: 0.5, padding: 12, marginBottom: 8 },
  header: { gap: 2, marginBottom: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { fontSize: 14, fontFamily: "Inter_700Bold" },
  role: { fontSize: 11, fontFamily: "Inter_400Regular" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  rewards: { gap: 4, marginBottom: 8 },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  rewardText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  progressLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  desc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6 },
  claimBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: 10, paddingVertical: 10, marginTop: 10,
  },
  claimBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  claimedRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10, justifyContent: "center" },
  claimedText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#34C759" },
});

const qrS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  card: { width: 320, borderRadius: 24, padding: 24, alignItems: "center", gap: 12 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  qrWrap: { padding: 16, borderRadius: 12, borderWidth: 1 },
  link: { fontSize: 11, fontFamily: "Inter_400Regular", maxWidth: "100%" as any },
  shareQrBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  shareQrBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  closeBtn: { paddingHorizontal: 32, paddingVertical: 13, borderRadius: 14 },
  closeBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

const invS = StyleSheet.create({
  card: { borderRadius: 16, padding: 16 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  loadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12 },
  loadBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  center: { alignItems: "center", gap: 10, paddingVertical: 20 },
  loadingText: { fontSize: 13 },
  deniedText: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14 },
  countLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 8 },
  contactRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  contactName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  contactPhone: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  inviteActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  inviteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  inviteBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
});

const claimModalS = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 24,
  },
  card: {
    width: "100%", maxWidth: 380, borderRadius: 24, overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 12px 28px rgba(0,0,0,0.38)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 16 },
    }),
  },
  header: { alignItems: "center", paddingTop: 32, paddingBottom: 24, paddingHorizontal: 24, gap: 8 },
  iconRing: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.3 },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.80)" },
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, gap: 12 },
  congrats: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  desc: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  nexaCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  nexaGradient: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  nexaIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: "#FFD60A20", alignItems: "center", justifyContent: "center",
  },
  nexaLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  nexaAmount: { fontSize: 20, fontFamily: "Inter_700Bold" },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  doneBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 14,
  },
  doneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
