import React from "react";
import { Platform, View } from "react-native";

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
const Rect = (props: any) => {
  const M = getSvgMod();
  const C = M.Rect ?? M.default?.Rect;
  if (!C) return null;
  return require("react").createElement(C, props);
};

import Colors from "@/constants/colors";
import { useAppAccent } from "@/context/AppAccentContext";

type RingType = 'premium' | 'crown' | 'void' | 'diamond';

const RING_COLORS: Record<RingType, { primary: string; secondary: string }> = {
  premium: { primary: Colors.gold,  secondary: "#E8C878" },
  crown:   { primary: Colors.gold,  secondary: "#E8C878" },
  void:    { primary: "#7B2FBE",    secondary: "#9F4DDB" },
  diamond: { primary: "#60CBFF",    secondary: "#A5E8FF" },
};

type Props = {
  size: number;
  children: React.ReactNode;
  square?: boolean;
  ringType?: RingType;
};

export function PremiumRing({ size, children, square, ringType = 'premium' }: Props) {
  const { accent } = useAppAccent();
  const ringColors = RING_COLORS[ringType];
  const primaryColor = ringColors.primary;
  const secondaryColor = ringType === 'premium' ? accent : ringColors.secondary;

  const ring = 2.5;
  const gap = 2;
  const outerSize = size + (ring + gap) * 2;
  const center = outerSize / 2;
  const arcGap = 5;

  if (!hasSvg()) {
    return (
      <View style={{ width: outerSize, height: outerSize, alignItems: "center", justifyContent: "center" }}>
        <View style={{
          position: "absolute", width: outerSize, height: outerSize,
          borderRadius: square ? outerSize * 0.2 : outerSize / 2,
          borderWidth: ring,
          borderColor: primaryColor,
        }} />
        <View style={{ position: "absolute" }}>{children}</View>
      </View>
    );
  }

  let ringShape: React.ReactNode;

  if (square) {
    const avatarRadius = size * 0.2;
    const rx = avatarRadius + gap + ring / 2;
    const rectW = outerSize - ring;
    const rectH = outerSize - ring;
    const straight = 2 * (rectW + rectH) - 8 * rx;
    const curved = 2 * Math.PI * rx;
    const perimeter = straight + curved;
    const halfPerim = perimeter / 2;

    ringShape = (
      <SvgRoot width={outerSize} height={outerSize}>
        <Rect
          x={ring / 2} y={ring / 2} width={rectW} height={rectH} rx={rx} ry={rx}
          stroke={primaryColor} strokeWidth={ring} fill="none"
          strokeDasharray={`${halfPerim - arcGap} ${halfPerim + arcGap}`}
          strokeDashoffset={0} strokeLinecap="round"
        />
        <Rect
          x={ring / 2} y={ring / 2} width={rectW} height={rectH} rx={rx} ry={rx}
          stroke={secondaryColor} strokeWidth={ring} fill="none"
          strokeDasharray={`${halfPerim - arcGap} ${halfPerim + arcGap}`}
          strokeDashoffset={-(halfPerim)} strokeLinecap="round"
        />
      </SvgRoot>
    );
  } else {
    const radius = (outerSize - ring) / 2;
    const circumference = 2 * Math.PI * radius;
    const halfCirc = circumference / 2;

    ringShape = (
      <SvgRoot width={outerSize} height={outerSize}>
        <Circle
          cx={center} cy={center} r={radius}
          stroke={primaryColor} strokeWidth={ring} fill="none"
          strokeDasharray={`${halfCirc - arcGap} ${halfCirc + arcGap}`}
          strokeDashoffset={0} strokeLinecap="round"
          rotation={-90} origin={`${center}, ${center}`}
        />
        <Circle
          cx={center} cy={center} r={radius}
          stroke={secondaryColor} strokeWidth={ring} fill="none"
          strokeDasharray={`${halfCirc - arcGap} ${halfCirc + arcGap}`}
          strokeDashoffset={-(halfCirc)} strokeLinecap="round"
          rotation={-90} origin={`${center}, ${center}`}
        />
      </SvgRoot>
    );
  }

  return (
    <View style={{ width: outerSize, height: outerSize, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: outerSize, height: outerSize }}>
        {ringShape}
      </View>
      <View style={{ position: "absolute" }}>
        {children}
      </View>
    </View>
  );
}
