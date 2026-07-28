import "@/polyfills";
import "react-native-gesture-handler";
import "@/lib/callService";
import { enableScreens } from "react-native-screens";
import { initCrashReporter, setCrashReporterUserId, setCrashNotificationHandler } from "@/lib/crashReporter";
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
import { Alert, Linking, LogBox, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, usePathname, router } from "expo-router";
import { setCurrentPage, resolvePageInfo } from "@/lib/pageTracker";
import { StatusBar } from "expo-status-bar";
import * as Font from "expo-font";
import { Asset } from "expo-asset";
import { Ionicons } from "@expo/vector-icons";
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
import { CallProvider } from "@/context/CallContext";
import { IncomingCallModal } from "@/components/IncomingCallModal";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppAccentProvider } from "@/context/AppAccentContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { AdvancedFeaturesProvider } from "@/context/AdvancedFeaturesContext";
import { ChatPreferencesProvider } from "@/context/ChatPreferencesContext";
import { DataModeProvider } from "@/context/DataModeContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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

// Lock out system-level font scaling so the app always renders at its
// intended sizes regardless of the device's accessibility font-size setting.
(Text as any).defaultProps = { ...((Text as any).defaultProps ?? {}), allowFontScaling: false };
(TextInput as any).defaultProps = { ...((TextInput as any).defaultProps ?? {}), allowFontScaling: false };

LogBox.ignoreLogs(['"shadow*" style props are deprecated', "props.pointerEvents is deprecated"]);

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

/**
 * Registers the crash notification handler so that whenever a crash is
 * captured the user immediately gets the option to report it — either by
 * email or via an in-app support ticket with the error pre-filled as the
 * subject.
 */
function CrashSupportHandler() {
  const { user } = useAuth();

  useEffect(() => {
    setCrashNotificationHandler((errorMessage: string) => {
      // Truncate long messages so they fit in the alert
      const shortMsg = errorMessage.length > 120
        ? errorMessage.slice(0, 117) + "…"
        : errorMessage;

      const encodedSubject = encodeURIComponent(`[AfuChat Bug] ${shortMsg}`);
      const encodedBody = encodeURIComponent(
        `Error: ${errorMessage}\n\nSteps to reproduce:\n\nDevice info:\n`,
      );

      Alert.alert(
        "Something went wrong",
        "An error was detected. Would you like to send a report so our team can fix it?",
        [
          {
            text: "Send Email",
            onPress: () => {
              Linking.openURL(
                `mailto:support@afuchat.com?subject=${encodedSubject}&body=${encodedBody}`,
              ).catch(() => {});
            },
          },
          {
            text: "In-App Support",
            onPress: () => {
              // Navigate to the support page with error pre-filled.
              // Small delay so the alert dismisses before navigation.
              setTimeout(() => {
                router.push({
                  pathname: "/support" as any,
                  params: {
                    errorSubject: shortMsg,
                    errorCategory: "technical",
                    errorPriority: "high",
                  },
                });
              }, 300);
            },
          },
          { text: "Dismiss", style: "cancel" },
        ],
        { cancelable: true },
      );
    });

    return () => { setCrashNotificationHandler(null); };
  }, [user?.id]);

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
// Uses "slide_from_right" globally — native platform slide on every push/pop,
// no flash, steady feel.  Tabs and initial boot screens stay animation:"none".
function AppNavigationStack() {
  const { colors } = useTheme();
  const bg = colors.background;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
        contentStyle: { backgroundColor: bg },
        freezeOnBlur: true,
      }}
    >
      {/* Boot / auth-shell screens — no directional slide, instant swap */}
      <Stack.Screen name="index"      options={{ animation: "none", contentStyle: { backgroundColor: bg } }} />
      <Stack.Screen name="welcome"    options={{ animation: "none", gestureEnabled: false }} />
      <Stack.Screen name="(tabs)"     options={{ animation: "none" }} />
      {/* Every other group and screen inherits slide_from_right */}
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
  // Load custom fonts without blocking the first render. The app intentionally
  // has no launch splash or JS splash overlay; text uses platform fallbacks
  // until these fonts finish loading.
  Font.useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

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

    // Decode bundled visuals and icon glyphs while the first route is mounting.
    // These assets are shipped inside the app and do not require internet.
    Asset.loadAsync([
      require("@/assets/images/icon.png"),
      require("@/assets/images/logo_white.png"),
      require("@/assets/images/logo_black.png"),
      require("@/assets/illustrations/messaging.png"),
      require("@/assets/illustrations/community.png"),
      require("@/assets/illustrations/ai.png"),
      require("@/assets/illustrations/wallet.png"),
    ]).catch(() => {});
    Ionicons.loadFont().catch(() => {});

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
        { type: "warning", duration: 0, id: TOAST_ID, icon: "wifi" },
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
                  <CallProvider>
                    <ActivityTrackerSync />
                    <CrashReporterUserSync />
                    <CrashSupportHandler />
                    <PageWatcher />
                    <PushNotificationManager />
                    <GlobalInboxListener />
                    <UpdatePrompt />
                    {/* Incoming call overlay — renders above every screen */}
                    <IncomingCallModal />
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
                  </CallProvider>
                </AuthProvider>
              </DataModeProvider>
            </AppAccentProvider>
          </ThemedRoot>
        </ThemeProvider>

      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
