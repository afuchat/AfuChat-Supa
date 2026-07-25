import "@/polyfills";
import "react-native-gesture-handler";
import "@/lib/callService";
import { enableScreens } from "react-native-screens";
import { initCrashReporter, setCrashReporterUserId } from "@/lib/crashReporter";
initCrashReporter();

// enableScreens() is intentionally moved out of module-evaluation scope.
// Calling it synchronously at the top level (before any React component mounts)
// made it run before the Android activity was fully initialized on some devices,
// causing a native crash with no JS stack trace. Calling it once inside a
// useEffect (or the component body) is safe and still early enough for
// react-native-screens to intercept all route-level screen creation.
// See: https://github.com/software-mansion/react-native-screens/issues/2086

import React, { useCallback, useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Linking, LogBox, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, usePathname, router } from "expo-router";
import { setCurrentPage, resolvePageInfo } from "@/lib/pageTracker";
import { StatusBar } from "expo-status-bar";
import * as Font from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useTheme } from "@/hooks/useTheme";
import {
  getCachedUserId,
  onConnectivityChange,
  isOnline,
  getCachedShortsTab,
} from "@/lib/offlineStore";
import { preloadConversations } from "@/lib/conversationsPreload";
import { showActionToast, dismissToast, showToast } from "@/lib/toast";

import { handleIncomingUrl } from "@/lib/deepLinkHandler";
import { verifyDeepLinks } from "@/lib/deepLinkVerifier";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppAccentProvider } from "@/context/AppAccentContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { AdvancedFeaturesProvider } from "@/context/AdvancedFeaturesContext";
import { ChatPreferencesProvider } from "@/context/ChatPreferencesContext";
import { DataModeProvider } from "@/context/DataModeContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SplashScreenView } from "@/components/ui/SplashScreenView";
import { ToastContainer } from "@/components/ui/ToastContainer";
import AlertModal from "@/components/ui/AlertModal";
import OfflineBanner from "@/components/ui/OfflineBanner";
import OfflineVideoToast from "@/components/ui/OfflineVideoToast";
import { PushNotificationManager } from "@/components/PushNotificationManager";
import { GlobalInboxListener } from "@/components/GlobalInboxListener";
import UpdatePrompt from "@/components/UpdatePrompt";
import { initActivityTracker } from "@/lib/activityTracker";
import { startOfflineSync } from "@/lib/offlineSync";
import { startSyncQueue } from "@/lib/storage/syncQueue";
import { MiniAppRuntimeProvider } from "@/lib/superapp/MiniAppRuntime";
import { AnimationGuardInit } from "@/components/AnimationGuardInit";

// NOTE: react-native-mmkv has been downgraded to v3 (stable JSI bridge) and
// react-native-nitro-modules has been removed.  v4/Nitro caused an unrecoverable
// native crash on Android standalone builds because the Nitro C++ library had a
// JNI load-order race that no JS try/catch could intercept.  v3 uses the
// traditional synchronous JSI bridge and does not have this problem.
// Conversations pre-warm remains in the useEffect below (not at module-eval time)
// so MMKV is only accessed after the full native runtime is ready.

// ─── Splash screen — hold immediately at module-evaluation time ───────────────
// This runs before any component renders, ensuring the native splash stays
// visible until we explicitly call hideAsync() below. Without this, Expo
// auto-hides the splash when the first JS frame renders, which is before auth
// resolves — causing a flash of onboarding / welcome screens for signed-in users.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Lock out system-level font scaling so the app always renders at its
// intended sizes regardless of the device's accessibility font-size setting.
(Text as any).defaultProps = { ...((Text as any).defaultProps ?? {}), allowFontScaling: false };
(TextInput as any).defaultProps = { ...((TextInput as any).defaultProps ?? {}), allowFontScaling: false };

LogBox.ignoreLogs(['"shadow*" style props are deprecated', "props.pointerEvents is deprecated"]);

