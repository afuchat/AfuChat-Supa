import React from "react";
import { Image as RNImage, StyleProp, ViewStyle } from "react-native";
import { LOGO_BLACK_B64 } from "@/lib/logoAssets";
import { useThemeContext } from "@/context/ThemeContext";

const LOGO_DARK = require("@/assets/images/white-logo-bold.png");
const LOGO_LIGHT = { uri: LOGO_BLACK_B64 };

/**
 * AfuChat brand logo — theme-aware.
 * • Dark theme  → notification icon (light marks on dark bg)
 * • Light theme → black logo (dark marks on light bg)
 * • forceTheme  → override app theme ("dark" = notification icon, "light" = black logo)
 */
export function AfuLogo({
  size = 72,
  style,
  forceTheme,
  visualScale = 1,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
  forceTheme?: "dark" | "light";
  /**
   * Enlarges the artwork inside its allocated box. The source PNG includes
   * transparent breathing room, so this increases the visible mark without
   * changing surrounding layout dimensions.
   */
  visualScale?: number;
}) {
  const { isDark } = useThemeContext();
  const resolved = forceTheme ?? (isDark ? "dark" : "light");
  const source = resolved === "dark" ? LOGO_DARK : LOGO_LIGHT;

  return (
    <RNImage
      source={source}
      style={[
        { width: size, height: size },
        visualScale !== 1 && { transform: [{ scale: visualScale }] },
        style as any,
      ]}
      resizeMode="contain"
      accessibilityLabel="AfuChat logo"
    />
  );
}

export default AfuLogo;
