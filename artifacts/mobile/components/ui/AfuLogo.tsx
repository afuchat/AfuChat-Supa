import React from "react";
import { Image as RNImage, StyleProp, ViewStyle } from "react-native";
import Svg, { Defs, Ellipse, Image as SvgImage, Mask, Rect } from "react-native-svg";
import { LOGO_BLACK_B64 } from "@/lib/logoAssets";
import { LOGO_WHITE_BOLD_B64 } from "@/lib/logoWhiteBold";
import { useThemeContext } from "@/context/ThemeContext";

const LOGO_DARK = { uri: LOGO_WHITE_BOLD_B64 };
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
  withoutFlame = false,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
  forceTheme?: "dark" | "light";
  withoutFlame?: boolean;
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

  if (withoutFlame) {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 1024 1024"
        style={[
          visualScale !== 1 && { transform: [{ scale: visualScale }] },
          style as any,
        ]}
        accessibilityLabel="AfuChat logo"
      >
        <Defs>
          <Mask id="afu-logo-without-flame" maskUnits="userSpaceOnUse">
            <Rect width="1024" height="1024" fill="#FFFFFF" />
            {/* The logo artwork's inner flame is isolated from the outer
                transparent chat mark, so the backdrop shows through here. */}
            <Ellipse cx="512" cy="512" rx="248" ry="244" fill="#000000" />
          </Mask>
        </Defs>
        <SvgImage
          href={source.uri}
          x="0"
          y="0"
          width="1024"
          height="1024"
          preserveAspectRatio="xMidYMid meet"
          mask="url(#afu-logo-without-flame)"
        />
      </Svg>
    );
  }

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
