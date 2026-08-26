import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {items.map((item) => {
        const active = activeKey === item.key || (!activeKey && pathname === item.href);
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => router.replace(item.href as any)}
            style={({ pressed }) => [styles.item, { opacity: pressed ? 0.65 : 1 }]}
          >
            <Ionicons name={item.icon} size={21} color={active ? accent : colors.textMuted} />
            <Text style={[styles.label, { color: active ? accent : colors.textMuted }]}>{item.label}</Text>
            {active && <View style={[styles.dot, { backgroundColor: accent }]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    paddingTop: 9,
    minHeight: 64,
    borderTopWidth: 0.5,
  },
  item: {
    minWidth: 58,
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
});