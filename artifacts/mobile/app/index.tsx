import { useEffect, useRef } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { getCachedUserId } from "@/lib/offlineStore";
import { storage, KEYS } from "@/lib/storage/mmkv";

export default function IndexScreen() {
  const { session, profile, loading, user } = useAuth();
  const redirected = useRef(false);
  const { handle } = useLocalSearchParams<{ handle?: string }>();

  function doRedirect(hasSession: boolean, profileReady: boolean, profileOnboarded: boolean) {
    if (redirected.current) return;

    const cachedId  = getCachedUserId();
    // Three signals for "user is logged in" — any one is sufficient:
    //  1. hasSession   — Supabase returned a live session this boot
    //  2. cachedId     — MMKV (or its AsyncStorage backup) has a user ID
    //  3. user?.id     — AuthContext already set a synthetic user from SecureStore
    //     (happens when MMKV fell back to memory store but SecureStore still had tokens)
    const isLoggedIn = hasSession || Boolean(cachedId) || Boolean(user?.id);

    // Not logged in — show welcome onboarding first, then login
    if (!isLoggedIn) {
      redirected.current = true;
      const onboardingDone = (() => { try { return storage.getBoolean(KEYS.ONBOARDING_DONE); } catch { return false; } })();
      router.replace(onboardingDone ? "/(auth)/login" : "/welcome");
      return;
    }

    // Known returning user — go home INSTANTLY.
    // Use cachedId OR user?.id so SecureStore-restored sessions also skip the wait.
    if (cachedId || user?.id) {
      redirected.current = true;
      if (hasSession && profileReady && profile?.onboarding_completed === false) {
        router.replace("/onboarding");
      } else {
        router.replace("/(tabs)/chats");
      }
      return;
    }

    // Brand-new sign-in (no cached ID yet): wait for profile before routing
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
  }, [session, profile, loading, handle, user?.id]);

  // Safety net: if auth takes too long, route based on cached/in-memory state.
  //
  // Extended to 2 500 ms (was 600 ms) so the slow-path (getSession → AsyncStorage
  // backup → SecureStore refresh) has time to complete before we make a routing
  // decision. On a cold start with no MMKV data but a valid SecureStore token the
  // getSession + setSession + TOKEN_REFRESHED round-trip can easily take 1–2 s on
  // a slow network or right after a device reboot.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (redirected.current) return;
      redirected.current = true;
      if (handle) {
        router.replace(`/${handle}` as any);
      } else if (getCachedUserId() || user?.id) {
        router.replace("/(tabs)/chats");
      } else {
        const onboardingDone = (() => { try { return storage.getBoolean(KEYS.ONBOARDING_DONE); } catch { return false; } })();
        router.replace(onboardingDone ? "/(auth)/login" : "/welcome");
      }
    }, 2500);

    return () => clearTimeout(timeout);
  }, [handle]);

  return null;
}
