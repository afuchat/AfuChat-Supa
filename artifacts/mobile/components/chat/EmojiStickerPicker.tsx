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
  TextInput,
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
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const delay = q.trim() ? 350 : 0;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const endpoint = q.trim()
          ? `https://g.tenor.com/v1/search?q=${encodeURIComponent(q.trim())}&key=LIVEGIF&limit=24&media_filter=minimal`
          : `https://g.tenor.com/v1/trending?key=LIVEGIF&limit=24&media_filter=minimal`;
        const res = await fetch(endpoint);
        const json = await res.json();
        if (cancelled) return;
        const items: GifItem[] = (json.results ?? [])
          .map((r: any) => ({
            id:      r.id,
            preview: r.media?.[0]?.tinygif?.url ?? r.media?.[0]?.gif?.url ?? "",
            url:     r.media?.[0]?.gif?.url     ?? r.media?.[0]?.tinygif?.url ?? "",
          }))
          .filter((g: GifItem) => g.url);
        setResults(items);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, delay);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q]);

  const left  = results.filter((_, i) => i % 2 === 0);
  const right = results.filter((_, i) => i % 2 !== 0);

  return (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={[gs.searchRow, { backgroundColor: colors.inputBg, borderColor: (colors.border as string) ?? "#ccc" }]}>
        <Ionicons name="search" size={16} color={colors.textMuted as string} style={{ marginRight: 6 }} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search GIFs…"
          placeholderTextColor={colors.textMuted as string}
          style={[gs.searchInput, { color: colors.text as string }]}
          returnKeyType="search"
          autoCorrect={false}
        />
        {q.length > 0 && (
          <TouchableOpacity hitSlop={8} onPress={() => setQ("")}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted as string} />
          </TouchableOpacity>
        )}
      </View>

      {/* Attribution */}
      <Text style={[gs.poweredBy, { color: colors.textMuted as string }]}>Powered by Tenor</Text>

      {/* Grid */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent as string} />
        </View>
      ) : results.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Text style={{ fontSize: 32 }}>🔍</Text>
          <Text style={[gs.gifNotice, { color: colors.textSecondary as string }]}>
            {q.trim() ? "No GIFs found" : "Loading trending GIFs…"}
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    margin: 10,
    borderRadius: 10,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  gifNotice: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  poweredBy: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right", paddingHorizontal: 12, paddingBottom: 2 },
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
            enableSearchBar
            enableCategoryChangeGesture={false}
            categoryPosition="top"
            disableSafeArea
            expandable={false}
            theme={emojiTheme}
            styles={{
              container: {
                flex: 1,
                borderRadius: 0,
                ...{ shadowOpacity: 0 },
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

        {/* Spacer pushes ⌫ to the right */}
        <View style={{ flex: 1 }} />

        {/* Delete / backspace key */}
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
    
    paddingHorizontal: 4,
  },
  bottomTab: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
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
