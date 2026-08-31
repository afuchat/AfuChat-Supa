import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import { LANG_LABELS } from "@/lib/translate";
import Image from "@/components/ui/OptimizedImage";

const PLATFORM_LOGO = require("@/assets/images/icon.png");

const FLAGS: Record<string, string> = {
  en: "🇬🇧", zh: "🇨🇳", es: "🇪🇸", fr: "🇫🇷", ar: "🇸🇦", hi: "🇮🇳",
  pt: "🇧🇷", ru: "🇷🇺", ja: "🇯🇵", de: "🇩🇪", sw: "🇰🇪", ko: "🇰🇷",
  it: "🇮🇹", tr: "🇹🇷", nl: "🇳🇱", pl: "🇵🇱", th: "🇹🇭", vi: "🇻🇳",
  id: "🇮🇩", ms: "🇲🇾", fil: "🇵🇭", uk: "🇺🇦", ro: "🇷🇴", el: "🇬🇷",
  cs: "🇨🇿", sv: "🇸🇪", da: "🇩🇰", no: "🇳🇴", fi: "🇫🇮", he: "🇮🇱",
  bn: "🇧🇩", ta: "🇮🇳", ur: "🇵🇰", fa: "🇮🇷", am: "🇪🇹",
};

const LANGUAGES = Object.entries(LANG_LABELS).map(([code, name]) => ({
  code,
  name,
  flag: FLAGS[code] ?? "🌐",
}));

type LanguageSelectionStepProps = {
  onComplete: () => void;
};

export default function LanguageSelectionStep({ onComplete }: LanguageSelectionStepProps) {
  const insets = useSafeAreaInsets();
  const { setPreferredLang, t } = useLanguage();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedLanguage = useMemo(
    () => LANGUAGES.find((language) => language.code === selected),
    [selected],
  );

  async function continueSelection() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await setPreferredLang(selected);
    } catch {
      // The local preference is written before optional remote profile sync.
    } finally {
      setSaving(false);
      onComplete();
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#111A54", "#050713", "#000000"]}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb, styles.orbBlue]} />
      <View style={[styles.orb, styles.orbPurple]} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 28,
            paddingBottom: selected
              ? 150 + Math.max(insets.bottom, 20)
              : Math.max(insets.bottom, 20) + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <Image source={PLATFORM_LOGO} style={styles.brandLogo} />
          <Text style={styles.brandText}>AfuChat</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.globeBadge}>
            <Ionicons name="globe-outline" size={28} color="#88B7FF" />
          </View>
          <Text style={styles.title}>Choose your language</Text>
          <Text style={styles.subtitle}>
            Select the language you understand best. We will use it to make your
            AfuChat experience easier to follow.
          </Text>
        </View>

        <View style={styles.languageList}>
          {LANGUAGES.map((language) => {
            const isSelected = selected === language.code;
            return (
              <Pressable
                key={language.code}
                onPress={() => setSelected(language.code)}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                style={({ pressed }) => [
                  styles.languageRow,
                  isSelected && styles.languageRowSelected,
                  pressed && styles.languageRowPressed,
                ]}
              >
                <View style={styles.flagBubble}>
                  <Text style={styles.flag}>{language.flag}</Text>
                </View>
                <View style={styles.languageInfo}>
                  <Text style={[styles.languageName, isSelected && styles.languageNameSelected]}>
                    {language.name}
                  </Text>
                  <Text style={styles.languageCode}>{language.code.toUpperCase()}</Text>
                </View>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {selected && (
        <View style={[styles.bottomFooter, { paddingBottom: Math.max(insets.bottom, 20) + 14 }]}>
          <Pressable
            onPress={continueSelection}
            disabled={saving}
            style={({ pressed }) => [
              styles.continueButton,
              pressed && styles.continueButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${t("Continue with")} ${selectedLanguage?.name ?? t("selected language")}`}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.continueText}>Continue</Text>
                <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
              </>
            )}
          </Pressable>
          <Text style={styles.requiredHint}>You can change this later in Settings.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  content: { flexGrow: 1, paddingHorizontal: 22 },
  orb: { position: "absolute", borderRadius: 999, opacity: 0.15 },
  orbBlue: { width: 260, height: 260, top: -120, right: -85, backgroundColor: "#2D5BFF" },
  orbPurple: { width: 200, height: 200, top: 210, left: -120, backgroundColor: "#873DCE" },
  bottomFooter: {
    position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center",
    paddingTop: 14, paddingHorizontal: 22, backgroundColor: "rgba(5,7,19,0.92)",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandLogo: { width: 30, height: 30, borderRadius: 9 },
  brandText: { color: "#FFFFFF", fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  hero: { alignItems: "center", marginTop: 42, marginBottom: 26 },
  globeBadge: {
    width: 66, height: 66, borderRadius: 33, backgroundColor: "rgba(52,125,255,0.16)",
    borderWidth: 1, borderColor: "rgba(125,180,255,0.34)", alignItems: "center",
    justifyContent: "center", marginBottom: 18,
  },
  title: { color: "#FFFFFF", fontSize: 29, lineHeight: 36, textAlign: "center", fontFamily: "Inter_700Bold", letterSpacing: -0.7 },
  subtitle: { maxWidth: 440, color: "rgba(255,255,255,0.62)", fontSize: 15, lineHeight: 22, textAlign: "center", fontFamily: "Inter_400Regular", marginTop: 12 },
  languageList: { width: "100%", maxWidth: 560, alignSelf: "center", gap: 12 },
  languageRow: {
    minHeight: 70, flexDirection: "row", alignItems: "center", paddingHorizontal: 13,
    borderRadius: 22, backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.16)",
    ...Platform.select({
      ios: { shadowColor: "#000000", shadowOpacity: 0.20, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 4 },
      web: { boxShadow: "0 6px 16px rgba(0,0,0,0.20)" } as any,
    }),
  },
  languageRowSelected: {
    backgroundColor: "rgba(29,140,255,0.20)", borderColor: "rgba(112,184,255,0.82)",
    ...Platform.select({
      ios: { shadowColor: "#167EFF", shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 7 },
      web: { boxShadow: "0 7px 20px rgba(22,126,255,0.24)" } as any,
    }),
  },
  languageRowPressed: { opacity: 0.76 },
  flag: { fontSize: 24 },
  flagBubble: { width: 44, height: 44, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.13)", alignItems: "center", justifyContent: "center" },
  languageInfo: { flex: 1, marginLeft: 10 },
  languageName: { color: "rgba(255,255,255,0.86)", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  languageNameSelected: { color: "#FFFFFF" },
  languageCode: { color: "rgba(255,255,255,0.42)", fontSize: 11, marginTop: 2, fontFamily: "Inter_500Medium", letterSpacing: 0.6 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.34)", alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: "#72B5FF" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: "#72B5FF" },
  continueButton: {
    width: "100%", maxWidth: 560, minHeight: 56, alignSelf: "center", borderRadius: 999,
    backgroundColor: "#167EFF", flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: "#167EFF", shadowOpacity: 0.42, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 7 },
      web: { boxShadow: "0 6px 22px rgba(22,126,255,0.35)" } as any,
    }),
  },
  continueButtonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  continueText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_700Bold" },
  requiredHint: { color: "rgba(255,255,255,0.38)", fontSize: 12, textAlign: "center", fontFamily: "Inter_400Regular", marginTop: 14 },
});