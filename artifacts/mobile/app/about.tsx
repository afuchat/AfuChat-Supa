import React from "react";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { AfuLogo } from "@/components/ui/AfuLogo";
import Colors from "@/constants/colors";
import Constants from "expo-constants";

const VERSION = Constants.expoConfig?.version ?? "2.2.5";
const BUILD   = (Constants.expoConfig?.android as any)?.versionCode
  ? String((Constants.expoConfig?.android as any).versionCode)
  : "232";

const ACCENT = Colors.brand;

const FEATURES = [
  { icon: "chatbubbles",   label: "Messaging",    desc: "End-to-end encrypted chats, voice & video calls" },
  { icon: "film",          label: "Video & Reels", desc: "Short videos, Shorts, Duets & live streaming" },
  { icon: "sparkles",      label: "AfuAI",        desc: "AI chat assistant, image generation & smart replies" },
  { icon: "wallet",        label: "Wallet",       desc: "ACoins, peer transfers, Red Envelopes & gifts" },
  { icon: "storefront",    label: "Market",       desc: "Buy & sell goods, services and freelance work" },
  { icon: "people",        label: "Community",    desc: "Groups, channels, communities & AfuMatch" },
] as const;

const STATS = [
  { value: "2M+",  label: "Users"      },
  { value: "190+", label: "Countries"  },
  { value: "50M+", label: "Messages/day" },
] as const;

const LINKS = [
  { icon: "document-text", label: "Terms of Service",   onPress: () => Linking.openURL("https://afuchat.com/terms").catch(() => {}) },
  { icon: "shield",        label: "Privacy Policy",     onPress: () => Linking.openURL("https://afuchat.com/privacy").catch(() => {}) },
  { icon: "help-buoy",     label: "Help & Support",     onPress: () => router.push("/support" as any) },
  { icon: "globe",         label: "Visit afuchat.com",  onPress: () => Linking.openURL("https://afuchat.com").catch(() => {}) },
  { icon: "mail",          label: "Contact Us",         onPress: () => Linking.openURL("mailto:hello@afuchat.com").catch(() => {}) },
] as const;

