import React, { useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import {
  getPostUploadState,
  subscribePostUpload,
} from "@/lib/postUploadStore";

function usePostUpload() {
  return useSyncExternalStore(subscribePostUpload, getPostUploadState, getPostUploadState);
}

export default function PostUploadBanner() {
  const { colors } = useTheme();
  const upload = usePostUpload();
  if (!upload) return null;

  const isDone   = upload.done;
  const isFailed = upload.failed;
  const pct      = Math.round(upload.progress * 100);
  const isVideo  = upload.type === "video";

  return (
    <View style={[s.wrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={s.row}>
        <View style={[s.iconCircle, {
          backgroundColor: isDone ? "#22C55E20" : isFailed ? "#EF444420" : colors.accent + "22",
        }]}>
          <Ionicons
            name={isDone ? "checkmark-circle" : isFailed ? "alert-circle" : isVideo ? "videocam" : "image"}
            size={16}
            color={isDone ? "#22C55E" : isFailed ? "#EF4444" : colors.accent}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.label, { color: colors.text }]}>
            {isDone
              ? `${isVideo ? "Video" : "Post"} published!`
              : isFailed
              ? `${isVideo ? "Video" : "Post"} upload failed`
              : upload.label?.startsWith("Compressing")
              ? "Compressing video…"
              : `Posting your ${isVideo ? "video" : "post"}…`}
          </Text>
          {isFailed && upload.errorMessage ? (
            <Text style={[s.caption, { color: "#EF4444" }]} numberOfLines={2}>
              {upload.errorMessage}
            </Text>
          ) : upload.label && !upload.label.startsWith("Compressing") ? (
            <Text style={[s.caption, { color: colors.textMuted }]} numberOfLines={1}>
              {upload.label}
            </Text>
          ) : null}
        </View>
        {!isDone && !isFailed && (
          <Text style={[s.pct, { color: colors.accent }]}>{pct}%</Text>
        )}
      </View>
      {!isDone && !isFailed && (
        <View style={[s.track, { backgroundColor: colors.border }]}>
          <View style={[s.fill, { width: `${pct}%` as any, backgroundColor: colors.accent }]} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:       { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  row:        { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  iconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  label:      { fontSize: 13, fontWeight: "600" },
  caption:    { fontSize: 11, marginTop: 1 },
  pct:        { fontSize: 12, fontWeight: "600", minWidth: 30, textAlign: "right" },
  track:      { height: 3, borderRadius: 2, overflow: "hidden" },
  fill:       { height: 3, borderRadius: 2 },
});
