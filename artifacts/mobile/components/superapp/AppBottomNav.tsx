import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { usePathname } from "expo-router";

export type AppNavItem = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  href: string;
};

type Props = {
  items: AppNavItem[];
  activeKey?: string;
};

export default function AppBottomNav({ items, activeKey }: Props) {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  return (
    <View style={[styles.bar, {
      backgroundColor: colors.surface,
      paddingBottom: Platform.OS === "web" ? 34 : Math.max(insets.bottom, 8),
      minHeight: Platform.OS === "web" ? 84 : 64,
    }]}>
      {items.map((item) => {
        const active = activeKey === item.key || (!activeKey && pathname === item.href);
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => router.replace(item.href as any)}
            style={({ pressed }) => [
              styles.item,
              active && { backgroundColor: accent + "18" },
              { opacity: pressed ? 0.65 : 1 },
            ]}
          >
            <View style={styles.itemContent}>
              <Ionicons name={item.icon} size={21} color={active ? accent : colors.textMuted} />
              <Text style={[styles.label, { color: active ? accent : colors.textMuted }]} numberOfLines={1}>{item.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 9,
  },
  item: {
    flex: 1,
    maxWidth: 110,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  itemContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
});