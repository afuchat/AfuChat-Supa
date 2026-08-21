import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SmartSheet } from "@/components/ui/SmartSheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";
import Colors from "@/constants/colors";

type Seller = { display_name: string; handle: string; avatar_url?: string } | null;
type Listing = {
  id: string; username: string; price: number; description: string | null;
  is_active: boolean; created_at: string; views: number; seller_id: string; seller: Seller;
};
type Tab = "discover" | "yours";

const HANDLE_RE = /^[a-z0-9_]{1,30}$/;
const money = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days < 1 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`;
};

function TransferSheet({ item, visible, onClose, onConfirm, busy, colors }: {
  item: Listing | null; visible: boolean; onClose: () => void; onConfirm: () => void; busy: boolean; colors: any;
}) {
  if (!item) return null;
  return (
    <SmartSheet visible={visible} onClose={onClose} peekFraction={0.72} backgroundColor={colors.surface}>
      <View style={s.sheet}>
        <View style={[s.sheetIcon, { backgroundColor: colors.accent + "18" }]}>
          <Ionicons name="swap-horizontal" size={26} color={colors.accent} />
        </View>
        <Text style={[s.sheetTitle, { color: colors.text }]}>Secure transfer</Text>
        <Text style={[s.sheetCopy, { color: colors.textMuted }]}>
          You are buying a permanent handle, not a seller’s profile. Payment and ownership transfer happen together.
        </Text>
        <View style={[s.receipt, { borderColor: colors.border }]}>
          <View style={s.receiptRow}><Text style={[s.receiptLabel, { color: colors.textMuted }]}>Username</Text><Text style={[s.receiptValue, { color: colors.text }]}>@{item.username}</Text></View>
          <View style={s.receiptRow}><Text style={[s.receiptLabel, { color: colors.textMuted }]}>Seller</Text><Text style={[s.receiptValue, { color: colors.text }]}>@{item.seller?.handle || "seller"}</Text></View>
          <View style={s.receiptRow}><Text style={[s.receiptLabel, { color: colors.textMuted }]}>Total</Text><Text style={[s.receiptValue, { color: colors.accent }]}>{money(item.price)} ACoin</Text></View>
        </View>
        <View style={s.trustLine}><Ionicons name="shield-checkmark" size={17} color={colors.success} /><Text style={[s.trustText, { color: colors.textSecondary }]}>The listing closes immediately and the handle routes to your profile.</Text></View>
        <Pressable testID="confirm-username-purchase" onPress={onConfirm} disabled={busy} style={[s.primaryButton, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Buy & secure @{item.username}</Text>}
        </Pressable>
        <Pressable onPress={onClose} disabled={busy} style={s.cancelButton}><Text style={[s.cancelText, { color: colors.textMuted }]}>Not now</Text></Pressable>
      </View>
    </SmartSheet>
  );
}

function ListSheet({ visible, onClose, onListed, userId, handle, colors }: {
  visible: boolean; onClose: () => void; onListed: () => void; userId?: string; handle?: string; colors: any;
}) {
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) setPrice(""); }, [visible]);
  const submit = async () => {
    if (!userId) { showAlert("Sign in required", "Sign in before listing your username."); return; }
    const username = (handle || "").trim().replace(/^@/, "").toLowerCase();
    const value = Number.parseInt(price, 10);
    if (!HANDLE_RE.test(username)) { showAlert("Unavailable", "Only your current username can be listed."); return; }
    if (!Number.isFinite(value) || value < 1) { showAlert("Set a price", "Enter at least 1 ACoin."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("create_username_listing", { p_username: username, p_price: value, p_is_auction: false, p_duration_hours: null });
    setBusy(false);
    if (error) { showAlert("Could not list", error.message); return; }
    onClose(); onListed(); showAlert("Listing is live", `@${username} is now available for a one-time transfer.`);
  };
  return (
    <SmartSheet visible={visible} onClose={onClose} peekFraction={0.73} backgroundColor={colors.surface}>
      <View style={s.sheet}>
        <Text style={[s.sheetTitle, { color: colors.text }]}>List your username</Text>
        <Text style={[s.sheetCopy, { color: colors.textMuted }]}>Your profile stays protected until a buyer completes payment. There are no bids or duplicate listings.</Text>
        <Text style={[s.label, { color: colors.textSecondary }]}>Your handle</Text>
        <View style={[s.field, { backgroundColor: colors.inputBg }]}><Text style={[s.prefix, { color: colors.accent }]}>@</Text><Text style={[s.lockedHandle, { color: colors.text }]}>{handle || "username"}</Text><Ionicons name="lock-closed" size={15} color={colors.textMuted} /></View>
        <Text style={[s.label, { color: colors.textSecondary }]}>Fixed price</Text>
        <View style={[s.field, { backgroundColor: colors.inputBg }]}><Ionicons name="flash" size={17} color={Colors.gold} /><TextInput testID="username-list-price" style={[s.input, { color: colors.text }]} value={price} onChangeText={setPrice} placeholder="Amount in ACoin" placeholderTextColor={colors.textMuted} keyboardType="number-pad" /><Text style={[s.suffix, { color: colors.textMuted }]}>ACoin</Text></View>
        <Pressable testID="list-username" onPress={submit} disabled={busy} style={[s.primaryButton, { backgroundColor: colors.accent, opacity: busy ? 0.6 : 1 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Publish fixed-price listing</Text>}</Pressable>
      </View>
    </SmartSheet>
  );
}

export default function AfuUsernamesApp() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [tab, setTab] = useState<Tab>("discover");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [buying, setBuying] = useState(false);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true); else setLoading(true);
    let q = supabase.from("username_listings")
      .select("id,username,price,description,is_active,created_at,views,seller_id,seller:seller_id(display_name,handle,avatar_url)")
      .eq("is_active", true).eq("is_auction", false).order("created_at", { ascending: false }).limit(80);
    if (search.trim()) q = q.ilike("username", `%${search.trim().replace(/^@/, "")}%`);
    const { data, error } = await q;
    if (!error) setListings((data || []) as unknown as Listing[]);
    setLoading(false); setRefreshing(false);
  }, [search]);
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t); }, [load]);

  const mine = useMemo(() => listings.filter(x => x.seller_id === user?.id), [listings, user?.id]);
  const visible = tab === "yours" ? mine : listings;
  const buy = async () => {
    if (!selected || !user) { showAlert("Sign in required", "Sign in to secure a username."); return; }
    setBuying(true);
    const { error } = await supabase.rpc("purchase_username", { p_listing_id: selected.id });
    setBuying(false);
    if (error) { setSelected(null); showAlert("Transfer not completed", error.message || "This listing may have just been secured."); await load(); return; }
    const name = selected.username; setSelected(null); setListings(prev => prev.filter(x => x.id !== selected.id));
    showAlert("Username secured", `@${name} now routes to your profile.`);
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.headerTitleRow}><View style={[s.brandMark, { backgroundColor: colors.accent }]}><Text style={s.brandAt}>@</Text></View><View><Text style={[s.title, { color: colors.text }]}>Username Market</Text><Text style={[s.subtitle, { color: colors.textMuted }]}>Find a handle worth owning</Text></View></View>
        <Pressable testID="open-list-username" onPress={() => user ? setSellOpen(true) : showAlert("Sign in required", "Sign in to list your username.")} style={[s.sellButton, { borderColor: colors.border }]}><Ionicons name="add" size={18} color={colors.accent} /><Text style={[s.sellText, { color: colors.accent }]}>Sell</Text></Pressable>
      </View>
      <View style={[s.searchField, { backgroundColor: colors.inputBg }]}><Ionicons name="search" size={17} color={colors.textMuted} /><TextInput testID="username-market-search" style={[s.searchInput, { color: colors.text }]} value={search} onChangeText={setSearch} placeholder="Search a username" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} /><Ionicons name="shield-checkmark" size={16} color={colors.success} /></View>
      <View style={[s.notice, { backgroundColor: colors.accent + "12" }]}><Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} /><Text style={[s.noticeText, { color: colors.textSecondary }]}><Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>Verified transfer. </Text>Payment, listing closure, and ownership update happen together.</Text></View>
      <View style={[s.tabs, { borderBottomColor: colors.border }]}>{(["discover", "yours"] as Tab[]).map(x => <Pressable key={x} onPress={() => setTab(x)} style={[s.tab, tab === x && { borderBottomColor: colors.accent }]}><Text style={[s.tabText, { color: tab === x ? colors.accent : colors.textMuted }]}>{x === "discover" ? "Discover" : "Your listing"}</Text>{x === "yours" && mine.length > 0 ? <View style={[s.count, { backgroundColor: colors.accent }]}><Text style={s.countText}>{mine.length}</Text></View> : null}</Pressable>)}</View>
      {loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 50 }} /> : <FlatList data={visible} keyExtractor={x => x.id} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.accent} />} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: insets.bottom + 30, flexGrow: visible.length ? 0 : 1 }} renderItem={({ item }) => (
        <Pressable testID={`username-listing-${item.id}`} onPress={() => { if (item.seller_id === user?.id) return; void supabase.from("username_listings").update({ views: (item.views || 0) + 1 }).eq("id", item.id); setSelected(item); }} style={({ pressed }) => [s.listing, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
          <View style={[s.handleIcon, { backgroundColor: colors.accent + "16" }]}><Text style={[s.handleAt, { color: colors.accent }]}>@</Text></View><View style={s.listingBody}><Text style={[s.handle, { color: colors.text }]}>@{item.username}</Text><Text style={[s.seller, { color: colors.textMuted }]}>by @{item.seller?.handle || "seller"} · {ago(item.created_at)}</Text>{item.description ? <Text style={[s.description, { color: colors.textMuted }]} numberOfLines={1}>{item.description}</Text> : null}</View><View style={s.priceBox}><Text style={[s.price, { color: colors.text }]}>{money(item.price)}</Text><Text style={[s.coin, { color: colors.textMuted }]}>ACoin</Text><Text style={[s.buyLabel, { color: item.seller_id === user?.id ? colors.textMuted : colors.accent }]}>{item.seller_id === user?.id ? "Your listing" : "Secure"}</Text></View>
        </Pressable>
      )} ListEmptyComponent={<View style={s.empty}><View style={[s.emptyIcon, { backgroundColor: colors.inputBg }]}><Text style={[s.handleAt, { color: colors.accent }]}>@</Text></View><Text style={[s.emptyTitle, { color: colors.text }]}>{tab === "yours" ? "Nothing listed yet" : search ? "No matching usernames" : "The market is quiet"}</Text><Text style={[s.emptyCopy, { color: colors.textMuted }]}>{tab === "yours" ? "List your current handle when you are ready to transfer it." : "Try another search or check back for new handles."}</Text></View>} />}
      <TransferSheet item={selected} visible={!!selected} onClose={() => setSelected(null)} onConfirm={() => void buy()} busy={buying} colors={colors} />
      <ListSheet visible={sellOpen} onClose={() => setSellOpen(false)} onListed={() => void load()} userId={user?.id} handle={profile?.handle} colors={colors} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 }, header: { paddingHorizontal: 18, paddingBottom: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 11 }, brandMark: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" }, brandAt: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" }, subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 }, sellButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, borderWidth: 1 }, sellText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  searchField: { marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 9 }, searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  notice: { margin: 16, marginBottom: 11, padding: 12, borderRadius: 10, flexDirection: "row", gap: 9, alignItems: "flex-start" }, noticeText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular" },
  tabs: { flexDirection: "row", paddingHorizontal: 16, borderBottomWidth: 1 }, tab: { paddingHorizontal: 4, marginRight: 24, paddingBottom: 11, borderBottomWidth: 2, borderBottomColor: "transparent", flexDirection: "row", alignItems: "center", gap: 6 }, tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" }, count: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" }, countText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  listing: { paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth }, handleIcon: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" }, handleAt: { fontSize: 22, fontFamily: "Inter_700Bold" }, listingBody: { flex: 1, gap: 2 }, handle: { fontSize: 16, fontFamily: "Inter_600SemiBold" }, seller: { fontSize: 12, fontFamily: "Inter_400Regular" }, description: { fontSize: 11, fontFamily: "Inter_400Regular" }, priceBox: { alignItems: "flex-end", gap: 1 }, price: { fontSize: 16, fontFamily: "Inter_700Bold" }, coin: { fontSize: 10, fontFamily: "Inter_400Regular" }, buyLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", marginTop: 3 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 9 }, emptyIcon: { width: 58, height: 58, borderRadius: 17, alignItems: "center", justifyContent: "center", marginBottom: 4 }, emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" }, emptyCopy: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular", textAlign: "center" },
  sheet: { width: "100%", paddingHorizontal: 20, paddingTop: 2, paddingBottom: 10, gap: 10 }, sheetIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 2 }, sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" }, sheetCopy: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 4 }, receipt: { borderWidth: 1, borderRadius: 12, padding: 13, gap: 11 }, receiptRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, receiptLabel: { fontSize: 13, fontFamily: "Inter_400Regular" }, receiptValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" }, trustLine: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 3 }, trustText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" }, primaryButton: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 3 }, primaryButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" }, cancelButton: { alignItems: "center", paddingVertical: 7 }, cancelText: { fontSize: 13, fontFamily: "Inter_500Medium" }, label: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 3 }, field: { minHeight: 48, borderRadius: 12, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9 }, prefix: { fontSize: 17, fontFamily: "Inter_700Bold" }, lockedHandle: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" }, input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" }, suffix: { fontSize: 12, fontFamily: "Inter_400Regular" },
});