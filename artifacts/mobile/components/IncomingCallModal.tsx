// ─── IncomingCallModal ────────────────────────────────────────────────────────
// Full-screen incoming call overlay — renders above everything else.
// Auto-declines after 30 s if the user doesn't interact.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Vibration,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/ui/Avatar";
import { useCall } from "@/context/CallContext";
import { notifyMissedCall } from "@/lib/notifyUser";
import { declineCall as engineDecline } from "@/lib/callEngine";

const AUTO_DECLINE_MS = 30_000;

// Vibration pattern: buzz-pause repeated
const VIBRATION_PATTERN =
  Platform.OS === "android"
    ? [0, 600, 400, 600, 400, 600]
    : [0, 400, 200, 400];

export function IncomingCallModal() {
  const { incomingNotice, acceptCall, declineCall } = useCall();
  const insets = useSafeAreaInsets();

  const ringScale1 = useRef(new Animated.Value(1)).current;
  const ringScale2 = useRef(new Animated.Value(1)).current;
  const ringOpacity1 = useRef(new Animated.Value(0.6)).current;
  const ringOpacity2 = useRef(new Animated.Value(0.4)).current;
  const slideIn = useRef(new Animated.Value(60)).current;
  const fadeIn  = useRef(new Animated.Value(0)).current;

  const autoDeclineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const visible = !!incomingNotice;

  // ── Entrance animation + ring loop ────────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      animLoopRef.current?.stop();
      animLoopRef.current = null;
      Vibration.cancel();
      return;
    }

    // Slide in + fade
    Animated.parallel([
      Animated.spring(slideIn, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 200 }),
      Animated.timing(fadeIn, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    // Pulsing ring waves
    const loop = Animated.loop(
      Animated.stagger(300, [
        Animated.parallel([
          Animated.timing(ringScale1, { toValue: 1.6, duration: 1000, useNativeDriver: true }),
          Animated.timing(ringOpacity1, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ringScale2, { toValue: 1.6, duration: 1000, useNativeDriver: true }),
          Animated.timing(ringOpacity2, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ]),
      ]),
    );
    animLoopRef.current = loop;
    loop.start();

    // Reset ring values each loop via a separate reset (Animated.loop handles restart)
    ringScale1.setValue(1); ringOpacity1.setValue(0.6);
    ringScale2.setValue(1); ringOpacity2.setValue(0.4);

    // Vibration
    Vibration.vibrate(VIBRATION_PATTERN, true);

    // Auto-decline
    autoDeclineTimer.current = setTimeout(() => {
      if (incomingNotice) {
        // Record as missed on callee side
        notifyMissedCall({
          calleeId: incomingNotice.callerId, // notify caller that we missed
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
      animLoopRef.current?.stop();
      Vibration.cancel();
      slideIn.setValue(60);
      fadeIn.setValue(0);
      ringScale1.setValue(1); ringOpacity1.setValue(0.6);
      ringScale2.setValue(1); ringOpacity2.setValue(0.4);
    };
  }, [visible]);

  const handleDecline = useCallback(() => {
    if (autoDeclineTimer.current) clearTimeout(autoDeclineTimer.current);
    declineCall();
  }, [declineCall]);

  const handleAccept = useCallback(() => {
    if (autoDeclineTimer.current) clearTimeout(autoDeclineTimer.current);
    acceptCall();
  }, [acceptCall]);

  if (!incomingNotice) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={handleDecline}
    >
      <View style={styles.root}>
        {/* Dark gradient background */}
        <View style={StyleSheet.absoluteFill}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0a0a0f" }]} />
          <View style={[StyleSheet.absoluteFill, styles.radialGlow]} />
        </View>

        <Animated.View
          style={[
            styles.content,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
            { transform: [{ translateY: slideIn }], opacity: fadeIn },
          ]}
        >
          {/* Avatar + ring waves */}
          <View style={styles.avatarSection}>
            <Animated.View
              style={[
                styles.ring,
                { transform: [{ scale: ringScale1 }], opacity: ringOpacity1 },
              ]}
            />
            <Animated.View
              style={[
                styles.ring,
                { transform: [{ scale: ringScale2 }], opacity: ringOpacity2 },
              ]}
            />
            <View style={styles.avatarBorder}>
              <Avatar
                uri={incomingNotice.callerAvatar}
                name={incomingNotice.callerName}
                size={96}
              />
            </View>
          </View>

          {/* Caller info */}
          <Text style={styles.callerName} numberOfLines={1}>
            {incomingNotice.callerName}
          </Text>
          <View style={styles.callTypeBadge}>
            <Ionicons name="call" size={12} color="#34C759" />
            <Text style={styles.callTypeText}>Voice Call</Text>
          </View>

          <Text style={styles.subtitle}>Incoming voice call…</Text>

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* Action buttons */}
          <View style={styles.actionRow}>
            {/* Decline */}
            <View style={styles.btnWrapper}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.declineBtn]}
                onPress={handleDecline}
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={28} color="#fff" style={styles.rotated} />
              </TouchableOpacity>
              <Text style={styles.btnLabel}>Decline</Text>
            </View>

            {/* Accept */}
            <View style={styles.btnWrapper}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn]}
                onPress={handleAccept}
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.btnLabel}>Accept</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const AVATAR_SIZE = 96;
const RING_SIZE = AVATAR_SIZE + 32;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  radialGlow: {
    borderRadius: 0,
    backgroundColor: "rgba(52,199,89,0.06)",
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  avatarSection: {
    marginTop: 60,
    width: RING_SIZE + 40,
    height: RING_SIZE + 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  ring: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1.5,
    borderColor: "rgba(52,199,89,0.5)",
  },
  avatarBorder: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    borderRadius: (AVATAR_SIZE + 6) / 2,
    borderWidth: 2,
    borderColor: "rgba(52,199,89,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  callerName: {
    color: "#fff",
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    maxWidth: 280,
    marginBottom: 10,
  },
  callTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(52,199,89,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 12,
  },
  callTypeText: {
    color: "#34C759",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: 8,
  },
  btnWrapper: {
    alignItems: "center",
    gap: 10,
  },
  actionBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  declineBtn: {
    backgroundColor: "#FF3B30",
  },
  acceptBtn: {
    backgroundColor: "#34C759",
  },
  btnLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  rotated: {
    transform: [{ rotate: "135deg" }],
  },
});
