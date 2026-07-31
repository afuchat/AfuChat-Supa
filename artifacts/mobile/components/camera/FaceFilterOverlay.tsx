import React from "react";
import { View, StyleSheet } from "react-native";
import { FilterId, FILTERS, getLipColor } from "./filterDefs";

interface Props {
  filter: FilterId;
  videoRef?: React.RefObject<any>;
  width?: number;
  height?: number;
}

export default function FaceFilterOverlay({ filter }: Props) {
  if (filter === "normal") return null;

  const def = FILTERS.find((f) => f.id === filter);

  const isLip = filter === "lipstick_red" || filter === "lipstick_pink" || filter === "lipstick_coral";
  const isBlush = filter === "blush";
  const isSunglasses = filter === "sunglasses";

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      {def?.overlayColor && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: def.overlayColor }]} />
      )}

      {isLip && (
        <View style={st.lipWrap}>
          <View style={[st.lip, { backgroundColor: getLipColor(filter) }]} />
        </View>
      )}

      {isBlush && (
        <>
          <View style={[st.blushLeft, { backgroundColor: "rgba(240,100,140,0.32)" }]} />
          <View style={[st.blushRight, { backgroundColor: "rgba(240,100,140,0.32)" }]} />
        </>
      )}

      {isSunglasses && (
        <View style={st.sunglassesWrap}>
          <View style={st.sunglasses}>
            <View style={[st.lens, { marginRight: 4 }]} />
            <View style={[st.lens, { marginLeft: 4 }]} />
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  lipWrap: {
    position: "absolute",
    bottom: "30%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  lip: {
    width: 80,
    height: 28,
    borderRadius: 14,
    opacity: 0.8,
  },
  blushLeft: {
    position: "absolute",
    top: "38%",
    left: "12%",
    width: 60,
    height: 34,
    borderRadius: 30,
  },
  blushRight: {
    position: "absolute",
    top: "38%",
    right: "12%",
    width: 60,
    height: 34,
    borderRadius: 30,
  },
  sunglassesWrap: {
    position: "absolute",
    top: "28%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  sunglasses: {
    flexDirection: "row",
    alignItems: "center",
  },
  lens: {
    width: 72,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(10,10,30,0.78)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
});
