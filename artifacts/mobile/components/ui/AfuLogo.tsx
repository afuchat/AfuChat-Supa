import React from "react";
import { Image as RNImage, StyleProp, ViewStyle } from "react-native";
import Svg, { Defs, Ellipse, Image as SvgImage, Mask, Rect } from "react-native-svg";

const LOGO_SOURCE = require("@/assets/images/black-logo.png");

/**
 * AfuChat brand logo.
 * The logo intentionally uses one fixed black asset in every context.
 */
export function AfuLogo({
  size = 72,
  style,
  visualScale = 1,
  withoutFlame = false,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
  withoutFlame?: boolean;
  /**
   * Enlarges the artwork inside its allocated box. The source PNG includes
   * transparent breathing room, so this increases the visible mark without
   * changing surrounding layout dimensions.
   */
  visualScale?: number;
}) {
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
          href={LOGO_SOURCE as any}
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
      source={LOGO_SOURCE}
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
