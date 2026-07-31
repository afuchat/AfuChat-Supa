import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

interface Props {
  wallpaper?: string;
  dark?: boolean;
}

export default function WallpaperOverlay({ wallpaper, dark }: Props) {
  const { width, height } = useWindowDimensions();

  const elements = useMemo<React.ReactNode[]>(() => {
    if (!wallpaper || wallpaper === "none") return [];
    const ink = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
    const items: React.ReactNode[] = [];

    if (wallpaper === "dots") {
      const gapX = 38, gapY = 38, dot = 4;
      const cols = Math.ceil(width  / gapX) + 1;
      const rows = Math.ceil(height / gapY) + 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (items.length >= 280) break;
          items.push(
            <View
              key={`d${r}-${c}`}
              style={{
                position: "absolute",
                width: dot, height: dot, borderRadius: dot / 2,
                backgroundColor: ink,
                top:  r * gapY + (c % 2 === 0 ? 0 : gapY / 2),
                left: c * gapX,
              }}
            />,
          );
        }
      }
    } else if (wallpaper === "lines") {
      const gap = 26;
      const count = Math.min(Math.ceil(height / gap) + 1, 50);
      for (let i = 0; i < count; i++) {
        items.push(
          <View
            key={`l${i}`}
            style={{ position: "absolute", height: 1, left: 0, right: 0, backgroundColor: ink, top: i * gap }}
          />,
        );
      }
    } else if (wallpaper === "grid") {
      const gap = 34;
      const rows = Math.min(Math.ceil(height / gap) + 1, 36);
      const cols = Math.min(Math.ceil(width  / gap) + 1, 20);
      for (let i = 0; i < rows; i++)
        items.push(<View key={`gh${i}`} style={{ position: "absolute", height: 1, left: 0, right: 0, backgroundColor: ink, top: i * gap }} />);
      for (let i = 0; i < cols; i++)
        items.push(<View key={`gv${i}`} style={{ position: "absolute", width: 1, top: 0, bottom: 0, backgroundColor: ink, left: i * gap }} />);
    } else if (wallpaper === "diamonds") {
      const step = 40, sz = 9;
      const cols = Math.ceil(width  / step) + 1;
      const rows = Math.ceil(height / step) + 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (items.length >= 250) break;
          items.push(
            <View
              key={`dia${r}-${c}`}
              style={{
                position: "absolute",
                width: sz, height: sz,
                borderWidth: 1,
                borderColor: ink,
                backgroundColor: "transparent",
                transform: [{ rotate: "45deg" }],
                top:  r * step - sz / 2 + (c % 2 === 0 ? 0 : step / 2),
                left: c * step - sz / 2,
              }}
            />,
          );
        }
      }
    }

    return items;
  }, [wallpaper, dark, width, height]);

  if (!elements.length) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      {elements}
    </View>
  );
}
