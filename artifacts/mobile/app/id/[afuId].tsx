import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "@/lib/supabase";

const DARK_BG = "#0a0f1a";
const BRAND = "#1f95ff";

export default function IdLandingPage() {
  const { afuId } = useLocalSearchParams<{ afuId: string }>();

  useEffect(() => {
    if (!afuId) { router.back(); return; }
    supabase
      .rpc("lookup_profile_by_afu_id", { p_afu_id: String(afuId).padStart(8, "0") })
      .then(({ data }) => {
        const p = data?.[0];
        if (p) router.replace({ pathname: "/contact/[id]", params: { id: p.id } } as any);
        else router.back();
      }, () => router.back());
  }, [afuId]);

  return (
    <View style={{ flex: 1, backgroundColor: DARK_BG, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={BRAND} size="large" />
    </View>
  );
}
