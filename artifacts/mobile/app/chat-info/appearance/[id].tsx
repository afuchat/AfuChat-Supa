import React, { useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";

const BUBBLE_COLORS = [
  { label: "Default",  value: null },
  { label: "Blue",     value: "#007AFF" },
  { label: "Green",    value: "#34C759" },
  { label: "Purple",   value: "#AF52DE" },
  { label: "Pink",     value: "#FF2D55" },
  { label: "Orange",   value: "#FF9500" },
  { label: "Teal",     value: "#5AC8FA" },
  { label: "Red",      value: "#FF3B30" },
];

const FONT_SIZES = [
  { label: "Small",   value: "small" },
  { label: "Normal",  value: "normal" },
  { label: "Large",   value: "large" },
];

const WALLPAPERS = [
  { label: "None",      value: null },
  { label: "Subtle",    value: "subtle" },
  { label: "Dots",      value: "dots" },
  { label: "Lines",     value: "lines" },
];

export default function ChatAppearanceScreen() {
  const { id, displayName } = useLocalSearchParams<{ id: string; displayName?: string }>();
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();

  const [bubbleColor,  setBubbleColor]  = useState<string | null>(null);
  const [fontSize,     setFontSize]     = useState("normal");
  const [wallpaper,    setWallpaper]    = useState<string | null>(null);
  const [saved,        setSaved]        = useState(false);

  const storageKey = `afu_chat_appearance_${id}`;

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.bubbleColor !== undefined) setBubbleColor(parsed.bubbleColor);
        if (parsed.fontSize)    setFontSize(parsed.fontSize);
        if (parsed.wallpaper !== undefined) setWallpaper(parsed.wallpaper);
      } catch {}
    });
  }, [storageKey]);

  async function save(next: { bubbleColor?: string | null; fontSize?: string; wallpaper?: string | null }) {
    const current = { bubbleColor, fontSize, wallpaper, ...next };
    await AsyncStorage.setItem(storageKey, JSON.stringify(current));
    if (next.bubbleColor !== undefined) setBubbleColor(next.bubbleColor);
    if (next.fontSize)    setFontSize(next.fontSize);
    if (next.wallpaper !== undefined) setWallpaper(next.wallpaper);
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  }

  const activeBubble = bubbleColor ?? accent;

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary ?? colors.background }]}>
      <GlassHeader title={`Appearance — ${displayName ?? "Chat"}`} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
      >
        {saved && (
          <View style={[s.savedBanner, { backgroundColor: "#34C75920", borderColor: "#34C75940" }]}>
            <Ionicons name="checkmark-circle" size={16} color="#34C759" />
            <Text style={[s.savedText, { color: "#34C759" }]}>Saved for this chat</Text>
          </View>
        )}

        {/* ── Bubble Color ── */}
        <SectionTitle label="BUBBLE COLOR" colors={colors} />
        <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.colorGrid}>
            {BUBBLE_COLORS.map((c) => {
              const isActive = (c.value === null ? null : c.value) === bubbleColor;
              const swatch = c.value ?? accent;
              return (
                <TouchableOpacity
                  key={c.label}
                  style={s.colorItem}
                  onPress={() => save({ bubbleColor: c.value })}
                  activeOpacity={0.7}
                >
                  <View style={[
                    s.colorSwatch,
                    { backgroundColor: swatch },
                    isActive && s.colorSwatchActive,
                  ]}>
                    {isActive && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                  <Text style={[s.colorLabel, { color: colors.textMuted }]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Preview bubble ── */}
        <View style={s.previewWrap}>
          <View style={[s.bubblePreview, { backgroundColor: activeBubble }]}>
            <Text style={s.bubbleText}>
              {fontSize === "small" ? "Small text preview" : fontSize === "large" ? "Large text preview" : "Normal text preview"}
            </Text>
          </View>
        </View>

        {/* ── Font Size ── */}
        <SectionTitle label="TEXT SIZE" colors={colors} />
        <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {FONT_SIZES.map((f, i) => (
            <React.Fragment key={f.value}>
              {i > 0 && <Sep color={colors.border} />}
              <TouchableOpacity style={s.row} onPress={() => save({ fontSize: f.value })} activeOpacity={0.6}>
                <View style={[s.iconBadge, { backgroundColor: "#5856D6" }]}>
                  <Ionicons name="text-outline" size={17} color="#fff" />
                </View>
                <Text style={[s.rowLabel, { color: colors.text }]}>{f.label}</Text>
                {fontSize === f.value && (
                  <Ionicons name="checkmark" size={17} color={accent} />
                )}
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* ── Wallpaper ── */}
        <SectionTitle label="CHAT WALLPAPER" colors={colors} />
        <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {WALLPAPERS.map((w, i) => (
            <React.Fragment key={String(w.value)}>
              {i > 0 && <Sep color={colors.border} />}
              <TouchableOpacity style={s.row} onPress={() => save({ wallpaper: w.value })} activeOpacity={0.6}>
                <View style={[s.iconBadge, { backgroundColor: "#007AFF" }]}>
                  <Ionicons name="image-outline" size={17} color="#fff" />
                </View>
                <Text style={[s.rowLabel, { color: colors.text }]}>{w.label}</Text>
                {wallpaper === w.value && (
                  <Ionicons name="checkmark" size={17} color={accent} />
                )}
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* ── Reset ── */}
        <SectionTitle label="" colors={colors} />
        <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity
            style={s.row}
            onPress={() => save({ bubbleColor: null, fontSize: "normal", wallpaper: null })}
            activeOpacity={0.6}
          >
            <View style={[s.iconBadge, { backgroundColor: "#FF3B30" }]}>
              <Ionicons name="refresh-outline" size={17} color="#fff" />
            </View>
            <Text style={[s.rowLabel, { color: "#FF3B30" }]}>Reset to Default</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ label, colors }: { label: string; colors: any }) {
  return <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{label}</Text>;
}

function Sep({ color }: { color: string }) {
  return <View style={[s.sep, { backgroundColor: color }]} />;
}

const s = StyleSheet.create({
  root: { flex: 1 },

  savedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  savedText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.9,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 6,
  },

  group: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },

  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 16,
  },
  colorItem: {
    alignItems: "center",
    gap: 6,
    width: 56,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSwatchActive: {
    borderWidth: 3,
    borderColor: "#fff",
  },
  colorLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },

  previewWrap: {
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  bubblePreview: {
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: "70%",
  },
  bubbleText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
    minHeight: 52,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },

  sep: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 62,
  },
});
