// ─── IncomingCallModal — Liquid Glass Edition ────────────────────────────────
// Full-screen incoming call overlay that matches the glass visual language of
// call/[id].tsx. Renders above everything via a Modal.
// Auto-declines after 30 s if the user doesn't interact.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/ui/Avatar";
import { useCall } from "@/context/CallContext";
import { useAuth } from "@/context/AuthContext";
import { notifyMissedCall } from "@/lib/notifyUser";
import { GLASS } from "@/constants/glass";

const AUTO_DECLINE_MS = 30_000;

const VIBRATION_PATTERN =
  Platform.OS === "android"
    ? [0, 600, 400, 600, 400, 600]
    : [0, 400, 200, 400];

// ─── Avatar size constants ────────────────────────────────────────────────────
const AVATAR_SIZE = 100;
const RING_BASE   = AVATAR_SIZE + 28;

// ─────────────────────────────────────────────────────────────────────────────

export function IncomingCallModal() {
  const { incomingNotice, acceptCall, declineCall, status } = useCall();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // ── Animated values ────────────────────────────────────────────────────────
  const slideIn     = useRef(new Animated.Value(80)).current;
  const fadeIn      = useRef(new Animated.Value(0)).current;

  // Pulsing ring waves
  const ringScale1  = useRef(new Animated.Value(1)).current;
  const ringScale2  = useRef(new Animated.Value(1)).current;
  const ringOpacity1= useRef(new Animated.Value(0.55)).current;
  const ringOpacity2= useRef(new Animated.Value(0.35)).current;

  // Shimmer label pulse
  const labelPulse  = useRef(new Animated.Value(0.55)).current;

  const autoDeclineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringLoopRef      = useRef<Animated.CompositeAnimation | null>(null);
  const labelLoopRef     = useRef<Animated.CompositeAnimation | null>(null);

  // Show the modal while there is an incoming notice AND the engine is either
  // idle (first render lag) or incoming_ringing (steady state after engine fix).
  // The "idle" arm handles the one-render gap between the engine emitting
  // "incoming_ringing" and the React status state updating from the listener.
  const visible = !!incomingNotice && (status === "idle" || status === "incoming_ringing");

  // ── Animations ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      // Stop every tracked loop in one place so none can outlive the modal
      ringLoopRef.current?.stop();
      ringLoopRef.current = null;
      labelLoopRef.current?.stop();
      labelLoopRef.current = null;
      Vibration.cancel();
      // Reset values for the next open
      slideIn.setValue(80);
      fadeIn.setValue(0);
      ringScale1.setValue(1); ringOpacity1.setValue(0.55);
      ringScale2.setValue(1); ringOpacity2.setValue(0.35);
      labelPulse.setValue(0.55);
      return;
    }

    // Entrance
    Animated.parallel([
      Animated.spring(slideIn, {
        toValue: 0, useNativeDriver: true,
        damping: 20, stiffness: 220,
      }),
      Animated.timing(fadeIn, {
        toValue: 1, duration: 220, useNativeDriver: true,
      }),
    ]).start();

    // Ring pulse loop — stored in ref so cleanup path can always reach it
    const ringLoop = Animated.loop(
      Animated.stagger(350, [
        Animated.parallel([
          Animated.timing(ringScale1, { toValue: 1.65, duration: 1100, useNativeDriver: true }),
          Animated.timing(ringOpacity1, { toValue: 0, duration: 1100, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ringScale2, { toValue: 1.65, duration: 1100, useNativeDriver: true }),
          Animated.timing(ringOpacity2, { toValue: 0, duration: 1100, useNativeDriver: true }),
        ]),
      ]),
    );
    ringLoopRef.current = ringLoop;
    ringLoop.start();

    // Label shimmer — also stored in ref
    const labelLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(labelPulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
        Animated.timing(labelPulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    labelLoopRef.current = labelLoop;
    labelLoop.start();

    // Vibrate
    Vibration.vibrate(VIBRATION_PATTERN, true);

    // Auto-decline
    autoDeclineTimer.current = setTimeout(() => {
      if (incomingNotice) {
        // calleeId = current user (the one who didn't answer)
        // callerId = the person who placed the call
        notifyMissedCall({
          calleeId: user?.id ?? incomingNotice.callerId,
          callerId: incomingNotice.callerId,
          callId: incomingNotice.callId,
          callType: "voice",
          callerName: incomingNotice.callerName,
        }).catch(() => {});
        declineCall();
      }
    }, AUTO_DECLINE_MS);

    return () => {
      if (autoDeclineTimer.current) {
        clearTimeout(autoDeclineTimer.current);
        autoDeclineTimer.current = null;
      }
      // Stop both loops through their refs — single cleanup path, no splits
      ringLoopRef.current?.stop();
      ringLoopRef.current = null;
      labelLoopRef.current?.stop();
      labelLoopRef.current = null;
      Vibration.cancel();
    };
  }, [visible]);

  const handleDecline = useCallback(() => {
    if (autoDeclineTimer.current) clearTimeout(autoDeclineTimer.current);
    declineCall();
  }, [declineCall]);

  const handleAccept = useCallback(() => {
    if (autoDeclineTimer.current) clearTimeout(autoDeclineTimer.current);
    Promise.resolve(acceptCall()).catch(() => {});
  }, [acceptCall]);

  if (!incomingNotice || (status !== "idle" && status !== "incoming_ringing")) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={handleDecline}
    >
      {/* ── Background: deep dark + colour orbs ─────────────────────────── */}
      <View style={styles.root}>
        <View style={[StyleSheet.absoluteFill, styles.bg]} />
        <View style={[styles.orb, styles.orbGreen]} />
        <View style={[styles.orb, styles.orbBlue]} />
        <View style={[styles.orb, styles.orbPurple]} />

        {/* ── Main content card — slides up ─────────────────────────────── */}
        <Animated.View
          style={[
            styles.content,
            {
              paddingTop: insets.top + 28,
              paddingBottom: insets.bottom + 32,
              transform: [{ translateY: slideIn }],
              opacity: fadeIn,
            },
          ]}
        >
          {/* Glass "Voice Call" label at top */}
          <BlurView intensity={GLASS.blur.light} tint="dark" style={styles.topPill}>
            <View style={styles.topPillInner}>
              <Ionicons name="call" size={11} color="rgba(52,199,89,0.85)" />
              <Text style={styles.topPillText}>Incoming Voice Call</Text>
            </View>
          </BlurView>

          {/* ── Avatar + pulse rings ─────────────────────────────────────── */}
          <View style={styles.avatarSection}>
            {/* Outer ring wave */}
            <Animated.View
              style={[
                styles.ring,
                { transform: [{ scale: ringScale2 }], opacity: ringOpacity2 },
              ]}
            />
            {/* Inner ring wave */}
            <Animated.View
              style={[
                styles.ring,
                { transform: [{ scale: ringScale1 }], opacity: ringOpacity1 },
              ]}
            />

            {/* Glass avatar card */}
            <BlurView intensity={GLASS.blur.heavy} tint="dark" style={styles.avatarCard}>
              <View style={styles.avatarCardInner}>
                {/* Specular top edge */}
                <View style={styles.avatarCardSpecular} />
                <View style={styles.avatarRingBorder}>
                  <Avatar
                    uri={incomingNotice.callerAvatar}
                    name={incomingNotice.callerName}
                    size={AVATAR_SIZE}
                  />
                </View>
              </View>
            </BlurView>
          </View>

          {/* Name */}
          <Text style={styles.callerName} numberOfLines={1}>
            {incomingNotice.callerName}
          </Text>

          {/* Pulsing status label */}
          <Animated.Text style={[styles.subtitle, { opacity: labelPulse }]}>
            Calling you…
          </Animated.Text>

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* ── Glass control panel ──────────────────────────────────────── */}
          <BlurView intensity={GLASS.blur.heavy} tint="dark" style={styles.controlsGlass}>
            <View style={styles.controlsInner}>
              {/* Specular top edge */}
              <View style={styles.controlsSpecular} />

              <View style={styles.actionRow}>
                {/* Decline — red glass */}
                <GlassActionBtn
                  type="decline"
                  icon="call"
                  label="Decline"
                  onPress={handleDecline}
                />

                {/* Accept — green glass */}
                <GlassActionBtn
                  type="accept"
                  icon="call"
                  label="Accept"
                  onPress={handleAccept}
                />
              </View>
            </View>
          </BlurView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Glass action button ──────────────────────────────────────────────────────

