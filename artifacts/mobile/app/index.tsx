import { useEffect, useRef } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { getCachedUserId } from "@/lib/offlineStore";
import { storage, KEYS } from "@/lib/storage/mmkv";

export default function IndexScreen() {
  const { session, profile, loading } = useAuth();
  const redirected = useRef(false);
  const { handle } = useLocalSearchParams<{ handle?: string }>();

  function doRedirect(hasSession: boolean, profileReady: boolean, profileOnboarded: boolean) {
    if (redirected.current) return;

    const cachedId  = getCachedUserId();
    const isLoggedIn = hasSession || Boolean(cachedId);

    // Not logged in — show welcome onboarding first, then login
    if (!isLoggedIn) {
      redirected.current = true;
      const onboardingDone = (() => { try { return storage.getBoolean(KEYS.ONBOARDING_DONE); } catch { return false; } })();
      router.replace(onboardingDone ? "/(auth)/login" : "/welcome");
      return;
    }

    // Known returning user (MMKV has their ID): go home INSTANTLY.
    if (cachedId) {
      redirected.current = true;
      if (hasSession && profileReady && profile?.onboarding_completed === false) {
        router.replace("/onboarding");
      } else {
        router.replace("/(tabs)/chats");
      }
      return;
    }

    // Brand-new sign-in (no cachedId yet): wait for profile before routing
    if (hasSession && !profileReady) return;

    redirected.current = true;
    if (hasSession && profileReady && !profileOnboarded) {
      router.replace("/onboarding");
    } else {
      router.replace("/(tabs)/chats");
    }
  }

  // Handle ?handle= query param (referral / handle deep links via web)
  useEffect(() => {
    if (!handle || redirected.current || loading) return;
    redirected.current = true;
    router.replace(`/${handle}` as any);
  }, [handle, loading]);

  // Main routing — fires whenever auth state resolves
  useEffect(() => {
    if (loading) return;
    if (handle) return;
    doRedirect(
      !!session,
      !!profile,
      profile?.onboarding_completed === true,
    );
  }, [session, profile, loading, handle]);

  // Safety net: if auth takes too long, route based on cached state.
  // Reduced to 600ms — fast enough to feel instant on both platforms.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (redirected.current) return;
      redirected.current = true;
      if (handle) {
        router.replace(`/${handle}` as any);
      } else if (getCachedUserId()) {
        router.replace("/(tabs)/chats");
      } else {
        const onboardingDone = (() => { try { return storage.getBoolean(KEYS.ONBOARDING_DONE); } catch { return false; } })();
        router.replace(onboardingDone ? "/(auth)/login" : "/welcome");
      }
    }, 600);

    return () => clearTimeout(timeout);
  }, [handle]);

  return null;
}
