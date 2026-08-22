import React from "react";
import { View } from "react-native";
import type { ViewStyle } from "react-native";
import Colors from "@/constants/colors";

// ─── Expo Go detection ────────────────────────────────────────────────────────
// expo-linear-gradient's JS module loads fine in Expo Go, but its native view
// manager (ViewManagerAdapter_ExpoLinearGradient) is NOT registered. React
// Native throws during the native commit phase — after rendering — which means
// a React ErrorBoundary CANNOT catch it. We must skip the require entirely in
// Expo Go so NativeLinearGradient stays null and we fall back to a plain View.
function isExpoGo(): boolean {
  try {
    const Constants = require("expo-constants").default;
    return Constants?.executionEnvironment === "storeClient";
  } catch {
    return false;
  }
}

let NativeLinearGradient: React.ComponentType<any> | null = null;
if (!isExpoGo()) {
  try {
    NativeLinearGradient = require("expo-linear-gradient").LinearGradient;
  } catch (_) {}
}

type Props = {
  colors: readonly (string | number)[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  locations?: number[];
  style?: ViewStyle | any;
  children?: React.ReactNode;
  [key: string]: any;
};

export function LinearGradient({ colors, style, children, ...rest }: Props) {
  const fallback = typeof colors[0] === "string" ? (colors[0] as string) : Colors.brand;

  if (!NativeLinearGradient) {
    return (
      <View style={[style, { backgroundColor: fallback }]}>
        {children}
      </View>
    );
  }

  const Grad = NativeLinearGradient;
  return (
    <Grad colors={colors} style={style} {...rest}>
      {children}
    </Grad>
  );
}
