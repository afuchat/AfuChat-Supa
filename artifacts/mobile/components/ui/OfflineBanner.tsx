import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { STATUS } from "@/constants/colors";
import { T } from "@/constants/theme";

type State = "hidden" | "offline" | "reconnected";

export default function OfflineBanner() {
  return null;
}

const st = StyleSheet.create({
  pill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: T.space.sm - 2,
    paddingHorizontal: T.space.lg - 2,
    paddingVertical: T.space.sm - 2,
    borderRadius: T.radius.pill,
    zIndex: 99999,
    elevation: T.elevation.overlay,
    ...Platform.select({
      web: {},
      default: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.22,
      shadowRadius: T.space.sm,
      },
    })
  },
  label: {
    color: "#fff",
    ...T.caption,
    fontSize: 12,
    letterSpacing: 0.1,
  },
});
