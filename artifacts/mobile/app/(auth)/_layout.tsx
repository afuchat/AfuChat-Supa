import { Stack } from "expo-router";
import { useTheme } from "@/hooks/useTheme";

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, animation: "none", gestureEnabled: true, contentStyle: { backgroundColor: colors.background } }} />
  );
}
