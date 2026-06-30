import React, { useCallback } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { ChatAppearance } from "@/lib/chatAppearance";
import { SmartSheet } from "@/components/ui/SmartSheet";

// ── Palettes ──────────────────────────────────────────────────────────────────

const BUBBLE_COLORS = [
  { key: "default", label: "Default", value: undefined },
  { key: "teal",    label: "Teal",    value: "#009688" },
  { key: "blue",    label: "Blue",    value: "#1565C0" },
  { key: "indigo",  label: "Indigo",  value: "#3949AB" },
  { key: "purple",  label: "Purple",  value: "#7B1FA2" },
  { key: "pink",    label: "Pink",    value: "#C2185B" },
  { key: "red",     label: "Red",     value: "#C62828" },
  { key: "orange",  label: "Orange",  value: "#E65100" },
  { key: "amber",   label: "Amber",   value: "#F57F17" },
  { key: "green",   label: "Green",   value: "#2E7D32" },
  { key: "slate",   label: "Slate",   value: "#37474F" },
  { key: "black",   label: "Black",   value: "#212121" },
] as const;

const BG_OPTIONS = [
  { key: "default",  label: "Default", value: undefined },
  { key: "cream",    label: "Cream",   value: "#FFF8E7" },
  { key: "mint",     label: "Mint",    value: "#E8F5E9" },
  { key: "blush",    label: "Blush",   value: "#FCE4EC" },
  { key: "lavender", label: "Lavender",value: "#EDE7F6" },
  { key: "sky",      label: "Sky",     value: "#E3F2FD" },
  { key: "slate",    label: "Slate",   value: "#ECEFF1" },
  { key: "sand",     label: "Sand",    value: "#FFF3E0" },
  { key: "dark1",    label: "Dark",    value: "#1A1A2E" },
  { key: "dark2",    label: "Ink",     value: "#0D1117" },
  { key: "forest",   label: "Forest",  value: "#1B2A1F" },
  { key: "midnight", label: "Night",   value: "#0A0E1A" },
] as const;

// ── Preview ───────────────────────────────────────────────────────────────────

function BubblePreview({ bubbleColor, bgColor, defaultBubble, defaultBg }: {
  bubbleColor: string | undefined;
  bgColor: string | undefined;
  defaultBubble: string;
  defaultBg: string;
}) {
  const resolvedBubble = bubbleColor ?? defaultBubble;
  const resolvedBg = bgColor ?? defaultBg;
  return (
    <View style={[pv.wrap, { backgroundColor: resolvedBg }]}>
      <View style={pv.rowLeft}>
        <View style={[pv.bubble, pv.incoming]}>
          <Text style={pv.incomingText}>Hey, how are you? 👋</Text>
        </View>
      </View>
      <View style={pv.rowRight}>
        <View style={[pv.bubble, { backgroundColor: resolvedBubble }]}>
          <Text style={pv.outgoingText}>Doing great, thanks! 😊</Text>
        </View>
      </View>
      <View style={pv.rowLeft}>
        <View style={[pv.bubble, pv.incoming]}>
          <Text style={pv.incomingText}>Nice! Want to catch up? ☕</Text>
        </View>
      </View>
    </View>
  );
}

const pv = StyleSheet.create({
  wrap:         { borderRadius: 14, padding: 14, gap: 8, overflow: "hidden" },
  rowLeft:      { flexDirection: "row", alignSelf: "flex-start" },
  rowRight:     { flexDirection: "row", alignSelf: "flex-end" },
  bubble:       { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 220 },
  incoming:     { backgroundColor: "#E0E0E0" },
  incomingText: { fontSize: 13, color: "#333", fontFamily: "Inter_400Regular" },
  outgoingText: { fontSize: 13, color: "#FFF", fontFamily: "Inter_400Regular" },
});

// ── Swatch ────────────────────────────────────────────────────────────────────

