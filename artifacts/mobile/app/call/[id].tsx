import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "@/components/ui/Avatar";
import { useCall } from "@/context/CallContext";
import { useTheme } from "@/hooks/useTheme";

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export default function CallScreen() {
  const { colors } = useTheme();
  const { status, callInfo, isMuted, isSpeaker, toggleMute, toggleSpeaker, endCall } = useCall();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (status !== "active") return;
    const startedAt = callInfo?.answeredAt ?? Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [status, callInfo?.answeredAt]);

  useEffect(() => {
    if (status === "idle" || status === "ended") router.back();
  }, [status]);

  const remoteName = callInfo?.isCaller ? callInfo.calleeName : callInfo?.callerName;
  const remoteAvatar = callInfo?.isCaller ? callInfo.calleeAvatar : callInfo?.callerAvatar;
  const label = status === "active"
    ? formatDuration(seconds)
    : status === "connecting" ? "Connecting…" : "Calling…";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => { void endCall(); }} hitSlop={12}>
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.text }]}>Voice call</Text>
        <View style={{ width: 28 }} />
      </View>
      <View style={styles.center}>
        <Avatar uri={remoteAvatar} name={remoteName ?? "AfuChat user"} size={112} />
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {remoteName ?? "AfuChat user"}
        </Text>
        <Text style={[styles.status, { color: colors.textMuted }]}>{label}</Text>
        {status === "connecting" && <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />}
      </View>
      <View style={styles.controls}>
        <TouchableOpacity style={[styles.control, { backgroundColor: colors.surface }]} onPress={toggleMute}>
          <Ionicons name={isMuted ? "mic-off" : "mic"} size={24} color={colors.text} />
          <Text style={[styles.controlLabel, { color: colors.text }]}>{isMuted ? "Unmute" : "Mute"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.hangup} onPress={() => { void endCall(); }}>
          <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.control, { backgroundColor: colors.surface }]} onPress={toggleSpeaker}>
          <Ionicons name={isSpeaker ? "volume-high" : "volume-medium"} size={24} color={colors.text} />
          <Text style={[styles.controlLabel, { color: colors.text }]}>{isSpeaker ? "Speaker" : "Audio"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  top: { paddingTop: 60, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topTitle: { fontSize: 16, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 80 },
  name: { fontSize: 25, fontWeight: "700", marginTop: 20, maxWidth: "90%" },
  status: { fontSize: 15, marginTop: 8 },
  controls: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 24, paddingBottom: 42 },
  control: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center" },
  controlLabel: { fontSize: 10, marginTop: 3 },
  hangup: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#D92D3F", alignItems: "center", justifyContent: "center" },
});