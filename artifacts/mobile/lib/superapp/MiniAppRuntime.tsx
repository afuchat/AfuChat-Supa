import React, { useCallback, useMemo } from "react";
import { safeRouter } from "@/lib/navUtils";

import type { SuperAppContextValue } from "./types";
import { findModule, SUPER_APP_ID_SET } from "./registry";
import { SuperAppContext } from "./SuperAppContext";

/**
 * Apps are regular Expo Router stack routes rather than windows layered over
 * the current screen. This keeps the Android back gesture, deep links, screen
 * readers, and each app's own navigation bar working consistently.
 *
 * The context remains as a compatibility boundary for modules that used to
 * call openApp() while the app runtime was a mini-app host.
 */
export function MiniAppRuntimeProvider({ children }: { children: React.ReactNode }) {
  const openApp = useCallback((id: string, params?: Record<string, string>) => {
    const manifest = findModule(id);
    if (!manifest || manifest.comingSoon) return;

    try {
      safeRouter.push({
        pathname: `/app/${id}` as any,
        params: params ?? {},
      } as any);
    } catch (error) {
      if (__DEV__) console.warn("[SuperApp] Could not open app route", id, error);
    }
  }, []);

  // Kept as no-op compatibility methods. Full-page apps do not need a
  // background dock or overlay lifecycle.
  const closeApp = useCallback((_id: string) => {}, []);
  const minimizeApp = useCallback((_id: string) => {}, []);
  const isSuperAppId = useCallback((id: string) => SUPER_APP_ID_SET.has(id), []);

  const navigateOutside = useCallback((route: string, params?: Record<string, string>) => {
    try {
      if (params && Object.keys(params).length > 0) {
        safeRouter.push({ pathname: route as any, params } as any);
      } else {
        safeRouter.push(route as any);
      }
    } catch {}
  }, []);

  const value = useMemo<SuperAppContextValue>(
    () => ({
      openApps: [],
      activeAppId: null,
      openApp,
      closeApp,
      minimizeApp,
      isSuperAppId,
      navigateOutside,
    }),
    [openApp, closeApp, minimizeApp, isSuperAppId, navigateOutside],
  );

  return (
    <SuperAppContext.Provider value={value}>
      {children}
    </SuperAppContext.Provider>
  );
}

/** Re-export so callers can import from either location. */
export { useSuperApp } from "./SuperAppContext";