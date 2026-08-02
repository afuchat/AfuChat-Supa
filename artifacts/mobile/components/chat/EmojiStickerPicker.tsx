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
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { emojisByCategory } from "rn-emoji-keyboard";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";

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

const STICKER_CATEGORIES: { label: string; icon: string; stickers: string[] }[] = [
  {
    label: "Hot",
    icon: "🔥",
    stickers: [
      "😂","🥰","😍","😎","🤩","🥺","😭","🤣","😅","😇",
      "🫶","👏","🙌","🤝","💪","✌️","🤙","👋","🙏","💯",
    ],
  },
  {
    label: "Smiles",
    icon: "😊",
    stickers: [
      "😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊",
      "😋","😎","😍","🥰","😘","😗","😙","😚","🙂","🤗",
      "🤩","😲","😮","😯","😦","😧","😤","😠","😡","😈",
    ],
  },
  {
    label: "Gestures",
    icon: "👍",
    stickers: [
      "👍","👎","✌️","🤞","🤟","🤘","🤙","🖕","☝️","👆",
      "👇","👈","👉","🫵","✋","🖐️","👋","🤚","🙌","👐",
      "🤲","👏","🫶","🤝","🙏","✍️","💪","🦵","🦶","🖖",
    ],
  },
  {
    label: "Hearts",
    icon: "❤️",
    stickers: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔",
      "❤️‍🔥","❤️‍🩹","💕","💞","💓","💗","💖","💘","💝","💟",
      "♥️","🫀","💌","💋","😻","🥰","😍","😘","😗","💑",
    ],
  },
  {
    label: "Animals",
    icon: "🐶",
    stickers: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯",
      "🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦄","🐴",
      "🦋","🐝","🐛","🐞","🦊","🦝","🦔","🐺","🦉","🦅",
    ],
  },
  {
    label: "Food",
    icon: "🍕",
    stickers: [
      "🍕","🍔","🌮","🍟","🍿","🧁","🎂","🍰","🍩","🍪",
      "🍦","🍧","🍨","🍫","🍬","🍭","☕","🧋","🍺","🥂",
      "🍓","🍒","🍇","🍉","🍊","🍋","🍑","🥝","🍍","🥭",
    ],
  },
  {
    label: "Fun",
    icon: "🎉",
    stickers: [
      "🎉","🎊","🎈","🎁","🎀","🎮","🕹️","🎯","🎲","🃏",
      "🏆","🥇","🥈","🥉","🏅","🎖️","🎗️","🎟️","🎫","🎪",
      "🔥","💫","⭐","🌟","✨","💥","🎆","🎇","🧨","🎑",
    ],
  },
  {
    label: "Nature",
    icon: "🌸",
    stickers: [
      "🌸","🌺","🌻","🌹","🌷","🌼","💐","🌱","🌿","🍀",
      "🍁","🍂","🍃","🌳","🌴","🌵","🎋","🎍","🌾","🌊",
      "🌈","⚡","🌪️","🌤️","⛅","🌧️","🌙","⭐","☀️","🌞",
    ],
  },
];

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
  const [activeCat, setActiveCat] = useState(0);

  const TAB_BAR_H = 46;

  return (
    <View style={[s.root, { height, backgroundColor: colors.surface as string }]}>

      {/* ── Content area (fills space above tab bar) ── */}
      <View style={{ flex: 1 }}>
        {tab === "emoji" && (
          <EmojiScrollPanel onEmojiSelected={onEmojiSelected} />
        )}

        {tab === "gifs" && (
          <GifPanel onSendGif={onSendGif ?? (() => {})} />
        )}

        {tab === "stickers" && (
          <View style={{ flex: 1 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[s.catBar, { borderBottomColor: colors.border as string }]}
              contentContainerStyle={s.catBarContent}
            >
              {STICKER_CATEGORIES.map((cat, i) => (
                <TouchableOpacity
                  key={cat.label}
                  onPress={() => setActiveCat(i)}
                  style={[
                    s.catBtn,
                    i === activeCat && {
                      borderBottomColor: BRAND,
                      borderBottomWidth: 2,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={s.catIcon}>{cat.icon}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <FlatList
              key={activeCat}
              data={STICKER_CATEGORIES[activeCat].stickers}
              numColumns={6}
              keyExtractor={(item, i) => `${activeCat}-${i}-${item}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.grid}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingTop: 32, opacity: 0.5 }}>
                  <Text style={{ fontSize: 32 }}>🙈</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => onSendSticker(item)}
                  style={s.stickerBtn}
                  activeOpacity={0.6}
                >
                  <Text style={s.stickerEmoji}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

      {/* ── Bottom tab bar — Emoji | GIFs | Stickers  [⌫] ── */}
      <View
        style={[
          s.bottomBar,
          {
            height: TAB_BAR_H,
            backgroundColor: colors.surface as string,
            borderTopColor: ((colors.border as string) ?? "#ccc") + "80",
          },
        ]}
      >
        {/* Centered tabs */}
        <View style={s.tabsCenter}>
          {(["emoji", "gifs", "stickers"] as Tab[]).map((t) => {
            const active = tab === t;
            const label = t === "emoji" ? "Emoji" : t === "gifs" ? "GIFs" : "Stickers";
            return (
              <TouchableOpacity
                key={t}
                style={s.bottomTab}
                onPress={() => setTab(t)}
                activeOpacity={0.7}
              >
                {active && (
                  <View style={[s.activeIndicator, { backgroundColor: BRAND }]} />
                )}
                <Text
                  style={[
                    s.bottomTabLabel,
                    {
                      color: active ? BRAND : (colors.textMuted as string),
                      fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Delete / backspace key — pinned to right */}
        <TouchableOpacity
          style={s.deleteBtn}
          onPress={onDelete}
          activeOpacity={0.6}
          hitSlop={8}
        >
          <Ionicons
            name="backspace"
            size={22}
            color={colors.textMuted as string}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { overflow: "hidden", flexDirection: "column" },

  /* Sticker category bar */
  catBar: {
    
    maxHeight: 44,
  },
  catBarContent: {
    paddingHorizontal: 8,
    alignItems: "center",
  },
  catBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  catIcon: { fontSize: 22 },
  grid: { padding: 8 },
  stickerBtn: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  stickerEmoji: { fontSize: 34 },

  /* Bottom navigation bar */
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 0.5,
  },
  tabsCenter: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
  },
  bottomTab: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    height: "100%",
    position: "relative",
  },
  activeIndicator: {
    position: "absolute",
    top: 0,
    left: 10,
    right: 10,
    height: 2.5,
    borderRadius: 2,
  },
  bottomTabLabel: {
    fontSize: 13,
  },
  deleteBtn: {
    paddingHorizontal: 16,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
