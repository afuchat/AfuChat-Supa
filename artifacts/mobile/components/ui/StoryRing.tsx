import React from "react";
import { View } from "react-native";
import { useAppAccent } from "@/context/AppAccentContext";

let _svgMod: any = null;
function getSvgMod() {
  if (_svgMod !== null) return _svgMod;
  try { _svgMod = require("react-native-svg"); } catch { _svgMod = {}; }
  return _svgMod;
}
function hasSvg() {
  const M = getSvgMod();
  return !!(M.default ?? M.Svg);
}
const SvgRoot = (props: any) => {
  const M = getSvgMod();
  const C = M.default ?? M.Svg;
  if (!C) return null;
  return require("react").createElement(C, props);
};
const Circle = (props: any) => {
  const M = getSvgMod();
  const C = M.Circle ?? M.default?.Circle;
  if (!C) return null;
  return require("react").createElement(C, props);
};

type Props = {
  size: number;
  storyCount: number;
  seenCount: number;
  children: React.ReactNode;
};

export function StoryRing({ size, storyCount, seenCount, children }: Props) {
  const { accent } = useAppAccent();
  const strokeWidth = 2.5;
  const maxSegments = Math.min(storyCount, 30);
  const gap = maxSegments > 1 ? Math.min(6, (2 * Math.PI * ((size + strokeWidth * 2 + 4 - strokeWidth) / 2)) / (maxSegments * 3)) : 0;
  const outerSize = size + strokeWidth * 2 + 4;
  const radius = (outerSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = outerSize / 2;

  const hasUnseen = storyCount > seenCount;

  if (storyCount === 0) {
    return <View style={{ padding: strokeWidth + 2 }}>{children}</View>;
  }

  if (!hasSvg()) {
    const ringColor = hasUnseen ? accent : "#8E8E93";
    return (
      <View style={{
        width: outerSize, height: outerSize,
        alignItems: "center", justifyContent: "center",
        borderRadius: outerSize / 2,
        borderWidth: strokeWidth,
        borderColor: ringColor,
      }}>
        {children}
      </View>
    );
  }

  const totalGapLength = gap * maxSegments;
  const availableLength = circumference - totalGapLength;
  const segmentLength = availableLength / maxSegments;
  const gapLength = maxSegments > 1 ? gap : 0;

  const segments = [];
  for (let i = 0; i < maxSegments; i++) {
    const isSeen = i < seenCount;
    const offset = i * (segmentLength + gapLength);
    segments.push(
      <Circle
        key={i}
        cx={center}
        cy={center}
        r={radius}
        stroke={isSeen ? "#8E8E93" : accent}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
        strokeDashoffset={-offset}
        strokeLinecap="round"
        transform={`rotate(-90, ${center}, ${center})`}
      />
    );
  }

  return (
    <View style={{ width: outerSize, height: outerSize, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: outerSize, height: outerSize }}>
        <SvgRoot width={outerSize} height={outerSize}>
          {segments}
        </SvgRoot>
      </View>
      {children}
    </View>
  );
}
