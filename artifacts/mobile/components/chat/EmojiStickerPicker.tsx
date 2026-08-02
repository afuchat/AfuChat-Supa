/**
 * EmojiStickerPicker
 * Custom in-app keyboard replacement with three tabs:
 *   Emoji  |  GIFs  |  Stickers  [⌫]
 *
 * The tab bar sits at the BOTTOM exactly like a native keyboard (as per design).
 * The ⌫ delete button on the right deletes the last character from the input.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { BlurView } from "expo-blur";
import { emojisByCategory } from "rn-emoji-keyboard";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { GLASS, glassTokens } from "@/constants/glass";

// ─── Continuous emoji scroll panel ────────────────────────────────────────────

const EMOJI_COLS = 8;
const ROW_H = 38; // px — each emoji row height (paddingVertical 3 * 2 + fontSize ~32)
const HEADER_H = 28; // px — section header height

// Library PNG icons (same as rn-emoji-keyboard's category bar)
const CAT_ICON_SOURCES: Record<string, any> = {
  recently_used:    require("rn-emoji-keyboard/src/assets/icons/clock.png"),
  smileys_emotion:  require("rn-emoji-keyboard/src/assets/icons/smile.png"),
  people_body:      require("rn-emoji-keyboard/src/assets/icons/users.png"),
  animals_nature:   require("rn-emoji-keyboard/src/assets/icons/trees.png"),
  food_drink:       require("rn-emoji-keyboard/src/assets/icons/pizza.png"),
  travel_places:    require("rn-emoji-keyboard/src/assets/icons/plane.png"),
  activities:       require("rn-emoji-keyboard/src/assets/icons/football.png"),
  objects:          require("rn-emoji-keyboard/src/assets/icons/lightbulb.png"),
  symbols:          require("rn-emoji-keyboard/src/assets/icons/ban.png"),
  flags:            require("rn-emoji-keyboard/src/assets/icons/flag.png"),
};

const CAT_LABELS: Record<string, string> = {
  recently_used: "Recently Used", smileys_emotion: "Smileys & Emotion",
  people_body: "People & Body",   animals_nature: "Animals & Nature",
  food_drink: "Food & Drink",     travel_places: "Travel & Places",
  activities: "Activities",       objects: "Objects",
  symbols: "Symbols",             flags: "Flags",
};

type EmojiRow = { emoji: string; name: string }[];

function chunkEmojis(data: { emoji: string; name: string }[], cols: number): EmojiRow[] {
  const rows: EmojiRow[] = [];
  for (let i = 0; i < data.length; i += cols) rows.push(data.slice(i, i + cols));
  return rows;
}

// ── Flat data model (avoids SectionList getItemLayout complexity) ─────────────
// We flatten every category into a single array of typed rows so a plain
// FlatList can render everything. Each row is either a section header or an
// emoji grid row. getItemLayout on FlatList is straightforward and reliable.

type FlatHeader = { kind: "header"; title: string; key: string };
type FlatRow    = { kind: "row";    emojis: { emoji: string; name: string }[]; key: string };
type FlatItem   = FlatHeader | FlatRow;

const FLAT_ROWS: FlatItem[] = [];
const SECTION_INDICES: number[] = []; // flat index where each category's header starts

for (const cat of emojisByCategory) {
  if (cat.title === "search" || cat.data.length === 0) continue;
  SECTION_INDICES.push(FLAT_ROWS.length);
  FLAT_ROWS.push({ kind: "header", title: cat.title, key: `h:${cat.title}` });
  const rows = chunkEmojis(cat.data as { emoji: string; name: string }[], EMOJI_COLS);
  rows.forEach((row, ri) =>
    FLAT_ROWS.push({ kind: "row", emojis: row, key: `${cat.title}:${ri}` })
  );
}

const SECTION_TITLES = SECTION_INDICES.map((idx) => (FLAT_ROWS[idx] as FlatHeader).title);

// Pre-compute offsets for getItemLayout — every row is either HEADER_H or ROW_H
const FLAT_OFFSETS: number[] = [];
let _off = 0;
for (const row of FLAT_ROWS) {
  FLAT_OFFSETS.push(_off);
  _off += row.kind === "header" ? HEADER_H : ROW_H;
}

function EmojiScrollPanel({ onEmojiSelected }: { onEmojiSelected: (emoji: string) => void }) {
  const { colors } = useTheme();
  const { accent } = useAppAccent();
  const listRef = useRef<FlatList>(null);
  const catBarRef = useRef<ScrollView>(null);
  const activeCatRef = useRef(0);
  const [activeCat, setActiveCat] = useState(0);
  const isScrollingTo = useRef(false);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 });

  // Track which category is visible while scrolling
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (isScrollingTo.current || !viewableItems.length) return;
    // Find the first header that's viewable, or the section owning the first row
    for (const vi of viewableItems) {
      const item: FlatItem = vi.item;
      const title = item.kind === "header" ? item.title : (() => {
        // Walk backwards from vi.index to find the nearest header
        for (let i = vi.index - 1; i >= 0; i--) {
          if (FLAT_ROWS[i].kind === "header") return (FLAT_ROWS[i] as FlatHeader).title;
        }
        return SECTION_TITLES[0];
      })();
      const idx = SECTION_TITLES.indexOf(title);
      if (idx >= 0 && idx !== activeCatRef.current) {
        activeCatRef.current = idx;
        setActiveCat(idx);
        catBarRef.current?.scrollTo({ x: Math.max(0, idx * 44 - 44), animated: true });
      }
      break;
    }
  }).current;

  const scrollToCategory = useCallback((idx: number) => {
    isScrollingTo.current = true;
    activeCatRef.current = idx;
    setActiveCat(idx);
    listRef.current?.scrollToIndex({ index: SECTION_INDICES[idx], animated: true, viewOffset: 0 });
    catBarRef.current?.scrollTo({ x: Math.max(0, idx * 44 - 44), animated: true });
    setTimeout(() => { isScrollingTo.current = false; }, 700);
  }, []);

  // getItemLayout is simple and exact for a FlatList: every item is either
  // HEADER_H or ROW_H with pre-computed offsets — no section-counting tricks needed.
  const getItemLayout = useCallback((_: any, index: number) => ({
    length: FLAT_ROWS[index]?.kind === "header" ? HEADER_H : ROW_H,
    offset: FLAT_OFFSETS[index] ?? 0,
    index,
  }), []);

  const keyExtractor = useCallback((item: FlatItem) => item.key, []);

  const renderItem = useCallback(({ item }: { item: FlatItem }) => {
    if (item.kind === "header") {
      return (
        <View style={{ height: HEADER_H, justifyContent: "flex-end", paddingHorizontal: 12, paddingBottom: 3, backgroundColor: colors.surface as string }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.textMuted as string, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {CAT_LABELS[item.title] ?? item.title}
          </Text>
        </View>
      );
    }
    return (
      <View style={{ flexDirection: "row", paddingHorizontal: 4, height: ROW_H }}>
        {item.emojis.map((e) => (
          <TouchableOpacity
            key={e.name}
            onPress={() => onEmojiSelected(e.emoji)}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
            activeOpacity={0.6}
          >
            <Text style={{ fontSize: 26 }}>{e.emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }, [onEmojiSelected, colors]);

  return (
    <View style={{ flex: 1 }}>
      {/* Category icon bar */}
      <ScrollView
        ref={catBarRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ borderBottomWidth: 0.5, borderBottomColor: ((colors.border as string) ?? "#ccc") + "80", maxHeight: 44 }}
        contentContainerStyle={{ paddingHorizontal: 4, alignItems: "center" }}
      >
        {SECTION_TITLES.map((title, i) => {
          const isActive = i === activeCat;
          return (
            <TouchableOpacity
              key={title}
              onPress={() => scrollToCategory(i)}
              style={{
                width: 44, height: 44, alignItems: "center", justifyContent: "center",
                borderBottomWidth: isActive ? 2 : 0,
                borderBottomColor: accent,
              }}
              activeOpacity={0.7}
            >
              <Image
                source={CAT_ICON_SOURCES[title]}
                style={{ width: 20, height: 20 }}
                tintColor={isActive ? accent : (colors.textMuted as string)}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Single FlatList — simpler and more reliable than SectionList for custom
          getItemLayout. flex:1 gives it the remaining height in the panel. */}
      <FlatList
        ref={listRef}
        data={FLAT_ROWS}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={16}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: 8 }}
        style={{ flex: 1 }}
      />
    </View>
  );
}

