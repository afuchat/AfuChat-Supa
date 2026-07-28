// ─── Call Screen — Glass Edition ──────────────────────────────────────────────
// Full-screen voice call UI with liquid-glass panels, specular borders, and
// depth blur. Works for both outgoing and incoming calls via CallContext.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { BlurView } from "expo-blur";
import { Avatar } from "@/components/ui/Avatar";
import { useCall } from "@/context/CallContext";
import { GLASS } from "@/constants/glass";

// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
function pad(n: number) { return String(n).padStart(2, "0"); }

// ─────────────────────────────────────────────────────────────────────────────

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { status, callInfo, isMuted, isSpeaker, endCall, toggleMute, toggleSpeaker } = useCall();

  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ambient pulse glow when active
  const glowScale  = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const glowLoop   = useRef<Animated.CompositeAnimation | null>(null);

  // Connecting shimmer
  const shimmer = useRef(new Animated.Value(0)).current;

  // End-call button press spring
  const endBtnScale = useRef(new Animated.Value(1)).current;

  // ── Ambient glow pulse (active only) ─────────────────────────────────────
  useEffect(() => {
    if (status === "active") {
      Animated.timing(glowOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowScale,   { toValue: 1.22, duration: 1800, useNativeDriver: true }),
          Animated.timing(glowScale,   { toValue: 1.00, duration: 1800, useNativeDriver: true }),
        ]),
      );
      glowLoop.current = loop;
      loop.start();
    } else {
      glowLoop.current?.stop();
      Animated.timing(glowOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
      glowScale.setValue(1);
    }
    return () => { glowLoop.current?.stop(); };
  }, [status]);

  // ── Connecting shimmer ────────────────────────────────────────────────────
  useEffect(() => {
    if (status === "connecting" || status === "outgoing_ringing") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [status]);

  // ── Duration timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === "active") {
      const startAt = callInfo?.answeredAt ?? Date.now();
      setSeconds(Math.floor((Date.now() - startAt) / 1000));
      timerRef.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startAt) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (status !== "active") setSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status, callInfo?.answeredAt]);

  // ── Auto-navigate when call ends ──────────────────────────────────────────
  useEffect(() => {
    if (status === "ended" || status === "idle") {
      const t = setTimeout(() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)" as any);
      }, 2200);
      return () => clearTimeout(t);
    }
  }, [status]);

  const handleEndCall = useCallback(() => {
    Animated.sequence([
      Animated.spring(endBtnScale, { toValue: 0.86, useNativeDriver: true, speed: 80 }),
      Animated.spring(endBtnScale, { toValue: 1,    useNativeDriver: true, speed: 40 }),
    ]).start();
    endCall();
  }, [endCall, endBtnScale]);

  // ── Display data ──────────────────────────────────────────────────────────
  const isCaller    = callInfo?.isCaller ?? true;
  const remoteName  = isCaller ? (callInfo?.calleeName  ?? "Connecting…") : (callInfo?.callerName  ?? "Unknown");
  const remoteAvatar = isCaller ? (callInfo?.calleeAvatar ?? null) : (callInfo?.callerAvatar ?? null);

  const statusLabel =
    status === "outgoing_ringing"  ? "Ringing…"
    : status === "incoming_ringing"  ? "Incoming call"
    : status === "connecting"        ? "Connecting…"
    : status === "active"            ? formatDuration(seconds)
    : status === "ended"             ? "Call ended"
    : status === "unreachable"       ? `Couldn't reach ${remoteName}`
    : status === "connection_lost"   ? "Connection lost"
    : "";

  const isLive = status === "active";
  const isEnding =
    status === "ended" ||
    status === "idle" ||
    status === "connection_lost";

  // Shimmer opacity for status label during connecting/ringing
  const statusOpacity = shimmer.interpolate({
    inputRange: [0, 1], outputRange: [0.55, 1],
  });

  return (
    <View style={styles.root}>
      <StatusBar style="light" translucent />

      {/* ── Background ──────────────────────────────────────────────────── */}
      <View style={StyleSheet.absoluteFill}>
        {/* Deep space base */}
        <View style={[StyleSheet.absoluteFill, styles.bg]} />
        {/* Ambient colour orbs */}
        <View style={[styles.orb, styles.orbGreen, { opacity: isLive ? 0.28 : 0.14 }]} />
        <View style={[styles.orb, styles.orbBlue,  { opacity: 0.18 }]} />
        <View style={[styles.orb, styles.orbPurple,{ opacity: 0.12 }]} />
      </View>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        {/* Glass back / minimise button */}
        <TouchableOpacity onPress={handleEndCall} hitSlop={12} activeOpacity={0.75}>
          <GlassCircle size={38}>
            <Ionicons name="chevron-down" size={20} color="rgba(255,255,255,0.75)" />
          </GlassCircle>
        </TouchableOpacity>

        {/* Screen label */}
        <GlassPill>
          <Ionicons name="call" size={11} color="rgba(255,255,255,0.65)" />
          <Text style={styles.topLabel}>Voice Call</Text>
        </GlassPill>

        {/* Spacer to keep pill centred */}
        <View style={{ width: 38 }} />
      </View>

      {/* ── Centre: avatar card ──────────────────────────────────────────── */}
      <View style={styles.centreSection}>

        {/* Ambient glow ring behind avatar card */}
        <Animated.View
          style={[
            styles.glowRing,
            { transform: [{ scale: glowScale }], opacity: glowOpacity },
          ]}
        />

        {/* Glass avatar card */}
        <BlurView intensity={GLASS.blur.heavy} tint="dark" style={styles.avatarCard}>
          <View style={styles.avatarCardInner}>
            {/* Specular top edge */}
            <View style={styles.avatarCardSpecular} />
            <View style={styles.avatarRing}>
              <Avatar uri={remoteAvatar} name={remoteName} size={96} />
            </View>
          </View>
        </BlurView>

        {/* Name */}
        <Text style={styles.remoteName} numberOfLines={1}>{remoteName}</Text>

        {/* Status pill */}
        <BlurView intensity={30} tint="dark" style={styles.statusPill}>
          <View style={styles.statusPillInner}>
            {isLive && <View style={styles.activeDot} />}
            <Animated.Text style={[
              styles.statusLabel,
              !isLive && !isEnding && { opacity: statusOpacity },
              isLive && { color: "#34C759" },
              isEnding && { color: "rgba(255,255,255,0.35)" },
            ]}>
              {statusLabel}
            </Animated.Text>
          </View>
        </BlurView>

        {/* Connection quality dots (active only) */}
        {isLive && (
          <View style={styles.qualityRow}>
            <ConnectionDot delay={0}   color="#34C759" />
            <ConnectionDot delay={220} color="#34C759" />
            <ConnectionDot delay={440} color="#34C759" />
          </View>
        )}
      </View>

      {/* ── Bottom controls ──────────────────────────────────────────────── */}
      <View style={[styles.controlsWrap, { paddingBottom: insets.bottom + 24 }]}>
        <BlurView intensity={GLASS.blur.heavy} tint="dark" style={styles.controlsGlass}>
          <View style={styles.controlsGlassInner}>
            {/* Specular top edge */}
            <View style={styles.controlsSpecular} />

            <View style={styles.controlsRow}>
              {/* Mute */}
              <GlassControlBtn
                icon={isMuted ? "mic-off" : "mic"}
                label={isMuted ? "Unmute" : "Mute"}
                active={isMuted}
                disabled={!isLive && status !== "connecting"}
                onPress={toggleMute}
              />

              {/* End call — red glass */}
              <Animated.View style={{ transform: [{ scale: endBtnScale }] }}>
                <TouchableOpacity
                  style={styles.endBtn}
                  onPress={handleEndCall}
                  activeOpacity={0.82}
                >
                  <BlurView intensity={60} tint="dark" style={styles.endBtnBlur}>
                    <View style={styles.endBtnOverlay}>
                      <Ionicons
                        name="call"
                        size={28}
                        color="#fff"
                        style={{ transform: [{ rotate: "135deg" }] }}
                      />
                    </View>
                  </BlurView>
                </TouchableOpacity>
              </Animated.View>

              {/* Speaker */}
              <GlassControlBtn
                icon={isSpeaker ? "volume-high" : "volume-medium"}
                label={isSpeaker ? "Earpiece" : "Speaker"}
                active={isSpeaker}
                disabled={!isLive && status !== "connecting"}
                onPress={toggleSpeaker}
              />
            </View>
          </View>
        </BlurView>
      </View>
    </View>
  );
}

