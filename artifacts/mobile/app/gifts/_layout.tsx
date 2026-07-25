import { Stack } from "expo-router";
import { useTheme } from "@/hooks/useTheme";

export default function GiftsLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade", gestureEnabled: true, contentStyle: { backgroundColor: colors.background } }} />
  );
}
