import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { addToHistory, clearHistory, getSearchHistory } from "@/lib/searchStore";
import { useSuperApp } from "@/lib/superapp/SuperAppContext";

// ─── Types ────────────────────────────────────────────────────────────────────
type SearchTab = "all" | "people" | "posts" | "videos" | "channels" | "groups" | "events" | "jobs" | "gifts" | "market";
type PersonResult  = { id:string; handle:string; display_name:string; avatar_url:string|null; bio:string|null; is_verified:boolean; current_grade:string; xp?:number; kind:"profile" };
type PostResult    = { id:string; content:string; author_handle:string; author_name:string; author_avatar:string|null; view_count:number; created_at:string };
type VideoResult   = { id:string; content:string; video_url:string; image_url:string|null; author_handle:string; author_name:string; author_avatar:string|null; view_count:number; created_at:string };
type ChannelResult = { id:string; name:string; description:string|null; avatar_url:string|null; subscriber_count:number; owner_handle:string|null };
type GroupResult   = { id:string; name:string; description:string|null; avatar_url:string|null; member_count:number };
type EventResult   = { id:string; title:string; emoji:string; price:number; event_date:string; category:string|null; creator_handle:string };
type GiftResult    = { id:string; name:string; emoji:string; base_xp_cost:number; rarity:string; description:string|null };
type MarketResult  = { id:string; kind:"product"|"freelance"|"community"; title:string; emoji:string|null; price:number; badge:string; route:string };
type JobResult     = { id:string; title:string; job_type:string|null; location:string|null; apply_url:string|null; company_name:string; company_logo:string|null };

type AllResults = {
  people: PersonResult[];
  posts: PostResult[];
  videos: VideoResult[];
  channels: ChannelResult[];
  groups: GroupResult[];
  events: EventResult[];
  gifts: GiftResult[];
  market: MarketResult[];
  jobs: JobResult[];
};

const EMPTY: AllResults = { people:[], posts:[], videos:[], channels:[], groups:[], events:[], gifts:[], market:[], jobs:[] };

// ─── Constants ────────────────────────────────────────────────────────────────
const TABS: { id: SearchTab; label: string; icon: string }[] = [
  { id: "all",      label: "All",      icon: "apps" },
  { id: "people",   label: "People",   icon: "people" },
  { id: "posts",    label: "Posts",    icon: "document-text" },
  { id: "videos",   label: "Videos",   icon: "play-circle" },
  { id: "channels", label: "Channels", icon: "megaphone" },
  { id: "groups",   label: "Groups",   icon: "people-circle" },
  { id: "events",   label: "Events",   icon: "calendar" },
  { id: "jobs",     label: "Jobs",     icon: "briefcase" },
  { id: "gifts",    label: "Gifts",    icon: "gift" },
  { id: "market",   label: "Market",   icon: "storefront" },
];

