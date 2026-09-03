import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import { LANG_LABELS, BUNDLED_UI_LANGUAGES } from "@/lib/i18n";
import AfuLogo from "@/components/ui/AfuLogo";
import OnboardingBackdrop from "@/components/onboarding/OnboardingBackdrop";

const FLAGS: Record<string, string> = {
  en: "🇬🇧", zh: "🇨🇳", es: "🇪🇸", fr: "🇫🇷", ar: "🇸🇦", sw: "🇰🇪",
  am: "🇪🇹", rw: "🇷🇼",
};

const LANGUAGES = BUNDLED_UI_LANGUAGES
  .filter((code) => Boolean(FLAGS[code]))
  .map((code) => ({
    code,
    name: LANG_LABELS[code],
    flag: FLAGS[code],
  }));

type LanguageSelectionStepProps = {
  onComplete: () => void;
};

export default function LanguageSelectionStep({ onComplete }: LanguageSelectionStepProps) {
  const insets = useSafeAreaInsets();
  const { setPreferredLang, t } = useLanguage();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(278);
  const continueLabel = selected ? t("Continue") : t("Choose a language");

  function selectLanguage(code: string) {
    setSelected(code);
    // Apply the language immediately so this screen updates as soon as the
    // user selects an option. The provider handles persistence and sync.
    void setPreferredLang(code);
  }

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
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <OnboardingBackdrop />

      <View
        style={[styles.header, { paddingTop: insets.top + 24 }]}
        onLayout={(event) => {
          const measuredHeight = Math.ceil(event.nativeEvent.layout.height);
          if (measuredHeight > 0 && measuredHeight !== headerHeight) {
            setHeaderHeight(measuredHeight);
          }
        }}
      >
        <View style={styles.headerInner}>
          <View style={styles.brandRow}>
            <AfuLogo size={24} forceTheme="dark" />
            <Text style={styles.brandText}>AfuChat</Text>
          </View>

          <View style={styles.hero}>
            <View style={styles.globeBadge}>
              <Svg width={25} height={25} viewBox="0 0 25 25" accessibilityLabel="Language">
                <Circle cx="12.5" cy="12.5" r="9.5" stroke="#A9C9FF" strokeWidth="1.4" fill="none" />
                <Ellipse cx="12.5" cy="12.5" rx="4.2" ry="9.5" stroke="#A9C9FF" strokeWidth="1.2" fill="none" />
                <Path d="M3.5 12.5h18M5.4 7.6h14.2M5.4 17.4h14.2" stroke="#A9C9FF" strokeWidth="1.1" fill="none" />
              </Svg>
            </View>
            <Text style={styles.title}>{t("Choose your language")}</Text>
            <Text style={styles.subtitle}>
              {t("Select the language you understand best. We will use it to make your AfuChat experience easier to follow.")}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.languageScrollContent,
          {
            paddingTop: headerHeight + 12,
            paddingBottom: 28,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.languageList}>
          {LANGUAGES.map((language) => {
            const isSelected = selected === language.code;
            return (
              <Pressable
                key={language.code}
                onPress={() => selectLanguage(language.code)}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                style={({ pressed }) => [
                  styles.languageRow,
                  isSelected && styles.languageRowSelected,
                  pressed && styles.languageRowPressed,
                ]}
              >
                <View style={[styles.badgeBubble, isSelected && styles.badgeBubbleSelected]}>
                  <Text style={styles.flag}>{language.flag}</Text>
                </View>
                <View style={styles.languageInfo}>
                  <Text style={[styles.languageName, isSelected && styles.languageNameSelected]}>
                    {language.name}
                  </Text>
                </View>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.bottomFooter, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Pressable
          onPress={continueSelection}
          disabled={!selected || saving}
          style={({ pressed }) => [
            styles.continueButton,
            !selected && styles.continueButtonDisabled,
            pressed && selected && styles.continueButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !selected || saving }}
          accessibilityLabel={selected ? continueLabel : t("Choose a language")}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={[styles.continueText, !selected && styles.continueTextDisabled]}>
                {continueLabel}
              </Text>
              <Text style={[styles.continueArrow, !selected && styles.continueTextDisabled]}>→</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.requiredHint}>
          {selected ? t("You can change this later in Settings.") : t("Select one option to continue.")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000", overflow: "hidden" },
  scroll: { flex: 1 },
  languageScrollContent: { paddingHorizontal: 22 },
  header: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, elevation: 10,
    paddingTop: 24, paddingHorizontal: 22, backgroundColor: "rgba(0,0,0,0.34)",
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: "hidden",
  },
  headerInner: { width: "100%", maxWidth: 560, alignSelf: "center" },
  bottomFooter: {
    alignItems: "center",
    paddingTop: 8, paddingHorizontal: 22, backgroundColor: "transparent",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandText: { color: "#FFFFFF", fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  hero: { alignItems: "center", marginTop: 26, marginBottom: 16 },
  globeBadge: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(52,125,255,0.18)",
    borderWidth: 1, borderColor: "rgba(145,194,255,0.42)", alignItems: "center",
    justifyContent: "center", marginBottom: 18,
  },
  title: { color: "#FFFFFF", fontSize: 28, lineHeight: 34, textAlign: "center", fontFamily: "Inter_700Bold", letterSpacing: -0.7 },
  subtitle: { maxWidth: 440, color: "rgba(255,255,255,0.62)", fontSize: 14, lineHeight: 21, textAlign: "center", fontFamily: "Inter_400Regular", marginTop: 11 },
  languageList: { width: "100%", maxWidth: 560, alignSelf: "center", gap: 10 },
  languageRow: {
    minHeight: 64, flexDirection: "row", alignItems: "center", paddingHorizontal: 12,
    borderRadius: 999, backgroundColor: "rgba(255,255,255,0.085)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
    ...Platform.select({
      ios: { shadowColor: "#000000", shadowOpacity: 0.20, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 4 },
      web: { boxShadow: "0 6px 16px rgba(0,0,0,0.20)" } as any,
    }),
  },
  languageRowSelected: {
    backgroundColor: "rgba(30,126,255,0.22)", borderColor: "rgba(125,190,255,0.88)",
    ...Platform.select({
      ios: { shadowColor: "#167EFF", shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 7 },
      web: { boxShadow: "0 7px 20px rgba(22,126,255,0.24)" } as any,
    }),
  },
  languageRowPressed: { opacity: 0.76 },
  badgeBubble: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.11)",
    alignItems: "center", justifyContent: "center",
  },
  badgeBubbleSelected: { backgroundColor: "rgba(113,183,255,0.23)" },
  flag: { fontSize: 23, lineHeight: 26 },
  languageInfo: { flex: 1, marginLeft: 10 },
  languageName: { color: "rgba(255,255,255,0.88)", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  languageNameSelected: { color: "#FFFFFF" },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.34)", alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: "#72B5FF", backgroundColor: "rgba(114,181,255,0.13)" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: "#72B5FF" },
  continueButton: {
    width: "100%", maxWidth: 560, minHeight: 54, alignSelf: "center", borderRadius: 999,
    backgroundColor: "#167EFF", flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: "#167EFF", shadowOpacity: 0.42, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 7 },
      web: { boxShadow: "0 6px 22px rgba(22,126,255,0.35)" } as any,
    }),
  },
  continueButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.12)",
    ...Platform.select({
      ios: { shadowOpacity: 0 },
      android: { elevation: 0 },
      web: { boxShadow: "none" } as any,
    }),
  },
  continueButtonPressed: { opacity: 0.84 },
  continueText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_700Bold" },
  continueTextDisabled: { color: "rgba(255,255,255,0.38)" },
  continueArrow: { color: "#FFFFFF", fontSize: 21, lineHeight: 24, fontFamily: "Inter_700Bold" },
  requiredHint: { color: "rgba(255,255,255,0.38)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 10 },
});