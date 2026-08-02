/**
 * EmojiStickerPicker
 * Custom in-app keyboard replacement with three tabs:
 *   Emoji  |  GIFs  |  Stickers  [⌫]
 *
 * The tab bar sits at the BOTTOM exactly like a native keyboard (as per design).
 * The ⌫ delete button on the right deletes the last character from the input.
 */
import React, { useState, useEffect } from "react";
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
import { EmojiKeyboard } from "rn-emoji-keyboard";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";

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

  const emojiTheme = {
    knob: colors.textMuted,
    container: colors.surface,
    header: colors.text,
    skinTonesContainer: colors.surface,
    category: {
      icon: colors.textMuted,
      iconActive: BRAND,
      container: colors.surface,
      containerActive: colors.inputBg,
    },
    search: {
      text: colors.text,
      placeholder: colors.textMuted,
      icon: colors.textMuted,
      background: colors.inputBg,
    },
    emoji: { selected: colors.inputBg },
  };

  const TAB_BAR_H = 46;

  return (
    <View style={[s.root, { height, backgroundColor: colors.surface as string }]}>

      {/* ── Content area (fills space above tab bar) ── */}
      <View style={{ flex: 1 }}>
        {tab === "emoji" && (
          <EmojiKeyboard
            onEmojiSelected={(emojiObject: { emoji: string }) =>
              onEmojiSelected(emojiObject.emoji)
            }
            enableRecentlyUsed
            enableSearchBar={false}
            hideHeader
            enableCategoryChangeGesture={false}
            categoryPosition="top"
            disableSafeArea
            expandable={false}
            theme={emojiTheme}
            styles={{
              container: {
                flex: 1,
                borderRadius: 0,
                ...Platform.select({ default: { shadowOpacity: 0 } }),
                elevation: 0,
              },
            }}
          />
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
