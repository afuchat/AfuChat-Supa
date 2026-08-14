import "@/polyfills";
import "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";

// Keep the native splash visible until we explicitly hide it
SplashScreen.preventAutoHideAsync().catch(() => {});
import { enableScreens } from "react-native-screens";
import { initCrashReporter, setCrashReporterUserId, setCrashNotificationHandler } from "@/lib/crashReporter";
import { showAlert } from "@/lib/alert";
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
import { AppState, InteractionManager, Linking, LogBox, Platform, StyleSheet, Text, TextInput, View } from "react-native";
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
  initUserIdCache,
} from "@/lib/offlineStore";
import { preloadConversations } from "@/lib/conversationsPreload";
import { refreshAllPermissions } from "@/lib/permissionsManager";

// ── Boot-time UID cache warm-up ──────────────────────────────────────────────
// If MMKV fell back to an in-memory store (JNI init failure on some Android
// devices), the cached user ID won't survive a process kill.  Reading the
// AsyncStorage backup here — before AuthProvider mounts — pre-populates the
// synchronous MMKV / in-memory mirror so getCachedUserId() can return the
// correct value on the very first render.  This prevents the safety-timer in
// index.tsx from routing a legitimately-logged-in user to the welcome screen.
initUserIdCache().catch(() => {});

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
import { GlobalInboxListener } from "@/components/GlobalInboxListener";
import UpdatePrompt from "@/components/UpdatePrompt";
import { initActivityTracker } from "@/lib/activityTracker";
import { startOfflineSync } from "@/lib/offlineSync";
import { startSyncQueue } from "@/lib/storage/syncQueue";
import { runScheduledVideoPurge } from "@/lib/videoCache";
import { MiniAppRuntimeProvider } from "@/lib/superapp/MiniAppRuntime";
import { AnimationGuardInit } from "@/components/AnimationGuardInit";
import { SplashScreenView } from "@/components/ui/SplashScreenView";
import PushNotificationManager from "@/components/PushNotificationManager";

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
      // Display label is capped so it fits in the alert body.
      // The full message is still sent to the support ticket.
      const displayMsg = errorMessage.length > 140
        ? errorMessage.slice(0, 137) + "…"
        : errorMessage;

      const encodedSubject = encodeURIComponent(`[AfuChat Bug] ${displayMsg}`);
      const encodedBody = encodeURIComponent(
        `Error details:\n${errorMessage}\n\nSteps to reproduce:\n\nDevice info:\n`,
      );

      showAlert(
        "Unexpected Error",
        `Something went wrong in the app.\n\n"${displayMsg}"\n\nWould you like to send a report so we can fix it?`,
        [
          {
            text: "Open Support Ticket",
            onPress: () => {
              // Small delay so the alert dismisses cleanly before navigation.
              setTimeout(() => {
                router.push({
                  pathname: "/support" as any,
                  params: {
                    // Pass the full (untruncated) error as the ticket subject.
                    errorSubject: errorMessage,
                    errorCategory: "technical",
                    errorPriority: "high",
                  },
                });
              }, 300);
            },
          },
          {
            text: "Send Email",
            onPress: () => {
              Linking.openURL(
                `mailto:support@afuchat.com?subject=${encodedSubject}&body=${encodedBody}`,
              ).catch(() => {});
            },
          },
          { text: "Dismiss", style: "cancel" },
        ],
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
  const [fontsLoaded] = Font.useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [splashDone, setSplashDone] = useState(false);

  const handleSplashDone = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
    setSplashDone(true);
  }, []);

  // The visual splash overlay is intentionally native-only. Explicitly hide
  // the platform splash on web as well; otherwise preventAutoHideAsync() above
  // can leave the web preview looking like a blank screen forever.
  useEffect(() => {
    if (Platform.OS === "web") {
      SplashScreen.hideAsync().catch(() => {});
    }
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

  // Refresh OS permission statuses whenever the app comes back to foreground.
  // The user may have changed a permission (camera, mic, etc.)
  // in iOS/Android Settings while the app was backgrounded.  We re-query and
  // update the MMKV cache so every screen that reads getPermissionStatus() /
  // isPermissionGranted() always sees the current state without a native
  // round-trip at call time.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        refreshAllPermissions().catch(() => {});
      }
    });
    return () => sub.remove();
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
    // Keep the first route responsive. These jobs are useful, but none of them
    // is required to render or navigate the first screen. Starting them all in
    // the same effect as navigation made cold starts compete with SQLite,
    // image decoding, and queued network work for the JS/native bridge.
    const task = InteractionManager.runAfterInteractions(() => {
      if (getCachedUserId()) {
        preloadConversations();
      }

      Asset.loadAsync([
        require("@/assets/images/icon.png"),
        require("@/assets/images/logo_white.webp"),
        require("@/assets/images/logo_black.webp"),
        require("@/assets/illustrations/messaging.webp"),
        require("@/assets/illustrations/community.webp"),
        require("@/assets/illustrations/ai.webp"),
        require("@/assets/illustrations/wallet.webp"),
      ]).catch(() => {});
      Ionicons.loadFont().catch(() => {});

      startOfflineSync();
      startSyncQueue();
      runScheduledVideoPurge().catch(() => {});
    });

    return () => task.cancel();
  }, []);


  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        {/* JS splash overlay — visible until fonts load, then fades out */}
        {!splashDone && Platform.OS !== "web" && (
          <SplashScreenView ready={fontsLoaded} onDone={handleSplashDone} />
        )}
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
                    <PushNotificationManager />
                    <PageWatcher />
                    <GlobalInboxListener />
                    <UpdatePrompt />
                    {/* Incoming call overlay — renders above every screen */}
                    <IncomingCallModal />
                    <LanguageProvider>
                      <AdvancedFeaturesProvider>
                        <ChatPreferencesProvider>
                          <MiniAppRuntimeProvider>
                            <OfflineBanner />
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
