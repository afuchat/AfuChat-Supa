/**
 * Catch-all route for /@username and /username.
 *
 * Every valid handle resolves to the original full profile screen at
 * /contact/[id]. This route intentionally contains no second profile UI.
 */

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams, useRootNavigationState } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { ProfileNotFoundView } from "@/app/profile-not-found";
import { ContactProfileSkeleton } from "@/components/ui/Skeleton";
import { logHandleLeak } from "@/lib/deepLinkVerifier";

function safeNavigate(path: string, params?: Record<string, string>) {
  try {
    if (params) router.replace({ pathname: path as any, params });
    else router.replace(path as any);
  } catch {}
}

const RESERVED_ROUTES = new Set([
  "browser", "onboarding", "welcome", "settings", "wallet", "shop", "chat",
  "discover", "video", "shorts", "moments", "match", "games", "ai", "support",
  "company", "freelance", "article", "channel", "group", "join", "my-posts",
  "profile", "post", "stories", "red-envelope", "mini-programs", "gifts", "p",
  "update-password", "contact", "cart", "orders", "product", "index", "logout",
  "register", "login", "reset-password", "404", "not-found", "about", "lab",
  "achievements", "watch-history", "prestige", "store", "premium", "status",
  "digital-id", "qr-scanner", "create-post", "followers", "saved-posts",
  "collections", "language-settings", "device-security",
  "phone-contacts", "user-discovery", "username-market", "digital-events",
  "file-manager", "business", "business-verification", "paid-communities", "help",
]);

export default function HandleScreen() {
  const { handle: rawHandle } = useLocalSearchParams<{ handle: string }>();
  const { session, loading: authLoading } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigationState = useRootNavigationState();
  const hasNavigated = useRef(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileNotFound, setProfileNotFound] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  const cleanHandle = (rawHandle || "").replace(/^@/, "").toLowerCase();
  const isValidHandle =
    /^[a-zA-Z0-9_]{1,30}$/.test(cleanHandle) &&
    !RESERVED_ROUTES.has(cleanHandle);

  useEffect(() => {
    if (!cleanHandle || !RESERVED_ROUTES.has(cleanHandle)) return;
    logHandleLeak(cleanHandle, "reserved app route reached [handle].tsx");
    if (!hasNavigated.current) {
      hasNavigated.current = true;
      safeNavigate(session ? "/(tabs)/discover" : "/welcome");
    }
  }, [cleanHandle, session]);

  useEffect(() => {
    if (!isValidHandle) {
      setDataReady(true);
      return;
    }

    let cancelled = false;
    async function resolve() {
      const { data: primary } = await supabase
        .from("profiles")
        .select("id")
        .eq("handle", cleanHandle)
        .maybeSingle();

      if (cancelled) return;
      if (primary?.id) {
        setProfileId(primary.id);
        setDataReady(true);
        return;
      }

      const { data: alias } = await supabase
        .from("owned_usernames")
        .select("owner_id")
        .eq("handle", cleanHandle)
        .maybeSingle();

      if (cancelled) return;
      if (alias?.owner_id) {
        setProfileId(alias.owner_id);
      } else {
        setProfileNotFound(true);
      }
      setDataReady(true);
    }

    resolve().catch(() => {
      if (!cancelled) {
        setProfileNotFound(true);
        setDataReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cleanHandle, isValidHandle]);

  useEffect(() => {
    if (hasNavigated.current || !dataReady || authLoading || !navigationState?.key) return;
    if (RESERVED_ROUTES.has(cleanHandle)) return;
    if (profileNotFound || !isValidHandle) return;
    if (!profileId) return;

    hasNavigated.current = true;
    safeNavigate("/contact/[id]", { id: profileId });
  }, [
    authLoading,
    cleanHandle,
    dataReady,
    isValidHandle,
    navigationState?.key,
    profileId,
    profileNotFound,
  ]);

  if (authLoading || !dataReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ContactProfileSkeleton />
      </View>
    );
  }

  if (profileNotFound || !isValidHandle || !profileId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <ProfileNotFoundView handle={cleanHandle} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}