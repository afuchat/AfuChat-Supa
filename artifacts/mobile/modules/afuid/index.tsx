import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import QRCode from "@/components/ui/QRCode";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import AfuLogo from "@/components/ui/AfuLogo";
import { Skeleton } from "@/components/ui/Skeleton";

let ViewShot: any = ({ children, style, ...rest }: any) => (
  <View style={style} {...rest}>{children}</View>
);
try { ViewShot = require("react-native-view-shot").default; } catch (_) {}

const BRAND = Colors.brand;
const CEO_HANDLE = "amkaweesi";

type MemberRole = "ceo" | "staff" | "member";
function getMemberRole(handle?: string, isAdmin?: boolean): MemberRole {
  if (handle === CEO_HANDLE) return "ceo";
  if (isAdmin) return "staff";
  return "member";
}

type CT = {
  flag: string[];
  primary: string;
  secondary: string;
  cardBg: [string, string, string];
  headerBg: [string, string];
};

const THEMES: Record<string, CT> = {
  Uganda:          { flag: ["#000","#FCDC04","#D90000","#FFF"], primary: "#FCDC04", secondary: "#D90000", cardBg: ["#0A0800","#120E00","#0D0900"], headerBg: ["#1A1200","#0A0800"] },
  Kenya:           { flag: ["#006600","#CC0001","#000"],         primary: "#D90000", secondary: "#006600", cardBg: ["#0A0000","#130000","#0A0300"], headerBg: ["#180000","#0A0000"] },
  Tanzania:        { flag: ["#1EB53A","#000","#FCD116","#3A75C4"], primary: "#1EB53A", secondary: "#3A75C4", cardBg: ["#001508","#00100A","#001812"], headerBg: ["#001A0A","#000D06"] },
  Rwanda:          { flag: ["#20603D","#FAD201","#1F8FBF"],      primary: "#FAD201", secondary: "#1F8FBF", cardBg: ["#090800","#100E00","#0C0A00"], headerBg: ["#161200","#090800"] },
  Nigeria:         { flag: ["#008751","#FFF","#008751"],          primary: "#008751", secondary: "#4CAF50", cardBg: ["#001508","#001A0A","#001208"], headerBg: ["#001E0A","#000E05"] },
  Ghana:           { flag: ["#CE1126","#FCD116","#006B3F"],       primary: "#FCD116", secondary: "#CE1126", cardBg: ["#0A0800","#120E00","#0D0900"], headerBg: ["#1A1200","#0A0800"] },
  "South Africa":  { flag: ["#007A4D","#FFB612","#DE3831","#002868"], primary: "#FFB612", secondary: "#007A4D", cardBg: ["#0A0800","#110E00","#0A0A00"], headerBg: ["#161100","#080700"] },
  Ethiopia:        { flag: ["#078930","#FCDD09","#DA121A"],       primary: "#FCDD09", secondary: "#078930", cardBg: ["#080800","#0F0F00","#0A0A00"], headerBg: ["#141400","#080800"] },
  Egypt:           { flag: ["#CE1126","#FFF","#000"],             primary: "#CE1126", secondary: "#C09300", cardBg: ["#0A0000","#130000","#0A0200"], headerBg: ["#180000","#0A0000"] },
  Morocco:         { flag: ["#C1272D","#006233"],                 primary: "#006233", secondary: "#C1272D", cardBg: ["#001408","#001A0A","#001006"], headerBg: ["#001E0A","#000F05"] },
  "United States": { flag: ["#B22234","#FFF","#3C3B6E"],          primary: "#3C3B6E", secondary: "#B22234", cardBg: ["#00000A","#020010","#000008"], headerBg: ["#020018","#00000A"] },
  "United Kingdom":{ flag: ["#012169","#C8102E","#FFF"],          primary: "#012169", secondary: "#C8102E", cardBg: ["#000008","#00000E","#000005"], headerBg: ["#000010","#000008"] },
  Canada:          { flag: ["#FF0000","#FFF","#FF0000"],           primary: "#FF0000", secondary: "#8B0000", cardBg: ["#0A0000","#100000","#0A0000"], headerBg: ["#150000","#0A0000"] },
  Germany:         { flag: ["#000","#DD0000","#FFCE00"],           primary: "#DD0000", secondary: "#FFCE00", cardBg: ["#0A0000","#110000","#0A0200"], headerBg: ["#160000","#0A0000"] },
  France:          { flag: ["#002395","#FFF","#ED2939"],           primary: "#002395", secondary: "#ED2939", cardBg: ["#000008","#00000E","#000008"], headerBg: ["#000012","#000008"] },
  India:           { flag: ["#FF9933","#FFF","#138808"],           primary: "#FF9933", secondary: "#138808", cardBg: ["#0A0500","#110800","#0A0A00"], headerBg: ["#160900","#0A0500"] },
  China:           { flag: ["#DE2910","#FFDE00"],                  primary: "#DE2910", secondary: "#FFDE00", cardBg: ["#0A0000","#130000","#0A0000"], headerBg: ["#180000","#0A0000"] },
  Brazil:          { flag: ["#009C3B","#FEDF00","#002776"],        primary: "#FEDF00", secondary: "#009C3B", cardBg: ["#080800","#0F0F00","#080A00"], headerBg: ["#141400","#080800"] },
  UAE:             { flag: ["#00732F","#FFF","#000","#FF0000"],    primary: "#00732F", secondary: "#FF0000", cardBg: ["#001208","#001A0A","#001006"], headerBg: ["#001A0A","#000C06"] },
};

