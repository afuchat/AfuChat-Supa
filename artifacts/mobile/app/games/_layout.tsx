import { Stack } from "expo-router";

export default function GamesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "none", contentStyle: { backgroundColor: "#0a0a0a" } }} />
  );
}
