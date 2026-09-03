import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LOGO_WHITE_B64, LOGO_BLACK_B64 } from "@/lib/logoAssets";
import { useThemeContext } from "@/context/ThemeContext";

const LOGO_DARK = { uri: LOGO_WHITE_B64 };
const LOGO_LIGHT = { uri: LOGO_BLACK_B64 };

/**
 * AfuChat brand logo — theme-aware.
 * • Dark theme  → white logo (visible on dark backgrounds)
 * • Light theme → black logo (visible on light backgrounds)
 * • forceTheme  → override app theme ("dark" = white logo, "light" = black logo)
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
    <ExpoImage
      source={source}
      style={[
        { width: size, height: size },
        visualScale !== 1 && { transform: [{ scale: visualScale }] },
        style as any,
      ]}
      contentFit="contain"
      accessibilityLabel="AfuChat logo"
      cachePolicy="memory-disk"
    />
  );
}

export default AfuLogo;
