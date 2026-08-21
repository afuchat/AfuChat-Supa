import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
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
  is_active: boolean; is_auction: boolean; auction_end_at: string | null;
  reserve_price: number | null; current_bid: number; current_bidder_id: string | null;
  created_at: string; views: number; seller_id: string; seller: Seller;
};
type Owned = { handle: string; owner_id: string };
type Tab = "featured" | "explore" | "owned";

const HANDLE_RE = /^[a-z0-9_]{1,30}$/;
const money = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
const when = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const h = Math.floor(ms / 3600000);
  return h > 48 ? `${Math.floor(h / 24)}d left` : h > 0 ? `${h}h left` : `${Math.max(1, Math.floor(ms / 60000))}m left`;
};

const countdown = (iso: string) => {
  const ms = Math.max(0, new Date(iso).getTime() - Date.now());
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return days > 0
    ? `${days}d ${String(hours).padStart(2, "0")}h`
    : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

function LiveCountdown({ endAt, colors, compact = false }: { endAt: string; colors: any; compact?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const ended = new Date(endAt).getTime() <= Date.now();
  return (
    <View style={[s.countdown, { backgroundColor: ended ? colors.errorSubtle : Colors.gold + "18" }, compact && s.countdownCompact]}>
      <Ionicons name="time-outline" size={compact ? 12 : 14} color={ended ? colors.error : Colors.gold} />
      <Text style={[s.countdownText, { color: ended ? colors.error : Colors.gold }, compact && s.countdownTextCompact]}>
        {ended ? "Ended" : countdown(endAt)}
      </Text>
    </View>
  );
}

function SheetButton({ children, onPress, colors, disabled = false }: any) {
  return <Pressable onPress={onPress} disabled={disabled} style={[s.primary, { backgroundColor: colors.accent, opacity: disabled ? 0.55 : 1 }]}>{disabled ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>{children}</Text>}</Pressable>;
}

function ListingSheet({ visible, onClose, onDone, userId, handle, colors }: {
  visible: boolean; onClose: () => void; onDone: () => void; userId?: string; handle?: string; colors: any;
}) {
   const [price, setPrice] = useState(""); const [auction, setAuction] = useState(false); const [duration, setDuration] = useState("168"); const [busy, setBusy] = useState(false);
   useEffect(() => { if (visible) { setPrice(""); setAuction(false); setDuration("168"); } }, [visible]);
  const submit = async () => {
    if (!userId) { showAlert("Sign in required", "Sign in before listing a handle."); return; }
    const username = (handle || "").replace(/^@/, "").trim().toLowerCase(); const value = Number.parseInt(price, 10);
    const hours = Number.parseInt(duration, 10);
    if (!HANDLE_RE.test(username)) { showAlert("Unavailable", "Only your current handle can be listed."); return; }
    if (!Number.isFinite(value) || value < 1) { showAlert("Set a price", "Enter at least 1 ACoin."); return; }
     if (auction && (!Number.isFinite(hours) || hours < 1 || hours > 168)) { showAlert("Invalid duration", "Auctions can run for up to 7 days."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("create_username_listing", { p_username: username, p_price: value, p_is_auction: auction, p_duration_hours: auction ? hours : null });
    setBusy(false);
    if (error) { showAlert("Could not list", error.message); return; }
    onClose(); onDone(); showAlert("Listing is live", auction ? `Bidding is open for @${username}.` : `@${username} is available for a fixed-price transfer.`);
  };
  return <SmartSheet visible={visible} onClose={onClose} peekFraction={0.78} backgroundColor={colors.surface}>
    <View style={s.sheet}>
      <Text style={[s.sheetTitle, { color: colors.text }]}>List a handle</Text>
      <Text style={[s.sheetCopy, { color: colors.textMuted }]}>Your identity stays protected. The handle moves only after a verified sale completes.</Text>
      <View style={[s.lockedField, { backgroundColor: colors.inputBg }]}><Text style={[s.at, { color: colors.accent }]}>@</Text><Text style={[s.lockedText, { color: colors.text }]}>{handle || "your handle"}</Text><Ionicons name="lock-closed" size={15} color={colors.textMuted} /></View>
      <View style={[s.modeRow, { borderColor: colors.border }]}>
        <Pressable onPress={() => setAuction(false)} style={[s.mode, !auction && { backgroundColor: colors.accent + "18" }]}><Ionicons name="flash" size={16} color={!auction ? colors.accent : colors.textMuted} /><Text style={[s.modeText, { color: !auction ? colors.accent : colors.textMuted }]}>Fixed price</Text></Pressable>
        <Pressable onPress={() => setAuction(true)} style={[s.mode, auction && { backgroundColor: Colors.gold + "18" }]}><Ionicons name="hammer-outline" size={16} color={auction ? Colors.gold : colors.textMuted} /><Text style={[s.modeText, { color: auction ? Colors.gold : colors.textMuted }]}>Auction</Text></Pressable>
      </View>
      <Text style={[s.label, { color: colors.textSecondary }]}>{auction ? "Starting bid" : "Price"}</Text>
      <View style={[s.lockedField, { backgroundColor: colors.inputBg }]}><Ionicons name="flash" size={17} color={Colors.gold} /><TextInput style={[s.input, { color: colors.text }]} value={price} onChangeText={setPrice} placeholder="Amount in ACoin" placeholderTextColor={colors.textMuted} keyboardType="number-pad" /><Text style={[s.suffix, { color: colors.textMuted }]}>ACoin</Text></View>
       {auction ? <><Text style={[s.label, { color: colors.textSecondary }]}>Auction duration · max 7 days</Text><View style={[s.lockedField, { backgroundColor: colors.inputBg }]}><Ionicons name="time-outline" size={17} color={Colors.gold} /><TextInput style={[s.input, { color: colors.text }]} value={duration} onChangeText={setDuration} keyboardType="number-pad" /><Text style={[s.suffix, { color: colors.textMuted }]}>hours</Text></View></> : null}
      <SheetButton onPress={submit} colors={colors} disabled={busy}>{auction ? "Open auction" : "Publish listing"}</SheetButton>
    </View>
  </SmartSheet>;
}

function ActionSheet({ item, visible, onClose, onDone, userId, colors }: {
  item: Listing | null; visible: boolean; onClose: () => void; onDone: () => void; userId?: string; colors: any;
}) {
  const [amount, setAmount] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) setAmount(""); }, [visible]);
  if (!item) return null;
  const auction = item.is_auction;
  const ended = auction && !!item.auction_end_at && new Date(item.auction_end_at).getTime() <= Date.now();
  const minimum = Math.max((item.current_bid || 0) + 1, item.reserve_price || 1);
  const act = async () => {
    if (!userId) { showAlert("Sign in required", "Sign in to continue."); return; }
    setBusy(true);
    if (auction) {
      if (ended) {
        const { error } = await supabase.rpc("settle_username_auction", { p_listing_id: item.id });
        setBusy(false);
        if (error) { showAlert("Auction could not close", error.message); return; }
        onClose(); onDone();
        showAlert(item.current_bidder_id === userId ? "Handle secured" : "Auction closed", item.current_bidder_id === userId ? `@${item.username} now routes to your profile.` : `The auction for @${item.username} has closed.`);
        return;
      }
      const value = Number.parseInt(amount, 10);
      if (!Number.isFinite(value) || value < minimum) { setBusy(false); showAlert("Bid is too low", `The minimum bid is ${minimum} ACoin.`); return; }
      const { error } = await supabase.rpc("place_username_bid", { p_listing_id: item.id, p_amount: value });
      setBusy(false); if (error) { showAlert("Bid not placed", error.message); return; }
      onClose(); onDone(); showAlert("Bid placed", `Your ${value} ACoin bid is held securely until you are outbid or the auction ends.`);
    } else {
      const { error } = await supabase.rpc("purchase_username", { p_listing_id: item.id });
      setBusy(false); if (error) { showAlert("Transfer not completed", error.message); onClose(); await onDone(); return; }
      onClose(); onDone(); showAlert("Handle secured", `@${item.username} now routes to your profile.`);
    }
  };
  return <SmartSheet visible={visible} onClose={onClose} peekFraction={0.7} backgroundColor={colors.surface}>
    <View style={s.sheet}>
      <View style={[s.sheetIcon, { backgroundColor: auction ? Colors.gold + "18" : colors.accent + "18" }]}><Ionicons name={auction ? "hammer-outline" : "swap-horizontal"} size={26} color={auction ? Colors.gold : colors.accent} /></View>
      <Text style={[s.sheetTitle, { color: colors.text }]}>{auction ? "Place a bid" : "Secure transfer"}</Text>
      <Text style={[s.sheetCopy, { color: colors.textMuted }]}>{auction ? (ended ? "The bidding period has ended. Close the auction to complete the protected transfer or return the held bid." : `Bidding closes ${item.auction_end_at ? when(item.auction_end_at) : "soon"}. Funds are held safely and returned if you are outbid.`) : "Payment, listing closure, and ownership update happen together."}</Text>
      <View style={[s.receipt, { borderColor: colors.border }]}><View style={s.receiptRow}><Text style={[s.receiptLabel, { color: colors.textMuted }]}>Handle</Text><Text style={[s.receiptValue, { color: colors.text }]}>@{item.username}</Text></View><View style={s.receiptRow}><Text style={[s.receiptLabel, { color: colors.textMuted }]}>{auction ? "Current bid" : "Total"}</Text><Text style={[s.receiptValue, { color: auction ? Colors.gold : colors.accent }]}>{money(auction ? item.current_bid || item.price : item.price)} ACoin</Text></View></View>
      {auction && !ended ? <View style={[s.lockedField, { backgroundColor: colors.inputBg }]}><Ionicons name="flash" size={17} color={Colors.gold} /><TextInput style={[s.input, { color: colors.text }]} value={amount} onChangeText={setAmount} placeholder={`Minimum ${minimum}`} placeholderTextColor={colors.textMuted} keyboardType="number-pad" /><Text style={[s.suffix, { color: colors.textMuted }]}>ACoin</Text></View> : null}
      <View style={s.trustLine}><Ionicons name="shield-checkmark" size={17} color={colors.success} /><Text style={[s.trustText, { color: colors.textSecondary }]}>{auction ? "Every bid is protected by escrow logic." : "The seller cannot keep the handle after a successful transfer."}</Text></View>
      <SheetButton onPress={act} colors={colors} disabled={busy}>{auction ? (ended ? "Close auction" : "Submit bid") : `Buy for ${money(item.price)} ACoin`}</SheetButton>
      <Pressable onPress={onClose} style={s.cancel}><Text style={[s.cancelText, { color: colors.textMuted }]}>Not now</Text></Pressable>
    </View>
  </SmartSheet>;
}

export default function AfuUsernamesApp() {
  const { colors } = useTheme(); const insets = useSafeAreaInsets(); const { user, profile } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]); const [owned, setOwned] = useState<Owned[]>([]);
  const [tab, setTab] = useState<Tab>("featured"); const [search, setSearch] = useState(""); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const [listOpen, setListOpen] = useState(false); const [selected, setSelected] = useState<Listing | null>(null);
   const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true); else setLoading(true);
     await supabase.rpc("expire_username_auctions");
    let query = supabase.from("username_listings").select("id,username,price,description,is_active,is_auction,auction_end_at,reserve_price,current_bid,current_bidder_id,created_at,views,seller_id,seller:seller_id(display_name,handle,avatar_url)").eq("is_active", true).order("views", { ascending: false }).limit(100);
    if (search.trim()) query = query.ilike("username", `%${search.trim().replace(/^@/, "")}%`);
    const [result, aliases] = await Promise.all([query, user ? supabase.from("owned_usernames").select("handle,owner_id").eq("owner_id", user.id).order("handle") : Promise.resolve({ data: [], error: null })]);
    if (!result.error) setListings((result.data || []) as unknown as Listing[]); if (!aliases.error) setOwned((aliases.data || []) as Owned[]);
    setLoading(false); setRefreshing(false);
  }, [search, user?.id]);
   useEffect(() => {
     const t = setTimeout(() => void load(), 250);
     return () => clearTimeout(t);
   }, [load]);
   useEffect(() => {
     const channel = supabase.channel("username-market-live")
       .on("postgres_changes", { event: "*", schema: "public", table: "username_listings" }, () => void load(true))
       .subscribe();
     return () => { void supabase.removeChannel(channel); };
   }, [load]);
   const featured = useMemo(() => listings.filter(x => x.is_auction && x.auction_end_at && new Date(x.auction_end_at).getTime() > Date.now()).slice(0, 8), [listings]);
  const visible = tab === "featured" ? featured : tab === "explore" ? listings : [];
  const renderOwned = () => <View style={s.ownedGrid}>{owned.length ? owned.map(x => <View key={x.handle} style={[s.ownedCard, { backgroundColor: colors.inputBg }]}><View style={[s.ownedIcon, { backgroundColor: colors.accent + "18" }]}><Text style={[s.ownedAt, { color: colors.accent }]}>@</Text></View><Text style={[s.ownedHandle, { color: colors.text }]} numberOfLines={1}>@{x.handle}</Text><Text style={[s.ownedCaption, { color: colors.textMuted }]}>Owned by you</Text></View>) : <View style={s.empty}><View style={[s.emptyIcon, { backgroundColor: colors.inputBg }]}><Ionicons name="bookmark-outline" size={27} color={colors.accent} /></View><Text style={[s.emptyTitle, { color: colors.text }]}>Nothing owned yet</Text><Text style={[s.emptyCopy, { color: colors.textMuted }]}>Handles you secure from the market will appear here.</Text></View>}</View>;
   const renderSeller = (item: Listing, large = false) => <View style={s.sellerRow}>
     <Image source={item.seller?.avatar_url ? { uri: item.seller.avatar_url } : undefined} style={[s.sellerAvatar, large && s.sellerAvatarLarge]} contentFit="cover" />
     <View style={s.sellerIdentity}><Text style={[s.sellerName, { color: colors.text }]} numberOfLines={1}>{item.seller?.display_name || "Verified seller"}</Text><Text style={[s.sellerHandle, { color: colors.textMuted }]} numberOfLines={1}>@{item.seller?.handle || "seller"}</Text></View>
     <Ionicons name="checkmark-circle" size={16} color={colors.success} />
   </View>;
   const renderFeatured = () => <View style={s.featuredWrap}>
     <View style={s.sectionHead}><View><Text style={[s.sectionEyebrow, { color: Colors.gold }]}>LIVE AUCTIONS</Text><Text style={[s.sectionTitle, { color: colors.text }]}>Rare names, right now</Text></View><Ionicons name="sparkles" size={18} color={Colors.gold} /></View>
     <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.featuredRail}>
       {featured.map(item => <Pressable key={item.id} onPress={() => setSelected(item)} style={({ pressed }) => [s.featuredCard, { backgroundColor: colors.inputBg, opacity: pressed ? 0.82 : 1 }]}>
         <View style={s.featuredTop}><View style={[s.featuredMark, { backgroundColor: Colors.gold + "18" }]}><Text style={[s.featuredAt, { color: Colors.gold }]}>@</Text></View><LiveCountdown endAt={item.auction_end_at!} colors={colors} compact /></View>
         <Text style={[s.featuredHandle, { color: colors.text }]} numberOfLines={1}>@{item.username}</Text>
         {renderSeller(item)}
         <View style={s.featuredBottom}><Text style={[s.featuredBidLabel, { color: colors.textMuted }]}>Current bid</Text><Text style={[s.featuredBid, { color: Colors.gold }]}>{money(item.current_bid || item.price)} <Text style={s.featuredCoin}>ACoin</Text></Text></View>
       </Pressable>)}
       {!featured.length && <View style={s.noAuctions}><Ionicons name="hammer-outline" size={19} color={colors.textMuted} /><Text style={[s.noAuctionsText, { color: colors.textMuted }]}>No live auctions</Text></View>}
     </ScrollView>
   </View>;
  return <View style={[s.root, { backgroundColor: colors.background }]}>
     <View style={[s.searchTop, { paddingTop: insets.top + 10 }]}>
       <View style={[s.search, { backgroundColor: colors.inputBg }]}><Ionicons name="search" size={17} color={colors.textMuted} /><TextInput testID="username-market-search" style={[s.searchInput, { color: colors.text }]} value={search} onChangeText={setSearch} placeholder="Search rare usernames" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} /><Ionicons name="shield-checkmark" size={16} color={colors.success} /></View>
       <Pressable testID="open-list-username" onPress={() => user ? setListOpen(true) : showAlert("Sign in required", "Sign in before listing a handle.")} style={s.addButton}><Ionicons name="add" size={22} color={colors.text} /></Pressable>
     </View>
     {tab === "featured" && !search ? renderFeatured() : null}
     <View style={[s.tabs, { borderBottomColor: colors.border }]}>{(["featured", "explore", "owned"] as Tab[]).map(x => <Pressable key={x} onPress={() => setTab(x)} style={[s.tab, tab === x && { borderBottomColor: colors.accent }]}><Text style={[s.tabText, { color: tab === x ? colors.accent : colors.textMuted }]}>{x === "featured" ? "Auctions" : x === "explore" ? "All names" : "Owned"}</Text>{x === "owned" && owned.length ? <View style={[s.count, { backgroundColor: colors.accent }]}><Text style={s.countText}>{owned.length}</Text></View> : null}</Pressable>)}</View>
     {loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 50 }} /> : tab === "owned" ? <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>{renderOwned()}</ScrollView> : <FlatList data={visible} keyExtractor={x => x.id} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.accent} />} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: tab === "featured" ? 4 : 10, paddingBottom: insets.bottom + 30, flexGrow: visible.length ? 0 : 1 }} ListHeaderComponent={tab === "featured" ? null : null} renderItem={({ item }) => <Pressable testID={`username-listing-${item.id}`} onPress={() => { if (item.seller_id === user?.id) return; void supabase.from("username_listings").update({ views: (item.views || 0) + 1 }).eq("id", item.id); setSelected(item); }} style={({ pressed }) => [s.row, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><View style={[s.handleIcon, { backgroundColor: item.is_auction ? Colors.gold + "18" : colors.accent + "16" }]}><Text style={[s.handleAt, { color: item.is_auction ? Colors.gold : colors.accent }]}>@</Text></View><View style={s.rowBody}><View style={s.handleLine}><Text style={[s.handle, { color: colors.text }]}>@{item.username}</Text>{item.is_auction ? <View style={[s.auctionTag, { backgroundColor: Colors.gold + "18" }]}><Text style={[s.auctionTagText, { color: Colors.gold }]}>AUCTION</Text></View> : null}</View>{renderSeller(item)}{item.is_auction && item.auction_end_at ? <LiveCountdown endAt={item.auction_end_at} colors={colors} /> : <Text style={[s.description, { color: colors.textMuted }]} numberOfLines={1}>{item.description || "Verified seller"}</Text>}</View><View style={s.priceBox}><Text style={[s.price, { color: item.is_auction ? Colors.gold : colors.text }]}>{money(item.is_auction ? item.current_bid || item.price : item.price)}</Text><Text style={[s.coin, { color: colors.textMuted }]}>{item.is_auction ? "ACoin bid" : "ACoin"}</Text><Text style={[s.buyLabel, { color: item.seller_id === user?.id ? colors.textMuted : item.is_auction ? Colors.gold : colors.accent }]}>{item.seller_id === user?.id ? "Your listing" : item.is_auction ? "Bid now" : "Secure"}</Text></View></Pressable>} ListEmptyComponent={<View style={s.empty}><View style={[s.emptyIcon, { backgroundColor: colors.inputBg }]}><Text style={[s.handleAt, { color: colors.accent }]}>@</Text></View><Text style={[s.emptyTitle, { color: colors.text }]}>{search ? "No matching handles" : "The market is quiet"}</Text><Text style={[s.emptyCopy, { color: colors.textMuted }]}>Try another search or check back soon.</Text></View>} />}
    <ActionSheet item={selected} visible={!!selected} onClose={() => setSelected(null)} onDone={() => void load()} userId={user?.id} colors={colors} />
    <ListingSheet visible={listOpen} onClose={() => setListOpen(false)} onDone={() => void load()} userId={user?.id} handle={profile?.handle} colors={colors} />
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1 }, searchTop: { paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 9 }, addButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" }, top: { paddingHorizontal: 18, paddingBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }, kicker: { fontSize: 10, letterSpacing: 1.5, fontFamily: "Inter_700Bold", marginBottom: 5 }, hero: { fontSize: 25, fontFamily: "Inter_700Bold", letterSpacing: -0.5 }, sub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 }, sell: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 }, sellText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  search: { marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 9 }, searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" }, tabs: { flexDirection: "row", paddingHorizontal: 16, borderBottomWidth: 1, marginTop: 13 }, tab: { paddingHorizontal: 4, marginRight: 24, paddingBottom: 11, borderBottomWidth: 2, borderBottomColor: "transparent", flexDirection: "row", alignItems: "center", gap: 6 }, tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" }, count: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" }, countText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  featuredWrap: { paddingTop: 9 }, sectionHead: { paddingHorizontal: 18, paddingBottom: 11, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, sectionEyebrow: { fontSize: 10, letterSpacing: 1.6, fontFamily: "Inter_700Bold" }, sectionTitle: { fontSize: 20, letterSpacing: -0.4, fontFamily: "Inter_700Bold", marginTop: 3 }, featuredRail: { paddingHorizontal: 16, gap: 12 }, featuredCard: { width: 238, minHeight: 198, borderRadius: 20, padding: 16, justifyContent: "space-between" }, featuredTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, featuredMark: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, featuredAt: { fontSize: 21, fontFamily: "Inter_700Bold" }, featuredHandle: { fontSize: 21, fontFamily: "Inter_700Bold", marginTop: 11 }, featuredBottom: { marginTop: 12 }, featuredBidLabel: { fontSize: 10, fontFamily: "Inter_500Medium" }, featuredBid: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 3 }, featuredCoin: { fontSize: 10, fontFamily: "Inter_500Medium" }, noAuctions: { width: 238, height: 198, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 8 }, noAuctionsText: { fontSize: 13, fontFamily: "Inter_500Medium" }, row: { paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 0.5 }, handleIcon: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" }, handleAt: { fontSize: 22, fontFamily: "Inter_700Bold" }, rowBody: { flex: 1, gap: 3 }, handleLine: { flexDirection: "row", alignItems: "center", gap: 6 }, handle: { fontSize: 16, fontFamily: "Inter_600SemiBold" }, auctionTag: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }, auctionTagText: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.4 }, sellerRow: { flexDirection: "row", alignItems: "center", gap: 7, minWidth: 0 }, sellerIdentity: { flex: 1, minWidth: 0 }, sellerAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(128,128,128,0.18)" }, sellerAvatarLarge: { width: 30, height: 30, borderRadius: 15 }, sellerName: { fontSize: 11, fontFamily: "Inter_600SemiBold" }, sellerHandle: { fontSize: 10, fontFamily: "Inter_400Regular" }, description: { fontSize: 11, fontFamily: "Inter_400Regular" }, countdown: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginTop: 2 }, countdownCompact: { alignSelf: "auto", marginTop: 0, paddingHorizontal: 7, paddingVertical: 5 }, countdownText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.2 }, countdownTextCompact: { fontSize: 10 }, priceBox: { alignItems: "flex-end", gap: 1 }, price: { fontSize: 16, fontFamily: "Inter_700Bold" }, coin: { fontSize: 10, fontFamily: "Inter_400Regular" }, buyLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", marginTop: 3 },
  ownedGrid: { padding: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 }, ownedCard: { width: "47%", minHeight: 116, borderRadius: 14, padding: 14, justifyContent: "space-between" }, ownedIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" }, ownedAt: { fontSize: 18, fontFamily: "Inter_700Bold" }, ownedHandle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 8 }, ownedCaption: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 }, empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 9 }, emptyIcon: { width: 58, height: 58, borderRadius: 17, alignItems: "center", justifyContent: "center", marginBottom: 4 }, emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" }, emptyCopy: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular", textAlign: "center" },
  sheet: { width: "100%", paddingHorizontal: 20, paddingTop: 2, paddingBottom: 10, gap: 10 }, sheetIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", alignSelf: "center" }, sheetTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" }, sheetCopy: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 3 }, lockedField: { minHeight: 48, borderRadius: 12, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9 }, at: { fontSize: 17, fontFamily: "Inter_700Bold" }, lockedText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" }, input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" }, suffix: { fontSize: 12, fontFamily: "Inter_400Regular" }, label: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 }, modeRow: { flexDirection: "row", borderWidth: 1, borderRadius: 12, padding: 3, gap: 3 }, mode: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 9 }, modeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" }, receipt: { borderWidth: 1, borderRadius: 12, padding: 13, gap: 11 }, receiptRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, receiptLabel: { fontSize: 13, fontFamily: "Inter_400Regular" }, receiptValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" }, trustLine: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 3 }, trustText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" }, primary: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 3 }, primaryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" }, cancel: { alignItems: "center", paddingVertical: 6 }, cancelText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});