const RARITY_COLORS: Record<string, string> = {
  common: "#9E9E9E", uncommon: "#1018D8", rare: "#2979FF",
  epic: "#CE93D8", legendary: "#FFB74D",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ─── Small components ─────────────────────────────────────────────────────────
function AvatarFallback({ name, size, color }: { name: string; size: number; color: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: color + "22" }}>
      <Text style={{ color, fontSize: size * 0.4, fontFamily: "Inter_700Bold" }}>{(name || "?")[0].toUpperCase()}</Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AfuSearchApp() {
  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { navigateOutside } = useSuperApp();

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AllResults>(EMPTY);
  const [hasSearched, setHasSearched] = useState(false);

  const [history, setHistory] = useState<string[]>([]);
  const [trendingPeople, setTrendingPeople] = useState<PersonResult[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<{ tag: string; count: number }[]>([]);

  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchIdRef = useRef(0);
  const tabBarRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadInitial();
    setTimeout(() => inputRef.current?.focus(), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  async function loadInitial() {
    getSearchHistory().then(setHistory).catch(() => {});
    loadTrendingPeople();
    loadTrendingHashtags();
  }

  async function loadTrendingPeople() {
    try {
      const { data } = await supabase.from("profiles")
        .select("id,handle,display_name,avatar_url,bio,is_verified,current_grade,xp")
        .eq("is_verified", true).order("xp", { ascending: false }).limit(10);
      if (data) setTrendingPeople(data.map((p: any) => ({ ...p, kind: "profile" as const })));
    } catch {}
  }

  async function loadTrendingHashtags() {
    try {
      const { data } = await supabase.from("posts")
        .select("content,view_count").ilike("content", "%#%")
        .eq("visibility", "public").order("created_at", { ascending: false }).limit(300);
      if (!data) return;
      const RE = /#(\w{2,30})/g;
      const scores: Record<string, number> = {};
      for (const p of data) {
        if (!p.content) continue;
        RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = RE.exec(p.content))) {
          const t = m[1].toLowerCase();
          scores[t] = (scores[t] || 0) + 1 + Math.log1p(p.view_count || 0) * 0.1;
        }
      }
      setTrendingHashtags(
        Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 18)
          .map(([tag, count]) => ({ tag, count: Math.max(1, Math.round(count)) }))
      );
    } catch {}
  }

  const performSearch = useCallback(async (q: string, currentTab: SearchTab) => {
    const trimmed = q.trim();
    if (trimmed.length < 1) { setResults(EMPTY); setHasSearched(false); return; }

    const id = ++searchIdRef.current;
    setLoading(true); setHasSearched(true);
    const pat = `%${trimmed}%`;
    const all = currentTab === "all";

    try {
      const [peopleRes, postsRes, videosRes, channelsRes, groupsRes, eventsRes, giftsRes, jobsRes] = await Promise.all([
        (all || currentTab === "people")
          ? supabase.from("profiles").select("id,handle,display_name,avatar_url,bio,is_verified,current_grade,xp")
              .or(`handle.ilike.${pat},display_name.ilike.${pat},bio.ilike.${pat}`)
              .or("hide_from_search.is.null,hide_from_search.eq.false")
              .order("xp", { ascending: false }).limit(all ? 5 : 20)
          : Promise.resolve({ data: [] }),

        (all || currentTab === "posts")
          ? supabase.from("posts").select("id,content,image_url,author_id,view_count,created_at,post_type")
              .ilike("content", pat).eq("visibility", "public").neq("post_type", "video")
              .order("created_at", { ascending: false }).limit(all ? 5 : 25)
          : Promise.resolve({ data: [] }),

        (all || currentTab === "videos")
          ? supabase.from("posts").select("id,content,video_url,image_url,author_id,view_count,created_at")
              .eq("post_type", "video").eq("visibility", "public").not("video_url", "is", null)
              .ilike("content", pat).order("view_count", { ascending: false }).limit(all ? 4 : 20)
          : Promise.resolve({ data: [] }),

        (all || currentTab === "channels")
          ? supabase.from("channels").select("id,name,description,avatar_url,subscriber_count,owner_id,profiles!channels_owner_id_fkey(handle)")
              .or(`name.ilike.${pat},description.ilike.${pat}`).order("subscriber_count", { ascending: false }).limit(all ? 4 : 20)
          : Promise.resolve({ data: [] }),

        (all || currentTab === "groups")
          ? supabase.from("chats").select("id,name,description,avatar_url,member_count")
              .eq("is_group", true).eq("is_channel", false).eq("is_public", true)
              .or(`name.ilike.${pat},description.ilike.${pat}`)
              .order("member_count", { ascending: false }).limit(all ? 4 : 20)
          : Promise.resolve({ data: [] }),

        (all || currentTab === "events")
          ? supabase.from("digital_events").select("id,title,emoji,price,event_date,category,creator_id,profiles!digital_events_creator_id_fkey(handle)")
              .or(`title.ilike.${pat},description.ilike.${pat}`).gte("event_date", new Date().toISOString())
              .order("event_date", { ascending: true }).limit(all ? 3 : 15)
          : Promise.resolve({ data: [] }),

        (all || currentTab === "gifts")
          ? supabase.from("gifts").select("id,name,emoji,base_xp_cost,rarity,description")
              .or(`name.ilike.${pat},description.ilike.${pat}`)
              .order("base_xp_cost", { ascending: true }).limit(all ? 6 : 25)
          : Promise.resolve({ data: [] }),

        (all || currentTab === "jobs")
          ? supabase.from("org_page_jobs").select("id,title,job_type,location,apply_url,organization_pages!org_page_jobs_page_id_fkey(name,logo_url)")
              .eq("is_active", true).or(`title.ilike.${pat},description.ilike.${pat}`)
              .order("created_at", { ascending: false }).limit(all ? 4 : 20)
          : Promise.resolve({ data: [] }),
      ]);

      if (id !== searchIdRef.current) return;

      // Resolve post/video author profiles
      const authorIds = [
        ...((postsRes.data || []) as any[]).map((p: any) => p.author_id),
        ...((videosRes.data || []) as any[]).map((v: any) => v.author_id),
      ];
      const profilesMap = new Map<string, any>();
      if (authorIds.length > 0) {
        const uids = [...new Set(authorIds)] as string[];
        const { data: ps } = await supabase.from("profiles").select("id,display_name,handle,avatar_url").in("id", uids);
        if (ps) ps.forEach((p: any) => profilesMap.set(p.id, p));
      }

      // Market results
      let marketItems: MarketResult[] = [];
      if (all || currentTab === "market") {
        const [prods, frees, comms] = await Promise.all([
          supabase.from("shop_products").select("id,name,price_acoin").ilike("name", pat).eq("is_available", true).limit(all ? 3 : 12),
          supabase.from("freelance_listings").select("id,title,price,emoji").or(`title.ilike.${pat}`).eq("is_active", true).limit(all ? 3 : 12),
          supabase.from("paid_communities").select("id,name,price,emoji").or(`name.ilike.${pat}`).limit(all ? 2 : 10),
        ]);
        if (prods.data) marketItems.push(...(prods.data as any[]).map((p: any) => ({ id: p.id, kind: "product" as const, title: p.name, emoji: "📦", price: p.price_acoin || 0, badge: "Shop", route: `/shop/product/${p.id}` })));
        if (frees.data) marketItems.push(...(frees.data as any[]).map((p: any) => ({ id: p.id, kind: "freelance" as const, title: p.title, emoji: p.emoji || "💼", price: p.price || 0, badge: "Freelance", route: "/freelance" })));
        if (comms.data) marketItems.push(...(comms.data as any[]).map((p: any) => ({ id: p.id, kind: "community" as const, title: p.name, emoji: p.emoji || "🏠", price: p.price || 0, badge: "Community", route: "/paid-communities" })));
      }

      const people: PersonResult[] = ((peopleRes.data || []) as any[]).map((p: any) => ({ ...p, kind: "profile" as const }));
      const posts: PostResult[] = ((postsRes.data || []) as any[]).map((p: any) => {
        const a = profilesMap.get(p.author_id) || {};
        return { id: p.id, content: p.content || "", author_handle: a.handle || "", author_name: a.display_name || "", author_avatar: a.avatar_url || null, view_count: p.view_count || 0, created_at: p.created_at };
      });
      const videos: VideoResult[] = ((videosRes.data || []) as any[]).map((v: any) => {
        const a = profilesMap.get(v.author_id) || {};
        return { id: v.id, content: v.content || "", video_url: v.video_url, image_url: v.image_url || null, author_handle: a.handle || "", author_name: a.display_name || "", author_avatar: a.avatar_url || null, view_count: v.view_count || 0, created_at: v.created_at };
      });
      const channels: ChannelResult[] = ((channelsRes.data || []) as any[]).map((ch: any) => ({
        id: ch.id, name: ch.name, description: ch.description || null, avatar_url: ch.avatar_url || null,
        subscriber_count: ch.subscriber_count || 0, owner_handle: (ch.profiles as any)?.handle || null,
      }));
      const groups: GroupResult[] = ((groupsRes.data || []) as any[]).map((g: any) => ({
        id: g.id, name: g.name, description: g.description || null,
        avatar_url: g.avatar_url || null, member_count: g.member_count || 0,
      }));
      const events: EventResult[] = ((eventsRes.data || []) as any[]).map((e: any) => ({
        id: e.id, title: e.title, emoji: e.emoji || "🎟️", price: e.price || 0,
        event_date: e.event_date, category: e.category || null, creator_handle: (e.profiles as any)?.handle || "",
      }));
      const gifts: GiftResult[] = (giftsRes.data || []) as any[];
      const jobs: JobResult[] = ((jobsRes.data || []) as any[]).map((j: any) => {
        const op = (j.organization_pages as any) || {};
        return { id: j.id, title: j.title, job_type: j.job_type || null, location: j.location || null, apply_url: j.apply_url || null, company_name: op.name || "Company", company_logo: op.logo_url || null };
      });

      if (id !== searchIdRef.current) return;
      setResults({ people, posts, videos, channels, groups, events, gifts, market: marketItems, jobs });
      if (trimmed.length > 0) addToHistory(trimmed).then(setHistory).catch(() => {});
    } catch {}
    if (id === searchIdRef.current) setLoading(false);
  }, []);

  function onChangeText(t: string) {
    setQuery(t);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (t.trim().length === 0) { setResults(EMPTY); setHasSearched(false); return; }
    debounceRef.current = setTimeout(() => performSearch(t, tab), 480);
  }

  function onSubmit() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    performSearch(query, tab);
    inputRef.current?.blur();
  }

  function selectTab(t: SearchTab) {
    setTab(t);
    if (query.trim().length > 0) performSearch(query, t);
  }

  function tapHistory(q: string) {
    setQuery(q);
    performSearch(q, tab);
  }

  // ── Result counts ──────────────────────────────────────────────────────────
  const totalCount = results.people.length + results.posts.length + results.videos.length +
    results.channels.length + results.groups.length + results.events.length + results.gifts.length + results.market.length + results.jobs.length;

  const currentList = (() => {
    switch (tab) {
      case "people":   return results.people;
      case "posts":    return results.posts;
      case "videos":   return results.videos;
      case "channels": return results.channels;
      case "groups":   return results.groups;
      case "events":   return results.events;
      case "jobs":     return results.jobs;
      case "gifts":    return results.gifts;
      case "market":   return results.market;
      default: return [
        ...results.people, ...results.posts, ...results.videos,
        ...results.channels, ...results.groups, ...results.events, ...results.jobs,
        ...results.gifts, ...results.market,
      ];
    }
  })() as any[];

  // ── Renderers ──────────────────────────────────────────────────────────────
  function renderPerson(item: PersonResult) {
    return (
      <TouchableOpacity key={item.id} style={[s.row, { borderBottomColor: colors.border }]}
        onPress={() => navigateOutside("/contact/[id]", { id: item.id })}>
        {item.avatar_url
          ? <Image source={{ uri: item.avatar_url }} style={s.avatar} />
          : <AvatarFallback name={item.display_name} size={44} color={accent} />}
        <View style={s.rowBody}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>{item.display_name}</Text>
            {item.is_verified && <Ionicons name="checkmark-circle" size={14} color={accent} />}
          </View>
          <Text style={[s.handle, { color: colors.textMuted }]}>@{item.handle}</Text>
          {item.bio ? <Text style={[s.bio, { color: colors.textSecondary }]} numberOfLines={1}>{item.bio}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  function renderPost(item: PostResult) {
    return (
      <View key={item.id} style={[s.row, { borderBottomColor: colors.border, flexDirection: "column", alignItems: "flex-start", gap: 6 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {item.author_avatar
            ? <Image source={{ uri: item.author_avatar }} style={[s.avatar, { width: 28, height: 28, borderRadius: 14 }]} />
            : <AvatarFallback name={item.author_name} size={28} color={accent} />}
          <Text style={[s.handle, { color: colors.textMuted }]}>@{item.author_handle}</Text>
          <Text style={[s.bio, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
        </View>
        <Text style={[s.bio, { color: colors.text, fontSize: 14, lineHeight: 20 }]} numberOfLines={3}>{item.content}</Text>
        {item.view_count > 0 && <Text style={[s.bio, { color: colors.textMuted }]}>{fmtNum(item.view_count)} views</Text>}
      </View>
    );
  }

  function renderVideo(item: VideoResult) {
    return (
      <TouchableOpacity key={item.id} style={[s.row, { borderBottomColor: colors.border }]}
        onPress={() => navigateOutside("/video/[id]", { id: item.id })}>
        <View style={[s.videoCover, { backgroundColor: "#00000022" }]}>
          {item.image_url
            ? <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : null}
          <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="play-circle" size={28} color="rgba(255,255,255,0.9)" />
          </View>
        </View>
        <View style={s.rowBody}>
          <Text style={[s.name, { color: colors.text }]} numberOfLines={2}>{item.content || "Video"}</Text>
          <Text style={[s.handle, { color: colors.textMuted }]}>@{item.author_handle}</Text>
          <Text style={[s.bio, { color: colors.textMuted }]}>{fmtNum(item.view_count)} views · {timeAgo(item.created_at)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  function renderChannel(item: ChannelResult) {
    return (
      <TouchableOpacity key={item.id} style={[s.row, { borderBottomColor: colors.border }]}
        onPress={() => navigateOutside("/channel/[id]", { id: item.id })}>
        {item.avatar_url
          ? <Image source={{ uri: item.avatar_url }} style={[s.avatar, { borderRadius: 10 }]} />
          : <AvatarFallback name={item.name} size={44} color="#8B5CF6" />}
        <View style={s.rowBody}>
          <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[s.handle, { color: colors.textMuted }]}>{fmtNum(item.subscriber_count)} subscribers</Text>
          {item.description ? <Text style={[s.bio, { color: colors.textSecondary }]} numberOfLines={1}>{item.description}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  function renderGroup(item: GroupResult) {
    return (
      <TouchableOpacity key={item.id} style={[s.row, { borderBottomColor: colors.border }]}
        onPress={() => navigateOutside("/group/[id]", { id: item.id })}>
        {item.avatar_url
          ? <Image source={{ uri: item.avatar_url }} style={[s.avatar, { borderRadius: 22 }]} />
          : <AvatarFallback name={item.name} size={44} color="#22C55E" />}
        <View style={s.rowBody}>
          <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[s.handle, { color: colors.textMuted }]}>
            {item.member_count > 0 ? `${fmtNum(item.member_count)} members` : "Public Group"}
          </Text>
          {item.description ? <Text style={[s.bio, { color: colors.textSecondary }]} numberOfLines={1}>{item.description}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  function renderEvent(item: EventResult) {
    const dt = new Date(item.event_date);
    const dateStr = dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return (
      <TouchableOpacity key={item.id} style={[s.row, { borderBottomColor: colors.border }]}
        onPress={() => navigateOutside("/digital-events")}>
        <View style={[s.emojiBox, { backgroundColor: "#FF950022" }]}>
          <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
        </View>
        <View style={s.rowBody}>
          <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[s.handle, { color: colors.textMuted }]}>{dateStr} · @{item.creator_handle}</Text>
          {item.price > 0
            ? <Text style={[s.bio, { color: accent }]}>{item.price} ACoin</Text>
            : <Text style={[s.bio, { color: "#22C55E" }]}>Free</Text>}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  function renderGift(item: GiftResult) {
    const rc = RARITY_COLORS[item.rarity] || "#9E9E9E";
    return (
      <View key={item.id} style={[s.row, { borderBottomColor: colors.border }]}>
        <View style={[s.emojiBox, { backgroundColor: rc + "22" }]}>
          <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
        </View>
        <View style={s.rowBody}>
          <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[s.rarityChip, { backgroundColor: rc + "22" }]}>
              <Text style={{ fontSize: 10, color: rc, fontFamily: "Inter_600SemiBold" }}>{item.rarity.toUpperCase()}</Text>
            </View>
            <Text style={[s.handle, { color: colors.textMuted }]}>{item.base_xp_cost} Nexa</Text>
          </View>
        </View>
      </View>
    );
  }

  function renderMarket(item: MarketResult) {
    return (
      <TouchableOpacity key={item.id} style={[s.row, { borderBottomColor: colors.border }]}
        onPress={() => navigateOutside(item.route)}>
        <View style={[s.emojiBox, { backgroundColor: accent + "22" }]}>
          <Text style={{ fontSize: 22 }}>{item.emoji || "📦"}</Text>
        </View>
        <View style={s.rowBody}>
          <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[s.rarityChip, { backgroundColor: accent + "22" }]}>
              <Text style={{ fontSize: 10, color: accent, fontFamily: "Inter_600SemiBold" }}>{item.badge}</Text>
            </View>
            <Text style={[s.handle, { color: colors.textMuted }]}>{item.price} ACoin</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  function renderJob(item: JobResult) {
    return (
      <TouchableOpacity key={item.id} style={[s.row, { borderBottomColor: colors.border }]}
        onPress={() => item.apply_url ? Linking.openURL(item.apply_url) : null}>
        {item.company_logo
          ? <Image source={{ uri: item.company_logo }} style={[s.avatar, { borderRadius: 10 }]} />
          : <AvatarFallback name={item.company_name} size={44} color="#22C55E" />}
        <View style={s.rowBody}>
          <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[s.handle, { color: colors.textMuted }]}>{item.company_name}</Text>
          {(item.job_type || item.location) && (
            <Text style={[s.bio, { color: colors.textMuted }]}>
              {[item.job_type, item.location].filter(Boolean).join(" · ")}
            </Text>
          )}
        </View>
        <Ionicons name="open-outline" size={14} color={colors.textMuted} />
      </TouchableOpacity>
    );
  }

  function renderItem({ item }: { item: any }) {
    if ("kind" in item && item.kind === "profile") return renderPerson(item);
    if ("video_url" in item) return renderVideo(item);
    if ("author_handle" in item) return renderPost(item);
    if ("subscriber_count" in item) return renderChannel(item);
    if ("member_count" in item) return renderGroup(item);
    if ("event_date" in item) return renderEvent(item);
    if ("base_xp_cost" in item) return renderGift(item);
    if ("badge" in item) return renderMarket(item);
    if ("company_name" in item) return renderJob(item);
    return null;
  }

  const showTrending = !hasSearched && query.length === 0;
  const showEmpty = hasSearched && !loading && totalCount === 0;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Search bar */}
      <View style={[s.searchBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[s.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border, ...Platform.select({ web: { boxShadow: "0 2px 14px rgba(0,0,0,0.13)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.13, shadowRadius: 8, elevation: 4 } }) }]}>
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={[s.input, { color: colors.text }]}
            placeholder="Search people, posts, videos…"
            placeholderTextColor={colors.textMuted}
            value={query} onChangeText={onChangeText}
            returnKeyType="search" onSubmitEditing={onSubmit}
            autoCorrect={false} autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(""); setResults(EMPTY); setHasSearched(false); }} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Tab bar */}
      <ScrollView ref={tabBarRef} horizontal showsHorizontalScrollIndicator={false}
        style={[s.tabBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: 8 }}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} onPress={() => selectTab(t.id)}
            style={[s.tabBtn, tab === t.id && { borderBottomColor: accent, borderBottomWidth: 2 }]}>
            <Ionicons name={t.icon as any} size={14} color={tab === t.id ? accent : colors.textMuted} />
            <Text style={[s.tabLabel, { color: tab === t.id ? accent : colors.textMuted }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={accent} size="large" />
        </View>
      ) : showTrending ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          {/* History */}
          {history.length > 0 && (
            <View style={s.section}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 10 }}>
                <Text style={[s.sectionTitle, { color: colors.text }]}>Recent Searches</Text>
                <Pressable onPress={() => clearHistory().then(() => setHistory([])).catch(() => {})} hitSlop={8}>
                  <Text style={{ color: accent, fontSize: 13, fontFamily: "Inter_500Medium" }}>Clear</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                {history.slice(0, 10).map((h) => (
                  <Pressable key={h} onPress={() => tapHistory(h)}
                    style={[s.historyChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                    <Text style={[s.historyText, { color: colors.text }]}>{h}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Trending hashtags */}
          {trendingHashtags.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: colors.text, paddingHorizontal: 16, marginBottom: 10 }]}>Trending</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 8 }}>
                {trendingHashtags.slice(0, 12).map((ht) => (
                  <Pressable key={ht.tag} onPress={() => tapHistory(`#${ht.tag}`)}
                    style={[s.hashChip, { backgroundColor: accent + "15", borderColor: accent + "30" }]}>
                    <Text style={[s.hashText, { color: accent }]}>#{ht.tag}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Trending people */}
          {trendingPeople.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: colors.text, paddingHorizontal: 16, marginBottom: 4 }]}>Suggested People</Text>
              {trendingPeople.slice(0, 6).map(renderPerson)}
            </View>
          )}
        </ScrollView>
      ) : showEmpty ? (
        <View style={s.center}>
          <Ionicons name="search-outline" size={48} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.text }]}>No results for "{query}"</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>Try different keywords or switch tabs</Text>
        </View>
      ) : (
        <FlatList
          data={currentList}
          keyExtractor={(item) => `${item.id}-${item.kind || item.video_url || item.event_date || item.badge || ""}`}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  searchBar: { paddingHorizontal: 14, paddingVertical: 10 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 26, borderWidth: 0.5, paddingHorizontal: 14, height: 44 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  tabBar: { maxHeight: 48 },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, height: 46 },
  tabLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  videoCover: { width: 72, height: 52, borderRadius: 8, overflow: "hidden" },
  emojiBox: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  handle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  bio: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rarityChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  section: { paddingTop: 20 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  historyChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  historyText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  hashChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  hashText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
