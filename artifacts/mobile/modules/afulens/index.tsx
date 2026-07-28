/**
 * AfuLab — AI Lens mini app.
 * Adapted from the standalone lab.tsx screen to run inside MiniAppWindow.
 * The MiniAppWindow already provides a header with minimize/close controls,
 * so this component omits its own top bar and integrates with useSuperApp()
 * for any navigation that should leave the mini app context.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { getEdgeFnBase, edgeHeaders } from "@/lib/aiHelper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient as SafeGrad } from "@/components/ui/SafeGradient";
import { useSuperApp } from "@/lib/superapp/SuperAppContext";
import { CameraView, useCameraPermissions } from "expo-camera";

const { width: SW, height: SH } = Dimensions.get("window");
const FRAME_SIZE = Math.min(SW, SH) * 0.68;

const BRAND    = "#FF6B35";
const BRAND2   = "#FF3B00";
const BRAND_BG = "rgba(255,107,53,0.15)";

interface LensResult {
  title: string;
  description: string;
  facts: string[];
  category: string;
  searchQuery: string;
  confidence: "high" | "medium" | "low";
  answer?: string;
}

function ScanFrame({ scanning }: { scanning: boolean }) {
  const pulse  = useRef(new RNAnimated.Value(1)).current;
  const corner = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (scanning) {
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(pulse, { toValue: 0.6, duration: 600, useNativeDriver: true }),
          RNAnimated.timing(pulse, { toValue: 1,   duration: 600, useNativeDriver: true }),
        ])
      ).start();
      RNAnimated.loop(
        RNAnimated.timing(corner, { toValue: 1, duration: 1600, useNativeDriver: false })
      ).start();
    } else {
      pulse.stopAnimation();
      corner.stopAnimation();
      pulse.setValue(1);
      corner.setValue(0);
    }
  }, [scanning]);

  const borderColor = scanning
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [BRAND2, BRAND] })
    : BRAND;

  return (
    <View style={{ width: FRAME_SIZE, height: FRAME_SIZE, position: "relative" }}>
      {[
        { top: 0, left: 0 },
        { top: 0, right: 0 },
        { bottom: 0, left: 0 },
        { bottom: 0, right: 0 },
      ].map((pos, i) => (
        <RNAnimated.View key={i} style={[s.corner, pos, { borderColor, pointerEvents: "none" }]} />
      ))}
      {scanning && (
        <RNAnimated.View
          style={[
            s.scanLine,
            {
              top: corner.interpolate({ inputRange: [0, 1], outputRange: [0, FRAME_SIZE - 2] }),
              pointerEvents: "none",
            },
          ]}
        />
      )}
    </View>
  );
}

function categoryIcon(cat: string): React.ComponentProps<typeof Ionicons>["name"] {
  const map: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
    food: "restaurant", plant: "leaf", animal: "paw", place: "location",
    product: "bag-handle", person: "person", artwork: "image",
    text: "document-text", object: "cube", other: "help-circle",
  };
  return map[cat] ?? "help-circle";
}

function ConfidenceBadge({ level }: { level: string }) {
  const color = level === "high" ? "#34C759" : level === "medium" ? "#FF9F0A" : "#FF453A";
  return (
    <View style={[s.badge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
      <View style={[s.badgeDot, { backgroundColor: color }]} />
      <Text style={[s.badgeText, { color }]}>
        {level === "high" ? "High confidence" : level === "medium" ? "Medium confidence" : "Low confidence"}
      </Text>
    </View>
  );
}

export default function AfuLensApp() {
  const insets   = useSafeAreaInsets();
  const { colors } = useTheme();
  const { navigateOutside } = useSuperApp();
  const cameraRef = useRef<any>(null);

  const [permission, requestPermission] = useCameraPermissions();

  const [facing,   setFacing]   = useState<"back" | "front">("back");
  const [scanning, setScanning] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<LensResult | null>(null);
  const [preview,  setPreview]  = useState<string | null>(null);
  const [query,    setQuery]    = useState("");
  const [error,    setError]    = useState<string | null>(null);

  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [capturedMime,   setCapturedMime]   = useState<string>("image/jpeg");
  const [lensHistory, setLensHistory] = useState<Array<{ q: string; a: string }>>([]);
  const [moreQuery,   setMoreQuery]   = useState("");
  const [moreLoading, setMoreLoading] = useState(false);
  const moreInputRef = useRef<any>(null);

  const sheetY = useRef(new RNAnimated.Value(SH)).current;

  function showSheet() {
    RNAnimated.spring(sheetY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }
  function hideSheet() {
    RNAnimated.timing(sheetY, { toValue: SH, duration: 280, useNativeDriver: true }).start(() => {
      setResult(null); setPreview(null); setError(null);
      setLensHistory([]); setMoreQuery("");
    });
  }

  async function analyze(base64: string, mime: string) {
    setLoading(true); setScanning(true); setError(null);
    setCapturedBase64(base64); setCapturedMime(mime); setLensHistory([]);
    try {
      const body: Record<string, string> = { imageBase64: base64, mimeType: mime };
      if (query.trim()) body.query = query.trim();
      const res  = await fetch(`${getEdgeFnBase()}/ai-lens`, {
        method: "POST", headers: edgeHeaders(), body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setResult(data as LensResult);
      showSheet();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message || "Analysis failed. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false); setScanning(false);
    }
  }

  async function captureNative() {
    if (!cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (!photo?.base64) throw new Error("No image data");
      setPreview(photo.uri);
      await analyze(photo.base64, "image/jpeg");
    } catch (e: any) { setError(e.message || "Could not capture photo"); }
  }

  async function askMoreInLens() {
    const q = moreQuery.trim();
    if (!q || !capturedBase64 || moreLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMoreLoading(true); setMoreQuery("");
    try {
      const res  = await fetch(`${getEdgeFnBase()}/ai-lens`, {
        method: "POST", headers: edgeHeaders(),
        body: JSON.stringify({ imageBase64: capturedBase64, mimeType: capturedMime, query: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setLensHistory(prev => [...prev, { q, a: data.answer || data.description || "No answer found." }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setLensHistory(prev => [...prev, { q, a: `Could not answer: ${e.message}` }]);
    } finally { setMoreLoading(false); }
  }

  const needsPermission = !permission?.granted;

  if (needsPermission) {
    return (
      <View style={[s.permScreen, { backgroundColor: colors.background }]}>
        <View style={s.permInner}>
          <SafeGrad colors={[BRAND, BRAND2]} style={s.permIcon}>
            <Ionicons name="scan" size={48} color="#fff" />
          </SafeGrad>
          <Text style={[s.permTitle, { color: colors.text }]}>Camera Access Needed</Text>
          <Text style={[s.permSub, { color: colors.textSecondary }]}>
            AfuLab AI Lens needs your camera to identify objects, places, food, and more.
          </Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission} activeOpacity={0.85}>
            <Text style={s.permBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={StyleSheet.absoluteFill}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
      </View>

      <View style={[s.topControls, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          style={s.controlBtn}
          onPress={() => setFacing(f => f === "back" ? "front" : "back")}
          hitSlop={12}
        >
          <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[s.frameContainer, { pointerEvents: "none" }]}>
        <ScanFrame scanning={scanning || loading} />
        <Text style={s.frameHint}>
          {loading ? "Analyzing…" : "Point at anything to identify it"}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={undefined}
        style={s.bottomArea}
        keyboardVerticalOffset={0}
      >
        <View style={s.queryRow}>
          <View style={s.queryInput}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="rgba(255,255,255,0.6)" style={{ marginRight: 8 }} />
            <TextInput
              style={s.queryText}
              placeholder="Ask something specific… (optional)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              onSubmitEditing={captureNative}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {error && (
          <View style={s.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#FF453A" />
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)} hitSlop={8}>
              <Ionicons name="close" size={14} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        )}

        <View style={[s.captureRow, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[s.captureBtn, loading && s.captureBtnDisabled]}
            onPress={captureNative}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <View style={s.captureBtnInner}><Ionicons name="scan" size={28} color="#fff" /></View>
            }
          </TouchableOpacity>
          {result ? (
            <TouchableOpacity style={s.sideBtn} onPress={showSheet} activeOpacity={0.8}>
              <Ionicons name="list-outline" size={24} color="#fff" />
              <Text style={s.sideBtnText}>Results</Text>
            </TouchableOpacity>
          ) : <View style={{ width: 72 }} />}
        </View>
      </KeyboardAvoidingView>

      {result && (
        <RNAnimated.View style={[s.sheet, { transform: [{ translateY: sheetY }] }]}>
          <TouchableOpacity style={s.sheetHandle} onPress={hideSheet} activeOpacity={0.7}>
            <View style={s.handleBar} />
          </TouchableOpacity>

          <ScrollView
            style={s.sheetScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
            keyboardShouldPersistTaps="handled"
          >
            {preview && (
              <Image source={{ uri: preview }} style={s.previewThumb} resizeMode="cover" />
            )}

            <View style={s.resultHeader}>
              <View style={s.resultCatBadge}>
                <Ionicons name={categoryIcon(result.category)} size={16} color={BRAND} />
                <Text style={s.resultCatText}>{result.category}</Text>
              </View>
              <Text style={s.resultTitle}>{result.title}</Text>
              <ConfidenceBadge level={result.confidence} />
            </View>

            <Text style={s.resultDesc}>{result.description}</Text>

            {result.answer && (
              <View style={s.answerBox}>
                <View style={s.answerHeader}>
                  <Ionicons name="chatbubble-ellipses" size={14} color={BRAND} />
                  <Text style={s.answerHeaderText}>Lens Analysis</Text>
                </View>
                <Text style={s.answerText}>{result.answer}</Text>
              </View>
            )}

            {result.facts?.length > 0 && (
              <View style={s.factsSection}>
                <Text style={s.sectionLabel}>Key Facts</Text>
                {result.facts.map((fact, i) => (
                  <View key={i} style={s.factRow}>
                    <View style={s.factDot} />
                    <Text style={s.factText}>{fact}</Text>
                  </View>
                ))}
              </View>
            )}

            {lensHistory.length > 0 && (
              <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                <Text style={[s.sectionLabel, { marginBottom: 10 }]}>Your Questions</Text>
                {lensHistory.map((item, i) => (
                  <View key={i} style={{
                    marginBottom: 10, backgroundColor: BRAND_BG, borderRadius: 14,
                    padding: 12, borderLeftWidth: 3, borderLeftColor: BRAND,
                  }}>
                    <Text style={{ fontSize: 13, color: BRAND, fontFamily: "Inter_600SemiBold", marginBottom: 4 }}>
                      Q: {item.q}
                    </Text>
                    <Text style={{ fontSize: 13, lineHeight: 19, color: "rgba(255,255,255,0.85)", paddingLeft: 8 }}>
                      {item.a}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {capturedBase64 && (
              <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                <Text style={[s.sectionLabel, { marginBottom: 8 }]}>Ask more about this</Text>
                <View style={{
                  flexDirection: "row", gap: 8, alignItems: "flex-end",
                  backgroundColor: BRAND_BG, borderRadius: 26,
                  borderWidth: 1, borderColor: BRAND + "40",
                  paddingHorizontal: 14, paddingVertical: 6,
                  shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
                }}>
                  <TextInput
                    ref={moreInputRef}
                    style={{ flex: 1, fontSize: 14, color: "#fff", paddingVertical: 8, maxHeight: 80, lineHeight: 20 }}
                    placeholder={`e.g. "What is it made of?"`}
                    placeholderTextColor="#999"
                    value={moreQuery}
                    onChangeText={setMoreQuery}
                    multiline
                    blurOnSubmit={false}
                    onSubmitEditing={askMoreInLens}
                    returnKeyType="send"
                    editable={!moreLoading}
                  />
                  <TouchableOpacity
                    onPress={askMoreInLens}
                    disabled={!moreQuery.trim() || moreLoading}
                    activeOpacity={0.75}
                    style={{
                      backgroundColor: (!moreQuery.trim() || moreLoading) ? "#555" : BRAND,
                      borderRadius: 12, padding: 9, marginBottom: 2,
                    }}
                  >
                    {moreLoading
                      ? <ActivityIndicator size={16} color="#fff" />
                      : <Ionicons name="arrow-up" size={16} color="#fff" />
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Powered by Engagera */}
            <TouchableOpacity
              style={s.poweredRow}
              onPress={() => Linking.openURL("https://engagera.afuchat.com")}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Ionicons name="sparkles" size={10} color="rgba(255,255,255,0.35)" />
              <Text style={s.poweredText}>Powered by Engagera</Text>
            </TouchableOpacity>

            <View style={s.aiDisclaimerRow}>
              <Ionicons name="information-circle-outline" size={12} color="rgba(255,255,255,0.4)" />
              <Text style={s.aiDisclaimerText}>AI can make mistakes. Double-check important information.</Text>
            </View>

            <View style={s.actions}>
              <TouchableOpacity
                style={[s.actionBtn, s.actionBtnPrimary]}
                onPress={() => { hideSheet(); setQuery(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.85}
              >
                <Ionicons name="scan" size={16} color="#fff" />
                <Text style={s.actionBtnPrimaryText}>Scan Again</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.actionBtn, { flex: 1 }]}
                onPress={async () => {
                  if (!result) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  hideSheet();
                  try {
                    await AsyncStorage.setItem("afuai_lens_context", JSON.stringify({
                      title: result.title, description: result.description,
                      category: result.category, confidence: result.confidence,
                      facts: result.facts || [], answer: result.answer || "",
                      history: lensHistory, imagePreview: preview ?? undefined,
                      searchQuery: result.searchQuery,
                      expiresAt: Date.now() + 30 * 60 * 1000,
                    }));
                  } catch {}
                  navigateOutside("/ai", { lensIntro: "true" });
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="sparkles-outline" size={16} color={BRAND} />
                <Text style={[s.actionBtnText, { color: BRAND }]}>
                  {lensHistory.length > 0 ? "Continue in AfuAI" : "Ask AfuAI"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </RNAnimated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  permScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  permInner: { alignItems: "center", gap: 16, maxWidth: 320 },
  permIcon: { width: 100, height: 100, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  permTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  permSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  permBtn: { backgroundColor: BRAND, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8, width: "100%" as any, alignItems: "center" },
  permBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  topControls: { position: "absolute", top: 0, right: 16, zIndex: 10, paddingTop: 8 },
  controlBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  camLoading: { backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 10 },
  camLoadingText: { color: "#fff", fontSize: 14 },
  frameContainer: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 40, marginBottom: 160 },
  frameHint: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 20, textAlign: "center", letterSpacing: 0.2 },
  corner: { position: "absolute", width: 26, height: 26, borderWidth: 3 },
  scanLine: { position: "absolute", left: 0, right: 0, height: 2, backgroundColor: BRAND, opacity: 0.85 },
  bottomArea: { position: "absolute", bottom: 0, left: 0, right: 0 },
  queryRow: { paddingHorizontal: 16, paddingBottom: 8 },
  queryInput: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  queryText: { flex: 1, color: "#fff", fontSize: 14, fontFamily: "Inter_400Regular" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: "rgba(255,69,58,0.15)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(255,69,58,0.3)" },
  errorText: { flex: 1, color: "#FF453A", fontSize: 13, fontFamily: "Inter_400Regular" },
  captureRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28, paddingHorizontal: 32 },
  captureBtn: { width: 76, height: 76, borderRadius: 38, backgroundColor: BRAND, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: "rgba(255,255,255,0.3)" },
  captureBtnDisabled: { opacity: 0.5 },
  captureBtnInner: { alignItems: "center", justifyContent: "center" },
  sideBtn: { alignItems: "center", gap: 4, width: 60 },
  sideBtnText: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontFamily: "Inter_500Medium" },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sheet: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#1A1A1A", borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetHandle: { paddingVertical: 12, alignItems: "center" },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  sheetScroll: { flex: 1 },
  previewThumb: { width: "100%", height: 160, marginBottom: 16 },
  resultHeader: { paddingHorizontal: 16, marginBottom: 12, gap: 8 },
  resultCatBadge: { flexDirection: "row", alignItems: "center", gap: 6 },
  resultCatText: { color: BRAND, fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  resultTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", lineHeight: 28 },
  resultDesc: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, paddingHorizontal: 16, marginBottom: 16 },
  answerBox: { marginHorizontal: 16, marginBottom: 16, backgroundColor: BRAND_BG, borderRadius: 14, padding: 14, borderLeftWidth: 3, borderLeftColor: BRAND },
  answerHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  answerHeaderText: { color: BRAND, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  answerText: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  factsSection: { marginHorizontal: 16, marginBottom: 16 },
  sectionLabel: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 },
  factRow: { flexDirection: "row", gap: 10, marginBottom: 8, alignItems: "flex-start" },
  factDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND, marginTop: 7 },
  factText: { flex: 1, color: "rgba(255,255,255,0.8)", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  actions: { flexDirection: "row", gap: 10, marginHorizontal: 16, marginBottom: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  actionBtnPrimary: { backgroundColor: BRAND, borderColor: BRAND },
  actionBtnPrimaryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  poweredRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: 16, marginBottom: 4, marginTop: 4,
  },
  poweredText: { fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "Inter_400Regular" },
  aiDisclaimerRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 5,
    marginHorizontal: 16, marginBottom: 12,
  },
  aiDisclaimerText: {
    flex: 1, fontSize: 11, color: "rgba(255,255,255,0.4)",
    fontFamily: "Inter_400Regular", lineHeight: 15,
  },
});