function GlassActionBtn({
  type,
  icon,
  label,
  onPress,
}: {
  type: "accept" | "decline";
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  const isDecline = type === "decline";
  const borderColor = isDecline
    ? "rgba(255,59,48,0.50)"
    : "rgba(52,199,89,0.50)";
  const overlayColor = isDecline
    ? "rgba(255,59,48,0.78)"
    : "rgba(52,199,89,0.78)";
  const glowColor = isDecline ? "#FF3B30" : "#34C759";

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.88, useNativeDriver: true, speed: 80 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40 }),
    ]).start();
    onPress();
  };

  return (
    <View style={styles.btnWrapper}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handlePress}
          style={[
            styles.actionBtn,
            {
              borderColor,
              ...Platform.select({
                ios: {
                  shadowColor: glowColor,
                  shadowOpacity: 0.60,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 4 },
                },
                android: { elevation: 12 },
                web: { boxShadow: `0 4px 22px ${glowColor}66` } as any,
              }),
            },
          ]}
        >
          <BlurView intensity={60} tint="dark" style={styles.actionBtnBlur}>
            <View style={[styles.actionBtnOverlay, { backgroundColor: overlayColor }]}>
              <Ionicons
                name={icon}
                size={30}
                color="#fff"
                style={isDecline ? styles.rotated : undefined}
              />
            </View>
          </BlurView>
        </TouchableOpacity>
      </Animated.View>
      <Text style={styles.btnLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Background
  bg: {
    backgroundColor: "#050810",
  },
  orb: {
    position: "absolute",
    borderRadius: 999,
    ...Platform.select({
      web: { filter: "blur(90px)" } as any,
      default: {},
    }),
  },
  orbGreen: {
    width: 360, height: 360,
    top: -80, left: -100,
    backgroundColor: "#00C170",
    opacity: 0.22,
  },
  orbBlue: {
    width: 280, height: 280,
    bottom: 40, right: -80,
    backgroundColor: "#0A6EFF",
    opacity: 0.16,
  },
  orbPurple: {
    width: 200, height: 200,
    top: "40%", left: "35%",
    backgroundColor: "#7B2FBE",
    opacity: 0.11,
  },

  // Content slide-up panel
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 28,
  },

  // Top pill
  topPill: {
    borderRadius: GLASS.radius.pill,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(52,199,89,0.30)",
    marginBottom: 48,
  },
  topPillInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(52,199,89,0.10)",
  },
  topPillText: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },

  // Avatar + rings
  avatarSection: {
    width: RING_BASE + 48,
    height: RING_BASE + 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  ring: {
    position: "absolute",
    width: RING_BASE,
    height: RING_BASE,
    borderRadius: RING_BASE / 2,
    borderWidth: 1.5,
    borderColor: "rgba(52,199,89,0.45)",
  },

  // Glass avatar card
  avatarCard: {
    borderRadius: GLASS.radius.xl,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: GLASS.border.dark,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.50,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 16 },
      web: { boxShadow: "0 10px 32px rgba(0,0,0,0.60)" } as any,
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
  avatarRingBorder: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    borderRadius: (AVATAR_SIZE + 6) / 2,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.14)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  // Caller name
  callerName: {
    color: "#fff",
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    maxWidth: 290,
    marginBottom: 10,
    ...Platform.select({
      web: { textShadow: "0 2px 14px rgba(0,0,0,0.65)" } as any,
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.55,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },

  // Subtitle pulse label
  subtitle: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },

  // Controls glass panel
  controlsGlass: {
    width: "100%",
    borderRadius: GLASS.radius.xl,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: GLASS.border.dark,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.45,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 14 },
      web: { boxShadow: "0 8px 28px rgba(0,0,0,0.55)" } as any,
    }),
  },
  controlsInner: {
    backgroundColor: GLASS.fill.dark,
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  controlsSpecular: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
  },

  // Action row
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  btnWrapper: {
    alignItems: "center",
    gap: 12,
  },

  // Individual action button
  actionBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: "hidden",
    borderWidth: 1,
  },
  actionBtnBlur: {
    flex: 1,
  },
  actionBtnOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },

  // Icon transforms
  rotated: {
    transform: [{ rotate: "135deg" }],
  },
});
