import { Stack } from "expo-router";
import { useTheme } from "@/hooks/useTheme";

export default function FreelanceLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: colors.background } }} />
  );
}
