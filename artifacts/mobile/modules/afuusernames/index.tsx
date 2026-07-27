import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SmartSheet } from "@/components/ui/SmartSheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";
import Colors from "@/constants/colors";

// ── Types ─────────────────────────────────────────────────────────────────────

type Seller = { display_name: string; handle: string; avatar_url?: string } | null;

type Listing = {
  id: string;
  username: string;
  price: number;
  description: string;
  is_active: boolean;
  is_auction: boolean;
  auction_end_at: string | null;
  reserve_price: number | null;
  current_bid: number;
  current_bidder_id: string | null;
  created_at: string;
  views: number;
  seller: Seller;
};

type FilterTab = "all" | "fixed" | "auction";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function auctionCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  const s  = Math.floor((ms % 60_000) / 1_000);
  if (h > 48) {
    const days = Math.floor(h / 24);
    return `${days}d left`;
  }
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m ${s}s left`;
}

function formatPrice(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Countdown hook ────────────────────────────────────────────────────────────

function useCountdown(iso: string | null): string {
  const [label, setLabel] = useState(iso ? auctionCountdown(iso) : "");
  useEffect(() => {
    if (!iso) return;
    setLabel(auctionCountdown(iso));
    const id = setInterval(() => setLabel(auctionCountdown(iso)), 1_000);
    return () => clearInterval(id);
  }, [iso]);
  return label;
}

// ── Auction card (with live countdown) ───────────────────────────────────────

function AuctionCard({
  item,
  colors,
  onPress,
}: {
  item: Listing;
  colors: any;
  onPress: () => void;
}) {
  const countdown = useCountdown(item.auction_end_at);
  const ended     = item.auction_end_at ? new Date(item.auction_end_at).getTime() <= Date.now() : true;

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: colors.surface, borderColor: "#FF9F0A40" }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {/* Auction badge */}
      <View style={[s.auctionBadge, { backgroundColor: ended ? "#8E8E9340" : "#FF9F0A22" }]}>
        <Ionicons name="hammer" size={11} color={ended ? colors.textMuted : "#FF9F0A"} />
        <Text style={[s.auctionBadgeText, { color: ended ? colors.textMuted : "#FF9F0A" }]}>
          {ended ? "ENDED" : countdown}
        </Text>
      </View>

      <View style={[s.usernameIcon, { backgroundColor: "#FF9F0A18" }]}>
        <Text style={[s.atSign, { color: "#FF9F0A" }]}>@</Text>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.username, { color: colors.text }]}>@{item.username}</Text>
        <Text style={[s.seller, { color: colors.textMuted }]}>
          by @{item.seller?.handle || "seller"} · {timeAgo(item.created_at)}
        </Text>
      </View>

      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text style={[s.priceLabel, { color: colors.textMuted }]}>
          {item.current_bid > 0 ? "Current bid" : "Reserve"}
        </Text>
        <Text style={[s.price, { color: "#FF9F0A" }]}>
          {formatPrice(item.current_bid > 0 ? item.current_bid : (item.reserve_price ?? item.price))}
        </Text>
        <Text style={[s.currency, { color: colors.textMuted }]}>ACoin</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Bid Sheet ────────────────────────────────────────────────────────────────

function BidSheet({
  listing,
  visible,
  onClose,
  userId,
  colors,
  isDark,
  onBidPlaced,
}: {
  listing: Listing | null;
  visible: boolean;
  onClose: () => void;
  userId: string | undefined;
  colors: any;
  isDark: boolean;
  onBidPlaced: (listingId: string, newBid: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!visible) setAmount(""); }, [visible]);

  async function placeBid() {
    if (!listing || !userId) return;
    const val = parseInt(amount, 10);
    const min = Math.max(
      (listing.reserve_price ?? 0) + 1,
      listing.current_bid > 0 ? listing.current_bid + 1 : 1,
    );
    if (isNaN(val) || val < min) {
      showAlert("Invalid Bid", `Minimum bid is ${min} ACoin.`);
      return;
    }
    if (listing.auction_end_at && new Date(listing.auction_end_at).getTime() <= Date.now()) {
      showAlert("Auction Ended", "This auction has already ended.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("username_bids").insert({
      listing_id: listing.id,
      bidder_id:  userId,
      amount:     val,
    });
    if (error) {
      showAlert("Error", error.message);
    } else {
      onBidPlaced(listing.id, val);
      onClose();
      showAlert("Bid Placed!", `Your bid of ${val} ACoin on @${listing.username} is live.`);
    }
    setSubmitting(false);
  }

  if (!listing) return null;

  const minBid = Math.max(
    (listing.reserve_price ?? 0) + 1,
    listing.current_bid > 0 ? listing.current_bid + 1 : 1,
  );

  return (
    <SmartSheet visible={visible} onClose={onClose} peekFraction={0.50} backgroundColor={colors.surface}>
      <View style={s.sheetContent}>
        <Text style={[s.sheetTitle, { color: colors.text }]}>Place a Bid</Text>
        <Text style={[s.sheetSub, { color: colors.textMuted }]}>
          @{listing.username} · min {minBid} ACoin
        </Text>

        <View style={[s.inputRow, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
          <Text style={[s.inputPrefix, { color: Colors.brand }]}>⚡</Text>
          <TextInput
            style={[s.sheetInput, { color: colors.text }]}
            placeholder={`Min ${minBid}`}
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <Text style={[s.inputSuffix, { color: colors.textMuted }]}>ACoin</Text>
        </View>

        <TouchableOpacity
          style={[s.sheetBtn, { backgroundColor: "#FF9F0A", opacity: submitting ? 0.65 : 1 }]}
          onPress={placeBid}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.sheetBtnText}>Place Bid</Text>
          }
        </TouchableOpacity>
      </View>
    </SmartSheet>
  );
}

// ── List Username Sheet ───────────────────────────────────────────────────────

function ListSheet({
  visible,
  onClose,
  userId,
  userHandle,
  colors,
  onListed,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string | undefined;
  userHandle: string | undefined;
  colors: any;
  onListed: () => void;
}) {
  const [username, setUsername] = useState("");
  const [price, setPrice]       = useState("");
  const [isAuction, setIsAuction] = useState(false);
  const [hoursLeft, setHoursLeft] = useState("24");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!visible) { setUsername(""); setPrice(""); setIsAuction(false); setHoursLeft("24"); } }, [visible]);

  async function submit() {
    if (!userId) { showAlert("Sign In Required", "Please sign in to list a username."); return; }
    const uname = username.trim().replace(/^@/, "").toLowerCase();
    if (!uname) { showAlert("Required", "Enter a username to list."); return; }
    if (!/^[a-z0-9_]{1,30}$/.test(uname)) { showAlert("Invalid", "Only letters, numbers, underscores (max 30)."); return; }
    const priceVal = parseInt(price, 10);
    if (isNaN(priceVal) || priceVal < 1) { showAlert("Invalid Price", "Enter a price ≥ 1 ACoin."); return; }

    setSubmitting(true);

    const row: Record<string, any> = {
      username:    uname,
      price:       priceVal,
      seller_id:   userId,
      is_active:   true,
      is_auction:  isAuction,
    };

    if (isAuction) {
      const hrs = parseInt(hoursLeft, 10) || 24;
      const endAt = new Date(Date.now() + hrs * 3_600_000).toISOString();
      row.auction_end_at  = endAt;
      row.reserve_price   = priceVal;
      row.current_bid     = 0;
    }

    const { error } = await supabase.from("username_listings").insert(row);
    if (error) {
      showAlert("Error", error.message || "Could not list username.");
    } else {
      onClose();
      onListed();
      showAlert("Listed!", `@${uname} is now live on the market.`);
    }
    setSubmitting(false);
  }

  return (
    <SmartSheet visible={visible} onClose={onClose} peekFraction={0.75} backgroundColor={colors.surface}>
      <View style={s.sheetContent}>
        <Text style={[s.sheetTitle, { color: colors.text }]}>List a Username</Text>
        <Text style={[s.sheetSub, { color: colors.textMuted }]}>
          Sell an @handle you own or that's unclaimed
        </Text>

        <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Username</Text>
        <View style={[s.inputRow, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
          <Text style={[s.inputPrefix, { color: Colors.brand }]}>@</Text>
          <TextInput
            style={[s.sheetInput, { color: colors.text }]}
            placeholder="username"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={t => setUsername(t.replace(/[^a-zA-Z0-9_]/g, ""))}
          />
        </View>

        <Text style={[s.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>
          {isAuction ? "Reserve Price (ACoin)" : "Price (ACoin)"}
        </Text>
        <View style={[s.inputRow, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
          <Text style={[s.inputPrefix, { color: Colors.brand }]}>⚡</Text>
          <TextInput
            style={[s.sheetInput, { color: colors.text }]}
            placeholder="e.g. 1000"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={price}
            onChangeText={setPrice}
          />
          <Text style={[s.inputSuffix, { color: colors.textMuted }]}>ACoin</Text>
        </View>

        <View style={[s.switchRow, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.switchLabel, { color: colors.text }]}>Auction mode</Text>
            <Text style={[s.switchSub, { color: colors.textMuted }]}>Bidders compete for the handle</Text>
          </View>
          <Switch
            value={isAuction}
            onValueChange={setIsAuction}
            trackColor={{ false: colors.border, true: "#FF9F0A66" }}
            thumbColor={isAuction ? "#FF9F0A" : colors.textMuted}
          />
        </View>

        {isAuction && (
          <>
            <Text style={[s.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>Auction Duration (hours)</Text>
            <View style={[s.inputRow, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <TextInput
                style={[s.sheetInput, { color: colors.text }]}
                placeholder="24"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={hoursLeft}
                onChangeText={setHoursLeft}
              />
              <Text style={[s.inputSuffix, { color: colors.textMuted }]}>hours</Text>
            </View>
          </>
        )}

        <TouchableOpacity
          style={[s.sheetBtn, { backgroundColor: Colors.brand, marginTop: 20, opacity: submitting ? 0.65 : 1 }]}
          onPress={submit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.sheetBtnText}>List Username</Text>
          }
        </TouchableOpacity>
      </View>
    </SmartSheet>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AfuUsernamesApp() {
  const { colors, isDark } = useTheme();
  const insets             = useSafeAreaInsets();
  const { user, profile }  = useAuth();

  const [listings,    setListings]    = useState<Listing[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [filter,      setFilter]      = useState<FilterTab>("all");
  const [bidTarget,   setBidTarget]   = useState<Listing | null>(null);
  const [showList,    setShowList]    = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("username_listings")
      .select("id,username,price,description,is_active,is_auction,auction_end_at,reserve_price,current_bid,current_bidder_id,created_at,views,seller:seller_id(display_name,handle,avatar_url)")
      .eq("is_active", true)
      .order("is_auction", { ascending: false })
      .order("created_at",  { ascending: false })
      .limit(60);

    if (search.trim()) query = query.ilike("username", `%${search.trim()}%`);
    if (filter === "fixed")   query = query.eq("is_auction", false);
    if (filter === "auction") query = query.eq("is_auction", true);

    const { data, error } = await query;
    if (!error) setListings((data as unknown as Listing[]) || []);
    setLoading(false);
  }, [search, filter]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [load]);

  // ── Derived stats ─────────────────────────────────────────────────────────

  const allListings    = listings;
  const auctionCount   = allListings.filter(l => l.is_auction).length;
  const fixedCount     = allListings.filter(l => !l.is_auction).length;

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleCardPress(item: Listing) {
    // Increment view count in background
    supabase.from("username_listings").update({ views: (item.views || 0) + 1 }).eq("id", item.id).then(() => {});

    if (item.is_auction) {
      if (!user) { showAlert("Sign In Required", "Sign in to place a bid."); return; }
      setBidTarget(item);
    } else {
      showAlert(
        `Buy @${item.username}`,
        `Price: ${formatPrice(item.price)} ACoin\nSeller: @${item.seller?.handle || "seller"}\n\nIn-app purchase coming soon!`,
      );
    }
  }

  function handleBidPlaced(listingId: string, newBid: number) {
    setListings(prev => prev.map(l =>
      l.id === listingId ? { ...l, current_bid: newBid, current_bidder_id: user?.id || null } : l,
    ));
  }

  // ── Render item ───────────────────────────────────────────────────────────

  function renderItem({ item }: { item: Listing }) {
    if (item.is_auction) {
      return <AuctionCard item={item} colors={colors} onPress={() => handleCardPress(item)} />;
    }

    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.82}
      >
        <View style={[s.usernameIcon, { backgroundColor: Colors.brand + "18" }]}>
          <Text style={[s.atSign, { color: Colors.brand }]}>@</Text>
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.username, { color: colors.text }]}>@{item.username}</Text>
          <Text style={[s.seller, { color: colors.textMuted }]}>
            by @{item.seller?.handle || "seller"} · {timeAgo(item.created_at)}
          </Text>
          {item.description ? (
            <Text style={[s.desc, { color: colors.textMuted }]} numberOfLines={1}>{item.description}</Text>
          ) : null}
        </View>

        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <View style={[s.buyBadge, { backgroundColor: Colors.brand + "18" }]}>
            <Text style={[s.buyBadgeText, { color: Colors.brand }]}>BUY NOW</Text>
          </View>
          <Text style={[s.price, { color: Colors.brand }]}>{formatPrice(item.price)}</Text>
          <Text style={[s.currency, { color: colors.textMuted }]}>ACoin</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // ── Header ────────────────────────────────────────────────────────────────

  const ListHeader = (
    <>
      {/* Stats row */}
      <View style={[s.statsRow, { borderBottomColor: colors.border }]}>
        <View style={s.statItem}>
          <Text style={[s.statNum, { color: colors.text }]}>{allListings.length}</Text>
          <Text style={[s.statLabel, { color: colors.textMuted }]}>Listings</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: colors.border }]} />
        <View style={s.statItem}>
          <Text style={[s.statNum, { color: "#FF9F0A" }]}>{auctionCount}</Text>
          <Text style={[s.statLabel, { color: colors.textMuted }]}>Auctions</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: colors.border }]} />
        <View style={s.statItem}>
          <Text style={[s.statNum, { color: Colors.brand }]}>{fixedCount}</Text>
          <Text style={[s.statLabel, { color: colors.textMuted }]}>Fixed Price</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={[s.filterRow, { borderBottomColor: colors.border }]}>
        {(["all", "fixed", "auction"] as FilterTab[]).map(tab => {
          const active = filter === tab;
          const label  = tab === "all" ? "All" : tab === "fixed" ? "Fixed Price" : "Auction";
          const accent = tab === "auction" ? "#FF9F0A" : Colors.brand;
          return (
            <TouchableOpacity
              key={tab}
              style={[s.filterTab, active && { borderBottomWidth: 2, borderBottomColor: accent }]}
              onPress={() => setFilter(tab)}
            >
              <Text style={[s.filterTabText, { color: active ? accent : colors.textMuted }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* Top bar */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: colors.text }]}>Username Market</Text>
          <Text style={[s.headerSub, { color: colors.textMuted }]}>Buy & sell premium @handles</Text>
        </View>
        <TouchableOpacity
          style={[s.listBtn, { backgroundColor: Colors.brand }]}
          onPress={() => {
            if (!user) { showAlert("Sign In Required", "Sign in to list a username."); return; }
            setShowList(true);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.listBtnText}>List</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={[s.searchWrap, { borderBottomColor: colors.border }]}>
        <View style={[s.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search" size={15} color={colors.textMuted} />
          <TextInput
            style={[s.searchInput, { color: colors.text }]}
            placeholder="Search usernames…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator color={Colors.brand} style={{ marginTop: 48 }} />
      ) : listings.length === 0 ? (
        <>
          {ListHeader}
          <View style={s.empty}>
            <Text style={{ fontSize: 44 }}>@</Text>
            <Text style={[s.emptyTitle, { color: colors.text }]}>
              {search ? `No results for "${search}"` : "No listings yet"}
            </Text>
            <Text style={[s.emptySub, { color: colors.textMuted }]}>
              {search ? "Try a different keyword." : "Be the first to list a premium username."}
            </Text>
          </View>
        </>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={l => l.id}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 32, gap: 10 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bid Sheet */}
      <BidSheet
        listing={bidTarget}
        visible={!!bidTarget}
        onClose={() => setBidTarget(null)}
        userId={user?.id}
        colors={colors}
        isDark={isDark}
        onBidPlaced={handleBidPlaced}
      />

      {/* List Sheet */}
      <ListSheet
        visible={showList}
        onClose={() => setShowList(false)}
        userId={user?.id}
        userHandle={profile?.handle}
        colors={colors}
        onListed={load}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  headerTitle:   { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub:     { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  listBtn:       { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  listBtnText:   { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },

  searchWrap:    { paddingHorizontal: 14, paddingVertical: 10 },
  searchBar:     { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput:   { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },

  statsRow:      { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 4, marginTop: 6 },
  statItem:      { flex: 1, alignItems: "center", gap: 2 },
  statNum:       { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel:     { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider:   { width: 0.5, height: 32 },

  filterRow:     { flexDirection: "row", marginBottom: 4 },
  filterTab:     { flex: 1, alignItems: "center", paddingVertical: 10 },
  filterTabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  card:          { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  usernameIcon:  { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  atSign:        { fontSize: 22, fontFamily: "Inter_700Bold" },
  username:      { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  seller:        { fontSize: 12, fontFamily: "Inter_400Regular" },
  desc:          { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  priceLabel:    { fontSize: 10, fontFamily: "Inter_400Regular" },
  price:         { fontSize: 16, fontFamily: "Inter_700Bold" },
  currency:      { fontSize: 11, fontFamily: "Inter_400Regular" },
  buyBadge:      { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginBottom: 2 },
  buyBadgeText:  { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  auctionBadge:  { position: "absolute", top: 8, right: 10, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  auctionBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  empty:         { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyTitle:    { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub:      { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  // sheetContent: inner padding for SmartSheet bodies (SmartSheet owns position/bg/handle)
  sheetContent:  { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, alignItems: "center", gap: 6, width: "100%" },
  sheetTitle:    { fontSize: 18, fontFamily: "Inter_700Bold" },
  sheetSub:      { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 12, textAlign: "center" },
  fieldLabel:    { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 6, alignSelf: "flex-start" },
  inputRow:      { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, width: "100%" },
  inputPrefix:   { fontSize: 16, fontFamily: "Inter_700Bold" },
  sheetInput:    { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  inputSuffix:   { fontSize: 13, fontFamily: "Inter_400Regular" },
  switchRow:     { flexDirection: "row", alignItems: "center", borderWidth: 0.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, width: "100%", marginTop: 14 },
  switchLabel:   { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  switchSub:     { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  sheetBtn:      { width: "100%", paddingVertical: 15, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sheetBtnText:  { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
