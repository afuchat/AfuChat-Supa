import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { useUserEffects } from "@/hooks/useUserEffects";
import { useTheme } from "@/hooks/useTheme";

const GOLD = "#D4A853";
const SEAL_BG = "#1a1a2e";

type Props = {
  userId: string | null | undefined;
};

export default function RoyaltyBadge({ userId }: Props) {
  const { founderSeal, royaltyTitle } = useUserEffects(userId);
  const { colors } = useTheme();

  if (!royaltyTitle && !founderSeal) return null;

  return (
    <View style={styles.row}>
      {royaltyTitle && (
        <View style={[styles.titleBadge, { borderColor: GOLD + "66" }]}>
          <Text style={styles.titleEmoji}>🎖️</Text>
          <Text style={[styles.titleText, { color: GOLD }]}>Royalty of AfuChat</Text>
        </View>
      )}
      {founderSeal && (
        <View style={[styles.sealBadge, { backgroundColor: SEAL_BG, borderColor: GOLD + "55" }]}>
          <Text style={styles.sealEmoji}>🔏</Text>
          <Text style={[styles.sealText, { color: GOLD }]}>Founder</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  titleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#D4A85312",
  },
  titleEmoji: { fontSize: 11 },
  titleText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  sealBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  sealEmoji: { fontSize: 11 },
  sealText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