// ─── AppReadyGate ─────────────────────────────────────────────────────────────
// Sits inside AuthProvider so it can read auth loading state.
// Signals the parent when BOTH fonts and auth are resolved so the JS splash
// can animate out before the native splash is hidden.
function AppReadyGate({
  fontsReady,
  onReady,
}: {
  fontsReady: boolean;
  onReady?: () => void;
}) {
  const { loading } = useAuth();
  const fired = useRef(false);

  const fire = useCallback(() => {
    if (fired.current) return;
    fired.current = true;
    if (typeof onReady === "function") onReady();
    else SplashScreen.hideAsync().catch(() => {});
  }, [onReady]);

  // Normal path: both fonts and auth resolved
  useEffect(() => {
    if (!fontsReady || loading) return;
    fire();
  }, [fontsReady, loading, fire]);

  return null;
}

function ActivityTrackerSync() {
  const { user } = useAuth();
  useEffect(() => { initActivityTracker(user?.id ?? null); }, [user?.id]);
  return null;
}

function CrashReporterUserSync() {
  const { user } = useAuth();
  useEffect(() => { setCrashReporterUserId(user?.id ?? null); }, [user?.id]);
  return null;
}

function PageWatcher() {
  const pathname = usePathname();
  useEffect(() => {
    setCurrentPage(resolvePageInfo(pathname));
  }, [pathname]);
  return null;
}

// ─── AppNavigationStack ───────────────────────────────────────────────────────
// Reads the theme background so every screen card uses the real background
// colour instead of "transparent" (which causes a white flash on push/pop).
// Uses "fade" globally — flat, fast, no directional slide, no flash on
// entry or exit.  Feels identical to a tab switch.
function AppNavigationStack() {
  const { colors } = useTheme();
  const bg = colors.background;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        gestureEnabled: true,
        contentStyle: { backgroundColor: bg },
        freezeOnBlur: true,
      }}
    >
      <Stack.Screen name="index"     options={{ animation: "none", contentStyle: { backgroundColor: bg } }} />
      <Stack.Screen name="welcome"   options={{ animation: "none", gestureEnabled: false }} />
      <Stack.Screen name="(tabs)"    options={{ animation: "none" }} />
      <Stack.Screen name="(auth)"    options={{ animation: "fade" }} />
      <Stack.Screen name="onboarding" options={{ animation: "none" }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return (
    <StatusBar
      style={isDark ? "light" : "dark"}
      translucent
      backgroundColor="transparent"
      animated
    />
  );
}

