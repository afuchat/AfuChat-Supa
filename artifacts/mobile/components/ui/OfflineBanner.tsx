import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { STATUS } from "@/constants/colors";
import { T } from "@/constants/theme";

type State = "hidden" | "offline" | "connecting" | "updating";

export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>(() => (isOnline() ? "hidden" : "offline"));
  const stateRef = useRef<State>(state);
  const wasOffline = useRef(state === "offline");
  const connectingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    stateRef.current = state;
    const visible = state !== "hidden";
    Animated.timing(translateY, {
      toValue: visible ? 0 : -80,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [state, translateY]);

  useEffect(() => {
    const clearTimers = () => {
      if (connectingTimer.current) clearTimeout(connectingTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      connectingTimer.current = null;
      hideTimer.current = null;
    };

    const unsubscribe = onConnectivityChange((online) => {
      clearTimers();
      if (!online) {
        wasOffline.current = true;
        setState("offline");
        return;
      }
      if (!wasOffline.current) {
        setState("hidden");
        return;
      }
      wasOffline.current = false;

      // A real reconnect gets an explicit two-step status. The work itself is
      // owned by AuthContext/offlineSync and remains fire-and-forget.
      setState("connecting");
      connectingTimer.current = setTimeout(() => {
        if (stateRef.current !== "connecting") return;
        setState("updating");
        hideTimer.current = setTimeout(() => setState("hidden"), 3500);
      }, 850);
    });

    return () => {
      clearTimers();
      unsubscribe();
    };
  }, []);

  if (state === "hidden") return null;

  const isOffline = state === "offline";
  const isConnecting = state === "connecting";
  const backgroundColor = isOffline ? STATUS.warning : STATUS.success;
  const icon = isOffline ? "cloud-offline-outline" : isConnecting ? "wifi-outline" : "sync-outline";
  const label = isOffline ? "Waiting for network" : isConnecting ? "Connecting…" : "Updating…";

  return (
    <Animated.View
      style={[
        st.pill,
        // Sit just below the app/header name instead of covering the status
        // bar or the top navigation controls.
        { top: insets.top + 48, backgroundColor, pointerEvents: "none", transform: [{ translateY }] },
      ]}
    >
      <Ionicons name={icon as any} size={15} color="#fff" />
      <Text style={st.label}>{label}</Text>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  pill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: T.radius.pill,
    zIndex: 99999,
    elevation: T.elevation.overlay,
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.22)" } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: T.space.sm,
      },
    }),
  },
  label: {
    color: "#fff",
    ...T.caption,
    fontSize: 10,
    letterSpacing: 0.1,
  },
});
