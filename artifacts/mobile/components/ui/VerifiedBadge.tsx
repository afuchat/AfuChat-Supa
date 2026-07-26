import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAppAccent } from "@/context/AppAccentContext";
import { useTheme } from "@/hooks/useTheme";

let _svgMod: any = null;
function getSvgMod() {
  if (_svgMod !== null) return _svgMod;
  try { _svgMod = require("react-native-svg"); } catch { _svgMod = {}; }
  return _svgMod;
}
function SvgComp(name: string) {
  return (props: any) => {
    const M = getSvgMod();
    const C = M[name] ?? M.default?.[name];
    if (!C) return null;
    return require("react").createElement(C, props);
  };
}
const Svg = (props: any) => {
  const M = getSvgMod();
  const C = M.default ?? M.Svg;
  if (!C) return null;
  return require("react").createElement(C, props);
};
const Circle = SvgComp("Circle");
const Path = SvgComp("Path");

function BadgeShape({ size, color }: { size: number; color: string }) {
  const M = getSvgMod();
  const hasSvg = !!(M.default ?? M.Svg);
  if (!hasSvg) {
    return (
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, alignItems: "center", justifyContent: "center",
      }}>
        <Text style={{ color: "#fff", fontSize: size * 0.55, fontWeight: "700" }}>✓</Text>
      </View>
    );
  }
  const r = size / 2;
  const sw = size * 0.13;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx="10" cy="10" r="9.2" fill={color} />
      <Path
        d="M5.8,10.2 L8.6,13 L14.2,7"
        stroke="#fff"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

type Props = {
  isVerified?: boolean;
  isOrganizationVerified?: boolean;
  size?: number;
};

export default function VerifiedBadge({
  isVerified,
  isOrganizationVerified,
  size = 14,
}: Props) {
  const { accent } = useAppAccent();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  const isOrg   = !!isOrganizationVerified;
  const isVerif = !!isVerified || isOrg;

  if (!isVerif) return null;

  const badgeColor = isOrg ? "#F5A623" : accent;

  const REASONS: { icon: string; label: string; premiumLink?: boolean }[] = isOrg
    ? [
        { icon: "business",        label: "Confirmed authentic business, brand, or organization" },
        { icon: "shield-checkmark", label: "Notable presence in its industry or community", premiumLink: true },
        { icon: "document-text",   label: "Compliant with AfuChat's community guidelines" },
      ]
    : [
        { icon: "person-circle",   label: "Confirmed authentic identity as a real person" },
        { icon: "star",            label: "Notable creator, public figure, or professional", premiumLink: true },
        { icon: "checkmark-done",  label: "Compliant with AfuChat's community guidelines" },
      ];

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
        hitSlop={10}
        style={{ marginLeft: 2 }}
      >
        <BadgeShape size={size} color={badgeColor} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={s.backdrop} onPress={() => setVisible(false)} />

        <View style={s.sheet}>
          <View style={[s.card, { backgroundColor: colors.surface }]}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />

            <View style={s.header}>
              <View style={[s.iconWrap, { backgroundColor: badgeColor + "18" }]}>
                <BadgeShape size={44} color={badgeColor} />
              </View>
              <Text style={[s.title, { color: colors.text }]}>
                {isOrg ? "Verified Organization" : "Verified Account"}
              </Text>
              <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                {isOrg
                  ? "AfuChat has confirmed this is an authentic business, brand, or organization."
                  : "AfuChat has confirmed this is an authentic account of a notable person or creator."}
              </Text>
            </View>

            <View style={[s.divider, { backgroundColor: colors.border }]} />

            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>
              VERIFICATION CRITERIA
            </Text>

            {REASONS.map((r, i) =>
              r.premiumLink ? (
                <TouchableOpacity
                  key={i}
                  style={[s.bulletRow, s.bulletRowTappable, { borderColor: badgeColor + "30", backgroundColor: badgeColor + "0C" }]}
                  activeOpacity={0.75}
                  onPress={() => { setVisible(false); router.push("/premium"); }}
                >
                  <View style={[s.bulletIcon, { backgroundColor: badgeColor + "28" }]}>
                    <Ionicons name={r.icon as any} size={15} color={badgeColor} />
                  </View>
                  <Text style={[s.bulletText, { color: colors.textSecondary, flex: 1 }]}>{r.label}</Text>
                  <View style={[s.premiumPill, { backgroundColor: badgeColor + "22" }]}>
                    <Ionicons name="diamond" size={10} color={badgeColor} />
                    <Text style={[s.premiumPillText, { color: badgeColor }]}>Premium</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View key={i} style={s.bulletRow}>
                  <View style={[s.bulletIcon, { backgroundColor: badgeColor + "18" }]}>
                    <Ionicons name={r.icon as any} size={15} color={badgeColor} />
                  </View>
                  <Text style={[s.bulletText, { color: colors.textSecondary }]}>{r.label}</Text>
                </View>
              )
            )}

            <View style={[s.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: badgeColor }]}
              activeOpacity={0.85}
              onPress={() => {
                setVisible(false);
                router.push(isOrg ? "/business-verification" : "/premium");
              }}
            >
              <Ionicons name={isOrg ? "business" : "ribbon"} size={16} color="#fff" />
              <Text style={s.ctaBtnText}>{isOrg ? "Apply for Verification" : "Get Verified"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.dismissBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.6}
            >
              <Text style={[s.dismissText, { color: colors.textMuted }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 16,
  },
  card: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 20,
    ...Platform.select({
      web: { boxShadow: "0 -4px 16px rgba(0,0,0,0.12)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 20 },
    }),
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  header: { alignItems: "center", gap: 10, marginBottom: 20 },
  iconWrap: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  divider: { height: 0.5, marginVertical: 16 },
  sectionLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.8, marginBottom: 12 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  bulletRowTappable: { borderRadius: 10, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 10, marginHorizontal: -4 },
  bulletIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 18 },
  premiumPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  premiumPillText: { fontSize: 10, fontWeight: "600" },
  ctaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 4 },
  ctaBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  dismissBtn: { alignItems: "center", paddingVertical: 14 },
  dismissText: { fontSize: 14 },
});