// ─── Sticker data ─────────────────────────────────────────────────────────────

const STICKER_COLS = 6;
const STICKER_ROW_H = 56;   // fixed row height for getItemLayout
const STICKER_HDR_H = 28;   // section header height

const STICKER_CATEGORIES: { label: string; ionicon: string; stickers: string[] }[] = [
  {
    label: "Hot",
    ionicon: "flame-outline",
    stickers: [
      "😂","🥰","😍","😎","🤩","🥺","😭","🤣","😅","😇",
      "🫶","👏","🙌","🤝","💪","✌️","🤙","👋","🙏","💯",
    ],
  },
  {
    label: "Smiles",
    ionicon: "happy-outline",
    stickers: [
      "😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊",
      "😋","😎","😍","🥰","😘","😗","😙","😚","🙂","🤗",
      "🤩","😲","😮","😯","😦","😧","😤","😠","😡","😈",
    ],
  },
  {
    label: "Gestures",
    ionicon: "hand-left-outline",
    stickers: [
      "👍","👎","✌️","🤞","🤟","🤘","🤙","🖕","☝️","👆",
      "👇","👈","👉","🫵","✋","🖐️","👋","🤚","🙌","👐",
      "🤲","👏","🫶","🤝","🙏","✍️","💪","🦵","🦶","🖖",
    ],
  },
  {
    label: "Hearts",
    ionicon: "heart-outline",
    stickers: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔",
      "❤️‍🔥","❤️‍🩹","💕","💞","💓","💗","💖","💘","💝","💟",
      "♥️","🫀","💌","💋","😻","🥰","😍","😘","😗","💑",
    ],
  },
  {
    label: "Animals",
    ionicon: "paw-outline",
    stickers: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯",
      "🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦄","🐴",
      "🦋","🐝","🐛","🐞","🦊","🦝","🦔","🐺","🦉","🦅",
    ],
  },
  {
    label: "Food",
    ionicon: "fast-food-outline",
    stickers: [
      "🍕","🍔","🌮","🍟","🍿","🧁","🎂","🍰","🍩","🍪",
      "🍦","🍧","🍨","🍫","🍬","🍭","☕","🧋","🍺","🥂",
      "🍓","🍒","🍇","🍉","🍊","🍋","🍑","🥝","🍍","🥭",
    ],
  },
  {
    label: "Fun",
    ionicon: "game-controller-outline",
    stickers: [
      "🎉","🎊","🎈","🎁","🎀","🎮","🕹️","🎯","🎲","🃏",
      "🏆","🥇","🥈","🥉","🏅","🎖️","🎗️","🎟️","🎫","🎪",
      "🔥","💫","⭐","🌟","✨","💥","🎆","🎇","🧨","🎑",
    ],
  },
  {
    label: "Nature",
    ionicon: "leaf-outline",
    stickers: [
      "🌸","🌺","🌻","🌹","🌷","🌼","💐","🌱","🌿","🍀",
      "🍁","🍂","🍃","🌳","🌴","🌵","🎋","🎍","🌾","🌊",
      "🌈","⚡","🌪️","🌤️","⛅","🌧️","🌙","⭐","☀️","🌞",
    ],
  },
];

