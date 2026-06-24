import React from "react";
import { Text, StyleProp, TextStyle } from "react-native";
import { useUserEffects } from "@/hooks/useUserEffects";

const GOLD = "#D4A853";

type Props = {
  userId: string | null | undefined;
  name: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  suppressStar?: boolean;
};

export default function UserName({
  userId,
  name,
  style,
  numberOfLines,
  suppressStar = false,
}: Props) {
  const { goldNameplate, verifiedStar } = useUserEffects(userId);

  return (
    <Text
      style={goldNameplate ? [style, { color: GOLD }] : style}
      numberOfLines={numberOfLines}
    >
      {name}
      {!suppressStar && verifiedStar ? " ⭐" : ""}
    </Text>
  );
}
