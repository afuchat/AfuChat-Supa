import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useSuperApp } from "@/lib/superapp/MiniAppRuntime";

export default function WalletPage() {
  const { openApp } = useSuperApp();

  useEffect(() => {
    openApp("afupay");
    router.replace("/(tabs)/apps");
  }, []);

  return <View style={{ flex: 1 }} />;
}
