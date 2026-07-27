/**
 * GlassButton — pill-shaped translucent button matching the welcome / login
 * screen aesthetic. Uses the same rgba(255,255,255,0.08) fill that the
 * "Continue with Google" button on the login screen uses.
 *
 * Usage:
 *   <GlassButton onPress={...}>Continue with Google</GlassButton>
 *   <GlassButton onPress={...} icon="mail-outline">Continue with email</GlassButton>
 *   <GlassButton onPress={...} variant="primary">Get Started</GlassButton>
 */

import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Variant = "glass" | "primary" | "subtle";

type GlassButtonProps = {
  onPress: () => void;
  children: React.ReactNode;
  /** Left-side Ionicons icon name */
  icon?: string;
  /** Visual style. "glass" = translucent (default); "primary" = accent-filled; "subtle" = lower opacity glass */
  variant?: Variant;
  /** Accent colour used when variant="primary" */
  accentColor?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  activeOpacity?: number;
};

export function GlassButton({
  onPress,
  children,
  icon,
  variant = "glass",
  accentColor,
  disabled = false,
  loading = false,
  style,
  textStyle,
  activeOpacity = 0.78,
}: GlassButtonProps) {
  const bg =
    variant === "primary"
      ? accentColor ?? "rgba(255,255,255,0.08)"
      : variant === "subtle"
      ? "rgba(255,255,255,0.05)"
      : "rgba(255,255,255,0.08)";

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={activeOpacity}
      style={[
        s.btn,
        { backgroundColor: bg, opacity: disabled && !loading ? 0.45 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <View style={s.inner}>
          {!!icon && (
            <Ionicons
              name={icon as any}
              size={20}
              color="rgba(255,255,255,0.75)"
              style={s.icon}
            />
          )}
          <Text style={[s.label, textStyle]}>{children}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    height: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  icon: {},
  label: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.85)",
  },
});
