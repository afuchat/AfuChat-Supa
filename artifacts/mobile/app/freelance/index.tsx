import { useEffect } from "react";
import { View } from "react-native";
import { useSuperApp } from "@/lib/superapp/MiniAppRuntime";
import { safeRouter } from "@/lib/navUtils";

export default function FreelancePage() {
  const { openApp } = useSuperApp();

  useEffect(() => {
    openApp("afufreelance");
    safeRouter.replace("/(tabs)/apps");
  }, []);

  return <View style={{ flex: 1 }} />;
}
