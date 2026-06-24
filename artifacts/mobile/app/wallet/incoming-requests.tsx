import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import * as Haptics from "@/lib/haptics";
import Colors from "@/constants/colors";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { Avatar } from "@/components/ui/Avatar";

function fmtAmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type MoneyRequest = {
  id: string;
  requester_id: string;
  target_id: string;
  currency: "acoin" | "nexa";
  amount: number;
  note: string | null;
  status: "pending" | "accepted" | "denied" | "expired" | "cancelled";
  created_at: string;
  expires_at: string;
  requester?: { id: string; display_name: string; handle: string; avatar_url: string | null };
};

type Tab = "incoming" | "sent";

export default function IncomingRequestsScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("incoming");

  const [incoming, setIncoming] = useState<MoneyRequest[]>([]);
  const [sent, setSent] = useState<MoneyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;

    // Fetch incoming (target = me) and sent (requester = me) in parallel
    const [incRes, sentRes] = await Promise.all([
      supabase
        .from("money_requests")
        .select("*")
        .eq("target_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("money_requests")
        .select("*")
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const incRows = (incRes.data || []) as MoneyRequest[];
    const sentRows = (sentRes.data || []) as MoneyRequest[];

    // Batch-fetch profiles for all unique user IDs
    const allIds = [
      ...new Set([
        ...incRows.map((r) => r.requester_id),
        ...sentRows.map((r) => r.target_id),
      ]),
    ].filter(Boolean);

    if (allIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, handle, avatar_url")
        .in("id", allIds);
      const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));

      incRows.forEach((r) => { r.requester = profileMap[r.requester_id]; });
      sentRows.forEach((r) => { (r as any).target = profileMap[r.target_id]; });
    }

    setIncoming(incRows);
    setSent(sentRows);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription for incoming requests
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`money-requests:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "money_requests", filter: `target_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "money_requests", filter: `requester_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  async function handleAccept(req: MoneyRequest) {
    if (!user || !profile) return;
    setActingId(req.id);

    try {
      // Check live balance
      const { data: myProfile, error: balErr } = await supabase
        .from("profiles")
        .select(req.currency === "acoin" ? "acoin" : "xp")
        .eq("id", user.id)
        .single();

      if (balErr) {
        showAlert("Error", "Could not verify your balance. Please try again.");
        setActingId(null);
        return;
      }

      const balance = req.currency === "acoin"
        ? (myProfile as any)?.acoin ?? 0
        : (myProfile as any)?.xp ?? 0;

      if (balance < req.amount) {
        showAlert(
          "Insufficient Balance",
          `You need ${fmtAmt(req.amount)} ${req.currency === "acoin" ? "ACoin" : "Nexa"} to fulfill this request. Your balance: ${fmtAmt(balance)}.`
        );
        setActingId(null);
        return;
      }

      let transferOk = true;
      let transferErrMsg = "Could not process the transfer. Please try again.";

      if (req.currency === "acoin") {
        const { data: deductData, error: deductErr } = await supabase.rpc("deduct_acoin", {
          p_user_id: user.id,
          p_amount: req.amount,
        });
        if (deductErr || (deductData as any)?.success === false) {
          transferOk = false;
          transferErrMsg = (deductData as any)?.message || "Deduction failed. Please try again.";
        } else {
          await supabase.rpc("credit_acoin", {
            p_user_id: req.requester_id,
            p_amount: req.amount,
          }).then(null, () => {});
        }
      } else {
        // Nexa (XP) transfer: direct update pattern
        const { error: deductErr } = await supabase
          .from("profiles")
          .update({ xp: balance - req.amount })
          .eq("id", user.id)
          .gte("xp", req.amount);
        if (deductErr) {
          transferOk = false;
        } else {
          const { data: reqProfile } = await supabase
            .from("profiles").select("xp").eq("id", req.requester_id).single();
          await supabase
            .from("profiles")
            .update({ xp: ((reqProfile as any)?.xp ?? 0) + req.amount })
            .eq("id", req.requester_id)
            .then(null, () => {});
        }
      }

      if (!transferOk) {
        showAlert("Transfer Failed", transferErrMsg);
        setActingId(null);
        return;
      }

      // Mark accepted
      await supabase.from("money_requests").update({
        status: "accepted",
        responded_at: new Date().toISOString(),
      }).eq("id", req.id);

      // Notify requester (fire-and-forget)
      supabase.from("notifications").insert({
        user_id: req.requester_id,
        type: "money_request_accepted",
        actor_id: user.id,
        actor_name: profile.display_name,
        actor_handle: profile.handle,
        actor_avatar: (profile as any).avatar_url ?? null,
        entity_type: "money_request",
        title: "Request Accepted!",
        body: `@${profile.handle} sent you ${fmtAmt(req.amount)} ${req.currency === "acoin" ? "ACoin" : "Nexa"} 🎉`,
        data: { currency: req.currency, amount: req.amount, request_id: req.id },
        read: false,
      }).then(null, () => {});

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Sent!", `You sent ${fmtAmt(req.amount)} ${req.currency === "acoin" ? "ACoin" : "Nexa"} to @${req.requester?.handle || "them"}.`);
      load();
    } catch (err) {
      console.error("[handleAccept] unexpected error:", err);
      showAlert("Error", "Something went wrong. Please try again.");
    }
    setActingId(null);
  }

  async function handleDeny(req: MoneyRequest) {
    if (!user || !profile) return;
    setActingId(req.id);
    await supabase.from("money_requests").update({
      status: "denied",
      responded_at: new Date().toISOString(),
    }).eq("id", req.id);

    supabase.from("notifications").insert({
      user_id: req.requester_id,
      type: "money_request_denied",
      actor_id: user.id,
      actor_name: profile.display_name,
      actor_handle: profile.handle,
      actor_avatar: (profile as any).avatar_url || null,
      entity_type: "money_request",
      title: "Request Declined",
      body: `@${profile.handle} declined your ${fmtAmt(req.amount)} ${req.currency === "acoin" ? "ACoin" : "Nexa"} request`,
      data: { currency: req.currency, amount: req.amount, request_id: req.id },
      read: false,
    }).then(() => {}).catch(() => {});

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    load();
    setActingId(null);
  }

  async function handleCancel(req: MoneyRequest) {
    setActingId(req.id);
    await supabase.from("money_requests").update({
      status: "cancelled",
      responded_at: new Date().toISOString(),
    }).eq("id", req.id);
    load();
    setActingId(null);
  }

  const pendingCount = incoming.filter((r) => r.status === "pending").length;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <GlassHeader
        title="Money Requests"
        onBack={() => router.back()}
        right={
          pendingCount > 0 ? (
            <View style={[s.countBadge, { backgroundColor: "#FF9500" }]}>
              <Text style={s.countBadgeText}>{pendingCount}</Text>
            </View>
          ) : undefined
        }
      />

      {/* Tabs */}
      <View style={[s.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["incoming", "sent"] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && { borderBottomColor: Colors.brand, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, { color: tab === t ? Colors.brand : colors.textMuted }]}>
              {t === "incoming" ? "Received" : "Sent"}
            </Text>
            {t === "incoming" && pendingCount > 0 && (
              <View style={[s.tabBadge, { backgroundColor: "#FF9500" }]}>
                <Text style={s.tabBadgeText}>{pendingCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color={Colors.brand} size="large" />
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={Colors.brand} />}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 24 }]}
        >
          {tab === "incoming" && (
            incoming.length === 0 ? (
              <EmptyState icon="hand-left-outline" title="No Requests" sub="Money requests sent to you will appear here." colors={colors} />
            ) : (
              incoming.map((req) => (
                <RequestCard
                  key={req.id}
                  req={req}
                  mode="incoming"
                  actingId={actingId}
                  colors={colors}
                  onAccept={() => handleAccept(req)}
                  onDeny={() => handleDeny(req)}
                />
              ))
            )
          )}

          {tab === "sent" && (
            sent.length === 0 ? (
              <EmptyState icon="paper-plane-outline" title="No Sent Requests" sub="Requests you send will appear here." colors={colors} />
            ) : (
              sent.map((req) => (
                <RequestCard
                  key={req.id}
                  req={req}
                  mode="sent"
                  actingId={actingId}
                  colors={colors}
                  onCancel={req.status === "pending" ? () => handleCancel(req) : undefined}
                />
              ))
            )
          )}
        </ScrollView>
      )}
    </View>
  );
}

function RequestCard({
  req, mode, actingId, colors, onAccept, onDeny, onCancel,
}: {
  req: MoneyRequest;
  mode: "incoming" | "sent";
  actingId: string | null;
  colors: any;
  onAccept?: () => void;
  onDeny?: () => void;
  onCancel?: () => void;
}) {
  const other = mode === "incoming" ? req.requester : (req as any).target;
  const isActing = actingId === req.id;
  const isPending = req.status === "pending";
  const isExpired = isPending && new Date(req.expires_at) < new Date();

  const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    pending:   { label: isExpired ? "Expired" : "Pending",  color: "#FF9500", icon: "time-outline" },
    accepted:  { label: "Accepted",  color: "#34C759", icon: "checkmark-circle" },
    denied:    { label: "Declined",  color: "#FF3B30", icon: "close-circle" },
    expired:   { label: "Expired",   color: "#8E8E93", icon: "time-outline" },
    cancelled: { label: "Cancelled", color: "#8E8E93", icon: "ban-outline" },
  };
  const sc = statusConfig[isExpired ? "expired" : req.status] || statusConfig.pending;
  const currColor = req.currency === "acoin" ? "#34C759" : "#FF9500";

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.cardTop}>
        <Avatar uri={other?.avatar_url} name={other?.display_name || "?"} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={[s.cardName, { color: colors.text }]} numberOfLines={1}>
            {other?.display_name || "Unknown"}
          </Text>
          <Text style={[s.cardHandle, { color: colors.textMuted }]}>
            @{other?.handle || "unknown"}
          </Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: sc.color + "15" }]}>
          <Ionicons name={sc.icon as any} size={11} color={sc.color} />
          <Text style={[s.statusPillText, { color: sc.color }]}>{sc.label}</Text>
        </View>
      </View>

      <View style={s.amountRow}>
        <Ionicons name={req.currency === "acoin" ? "diamond" : "flash"} size={20} color={currColor} />
        <Text style={[s.amount, { color: currColor }]}>
          {fmtAmt(req.amount)}{" "}
          <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular" }}>
            {req.currency === "acoin" ? "ACoin" : "Nexa"}
          </Text>
        </Text>
        <Text style={[s.timeAgo, { color: colors.textMuted }]}>{timeAgo(req.created_at)}</Text>
      </View>

      {req.note ? (
        <View style={[s.noteBox, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.textMuted} />
          <Text style={[s.noteText, { color: colors.textSecondary }]} numberOfLines={2}>
            {req.note}
          </Text>
        </View>
      ) : null}

      {/* Actions — only for pending, non-expired incoming requests */}
      {mode === "incoming" && isPending && !isExpired && (
        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: "#FF3B30" + "15", borderColor: "#FF3B30" + "40" }]}
            onPress={onDeny}
            disabled={isActing}
          >
            {isActing
              ? <ActivityIndicator size="small" color="#FF3B30" />
              : <><Ionicons name="close" size={16} color="#FF3B30" /><Text style={[s.btnText, { color: "#FF3B30" }]}>Decline</Text></>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: "#34C759", flex: 1.4 }]}
            onPress={onAccept}
            disabled={isActing}
          >
            {isActing
              ? <ActivityIndicator size="small" color="#fff" />
              : <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={[s.btnText, { color: "#fff" }]}>Send {fmtAmt(req.amount)}</Text></>}
          </TouchableOpacity>
        </View>
      )}

      {mode === "sent" && isPending && onCancel && (
        <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]} onPress={onCancel} disabled={isActing}>
          {isActing
            ? <ActivityIndicator size="small" color={colors.textMuted} />
            : <Text style={[s.cancelBtnText, { color: colors.textMuted }]}>Cancel Request</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

function EmptyState({ icon, title, sub, colors }: { icon: any; title: string; sub: string; colors: any }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={52} color={colors.textMuted} />
      <Text style={[s.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[s.emptySub, { color: colors.textMuted }]}>{sub}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", borderBottomWidth: 0.5 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabBadge: { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, minWidth: 16, alignItems: "center" },
  tabBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  countBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 20, alignItems: "center" },
  countBadgeText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  list: { padding: 16, gap: 12 },
  card: { borderRadius: 16, borderWidth: 0.5, padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  amount: { flex: 1, fontSize: 22, fontFamily: "Inter_700Bold" },
  timeAgo: { fontSize: 12, fontFamily: "Inter_400Regular" },
  noteBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 10 },
  noteText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  btnRow: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: "transparent" },
  btnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cancelBtn: { alignItems: "center", paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  cancelBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  empty: { alignItems: "center", paddingTop: 64, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 260 },
});
