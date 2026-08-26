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
        { icon: "storefront-outline",      label: "Business details confirmed" },
        { icon: "ribbon-outline",           label: "Recognized in its field" },
        { icon: "shield-checkmark-outline", label: "Follows AfuChat's guidelines" },
      ]
    : [
        { icon: "person-outline",          label: "Identity confirmed" },
        { icon: "sparkles-outline",        label: "Recognized public presence", premiumLink: true },
        { icon: "shield-checkmark-outline", label: "Follows AfuChat's guidelines" },
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
                <BadgeShape size={32} color={badgeColor} />
              </View>
              <View style={s.headerCopy}>
                <Text style={[s.title, { color: colors.text }]}>
                  {isOrg ? "Verified organization" : "Verified account"}
                </Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  {isOrg
                    ? "AfuChat confirmed this organization is authentic."
                    : "AfuChat confirmed this person is authentic."}
                </Text>
              </View>
            </View>

            <View style={[s.divider, { backgroundColor: colors.border }]} />

            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>
              WHY THIS BADGE
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

            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: badgeColor }]}
              activeOpacity={0.85}
              onPress={() => {
                setVisible(false);
                router.push(isOrg ? "/business-verification" : "/premium");
              }}
            >
              <Ionicons name={isOrg ? "storefront-outline" : "sparkles-outline"} size={15} color="#fff" />
              <Text style={s.ctaBtnText}>{isOrg ? "Apply for Verification" : "Get Verified"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.dismissBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.6}
            >
              <Ionicons name="close" size={16} color={colors.textMuted} />
              <Text style={[s.dismissText, { color: colors.textMuted }]}>Close</Text>
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
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    width: "100%",
    maxWidth: 370,
    borderRadius: 22,
    paddingTop: 9,
    paddingBottom: 7,
    paddingHorizontal: 16,
    ...Platform.select({
      web: { boxShadow: "0 -4px 16px rgba(0,0,0,0.12)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 20 },
    }),
  },
  handle: { width: 28, height: 3, borderRadius: 2, alignSelf: "center", marginBottom: 11 },
  header: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 13 },
  iconWrap: { width: 52, height: 52, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: "700" },
  subtitle: { fontSize: 12, lineHeight: 16 },
  divider: { height: 0.5, marginVertical: 11 },
  sectionLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 0.8, marginBottom: 8 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 7 },
  bulletRowTappable: { borderRadius: 10, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 8, marginHorizontal: -3 },
  bulletIcon: { width: 27, height: 27, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  bulletText: { flex: 1, fontSize: 12, lineHeight: 16 },
  premiumPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20 },
  premiumPillText: { fontSize: 9, fontWeight: "600" },
  ctaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 10, borderRadius: 12, marginTop: 5 },
  ctaBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  dismissBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8 },
  dismissText: { fontSize: 12, fontWeight: "600" },
});
