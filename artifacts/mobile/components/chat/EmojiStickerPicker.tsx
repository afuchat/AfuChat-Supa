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
  SectionList,
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

const CAT_ICONS: Record<string, string> = {
  recently_used: "🕐", smileys_emotion: "😀", people_body: "👋",
  animals_nature: "🐶", food_drink: "🍕", travel_places: "✈️",
  activities: "⚽", objects: "💡", symbols: "🔣", flags: "🏳️",
};

const CAT_LABELS: Record<string, string> = {
  recently_used: "Recently Used", smileys_emotion: "Smileys & Emotion",
  people_body: "People & Body", animals_nature: "Animals & Nature",
  food_drink: "Food & Drink", travel_places: "Travel & Places",
  activities: "Activities", objects: "Objects",
  symbols: "Symbols", flags: "Flags",
};

type EmojiRow = { emoji: string; name: string }[];

function chunkEmojis(data: { emoji: string; name: string }[], cols: number): EmojiRow[] {
  const rows: EmojiRow[] = [];
  for (let i = 0; i < data.length; i += cols) rows.push(data.slice(i, i + cols));
  return rows;
}

function EmojiScrollPanel({ onEmojiSelected }: { onEmojiSelected: (emoji: string) => void }) {
  const { colors } = useTheme();
  const { accent } = useAppAccent();
  const listRef = useRef<SectionList>(null);
  const catBarRef = useRef<ScrollView>(null);
  const [activeCat, setActiveCat] = useState(0);
  const isScrollingTo = useRef(false);

  const sections = useMemo(() =>
    emojisByCategory
      .filter((c) => c.title !== "search" && c.data.length > 0)
      .map((c) => ({ title: c.title, data: chunkEmojis(c.data, EMOJI_COLS) })),
    [],
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 30 });

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (isScrollingTo.current || !viewableItems.length) return;
    const first = viewableItems[0];
    const idx = sections.findIndex((s) => s.title === first.section?.title);
    if (idx >= 0 && idx !== activeCat) setActiveCat(idx);
  }, [sections, activeCat]);

  const scrollToCategory = useCallback((idx: number) => {
    isScrollingTo.current = true;
    setActiveCat(idx);
    listRef.current?.scrollToLocation({ sectionIndex: idx, itemIndex: 0, animated: true, viewOffset: 0 });
    catBarRef.current?.scrollTo({ x: idx * 44, animated: true });
    setTimeout(() => { isScrollingTo.current = false; }, 700);
  }, []);

  const renderItem = useCallback(({ item }: { item: EmojiRow }) => (
    <View style={{ flexDirection: "row", paddingHorizontal: 4 }}>
      {item.map((e) => (
        <TouchableOpacity
          key={e.name}
          onPress={() => onEmojiSelected(e.emoji)}
          style={{ flex: 1, alignItems: "center", paddingVertical: 3 }}
          activeOpacity={0.6}
          hitSlop={2}
        >
          <Text style={{ fontSize: 28 }}>{e.emoji}</Text>
        </TouchableOpacity>
      ))}
    </View>
  ), [onEmojiSelected]);

  const renderSectionHeader = useCallback(({ section }: any) => (
    <Text style={{
      fontSize: 11, fontFamily: "Inter_600SemiBold",
      color: colors.textMuted as string, textTransform: "uppercase", letterSpacing: 0.5,
      paddingHorizontal: 12, paddingTop: 10, paddingBottom: 3,
      backgroundColor: colors.surface as string,
    }}>
      {CAT_LABELS[section.title] ?? section.title}
    </Text>
  ), [colors]);

  const keyExtractor = useCallback((_: EmojiRow, i: number) => String(i), []);

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
        {sections.map((s, i) => (
          <TouchableOpacity
            key={s.title}
            onPress={() => scrollToCategory(i)}
            style={{
              width: 44, height: 44, alignItems: "center", justifyContent: "center",
              borderBottomWidth: i === activeCat ? 2 : 0,
              borderBottomColor: accent,
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 20 }}>{CAT_ICONS[s.title] ?? "🔡"}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Continuous emoji list */}
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={6}
        windowSize={10}
        contentContainerStyle={{ paddingBottom: 8 }}
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