const DEFAULT_THEME: CT = {
  flag: [BRAND, "#006d7c", "#004B57"],
  primary: BRAND,
  secondary: "#006d7c",
  cardBg: ["#030D10","#041218","#030D10"],
  headerBg: ["#041A20","#020C10"],
};

const getTheme = (c?: string | null): CT =>
  c && THEMES[c] ? THEMES[c] : DEFAULT_THEME;

const ROLES = {
  ceo:    { label: "CEO & FOUNDER",   color: Colors.gold ?? "#D4A853", bg: "rgba(212,168,83,0.15)"  },
  staff:  { label: "STAFF",           color: BRAND,                    bg: "rgba(0,188,212,0.15)"   },
  member: { label: "DIGITAL CITIZEN", color: "#9B59B6",                bg: "rgba(155,89,182,0.15)"  },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}
function addYears(iso: string, n: number) {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString();
}
function padMember(n: number) { return String(n).padStart(6, "0"); }
function mrz1(name: string) {
  return `AFUCHAT<<${name.toUpperCase().replace(/[^A-Z ]/g,"").replace(/ /g,"<").padEnd(30,"<").slice(0,30)}`;
}
function mrz2(id: string, c: string) {
  return `${id.padEnd(9,"<")}${(c||"AFU").toUpperCase().slice(0,3).padEnd(3,"<")}${"<".repeat(17)}`;
}

async function nativeDownload(ref: React.RefObject<any>) {
  if (!ref.current || typeof (ref.current as any).capture !== "function") return;
  const uri: string = await (ref.current as any).capture();
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "image/png" });
}

