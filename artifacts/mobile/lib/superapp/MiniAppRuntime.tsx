import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";
import { safeRouter } from "@/lib/navUtils";
import { useTheme } from "@/hooks/useTheme";

import type { AppLifecycleState, OpenApp, SuperAppContextValue } from "./types";
import { findModule, SUPER_APP_ID_SET } from "./registry";
import { SuperAppContext } from "./SuperAppContext";
import MiniAppWindow from "@/components/superapp/MiniAppWindow";
import MiniAppDock from "@/components/superapp/MiniAppDock";

// Mini-app modules are lazy-loaded on first open instead of statically imported.
// Static imports evaluated 17 module graphs at startup (before any screen rendered),
// which caused silent native crashes on Android if any module had a bad top-level
// statement. Lazy require() defers all evaluation until the user actually opens a
// mini-app, keeping the startup bundle lean and crash-free.
const _miniAppCache = new Map<string, React.ComponentType>();

function getMiniAppComponent(id: string): React.ComponentType | null {
  if (_miniAppCache.has(id)) return _miniAppCache.get(id)!;
  try {
    let mod: any;
    switch (id) {
      case "afupay":         mod = require("@/modules/afupay"); break;
      case "afumarket":      mod = require("@/modules/afumarket"); break;
      case "afugames":       mod = require("@/modules/afugames"); break;
      case "afubusiness":    mod = require("@/modules/afubusiness"); break;
      case "afusearch":      mod = require("@/modules/afusearch"); break;
      case "afulens":        mod = require("@/modules/afulens"); break;
      case "afuid":          mod = require("@/modules/afuid"); break;
      case "afuqr":          mod = require("@/modules/afuqr"); break;
      case "afusaved":       mod = require("@/modules/afusaved"); break;
      case "afureferral":    mod = require("@/modules/afureferral"); break;
      case "afuservices":    mod = require("@/modules/afuservices"); break;
      case "afufreelance":   mod = require("@/modules/afufreelance"); break;
      case "afucollections": mod = require("@/modules/afucollections"); break;
      case "afuevents":      mod = require("@/modules/afuevents"); break;
      case "afuusernames":   mod = require("@/modules/afuusernames"); break;
      default:               return null;
    }
    const Component = mod?.default ?? mod;
    if (Component) _miniAppCache.set(id, Component);
    return Component ?? null;
  } catch (e) {
    console.warn("[MiniAppRuntime] Failed to load module:", id, e);
    return null;
  }
}

/** Re-export so callers can import from either location. */
export { useSuperApp } from "./SuperAppContext";

export function MiniAppRuntimeProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const [openApps, setOpenApps] = useState<OpenApp[]>([]);
  const [activeAppId, setActiveAppId] = useState<string | null>(null);

  const openApp = useCallback((id: string) => {
    const manifest = findModule(id);
    if (!manifest || manifest.comingSoon) return;
    if (manifest.nativeOnly && false) return;

    setOpenApps((prev) => {
      const existing = prev.find((a) => a.manifest.id === id);
      if (existing) {
        return prev.map((a) =>
          a.manifest.id === id
            ? { ...a, state: "active" as AppLifecycleState }
            : { ...a, state: "background" as AppLifecycleState }
        );
      }
      return [
        ...prev.map((a) => ({ ...a, state: "background" as AppLifecycleState })),
        { manifest, state: "active" as AppLifecycleState, openedAt: Date.now() },
      ];
    });
    setActiveAppId(id);
  }, []);

  const closeApp = useCallback((id: string) => {
    setOpenApps((prev) => prev.filter((a) => a.manifest.id !== id));
    setActiveAppId((cur) => (cur === id ? null : cur));
  }, []);

  const minimizeApp = useCallback((id: string) => {
    setOpenApps((prev) =>
      prev.map((a) =>
        a.manifest.id === id
          ? { ...a, state: "background" as AppLifecycleState }
          : a
      )
    );
    setActiveAppId((cur) => (cur === id ? null : cur));
  }, []);

  const isSuperAppId = useCallback((id: string) => SUPER_APP_ID_SET.has(id), []);

  /**
   * Navigate to a main-app route while auto-minimizing the currently active
   * mini app so the destination screen is reachable in milliseconds.
   */
  const navigateOutside = useCallback(
    (route: string, params?: Record<string, string>) => {
      if (activeAppId) minimizeApp(activeAppId);
      // Small delay lets the modal slide down before the route changes,
      // then safeRouter applies the global nav lock.
      setTimeout(() => {
        try {
          if (params && Object.keys(params).length > 0) {
            safeRouter.push({ pathname: route as any, params } as any);
          } else {
            safeRouter.push(route as any);
          }
        } catch {}
      }, 80);
    },
    [activeAppId, minimizeApp]
  );

  useEffect(() => {
    if (!activeAppId || Platform.OS === "web") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      minimizeApp(activeAppId);
      return true;
    });
    return () => sub.remove();
  }, [activeAppId, minimizeApp]);

  const value = useMemo<SuperAppContextValue>(
    () => ({ openApps, activeAppId, openApp, closeApp, minimizeApp, isSuperAppId, navigateOutside }),
    [openApps, activeAppId, openApp, closeApp, minimizeApp, isSuperAppId, navigateOutside]
  );

  return (
    <SuperAppContext.Provider value={value}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {children}

        {(
          <>
            <MiniAppDock
              openApps={openApps}
              activeAppId={activeAppId}
              onOpen={openApp}
              onClose={closeApp}
            />

            {openApps.map((app) => {
              const AppComponent = getMiniAppComponent(app.manifest.id);
              if (!AppComponent) return null;
              return (
                <MiniAppWindow
                  key={app.manifest.id}
                  app={app}
                  onClose={() => closeApp(app.manifest.id)}
                  onMinimize={() => minimizeApp(app.manifest.id)}
                >
                  <AppComponent />
                </MiniAppWindow>
              );
            })}
          </>
        )}
      </View>
    </SuperAppContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