export default function AboutScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader
        title="About"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/settings" as any))}
      />

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero card ─────────────────────────────────────────────────── */}
        <View style={[s.heroCard, { backgroundColor: colors.card }]}>
          <LinearGradient
            colors={isDark
              ? ["rgba(31,149,255,0.10)", "transparent"]
              : ["rgba(31,149,255,0.06)", "transparent"]}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <AfuLogo size={88} />

          <View style={s.wordmark}>
            <Text style={[s.wordAfu,  { color: colors.text }]}>Afu</Text>
            <Text style={[s.wordChat, { color: ACCENT }]}>Chat</Text>
          </View>

          <View style={[s.versionBadge, { backgroundColor: ACCENT + "18", borderColor: ACCENT + "40" }]}>
            <Text style={[s.versionText, { color: ACCENT }]}>
              v{VERSION}  ·  Build {BUILD}
            </Text>
          </View>

          <Text style={[s.tagline, { color: colors.textMuted }]}>
            Connect · Discover · Create
          </Text>

          <Text style={[s.missionText, { color: colors.textSecondary }]}>
            A super-app built for Africa and the world — messaging, video, AI, marketplace and digital payments all in one place.
          </Text>
        </View>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <View style={s.statsRow}>
          {STATS.map(({ value, label }) => (
            <View key={label} style={[s.statBox, { backgroundColor: colors.card }]}>
              <Text style={[s.statValue, { color: ACCENT }]}>{value}</Text>
              <Text style={[s.statLabel, { color: colors.textMuted }]}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Features ──────────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { color: colors.textMuted }]}>FEATURES</Text>
        <View style={s.featuresGrid}>
          {FEATURES.map(({ icon, label, desc }) => (
            <View key={label} style={[s.featureCard, { backgroundColor: colors.card }]}>
              <View style={[s.featureIconBox, { backgroundColor: ACCENT + "15" }]}>
                <Ionicons name={icon as any} size={22} color={ACCENT} />
              </View>
              <Text style={[s.featureLabel, { color: colors.text }]}>{label}</Text>
              <Text style={[s.featureDesc,  { color: colors.textMuted }]}>{desc}</Text>
            </View>
          ))}
        </View>

        {/* ── Company ───────────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { color: colors.textMuted }]}>COMPANY</Text>
        <View style={[s.companyCard, { backgroundColor: colors.card }]}>
          {[
            { label: "Legal name",  value: "AfuChat Technologies Limited" },
            { label: "Founded",     value: "2023" },
            { label: "Headquarters", value: "Entebbe, Uganda" },
            { label: "Website",     value: "afuchat.com" },
          ].map(({ label, value }, i, arr) => (
            <React.Fragment key={label}>
              <View style={s.companyRow}>
                <Text style={[s.companyLabel, { color: colors.textMuted }]}>{label}</Text>
                <Text style={[s.companyValue, { color: colors.text }]}>{value}</Text>
              </View>
              {i < arr.length - 1 && (
                <View style={[s.companyDivider, { backgroundColor: colors.separator }]} />
              )}
            </React.Fragment>
          ))}
        </View>

        {/* ── Links ─────────────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { color: colors.textMuted }]}>LEGAL & SUPPORT</Text>
        <View style={[s.linksCard, { backgroundColor: colors.card }]}>
          {LINKS.map(({ icon, label, onPress }, i) => (
            <React.Fragment key={label}>
              {i > 0 && <View style={[s.linkDivider, { backgroundColor: colors.separator }]} />}
              <TouchableOpacity style={s.linkRow} onPress={onPress} activeOpacity={0.7}>
                <View style={[s.linkIconBox, { backgroundColor: ACCENT + "15" }]}>
                  <Ionicons name={icon as any} size={18} color={ACCENT} />
                </View>
                <Text style={[s.linkLabel, { color: colors.text }]}>{label}</Text>
                <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* ── Built with ────────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { color: colors.textMuted }]}>BUILT WITH</Text>
        <View style={[s.techCard, { backgroundColor: colors.card }]}>
          {[
            ["React Native / Expo", "Mobile framework"],
            ["Supabase", "Auth, realtime & database"],
            ["Cloudflare R2", "Media storage"],
            ["Groq + OpenAI", "AI engine"],
            ["Pesapal", "Payments gateway"],
          ].map(([tech, role], i, arr) => (
            <React.Fragment key={tech}>
              <View style={s.techRow}>
                <Text style={[s.techName,  { color: colors.text }]}>{tech}</Text>
                <Text style={[s.techRole,  { color: colors.textMuted }]}>{role}</Text>
              </View>
              {i < arr.length - 1 && (
                <View style={[s.companyDivider, { backgroundColor: colors.separator }]} />
              )}
            </React.Fragment>
          ))}
        </View>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <View style={s.footer}>
          <View style={s.footerLogo}>
            <AfuLogo size={20} />
            <Text style={[s.wordAfu,  { color: colors.textMuted, fontSize: 14 }]}>Afu</Text>
            <Text style={[s.wordChat, { color: ACCENT, fontSize: 14 }]}>Chat</Text>
          </View>
          <Text style={[s.copyright, { color: colors.textMuted }]}>
            © {new Date().getFullYear()} AfuChat Technologies Limited
          </Text>
          <Text style={[s.copyright, { color: colors.textMuted }]}>
            All rights reserved. Made with ♥ in Uganda.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },

  heroCard: {
    borderRadius: 24, alignItems: "center", padding: 28, gap: 8,
    marginBottom: 8, overflow: "hidden",
  },
  wordmark: { flexDirection: "row", alignItems: "baseline" },
  wordAfu:  { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  wordChat: { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  versionBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 4 },
  versionText:  { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },
  tagline:    { fontSize: 14, fontFamily: "Inter_400Regular", letterSpacing: 1 },
  missionText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center", marginTop: 4, maxWidth: 300 },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statBox:  { flex: 1, borderRadius: 16, alignItems: "center", paddingVertical: 16, gap: 2 },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },

  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginTop: 8, marginBottom: 6, paddingHorizontal: 4 },

  featuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  featureCard:  { borderRadius: 16, padding: 14, gap: 6, width: "48.5%" },
  featureIconBox: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  featureLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  featureDesc:  { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },

  companyCard:    { borderRadius: 16, overflow: "hidden", marginBottom: 8 },
  companyRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13 },
  companyLabel:   { fontSize: 13, fontFamily: "Inter_400Regular" },
  companyValue:   { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right", flex: 1, marginLeft: 8 },
  companyDivider: { height: 0.5, marginHorizontal: 16 },

  linksCard:    { borderRadius: 16, overflow: "hidden", marginBottom: 8 },
  linkRow:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  linkDivider:  { height: 0.5, marginHorizontal: 16 },
  linkIconBox:  { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  linkLabel:    { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },

  techCard: { borderRadius: 16, overflow: "hidden", marginBottom: 8 },
  techRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  techName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  techRole: { fontSize: 12, fontFamily: "Inter_400Regular" },

  footer:     { alignItems: "center", paddingVertical: 24, gap: 6 },
  footerLogo: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  copyright:  { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
});