/* ─── MINI-APP ─── */
export default function AfuIDApp() {
  const { colors, isDark } = useTheme();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [memberNumber, setMemberNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBack, setShowBack] = useState(false);
  const [dlState, setDlState] = useState<"idle"|"front"|"back">("idle");

  const flipAnim = useRef(new Animated.Value(0)).current;
  const frontShotRef = useRef<any>(null);
  const backShotRef  = useRef<any>(null);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      setLoading(true);
      try {
        const { count } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .lt("created_at", profile.created_at ?? new Date().toISOString());
        setMemberNumber((count ?? 0) + 1);
      } catch { setMemberNumber(1); }
      finally { setLoading(false); }
    })();
  }, [profile?.id]);

  const theme    = useMemo(() => getTheme(profile?.country), [profile?.country]);
  const role     = useMemo(() => getMemberRole(profile?.handle, profile?.is_admin), [profile]);
  const roleConf = ROLES[role];

  const afuId = useMemo(() => {
    if (!profile?.id) return "00000000";
    const hex = profile.id.replace(/-/g, "");
    return String(parseInt(hex.slice(0, 8), 16) % 100000000).padStart(8, "0");
  }, [profile?.id]);

  const qrValue  = `https://afuchat.com/id/${afuId}`;
  const issued   = profile?.created_at ? fmtDate(profile.created_at)               : "01/01/2024";
  const expires  = profile?.created_at ? fmtDate(addYears(profile.created_at, 10)) : "01/01/2034";
  const mrzLine1 = mrz1(profile?.display_name ?? "UNKNOWN");
  const mrzLine2 = mrz2(afuId, profile?.country ?? "AFU");

  const CARD_W = Math.min(width - 32, 380);
  const CARD_H = Math.round(CARD_W / 1.42);

  function flip() {
    const next = showBack ? 0 : 1;
    Animated.timing(flipAnim, {
      toValue: next,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    setShowBack(!showBack);
  }

  const frontRotateY = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const backRotateY = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["-180deg", "0deg"],
  });

  const frontFace = {
    transform: [{ perspective: 1600 }, { rotateY: frontRotateY }],
    backfaceVisibility: "hidden" as const,
    position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0,
  };
  const backFace = {
    transform: [{ perspective: 1600 }, { rotateY: backRotateY }],
    backfaceVisibility: "hidden" as const,
    position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0,
  };

  async function download(side: "front" | "back") {
    setDlState(side);
    try {
      await nativeDownload(side === "front" ? frontShotRef : backShotRef);
    } finally { setDlState("idle"); }
  }

  const cp = {
    cardWidth: CARD_W, cardHeight: CARD_H, theme, profile, role, roleConf,
    memberNumber, afuId, issued, expires, mrzLine1, mrzLine2, qrValue,
  };

  return (
    <ScrollView
      style={[r.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32, alignItems: "center" }}
      showsVerticalScrollIndicator={false}
    >
      {/* TITLE */}
      <View style={[r.titleRow, { paddingTop: 20 }]}>
        <View>
          <Text style={[r.pageTitle, { color: colors.text }]}>Digital ID</Text>
          <Text style={[r.pageSub, { color: colors.textMuted }]}>Your verifiable AfuChat identity</Text>
        </View>
        {profile?.is_verified && (
          <View style={[r.verifiedBadge, { backgroundColor: BRAND + "22" }]}>
            <Ionicons name="checkmark-circle" size={13} color={BRAND} />
            <Text style={[r.verifiedText, { color: BRAND }]}>Verified</Text>
          </View>
        )}
      </View>

      {/* FLIP CARD */}
      {loading ? (
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          <Skeleton width={CARD_W} height={CARD_H} borderRadius={20} />
        </View>
      ) : (
        <>
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={flip}
            style={[r.stage, { width: CARD_W, height: CARD_H }]}
          >
            <Animated.View style={[{ width: CARD_W, height: CARD_H }, frontFace]}>
              <CardFront {...cp} />
            </Animated.View>
            <Animated.View style={[{ width: CARD_W, height: CARD_H }, backFace]}>
              <CardBack {...cp} />
            </Animated.View>
          </TouchableOpacity>

          {/* FLIP INDICATOR */}
          <View style={r.flipRow}>
            <View style={[r.flipPill, { backgroundColor: isDark ? "#ffffff12" : "#00000010" }]}>
              <Ionicons name="sync-outline" size={11} color={colors.textMuted} />
              <Text style={[r.flipTxt, { color: colors.textMuted }]}>
                {showBack ? "Showing back — tap to flip" : "Tap card to flip"}
              </Text>
            </View>
            <View style={[r.sideDot, { backgroundColor: showBack ? theme.secondary : theme.primary }]} />
            <Text style={[r.sideLabel, { color: colors.textMuted }]}>{showBack ? "BACK" : "FRONT"}</Text>
          </View>

          {/* SAVE BUTTONS */}
          <View style={r.actionRow}>
            <TouchableOpacity
              style={[r.actionBtn, { borderColor: BRAND + "55" }, dlState !== "idle" && r.dim]}
              onPress={() => download("front")}
              disabled={dlState !== "idle"}
            >
              {dlState === "front"
                ? <ActivityIndicator size="small" color={BRAND} />
                : <Ionicons name="download-outline" size={14} color={BRAND} />}
              <Text style={[r.actionBtnTxt, { color: BRAND }]}>
                {dlState === "front" ? "Working…" : "Save Front"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[r.actionBtn, { borderColor: theme.primary + "55" }, dlState !== "idle" && r.dim]}
              onPress={() => download("back")}
              disabled={dlState !== "idle"}
            >
              {dlState === "back"
                ? <ActivityIndicator size="small" color={theme.primary} />
                : <Ionicons name="download-outline" size={14} color={theme.primary} />}
              <Text style={[r.actionBtnTxt, { color: theme.primary }]}>
                {dlState === "back" ? "Working…" : "Save Back"}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* DETAILS PANEL */}
      <View style={[r.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[r.detailTitle, { color: colors.textSecondary }]}>IDENTITY DETAILS</Text>
        <InfoRow label="Full Name"      value={profile?.display_name || "—"} colors={colors} />
        <Divider colors={colors} />
        <InfoRow label="Username"       value={`@${profile?.handle || "—"}`} colors={colors} />
        <Divider colors={colors} />
        <InfoRow label="AFU ID"         value={afuId} colors={colors} mono />
        <Divider colors={colors} />
        <InfoRow label="Member No."     value={`AFU‑${padMember(memberNumber ?? 1)}`} colors={colors} mono />
        <Divider colors={colors} />
        <InfoRow label="Nationality"    value={profile?.country || "Digital Citizen"} colors={colors} />
        <Divider colors={colors} />
        <InfoRow label="Issued"         value={issued} colors={colors} />
        <Divider colors={colors} />
        <InfoRow label="Expires"        value={expires} colors={colors} />
        <Divider colors={colors} />
        <InfoRow label="Account Status" value={profile?.is_verified ? "Verified" : "Active"} colors={colors} />
        <Divider colors={colors} />
        <InfoRow label="XP Level"       value={`${(profile?.xp || 0).toLocaleString()} Nexa`} colors={colors} />
        <Divider colors={colors} />
        <InfoRow label="ACoin Balance"  value={`${(profile?.acoin || 0).toLocaleString()} AC`} colors={colors} />
      </View>

      {/* HIDDEN CAPTURE LAYERS */}
      <View style={[r.captureLayer, { pointerEvents: "none" } as any]}>
        <ViewShot ref={frontShotRef} options={{ format: "png", quality: 1, result: "tmpfile" }}>
          <View><CardFront {...cp} /></View>
        </ViewShot>
        <ViewShot ref={backShotRef} options={{ format: "png", quality: 1, result: "tmpfile" }}>
          <View><CardBack {...cp} /></View>
        </ViewShot>
      </View>
    </ScrollView>
  );
}

/* ─── SHARED COMPONENTS ─── */
function InfoRow({ label, value, colors, mono }: { label: string; value: string; colors: any; mono?: boolean }) {
  return (
    <View style={r.infoRow}>
      <Text style={[r.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[r.infoValue, { color: colors.text }, mono && r.infoMono]} numberOfLines={1}>{value}</Text>
    </View>
  );
}
function Divider({ colors }: { colors: any }) {
  return <View style={[r.divider, { backgroundColor: colors.border }]} />;
}

function FlagStrip({ colors: fc, h = 5 }: { colors: string[]; h?: number }) {
  return (
    <View style={{ flexDirection: "row", height: h }}>
      {fc.map((c, i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}
    </View>
  );
}

function SecurityPattern({ w, h, color }: { w: number; h: number; color: string }) {
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: color + "08", opacity: 0.7, pointerEvents: "none" },
      ] as any}
    />
  );
}

