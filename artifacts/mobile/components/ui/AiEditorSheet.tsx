/**
 * AiEditorSheet
 * Bottom-sheet AI text editor for chat input.
 * Opens when the draft message is > 50 characters.
 * Three modes: Style (tone presets) · Fix (grammar/spelling) · Translate
 */
import { showAlert } from "@/lib/alert";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import {
  aiTransformTone,
  aiFixText,
  aiEmojifyText,
  aiTranslateMessage,
} from "@/lib/aiHelper";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "style" | "fix" | "translate";

// ─── Constants ────────────────────────────────────────────────────────────────

const TONE_PRESETS: { key: string; label: string; emoji: string }[] = [
  { key: "create",   label: "Create",   emoji: "📝" },
  { key: "formal",   label: "Formal",   emoji: "🌟" },
  { key: "short",    label: "Short",    emoji: "⚡" },
  { key: "tribal",   label: "Tribal",   emoji: "🔥" },
  { key: "corp",     label: "Corp",     emoji: "💼" },
  { key: "biblical", label: "Biblical", emoji: "📖" },
  { key: "viking",   label: "Viking",   emoji: "⚔️" },
  { key: "zen",      label: "Zen",      emoji: "🧘" },
];

const LANGUAGES = [
  "Arabic", "French", "Spanish", "Swahili", "Portuguese",
  "Hindi", "Chinese", "German", "Japanese", "Hausa",
  "Yoruba", "Amharic", "Somali", "Zulu", "Turkish",
  "Russian", "Korean", "Italian", "Dutch", "Polish",
];

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "translate", label: "Translate", icon: "language" },
  { key: "style",     label: "Style",     icon: "color-wand" },
  { key: "fix",       label: "Fix",       icon: "construct" },
];

// ─── AiEditorSheet ────────────────────────────────────────────────────────────