function Swatch({ color, label, selected, defaultColor, accent, onPress }: {
  color: string | undefined;
  label: string;
  selected: boolean;
  defaultColor: string;
  accent: string;
  onPress: () => void;
}) {
  const resolved = color ?? defaultColor;
  const isDefaultSlot = color === undefined;
  return (
    <TouchableOpacity style={sw.wrap} onPress={onPress} activeOpacity={0.75}>
      <View style={[
        sw.circle,
        { backgroundColor: resolved },
        isDefaultSlot && sw.defaultDash,
        selected && { borderWidth: 2.5, borderColor: accent },
      ]}>
        {selected && <Ionicons name="checkmark" size={14} color={isDefaultSlot ? accent : "#fff"} />}
      </View>
      <Text style={sw.label} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const sw = StyleSheet.create({
  wrap:        { alignItems: "center", gap: 4, width: 58 },
  circle:      { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  defaultDash: { borderWidth: 1.5, borderColor: "#ccc", borderStyle: "dashed" },
  label:       { fontSize: 10, color: "#888", fontFamily: "Inter_400Regular", textAlign: "center" },
});

// ── Main Sheet ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  chatId: string;
  appearance: ChatAppearance | null;
  onUpdate: (next: ChatAppearance | null) => void;
  onClose: () => void;
}

export default function ChatAppearanceSheet({ visible, chatId: _chatId, appearance, onUpdate, onClose }: Props) {
  const { colors } = useTheme();

  const currentBubble = appearance?.bubbleColor;
  const currentBg     = appearance?.bgColor;

  const setBubble = useCallback((val: string | undefined) => {
    const next: ChatAppearance = { ...appearance, bubbleColor: val };
    if (!next.bubbleColor && !next.bgColor) { onUpdate(null); return; }
    if (!next.bubbleColor) delete next.bubbleColor;
    onUpdate(next);
  }, [appearance, onUpdate]);

  const setBg = useCallback((val: string | undefined) => {
    const next: ChatAppearance = { ...appearance, bgColor: val };
    if (!next.bubbleColor && !next.bgColor) { onUpdate(null); return; }
    if (!next.bgColor) delete next.bgColor;
    onUpdate(next);
  }, [appearance, onUpdate]);

  const resetAll = useCallback(() => { onUpdate(null); }, [onUpdate]);

  const hasCustom = !!(currentBubble || currentBg);

  return (
    <SmartSheet
      visible={visible}
      onClose={onClose}
      backgroundColor={colors.surface}
      peekFraction={0.75}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Chat Appearance</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Live preview */}
        <BubblePreview
          bubbleColor={currentBubble}
          bgColor={currentBg}
          defaultBubble={colors.accent}
          defaultBg={colors.background}
        />

        {/* Bubble colour */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>BUBBLE COLOUR</Text>
        <View style={styles.swatchGrid}>
          {BUBBLE_COLORS.map((c) => (
            <Swatch
              key={c.key}
              color={c.value}
              label={c.label}
              selected={currentBubble === c.value}
              defaultColor={colors.accent}
              accent={colors.accent}
              onPress={() => setBubble(c.value)}
            />
          ))}
        </View>

        {/* Background colour */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>BACKGROUND</Text>
        <View style={styles.swatchGrid}>
          {BG_OPTIONS.map((c) => (
            <Swatch
              key={c.key}
              color={c.value}
              label={c.label}
              selected={currentBg === c.value}
              defaultColor={colors.background}
              accent={colors.accent}
              onPress={() => setBg(c.value)}
            />
          ))}
        </View>

        {/* Reset */}
        {hasCustom && (
          <TouchableOpacity style={[styles.resetBtn, { borderColor: colors.border }]} onPress={resetAll} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={24} color={colors.text} style={styles.resetIcon} />
            <Text style={[styles.resetText, { color: colors.text }]}>Reset to Default</Text>
          </TouchableOpacity>
        )}
      </View>
    </SmartSheet>
  );
}

const styles = StyleSheet.create({
  header:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  title:        { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold" },
  closeBtn:     { padding: 4 },
  content:      { paddingHorizontal: 20, paddingBottom: 36, gap: 16 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginTop: 6, marginBottom: 2 },
  swatchGrid:   { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  resetBtn:     { flexDirection: "row", alignItems: "center", alignSelf: "center", paddingHorizontal: 20, paddingVertical: 14, minHeight: 56 },
  resetIcon:    { marginRight: 18, width: 24, textAlign: "center" },
  resetText:    { fontSize: 16, fontFamily: "Inter_700Bold" },
});
