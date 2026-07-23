import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useSuperApp } from "@/lib/superapp/MiniAppRuntime";

export default function UsernameMarketPage() {
  const { openApp } = useSuperApp();

  useEffect(() => {
    openApp("afuusernames");
    router.replace("/(tabs)/apps");
  }, []);

  return <View style={{ flex: 1 }} />;
}