function HoloStrip({ w, primary }: { w: number; primary: string }) {
  return <View style={{ width: w, height: 22, backgroundColor: primary + "22" }} />;
}

function MagneticStripe({ w }: { w: number }) {
  return (
    <View style={{ width: w, height: 36, backgroundColor: "#1a1a1a" }}>
      <View style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        {[...Array(6)].map((_, i) => (
          <View key={i} style={{ height: 2, backgroundColor: i % 2 === 0 ? "#333" : "#111", flex: 1 }} />
        ))}
      </View>
    </View>
  );
}

function Chip({ size = 30, primary }: { size?: number; primary: string }) {
  const s2 = size * 0.6;
  return (
    <View style={{
      width: size, height: Math.round(size * 0.78),
      borderRadius: 4, backgroundColor: "#C8A84B",
      borderWidth: 0.5, borderColor: "#A07828",
      alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      <View style={{ width: s2, height: s2 * 0.75, borderRadius: 2, borderWidth: 0.5, borderColor: "#A07828", backgroundColor: "#B8943C", alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: s2 * 0.6, height: 0.5, backgroundColor: "#8B6914", marginVertical: 2 }} />
        <View style={{ width: s2 * 0.6, height: 0.5, backgroundColor: "#8B6914", marginVertical: 2 }} />
        <View style={{ width: s2 * 0.6, height: 0.5, backgroundColor: "#8B6914", marginVertical: 2 }} />
      </View>
    </View>
  );
}

type CP = {
  cardWidth: number; cardHeight: number; theme: CT; profile: any; role: MemberRole;
  roleConf: typeof ROLES[MemberRole]; memberNumber: number | null; afuId: string;
  issued: string; expires: string; mrzLine1: string; mrzLine2: string; qrValue: string;
};

function Field({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: string }) {
  return (
    <View style={{ gap: 1 }}>
      <Text style={c.fLbl}>{label}</Text>
      <Text style={[c.fVal, mono && c.fMono, accent ? { color: accent } : {}]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

/* ─── FRONT FACE ─── */
function CardFront({ cardWidth: cw, cardHeight: ch, theme, profile, roleConf, memberNumber, afuId, issued, expires, mrzLine1, mrzLine2 }: CP) {
  const PHOTO_W = Math.round(cw * 0.27);
  const PHOTO_H = Math.round(PHOTO_W * 1.30);
  const chipSize = Math.round(cw * 0.082);

  return (
    <View style={[c.card, { width: cw, height: ch }]}>
      <LinearGradient colors={theme.cardBg} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <SecurityPattern w={cw} h={ch} color={theme.primary} />

      <FlagStrip colors={theme.flag} h={6} />

      <LinearGradient colors={theme.headerBg} style={c.hdr}>
        <AfuLogo size={20} />
        <View style={{ flex: 1, marginLeft: 7 }}>
          <Text style={c.hdrBrand}>AFUCHAT UNIVERSE</Text>
          <Text style={c.hdrSub}>DIGITAL IDENTITY CARD</Text>
        </View>
        <View style={[c.roleBadge, { backgroundColor: roleConf.bg, borderColor: roleConf.color + "66" }]}>
          <Text style={[c.roleTxt, { color: roleConf.color }]}>{roleConf.label}</Text>
        </View>
      </LinearGradient>

      <HoloStrip w={cw} primary={theme.primary} />

      {/* MAIN BODY */}
      <View style={{ flex: 1, flexDirection: "row", paddingHorizontal: 12, paddingTop: 9, gap: 12 }}>
        {/* LEFT: photo + chip */}
        <View style={{ alignItems: "center", gap: 7 }}>
          <View style={[c.photoBox, { width: PHOTO_W, height: PHOTO_H, borderColor: theme.primary + "99" }]}>
            {profile?.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={{ width: PHOTO_W - 4, height: PHOTO_H - 4, borderRadius: 2 }} resizeMode="cover" />
              : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <Ionicons name="person" size={PHOTO_W * 0.38} color="#ffffff28" />
                  <Text style={{ fontSize: 6, color: "#ffffff22", letterSpacing: 0.5 }}>PHOTO</Text>
                </View>}
          </View>
          <Chip size={chipSize} primary={theme.primary} />
        </View>

        {/* RIGHT: ID fields */}
        <View style={{ flex: 1, gap: 5, paddingTop: 2 }}>
          <Field label="SURNAME / FULL NAME" value={profile?.display_name ?? "— — —"} />
          <View style={{ height: 0.5, backgroundColor: theme.primary + "33" }} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="MEMBER NO." value={`AFU‑${padMember(memberNumber ?? 1)}`} mono accent={theme.primary} /></View>
            <View style={{ flex: 1 }}><Field label="AFU ID" value={afuId} mono accent={theme.secondary || "#ffffff99"} /></View>
          </View>
          <Field label="NATIONALITY" value={profile?.country ?? "DIGITAL CITIZEN"} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="DATE OF ISSUE" value={issued} /></View>
            <View style={{ flex: 1 }}><Field label="DATE OF EXPIRY" value={expires} /></View>
          </View>
        </View>
      </View>

      {/* SIGNATURE STRIP — dedicated full-width row */}
      <View style={[c.sigStrip, { borderTopColor: theme.primary + "25", borderBottomColor: theme.primary + "15" }]}>
        <View style={{ flex: 1 }}>
          <Text style={c.sigLbl}>{"HOLDER'S SIGNATURE"}</Text>
          <Text style={[c.sigVal, { borderBottomColor: theme.primary + "60" }]} numberOfLines={1}>
            {profile?.display_name ?? ""}
          </Text>
        </View>
        <View style={[c.sigStamp, { borderColor: theme.primary + "40" }]}>
          <AfuLogo size={14} style={{ opacity: 0.5 }} />
          <Text style={[c.sigStampTxt, { color: theme.primary }]}>{"VALID"}</Text>
        </View>
      </View>

      {/* MRZ ZONE */}
      <View style={[c.mrzZone, { borderTopColor: theme.primary + "22" }]}>
        <Text style={c.mrz} numberOfLines={1}>{mrzLine1}</Text>
        <Text style={c.mrz} numberOfLines={1}>{mrzLine2}</Text>
      </View>

      <FlagStrip colors={theme.flag} h={5} />
    </View>
  );
}

/* ─── BACK FACE ─── */
function CardBack({ cardWidth: cw, cardHeight: ch, theme, profile, memberNumber, afuId, issued, expires, qrValue, mrzLine1, mrzLine2 }: CP) {
  const QR_SIZE = Math.round(ch * 0.42);
  return (
    <View style={[c.card, { width: cw, height: ch }]}>
      <LinearGradient colors={[theme.cardBg[2], theme.cardBg[1], theme.cardBg[0]]} style={StyleSheet.absoluteFill} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} />
      <SecurityPattern w={cw} h={ch} color={theme.secondary || theme.primary} />

      <FlagStrip colors={theme.flag} h={6} />
      <MagneticStripe w={cw} />

      <View style={[c.signaturePanel, { borderColor: theme.primary + "22" }]}>
        <View style={c.signatureStripes}>
          {[...Array(5)].map((_, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: i % 2 === 0 ? "#ffffff08" : "#00000008" }} />
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, gap: 8 }}>
          <AfuLogo size={13} />
          <Text style={[c.panelTxt, { color: BRAND }]}>AFUCHAT UNIVERSE · DIGITAL FINGERPRINT</Text>
          <View style={{ flex: 1 }} />
          <View style={[c.secChip, { borderColor: theme.primary + "55" }]}>
            <Ionicons name="lock-closed" size={6} color={theme.primary} />
            <Text style={[c.secTxt, { color: theme.primary }]}>SECURE</Text>
          </View>
        </View>
      </View>

      <HoloStrip w={cw} primary={theme.primary} />

      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, gap: 12 }}>
        <View style={[c.qrBox, { borderColor: theme.primary + "44", backgroundColor: "#ffffff08" }]}>
          <QRCode value={qrValue} size={QR_SIZE} color="#ffffff" backgroundColor="transparent"
            />
        </View>
        <View style={{ flex: 1, gap: 7 }}>
          <Field label="AFU ID" value={afuId} mono accent={theme.primary} />
          <View style={{ height: 0.5, backgroundColor: theme.primary + "33" }} />
          <Field label="MEMBER NO." value={`AFU‑${padMember(memberNumber ?? 1)}`} mono />
          <Field label="NATIONALITY" value={profile?.country ?? "DIGITAL CITIZEN"} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Field label="ISSUED" value={issued} /></View>
            <View style={{ flex: 1 }}><Field label="EXPIRES" value={expires} /></View>
          </View>
          <View style={{ marginTop: 2 }}>
            <Text style={c.sigLbl}>SCAN TO VERIFY</Text>
            <Text style={[c.sigLbl, { color: theme.primary, letterSpacing: 0.3, marginTop: 1 }]}>afuchat.com/id/{afuId}</Text>
          </View>
        </View>
      </View>

      <View style={[c.mrzZone, { borderTopColor: theme.primary + "22" }]}>
        <Text style={c.mrz} numberOfLines={1}>{mrzLine1}</Text>
        <Text style={c.mrz} numberOfLines={1}>{mrzLine2}</Text>
      </View>

      <FlagStrip colors={theme.flag} h={5} />
    </View>
  );
}

/* ─── STYLES ─── */
const r = StyleSheet.create({
  root: { flex: 1 },
  titleRow: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 20 },
  pageTitle: { fontSize: 22, fontWeight: "700" },
  pageSub: { fontSize: 13, marginTop: 2 },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  verifiedText: { fontSize: 12, fontWeight: "600" },
  loadBox: { alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#ffffff08" },
  stage: { position: "relative" },
  flipRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  flipPill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  flipTxt: { fontSize: 11, letterSpacing: 0.3 },
  sideDot: { width: 6, height: 6, borderRadius: 3, marginLeft: 4 },
  sideLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  actionRow: { flexDirection: "row", gap: 10, justifyContent: "center", marginTop: 14, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9 },
  dim: { opacity: 0.4 },
  actionBtnTxt: { fontSize: 13, fontWeight: "600" },
  detailCard: { width: "92%", borderRadius: 16, borderWidth: 0.5, padding: 16, marginTop: 24 },
  detailTitle: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 12 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: "600" },
  infoMono: { fontFamily: "monospace", letterSpacing: 0.8 },
  divider: { height: 0.5 },
  captureLayer: { position: "absolute", left: 0, top: 0, opacity: 0, zIndex: -1, pointerEvents: "none" as any },
});

