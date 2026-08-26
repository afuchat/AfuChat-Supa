import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";

export default function SavedPostsPage() {
  useEffect(() => {
    router.replace("/app/afusaved" as any);
  }, []);
  return <View style={{ flex: 1 }} />;
}
