import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "@/components/ui/SafeGradient";
import Colors from "@/constants/colors";

export const ONBOARDING_THEME = {
  background: Colors.dark.background,
  // Keep one consistent dark base across welcome, language selection, and
  // profile setup. The colored orbs still add atmosphere without changing
  // the underlying page color.
  gradientTop: Colors.dark.background,
  gradientMiddle: Colors.dark.background,
  orbBlue: "#1018D8",
  orbPurple: "#4B237A",
  text: Colors.dark.text,
  textSecondary: "rgba(255,255,255,0.62)",
  textMuted: "rgba(255,255,255,0.42)",
  inputBackground: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.14)",
} as const;

export default function OnboardingBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[
          ONBOARDING_THEME.gradientTop,
          ONBOARDING_THEME.gradientMiddle,
          ONBOARDING_THEME.background,
        ]}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb, styles.orbBlue]} />
      <View style={[styles.orb, styles.orbPurple]} />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.15,
  },
  orbBlue: {
    width: 260,
    height: 260,
    top: -120,
    right: -85,
    backgroundColor: ONBOARDING_THEME.orbBlue,
  },
  orbPurple: {
    width: 200,
    height: 200,
    top: 210,
    left: -120,
    backgroundColor: ONBOARDING_THEME.orbPurple,
  },
});