const c = StyleSheet.create({
  card: {
    borderRadius: 16, overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  hdr: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7 },
  hdrBrand: { fontSize: 10, fontWeight: "900", color: BRAND, letterSpacing: 2, lineHeight: 13 },
  hdrSub: { fontSize: 6.5, color: "#ffffff55", letterSpacing: 0.8, lineHeight: 10 },
  roleBadge: { borderWidth: 0.5, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  roleTxt: { fontSize: 6, fontWeight: "800", letterSpacing: 0.8 },
  photoBox: { borderWidth: 1.5, borderRadius: 4, overflow: "hidden", backgroundColor: "#ffffff08" },
  fLbl: { fontSize: 6.5, fontWeight: "700", color: "#ffffff44", letterSpacing: 1, lineHeight: 9 },
  fVal: { fontSize: 10, color: "#ffffffcc", fontWeight: "600", lineHeight: 14 },
  fMono: { fontFamily: "monospace", fontSize: 11, letterSpacing: 1.2, fontWeight: "800" },
  sigStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    
    
    backgroundColor: "rgba(255,255,255,0.03)",
    gap: 10,
  },
  sigLbl: { fontSize: 6, fontWeight: "700", color: "#ffffff33", letterSpacing: 0.8, marginBottom: 3 },
  sigVal: {
    fontSize: 13,
    fontStyle: "italic",
    color: "#ffffffbb",
    
    paddingBottom: 3,
    fontFamily: "serif",
    letterSpacing: 0.3,
  },
  sigStamp: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  sigStampTxt: { fontSize: 5.5, fontWeight: "800", letterSpacing: 1 },
  mrzZone: { backgroundColor: "#000000aa", paddingHorizontal: 10, paddingTop: 3, paddingBottom: 2 },
  mrz: { fontSize: 6, color: "#ffffff55", letterSpacing: 1.8, lineHeight: 9, fontFamily: "monospace" },
  signaturePanel: { overflow: "hidden" },
  signatureStripes: { flexDirection: "row", height: 18 },
  panelTxt: { fontSize: 6.5, fontWeight: "800", letterSpacing: 0.8 },
  secChip: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 0.5, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 2 },
  secTxt: { fontSize: 5.5, fontWeight: "700", letterSpacing: 0.5 },
  qrBox: { padding: 8, borderWidth: 0.5, borderRadius: 8 },
});
