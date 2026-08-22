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

// ── Preview ───────────────────────────────────────────────────────────────────

function BubblePreview({ defaultBubble, defaultBg }: {
  defaultBubble: string;
  defaultBg: string;
}) {
  return (
    <View style={[pv.wrap, { backgroundColor: defaultBg }]}>
      <View style={pv.rowLeft}>
        <View style={[pv.bubble, pv.incoming]}>
          <Text style={pv.incomingText}>Hey, how are you? 👋</Text>
        </View>
      </View>
      <View style={pv.rowRight}>
        <View style={[pv.bubble, { backgroundColor: defaultBubble }]}>
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

  const resetAll = useCallback(() => { onUpdate(null); }, [onUpdate]);

  const hasCustom = !!appearance && Object.keys(appearance).length > 0;

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
          defaultBubble={colors.accent}
          defaultBg={colors.background}
        />

        {/* Reset */}
        {hasCustom && (
          <TouchableOpacity style={[styles.resetBtn, { borderColor: colors.border }]} onPress={resetAll} activeOpacity={0.7}>
            <Ionicons name="refresh" size={24} color={colors.text} style={styles.resetIcon} />
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
