import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";

export default function WalletTopUpPage() {
  useEffect(() => {
    router.replace("/app/afupay?section=topup" as any);
  }, []);
  return <View style={{ flex: 1 }} />;
}