// ─── Glass sub-components ─────────────────────────────────────────────────────

function GlassCircle({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <BlurView intensity={40} tint="dark" style={[styles.glassCircle, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={[styles.glassCircleInner, { borderRadius: size / 2 }]}>
        {children}
      </View>
    </BlurView>
  );
}

function GlassPill({ children }: { children: React.ReactNode }) {
  return (
    <BlurView intensity={35} tint="dark" style={styles.glassPill}>
      <View style={styles.glassPillInner}>
        {children}
      </View>
    </BlurView>
  );
}

function GlassControlBtn({
  icon, label, active, disabled, onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.75} style={{ alignItems: "center", gap: 8 }}>
      <BlurView
        intensity={active ? 55 : 40}
        tint="dark"
        style={[styles.ctrlBtn, disabled && { opacity: 0.35 }]}
      >
        <View style={[styles.ctrlBtnInner, active && styles.ctrlBtnActive]}>
          <Ionicons
            name={icon}
            size={22}
            color={active ? "#fff" : "rgba(255,255,255,0.80)"}
          />
        </View>
      </BlurView>
      <Text style={[styles.ctrlLabel, disabled && { opacity: 0.35 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ConnectionDot({ delay, color }: { delay: number; color: string }) {
  const opacity = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 1,    duration: 380, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.25, duration: 380, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[styles.dot, { backgroundColor: color, opacity }]} />;
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Background
  bg: {
    backgroundColor: "#060912",
  },
  orb: {
    position: "absolute",
    borderRadius: 999,
  },
  orbGreen: {
    width: 340, height: 340,
    top: -60, left: -80,
    backgroundColor: "#00C170",
    // blur handled by rgba falloff — real blur only on iOS via BlurView
    ...Platform.select({
      web: { filter: "blur(90px)" } as any,
      default: {},
    }),
  },
  orbBlue: {
    width: 300, height: 300,
    bottom: 60, right: -60,
    backgroundColor: "#0A6EFF",
    ...Platform.select({
      web: { filter: "blur(90px)" } as any,
      default: {},
    }),
  },
  orbPurple: {
    width: 220, height: 220,
    top: "35%", left: "30%",
    backgroundColor: "#7B2FBE",
    ...Platform.select({
      web: { filter: "blur(80px)" } as any,
      default: {},
    }),
  },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  topLabel: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
    marginLeft: 5,
  },

  // Glass circle button (back)
  glassCircle: {
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: GLASS.border.dark,
  },
  glassCircleInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GLASS.fill.dark,
  },

  // Glass pill (top label)
  glassPill: {
    overflow: "hidden",
    borderRadius: GLASS.radius.pill,
    borderWidth: 0.5,
    borderColor: GLASS.border.dark,
  },
  glassPillInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: GLASS.fill.dark,
  },

  // Centre section
  centreSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 20,
  },

  // Glow ring
  glowRing: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1.5,
    borderColor: "rgba(52,199,89,0.35)",
    backgroundColor: "rgba(52,199,89,0.06)",
  },

  // Avatar card
  avatarCard: {
    borderRadius: GLASS.radius.xl,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: GLASS.border.dark,
    marginBottom: 24,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.45,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 14 },
      web: { boxShadow: "0 8px 32px rgba(0,0,0,0.55)" } as any,
    }),
  },
  avatarCardInner: {
    padding: 20,
    backgroundColor: GLASS.fill.dark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCardSpecular: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  avatarRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  // Name
  remoteName: {
    color: "#fff",
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
    maxWidth: 280,
    textAlign: "center",
    ...Platform.select({
      web: { textShadow: "0 2px 12px rgba(0,0,0,0.6)" } as any,
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.5,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },

  // Status pill
  statusPill: {
    borderRadius: GLASS.radius.pill,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: GLASS.border.darkSubtle,
    marginBottom: 16,
  },
  statusPillInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#34C759",
  },
  statusLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },

  // Connection dots
  qualityRow: {
    flexDirection: "row",
    gap: 5,
    marginTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  // Controls
  controlsWrap: {
    paddingHorizontal: 20,
  },
  controlsGlass: {
    borderRadius: GLASS.radius.xl,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: GLASS.border.dark,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.40,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 12 },
      web: { boxShadow: "0 6px 24px rgba(0,0,0,0.50)" } as any,
    }),
  },
  controlsGlassInner: {
    backgroundColor: GLASS.fill.dark,
    paddingVertical: 20,
    paddingHorizontal: 8,
  },
  controlsSpecular: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },

  // Control button
  ctrlBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: GLASS.border.dark,
  },
  ctrlBtnInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  ctrlBtnActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  ctrlLabel: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },

  // End call button
  endBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255,59,48,0.55)",
    ...Platform.select({
      ios: {
        shadowColor: "#FF3B30",
        shadowOpacity: 0.55,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 10 },
      web: { boxShadow: "0 4px 20px rgba(255,59,48,0.50)" } as any,
    }),
  },
  endBtnBlur: {
    flex: 1,
  },
  endBtnOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,59,48,0.80)",
  },
});