function ThemedRoot({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {children}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = Font.useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Track when both fonts + auth are resolved (triggers JS splash fade-out)
  const [appReady, setAppReady] = useState(false);
  // Track when the JS splash fade-out animation has fully completed
  const [splashGone, setSplashGone] = useState(false);

  const handleAppReady = useCallback(() => setAppReady(true), []);

  const handleSplashDone = useCallback(() => {
    setSplashGone(true);
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Safety: force the splash away after 2.5 s on native, 1 s on web (no native
  // splash to sync with). The normal path (AppReadyGate) fires sooner when
  // both fonts + auth resolve quickly.
  useEffect(() => {
    const timeout = Platform.OS === "web" ? 1000 : 2500;
    const t = setTimeout(() => setAppReady(true), timeout);
    return () => clearTimeout(t);
  }, []);

  // Enable react-native-screens optimisation. Called here (inside a component,
  // not at module-eval time) so the Android activity is guaranteed to be fully
  // initialized before the native call runs. Module-eval is too early on some
  // Android devices and causes a native crash before any JS error handler exists.
  useEffect(() => {
    try { enableScreens(true); } catch {}
  }, []);

  // Run deep-link route verification once in dev mode to catch any routes
  // that might accidentally fall through to [handle].tsx.
  useEffect(() => {
    verifyDeepLinks().catch(() => {});
  }, []);

  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    async function handleUrl(url: string | null) {
      const action = await handleIncomingUrl(url);
      if (!action) return;

      if (action.type === "join_group") {
        router.push({ pathname: "/join/[code]", params: { code: action.code } } as any);
        return;
      }

      if (action.type === "navigate") {
        if (action.params) {
          router.push({ pathname: action.path as any, params: action.params });
        } else {
          router.push(action.path as any);
        }
        return;
      }
    }
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Conversations pre-warm: kick off the SQLite read NOW so ChatsScreen can
    // initialise synchronously from the in-memory snapshot instead of waiting
    // for an async read.  Doing this inside useEffect (not at module-eval time)
    // ensures the native runtime is fully up before we touch MMKV storage.
    if (getCachedUserId()) {
      preloadConversations();
    }

    // Start the offline sync engine and action queue auto-drain.
    // These are idempotent — safe to call multiple times (they guard internally).
    // • startOfflineSync: drains pending messages and reconnects Supabase Realtime
    //   when the network comes back.
    // • startSyncQueue: replays queued offline actions (likes, follows, bookmarks,
    //   reactions, read receipts) the moment connectivity is restored.
    startOfflineSync();
    startSyncQueue();
  }, []);

  // ── Offline action toast ─────────────────────────────────────────────────
  // When the user loses connectivity, show a prominent action toast with a
  // "Watch now" button that navigates to /shorts (cached offline videos).
  // When connectivity is restored, dismiss it and confirm "Back online".
  useEffect(() => {
    const TOAST_ID = "connectivity";

    async function fireOfflineToast() {
      let videoCount = 0;
      try {
        const cached = await getCachedShortsTab("for_you");
        videoCount = cached?.posts?.length ?? 0;
      } catch {}

      const msg = videoCount > 0
        ? `You're offline · ${videoCount} video${videoCount === 1 ? "" : "s"} ready`
        : "You're offline";

      showActionToast(
        msg,
        videoCount > 0 ? "Watch now" : "",
        () => router.push("/shorts" as any),
        { type: "warning", duration: 0, id: TOAST_ID, icon: "wifi-outline" },
      );
    }

    // Fire immediately if already offline at mount
    if (!isOnline()) {
      fireOfflineToast();
    }

    // Listen for subsequent changes
    const unsub = onConnectivityChange((online) => {
      if (online) {
        dismissToast(TOAST_ID);
        showToast("Back online", { type: "success", duration: 2500, icon: "wifi" });
      } else {
        fireOfflineToast();
      }
    });

    return unsub;
  }, []);

  if (!fontsReady) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <ThemeProvider>
          <ThemedRoot>
            <AppAccentProvider>
              <ThemedStatusBar />
              {/* OOM guard: cancels all animations on app-background / memory-pressure */}
              <AnimationGuardInit />
              <DataModeProvider>
                <AuthProvider>
                  {/* Gate signals onReady when fonts + auth are both resolved */}
                  <AppReadyGate fontsReady={fontsReady} onReady={handleAppReady} />
                  <ActivityTrackerSync />
                  <CrashReporterUserSync />
                  <PageWatcher />
                  <PushNotificationManager />
                  <GlobalInboxListener />
                  <UpdatePrompt />
                  <LanguageProvider>
                    <AdvancedFeaturesProvider>
                      <ChatPreferencesProvider>
                        <MiniAppRuntimeProvider>
                          <OfflineBanner />
                          <OfflineVideoToast />
                          <AppNavigationStack />
                          <ToastContainer />
                          <AlertModal />
                        </MiniAppRuntimeProvider>
                      </ChatPreferencesProvider>
                    </AdvancedFeaturesProvider>
                  </LanguageProvider>
                </AuthProvider>
              </DataModeProvider>
            </AppAccentProvider>
          </ThemedRoot>
        </ThemeProvider>

        {/* JS splash overlay — sits above everything, fades out when ready */}
        {!splashGone && (
          <SplashScreenView ready={appReady} onDone={handleSplashDone} />
        )}
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