export default function AiEditorSheet({
  visible,
  text,
  onClose,
  onApply,
  onApplyAndSend,
}: {
  visible: boolean;
  text: string;
  onClose: () => void;
  onApply: (newText: string) => void;
  onApplyAndSend: (newText: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const accent = colors.accent as string;

  const sheetTranslateY = useRef(new Animated.Value(1000)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(sheetTranslateY, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      sheetTranslateY.setValue(1000);
    }
  }, [visible]);

  function dismissSheet() {
    Animated.timing(sheetTranslateY, { toValue: 1000, duration: 220, useNativeDriver: true }).start(() => onClose());
  }

  const sheetPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) sheetTranslateY.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80 || g.vy > 0.5) {
        Animated.timing(sheetTranslateY, { toValue: 1000, duration: 220, useNativeDriver: true }).start(() => onClose());
      } else {
        Animated.timing(sheetTranslateY, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      }
    },
  })).current;

  const [tab, setTab] = useState<Tab>("style");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [emojify, setEmojify] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const prevResultRef = useRef<string | null>(null);

  useEffect(() => {
    if (visible) {
      setTab("style");
      setActivePreset(null);
      setSelectedLang(null);
      setEmojify(false);
      setResult(null);
      setLoading(false);
    }
  }, [visible, text]);

  useEffect(() => {
    if (tab === "fix" && visible) {
      setActivePreset(null);
      setSelectedLang(null);
      setResult(null);
      runFix();
    }
    if (tab !== "fix") {
      setResult(null);
    }
  }, [tab]);

  async function runPreset(key: string) {
    setActivePreset(key);
    setResult(null);
    setLoading(true);
    try {
      let r = await aiTransformTone(text, key);
      if (emojify) r = await aiEmojifyText(r);
      setResult(r.trim());
      prevResultRef.current = r.trim();
    } catch {
      showAlert("AI error", "Could not transform the text. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function runFix() {
    setLoading(true);
    setResult(null);
    try {
      let r = await aiFixText(text);
      if (emojify) r = await aiEmojifyText(r);
      setResult(r.trim());
      prevResultRef.current = r.trim();
    } catch {
      showAlert("AI error", "Could not fix the text. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function runTranslate(lang: string) {
    setSelectedLang(lang);
    setResult(null);
    setLoading(true);
    try {
      let r = await aiTranslateMessage(text, lang);
      if (emojify) r = await aiEmojifyText(r);
      setResult(r.trim());
      prevResultRef.current = r.trim();
    } catch {
      showAlert("AI error", "Could not translate. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleEmojify() {
    const next = !emojify;
    setEmojify(next);
    if (result) {
      setLoading(true);
      try {
        if (next) {
          const r = await aiEmojifyText(result);
          setResult(r.trim());
          prevResultRef.current = r.trim();
        } else {
          if (prevResultRef.current) setResult(prevResultRef.current);
        }
      } catch {}
      setLoading(false);
    }
  }

  const hasResult = !!result && !loading;
  const sheetH = Math.min(winH * 0.72, 560);
  const animStyle = { transform: [{ translateY: sheetTranslateY }] };
  const sheetRadius = {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: (colors.border as string) + "80",
    pointerEvents: "none" as const,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismissSheet}
      statusBarTranslucent
    >
      <Pressable
        style={s.backdrop}
        onPress={dismissSheet}
      >
        <Animated.View style={animStyle}>
        <Pressable
          onPress={() => {}}
          style={[
            s.sheet,
            {
              backgroundColor: colors.backgroundSecondary,
              paddingBottom: Math.max(insets.bottom, 16),
              height: sheetH,
            },
          ]}
        >
          <View style={[StyleSheet.absoluteFill, sheetRadius as any]} />

          <View {...sheetPan.panHandlers} style={s.handle} />

          <View style={s.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={[s.aiGlyph, { backgroundColor: accent + "20", borderColor: accent + "40" }]}>
                <Text style={{ color: accent, fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 }}>Ai</Text>
              </View>
              <Text style={[s.title, { color: colors.text as string }]}>AI Editor</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textMuted as string} />
            </TouchableOpacity>
          </View>

          <View style={[s.tabRow, { borderBottomColor: (colors.border as string) + "60" }]}>
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  activeOpacity={0.7}
                  style={[s.tabBtn, active && { backgroundColor: accent + "18", borderColor: accent + "50" }]}
                >
                  <Ionicons name={t.icon as any} size={15} color={active ? accent : (colors.textMuted as string)} />
                  <Text style={[s.tabLabel, { color: active ? accent : (colors.textMuted as string), fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {tab === "style" && (
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presetRow}>
                  {TONE_PRESETS.map((p) => {
                    const active = activePreset === p.key;
                    return (
                      <TouchableOpacity
                        key={p.key}
                        onPress={() => runPreset(p.key)}
                        activeOpacity={0.75}
                        style={[s.presetChip, { backgroundColor: active ? accent : (colors.surface as string), borderColor: active ? accent : (colors.border as string) }]}
                      >
                        <Text style={s.presetEmoji}>{p.emoji}</Text>
                        <Text style={[s.presetLabel, { color: active ? "#fff" : (colors.text as string) }]}>{p.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {tab === "translate" && (
              <View style={s.langGrid}>
                {LANGUAGES.map((lang) => {
                  const active = selectedLang === lang;
                  return (
                    <TouchableOpacity
                      key={lang}
                      onPress={() => runTranslate(lang)}
                      activeOpacity={0.75}
                      style={[s.langChip, { backgroundColor: active ? accent : (colors.surface as string), borderColor: active ? accent : (colors.border as string) }]}
                    >
                      <Text style={[s.langLabel, { color: active ? "#fff" : (colors.text as string) }]}>{lang}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {tab === "fix" && loading && !result && (
              <View style={{ alignItems: "center", paddingVertical: 16 }}>
                <ActivityIndicator color={accent} />
                <Text style={[s.loadingLabel, { color: colors.textMuted as string }]}>Checking your text…</Text>
              </View>
            )}

            <View style={[s.textSection, { borderTopColor: (colors.border as string) + "40" }]}>
              <View style={s.textSectionHeader}>
                <Text style={[s.sectionLabel, { color: colors.textMuted as string }]}>Original</Text>
                <TouchableOpacity
                  onPress={toggleEmojify}
                  style={[s.emojifyBtn, { borderColor: emojify ? accent : (colors.border as string), backgroundColor: emojify ? accent + "18" : "transparent" }]}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13 }}>😄</Text>
                  <Text style={[s.emojifyLabel, { color: emojify ? accent : (colors.textMuted as string) }]}>emojify</Text>
                </TouchableOpacity>
              </View>
              <Text style={[s.originalText, { color: (colors.text as string) + "AA" }]} numberOfLines={5}>
                {text}
              </Text>
            </View>

            {(loading && (tab === "style" || tab === "translate")) && (
              <View style={[s.resultSection, { borderTopColor: (colors.border as string) + "40", backgroundColor: accent + "08" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, justifyContent: "center" }}>
                  <ActivityIndicator color={accent} size="small" />
                  <Text style={[s.loadingLabel, { color: accent }]}>
                    {tab === "style" ? `Applying ${TONE_PRESETS.find(p => p.key === activePreset)?.label} style…` : `Translating to ${selectedLang}…`}
                  </Text>
                </View>
              </View>
            )}

            {hasResult && (
              <View style={[s.resultSection, { borderTopColor: accent + "30", backgroundColor: accent + "0C" }]}>
                <View style={s.textSectionHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="bulb-outline" size={13} color={accent} />
                    <Text style={[s.sectionLabel, { color: accent }]}>Result</Text>
                  </View>
                </View>
                <Text style={[s.resultText, { color: colors.text as string }]}>{result}</Text>
              </View>
            )}
          </ScrollView>

          <View style={[s.actions, { borderTopColor: (colors.border as string) + "50" }]}>
            <TouchableOpacity
              onPress={() => { if (result) onApply(result); }}
              disabled={!hasResult}
              activeOpacity={0.85}
              style={[s.applyBtn, { backgroundColor: hasResult ? accent : (colors.surface as string), opacity: hasResult ? 1 : 0.5 }]}
            >
              <Text style={[s.applyBtnText, { color: hasResult ? "#fff" : (colors.textMuted as string) }]}>Apply</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { if (result) onApplyAndSend(result); }}
              disabled={!hasResult}
              style={[s.sendIconBtn, { backgroundColor: hasResult ? accent : (colors.surface as string), opacity: hasResult ? 1 : 0.5 }]}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={17} color="#fff" />
            </TouchableOpacity>
          </View>
        </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.52)", justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden",
    paddingHorizontal: 0,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(128,128,128,0.3)",
    alignSelf: "center", marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 12,
  },
  aiGlyph: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    borderWidth: 1, alignItems: "center",
  },
  title: {
    fontSize: 16, fontFamily: "Inter_700Bold",
  },
  tabRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 10, gap: 8,
    borderBottomWidth: 0.5,
  },
  tabBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: "transparent",
  },
  tabLabel: {
    fontSize: 13,
  },
  presetRow: {
    flexDirection: "row", paddingHorizontal: 16, paddingVertical: 14, gap: 8,
  },
  presetChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5,
  },
  presetEmoji: {
    fontSize: 15,
  },
  presetLabel: {
    fontSize: 13, fontFamily: "Inter_600SemiBold",
  },
  langGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 8,
  },
  langChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 16, borderWidth: 1.5,
  },
  langLabel: {
    fontSize: 13, fontFamily: "Inter_500Medium",
  },
  textSection: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
    marginTop: 4,
  },
  textSectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8,
  },
  emojifyBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1.5,
  },
  emojifyLabel: {
    fontSize: 12, fontFamily: "Inter_600SemiBold",
  },
  originalText: {
    fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20,
  },
  resultSection: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
    borderTopWidth: 1, marginTop: 2,
  },
  resultText: {
    fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 21,
    marginTop: 2, paddingBottom: 8,
  },
  loadingLabel: {
    fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 6,
  },
  actions: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4,
    gap: 10,
  },
  applyBtn: {
    flex: 1, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
  },
  applyBtnText: {
    fontSize: 15, fontFamily: "Inter_700Bold",
  },
  sendIconBtn: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
  },
});
