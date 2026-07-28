// ─── Call Screen ──────────────────────────────────────────────────────────────
// Active call UI: shows caller / callee info, duration timer, mute/speaker/end.
// Reads live state from CallContext. Works for both outgoing and incoming calls.
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
import { Avatar } from "@/components/ui/Avatar";
import { useCall } from "@/context/CallContext";

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

  // Duration timer
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pulse animation (shown when active)
  const pulse = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Button press feedback
  const btnScale = useRef(new Animated.Value(1)).current;

  // ── Pulse wave when active ────────────────────────────────────────────────
  useEffect(() => {
    if (status === "active") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current = loop;
      loop.start();
    } else {
      pulseLoop.current?.stop();
      pulse.setValue(1);
    }
    return () => { pulseLoop.current?.stop(); };
  }, [status]);

  // ── Duration timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === "active") {
      const startAt = callInfo?.answeredAt ?? Date.now();
      // Set initial elapsed time (in case we resumed after navigate)
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

  // ── Auto-navigate away when call ends ────────────────────────────────────
  useEffect(() => {
    if (status === "ended" || status === "idle") {
      // Brief delay so "Call ended" is visible
      const t = setTimeout(() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)" as any);
      }, 2200);
      return () => clearTimeout(t);
    }
  }, [status]);

  const handleEndCall = useCallback(() => {
    // Button press spring
    Animated.sequence([
      Animated.spring(btnScale, { toValue: 0.88, useNativeDriver: true, speed: 80 }),
      Animated.spring(btnScale, { toValue: 1,    useNativeDriver: true, speed: 40 }),
    ]).start();
    endCall();
  }, [endCall, btnScale]);

  // ── Derive display info ───────────────────────────────────────────────────
  const isCaller = callInfo?.isCaller ?? true;
  const remoteName   = isCaller ? (callInfo?.calleeName   ?? "Connecting…") : (callInfo?.callerName   ?? "Unknown");
  const remoteAvatar = isCaller ? (callInfo?.calleeAvatar ?? null)           : (callInfo?.callerAvatar ?? null);

  const statusLabel =
    status === "outgoing_ringing" ? "Ringing…"
    : status === "incoming_ringing" ? "Incoming call"
    : status === "connecting" ? "Connecting…"
    : status === "active" ? formatDuration(seconds)
    : status === "ended" ? "Call ended"
    : "";

  const statusColor =
    status === "active" ? "#34C759"
    : status === "ended" ? "rgba(255,255,255,0.4)"
    : "rgba(255,255,255,0.6)";

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="light" translucent />

      {/* Background subtle glow */}
      <View style={StyleSheet.absoluteFill}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#070a0f" }]} />
        <View style={[StyleSheet.absoluteFill, styles.bgGlow]} />
      </View>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <View style={[styles.topBar]}>
        <TouchableOpacity
          onPress={handleEndCall}
          hitSlop={12}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-down" size={24} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <Text style={styles.topLabel}>Voice Call</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Center: avatar + name + status ───────────────────────────────── */}
      <View style={styles.centerSection}>
        {/* Pulse ring behind avatar */}
        <Animated.View
          style={[
            styles.pulseRing,
            { transform: [{ scale: pulse }], opacity: status === "active" ? 0.35 : 0 },
          ]}
        />

        <View style={styles.avatarWrap}>
          <Avatar uri={remoteAvatar} name={remoteName} size={100} />
        </View>

        <Text style={styles.remoteName} numberOfLines={1}>{remoteName}</Text>

        <Text style={[styles.statusLabel, { color: statusColor }]}>
          {statusLabel}
        </Text>

        {/* Connection quality dots (active state only) */}
        {status === "active" && (
          <View style={styles.qualityDots}>
            <ConnectionDot delay={0} />
            <ConnectionDot delay={200} />
            <ConnectionDot delay={400} />
          </View>
        )}
      </View>

      {/* ── Bottom controls ───────────────────────────────────────────────── */}
      <View style={styles.controls}>
        {/* Mute */}
        <ControlButton
          icon={isMuted ? "mic-off" : "mic"}
          label={isMuted ? "Unmute" : "Mute"}
          active={isMuted}
          onPress={toggleMute}
          disabled={status !== "active" && status !== "connecting"}
        />

        {/* End call */}
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <TouchableOpacity
            style={styles.endBtn}
            onPress={handleEndCall}
            activeOpacity={0.85}
          >
            <Ionicons name="call" size={30} color="#fff" style={styles.endIcon} />
          </TouchableOpacity>
        </Animated.View>

        {/* Speaker */}
        <ControlButton
          icon={isSpeaker ? "volume-high" : "volume-medium"}
          label={isSpeaker ? "Earpiece" : "Speaker"}
          active={isSpeaker}
          onPress={toggleSpeaker}
          disabled={status !== "active" && status !== "connecting"}
        />
      </View>
    </View>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ControlButton({
  icon,
  label,
  active,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.ctrlBtn, active && styles.ctrlBtnActive, disabled && styles.ctrlBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <Ionicons name={icon} size={22} color={active ? "#fff" : "rgba(255,255,255,0.8)"} />
      <Text style={[styles.ctrlLabel, disabled && { opacity: 0.35 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ConnectionDot({ delay }: { delay: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[styles.dot, { opacity }]} />;
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bgGlow: {
    backgroundColor: "rgba(0,122,255,0.04)",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  topLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },
  centerSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 32,
  },
  pulseRing: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  avatarWrap: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
    overflow: "hidden",
  },
  remoteName: {
    color: "#fff",
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 10,
    maxWidth: 280,
    textAlign: "center",
  },
  statusLabel: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.2,
    marginBottom: 18,
  },
  qualityDots: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#34C759",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 32,
    paddingBottom: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  ctrlBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  ctrlBtnActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  ctrlBtnDisabled: {
    opacity: 0.4,
  },
  ctrlLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  endBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      android: { elevation: 4 },
      ios: {
        shadowColor: "#FF3B30",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
    }),
  },
  endIcon: {
    transform: [{ rotate: "135deg" }],
  },
});