// ── Flat sticker data (mirrors emoji flat model) ──────────────────────────────
type StickerHeader = { kind: "header"; label: string; key: string };
type StickerRow    = { kind: "row";    stickers: string[]; key: string };
type StickerItem   = StickerHeader | StickerRow;

const STICKER_FLAT: StickerItem[] = [];
const STICKER_SEC_INDICES: number[] = [];

for (const cat of STICKER_CATEGORIES) {
  STICKER_SEC_INDICES.push(STICKER_FLAT.length);
  STICKER_FLAT.push({ kind: "header", label: cat.label, key: `sh:${cat.label}` });
  for (let i = 0; i < cat.stickers.length; i += STICKER_COLS) {
    STICKER_FLAT.push({
      kind: "row",
      stickers: cat.stickers.slice(i, i + STICKER_COLS),
      key: `${cat.label}:${Math.floor(i / STICKER_COLS)}`,
    });
  }
}

const STICKER_OFFSETS: number[] = [];
let _soff = 0;
for (const row of STICKER_FLAT) {
  STICKER_OFFSETS.push(_soff);
  _soff += row.kind === "header" ? STICKER_HDR_H : STICKER_ROW_H;
}

// ── StickerScrollPanel ────────────────────────────────────────────────────────
function StickerScrollPanel({ onSendSticker }: { onSendSticker: (s: string) => void }) {
  const { colors } = useTheme();
  const { accent } = useAppAccent();
  const listRef  = useRef<FlatList>(null);
  const catBarRef = useRef<ScrollView>(null);
  const activeCatRef = useRef(0);
  const [activeCat, setActiveCat] = useState(0);
  const isScrollingTo = useRef(false);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 });

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (isScrollingTo.current || !viewableItems.length) return;
    for (const vi of viewableItems) {
      const item: StickerItem = vi.item;
      const label = item.kind === "header" ? item.label : (() => {
        for (let i = vi.index - 1; i >= 0; i--) {
          if (STICKER_FLAT[i].kind === "header") return (STICKER_FLAT[i] as StickerHeader).label;
        }
        return STICKER_CATEGORIES[0].label;
      })();
      const idx = STICKER_CATEGORIES.findIndex((c) => c.label === label);
      if (idx >= 0 && idx !== activeCatRef.current) {
        activeCatRef.current = idx;
        setActiveCat(idx);
        catBarRef.current?.scrollTo({ x: Math.max(0, idx * 44 - 44), animated: true });
      }
      break;
    }
  }).current;

  const scrollToCategory = useCallback((idx: number) => {
    isScrollingTo.current = true;
    activeCatRef.current = idx;
    setActiveCat(idx);
    listRef.current?.scrollToIndex({ index: STICKER_SEC_INDICES[idx], animated: true, viewOffset: 0 });
    catBarRef.current?.scrollTo({ x: Math.max(0, idx * 44 - 44), animated: true });
    setTimeout(() => { isScrollingTo.current = false; }, 700);
  }, []);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: STICKER_FLAT[index]?.kind === "header" ? STICKER_HDR_H : STICKER_ROW_H,
    offset: STICKER_OFFSETS[index] ?? 0,
    index,
  }), []);

  const keyExtractor = useCallback((item: StickerItem) => item.key, []);

  const renderItem = useCallback(({ item }: { item: StickerItem }) => {
    if (item.kind === "header") {
      return (
        <View style={{ height: STICKER_HDR_H, justifyContent: "flex-end", paddingHorizontal: 12, paddingBottom: 3, backgroundColor: colors.surface as string }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.textMuted as string, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {item.label}
          </Text>
        </View>
      );
    }
    return (
      <View style={{ flexDirection: "row", height: STICKER_ROW_H }}>
        {item.stickers.map((emoji, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => onSendSticker(emoji)}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
            activeOpacity={0.6}
          >
            <Text style={{ fontSize: 32 }}>{emoji}</Text>
          </TouchableOpacity>
        ))}
        {/* pad empty cells so last row aligns left */}
        {item.stickers.length < STICKER_COLS &&
          Array.from({ length: STICKER_COLS - item.stickers.length }).map((_, i) => (
            <View key={`pad-${i}`} style={{ flex: 1 }} />
          ))
        }
      </View>
    );
  }, [onSendSticker, colors]);

  return (
    <View style={{ flex: 1 }}>
      {/* Category icon bar — Ionicons, same layout as emoji bar */}
      <ScrollView
        ref={catBarRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ borderBottomWidth: 0.5, borderBottomColor: ((colors.border as string) ?? "#ccc") + "80", maxHeight: 44 }}
        contentContainerStyle={{ paddingHorizontal: 4, alignItems: "center" }}
      >
        {STICKER_CATEGORIES.map((cat, i) => {
          const isActive = i === activeCat;
          return (
            <TouchableOpacity
              key={cat.label}
              onPress={() => scrollToCategory(i)}
              style={{
                width: 44, height: 44, alignItems: "center", justifyContent: "center",
                borderBottomWidth: isActive ? 2 : 0,
                borderBottomColor: accent,
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={cat.ionicon as any}
                size={20}
                color={isActive ? accent : (colors.textMuted as string)}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        ref={listRef}
        data={STICKER_FLAT}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={16}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: 8 }}
        style={{ flex: 1 }}
      />
    </View>
  );
}

// ─── GIF panel ────────────────────────────────────────────────────────────────

type GifItem = { id: string; preview: string; url: string };

function GifPanel({ onSendGif }: { onSendGif: (url: string) => void }) {
  const { colors } = useTheme();
  const [results, setResults] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { GIPHY_API_KEY } = await import("@/lib/env");
        const endpoint = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`;
        const res = await fetch(endpoint);
        const json = await res.json();
        if (cancelled) return;
        const items: GifItem[] = (json.data ?? [])
          .map((r: any) => ({
            id:      r.id as string,
            preview: (r.images?.fixed_height_small?.url ?? r.images?.downsized_small?.url ?? "") as string,
            url:     (r.images?.downsized?.url ?? r.images?.fixed_height?.url ?? "") as string,
          }))
          .filter((g: GifItem) => g.url);
        setResults(items);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const left  = results.filter((_, i) => i % 2 === 0);
  const right = results.filter((_, i) => i % 2 !== 0);

  return (
    <View style={{ flex: 1 }}>
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent as string} />
        </View>
      ) : results.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Text style={{ fontSize: 32 }}>🎞️</Text>
          <Text style={[gs.gifNotice, { color: colors.textSecondary as string }]}>
            Loading trending GIFs…
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 8, paddingTop: 2 }}
        >
          <View style={{ flexDirection: "row", gap: 4 }}>
            {[left, right].map((col, ci) => (
              <View key={ci} style={{ flex: 1, gap: 4 }}>
                {col.map((gif) => (
                  <TouchableOpacity
                    key={gif.id}
                    activeOpacity={0.75}
                    onPress={() => onSendGif(gif.url)}
                    style={{ borderRadius: 8, overflow: "hidden", backgroundColor: colors.inputBg as string }}
                  >
                    <Image
                      source={{ uri: gif.preview }}
                      style={{ width: "100%", aspectRatio: 1.4 }}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const gs = StyleSheet.create({
  gifNotice: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "emoji" | "gifs" | "stickers";

interface Props {
  height: number;
  onEmojiSelected: (emoji: string) => void;
  onSendSticker: (emoji: string) => void;
  onSendGif?: (url: string) => void;
  onDelete?: () => void;
  onClose?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmojiStickerPicker({
  height,
  onEmojiSelected,
  onSendSticker,
  onSendGif,
  onDelete,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const { accent } = useAppAccent();
  const BRAND = accent;

  const [tab, setTab] = useState<Tab>("emoji");
  const { isDark } = useTheme();
  const glass = glassTokens(isDark);

  // Pill floats 10 px above the bottom edge; content scrolls behind it so we
  // pad the bottom of the content area by pillH + bottomGap.
  const PILL_H      = 40;
  const BOTTOM_GAP  = 10;
  const CONTENT_PAD = PILL_H + BOTTOM_GAP + 4;

  return (
    <View style={[s.root, { height, backgroundColor: colors.surface as string }]}>

      {/* ── Content area — padded so list never scrolls behind the pill ── */}
      <View style={{ flex: 1, paddingBottom: CONTENT_PAD }}>
        {tab === "emoji" && (
          <EmojiScrollPanel onEmojiSelected={onEmojiSelected} />
        )}
        {tab === "gifs" && (
          <GifPanel onSendGif={onSendGif ?? (() => {})} />
        )}
        {tab === "stickers" && (
          <StickerScrollPanel onSendSticker={onSendSticker} />
        )}
      </View>

      {/* ── Floating pill row — absolute at bottom center ── */}
      <View style={[s.pillRow, { bottom: BOTTOM_GAP, pointerEvents: "box-none" }]}>

        {/* Main glass pill: Emoji | GIFs | Stickers */}
        <BlurView
          intensity={GLASS.blur.heavy}
          tint={isDark ? "dark" : "light"}
          style={[s.pill, { borderColor: glass.border }, GLASS.shadow.darkSoft as any]}
        >
          {(["emoji", "gifs", "stickers"] as Tab[]).map((t) => {
            const active = tab === t;
            const label  = t === "emoji" ? "Emoji" : t === "gifs" ? "GIFs" : "Stickers";
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                activeOpacity={0.7}
                style={s.pillTab}
              >
                {/* Active chip highlight */}
                {active && (
                  <View style={[s.activeChip, { backgroundColor: BRAND + "28" }]} />
                )}
                <Text style={[
                  s.pillTabLabel,
                  { color: active ? BRAND : (colors.textMuted as string),
                    fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" },
                ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </BlurView>

        {/* ⌫ glass circle — separate from the pill */}
        <BlurView
          intensity={GLASS.blur.heavy}
          tint={isDark ? "dark" : "light"}
          style={[s.deleteCircle, { borderColor: glass.border }, GLASS.shadow.darkSoft as any]}
        >
          <TouchableOpacity
            onPress={onDelete}
            activeOpacity={0.6}
            hitSlop={8}
            style={s.deleteInner}
          >
            <Ionicons name="backspace-outline" size={20} color={colors.textMuted as string} />
          </TouchableOpacity>
        </BlurView>

      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { overflow: "hidden", flexDirection: "column" },

  /* Floating pill row ─────────────────────────────────────────────────────── */
  pillRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },

  /* Main pill (Emoji | GIFs | Stickers) */
  pill: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderRadius: GLASS.radius.pill,
    borderWidth: 0.5,
    overflow: "hidden",
    paddingHorizontal: 4,
  },

  pillTab: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    height: 40,
  },

  activeChip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: GLASS.radius.pill,
    marginHorizontal: 4,
    marginVertical: 6,
  },

  pillTabLabel: {
    fontSize: 13,
  },

  /* ⌫ circle */
  deleteCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 0.5,
    overflow: "hidden",
  },

  deleteInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
