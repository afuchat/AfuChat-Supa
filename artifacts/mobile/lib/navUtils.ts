/**
 * navUtils — Global navigation-lock + safe wrappers.
 *
 * WHY: React Native (and the web build) deliver touches to JS in bursts.
 * A user can easily fire 3-4 press events before the first route even
 * renders. Without a lock, all three navigations execute and the user
 * lands on an unintended deep stack or sees a flickering screen.
 *
 * HOW:
 * - A module-level action key records the most recent navigation and blocks
 *   only an immediate duplicate of that same action.
 * - Different destinations can be selected without waiting for a cooldown.
 * - `SafePressable` / `SafeTouchableOpacity` (in components/ui) also
 *   check the lock so even button presses that trigger navigation
 *   indirectly (like openApp()) are protected.
 */

import { router } from "expo-router";
import { useCallback, useRef } from "react";

export const NAV_COOLDOWN_MS = 250;

let _lastActionKey = "";
let _lastActionAt = 0;

// ── Core lock ─────────────────────────────────────────────────────────────────

/**
 * Attempt to acquire the navigation lock.
 * Returns `true` (and sets the lock) if navigation is allowed.
 * Returns `false` immediately if the lock is already held.
 */
export function acquireNavLock(
  cooldownMs = NAV_COOLDOWN_MS,
  actionKey = "__press__",
): boolean {
  const now = Date.now();
  if (
    actionKey === _lastActionKey &&
    now - _lastActionAt < cooldownMs
  ) {
    return false;
  }
  _lastActionKey = actionKey;
  _lastActionAt = now;
  return true;
}

/** True while the lock is held (i.e., navigation in progress). */
export function isNavLocked(): boolean {
  return Date.now() - _lastActionAt < NAV_COOLDOWN_MS;
}

/** Force-release the lock early (e.g., on back-gesture completion). */
export function releaseNavLock(): void {
  _lastActionKey = "";
  _lastActionAt = 0;
}

function navigationKey(kind: string, href: unknown): string {
  try {
    return `${kind}:${JSON.stringify(href)}`;
  } catch {
    return kind;
  }
}

// ── Safe router ───────────────────────────────────────────────────────────────

/**
 * Drop-in replacements for `router.push / replace / navigate / back`.
 * All calls are silently ignored while the lock is held.
 *
 * @example
 *   import { safeRouter } from "@/lib/navUtils";
 *   safeRouter.push("/profile");
 */
export const safeRouter = {
  push    (href: any, cooldown = NAV_COOLDOWN_MS): void { if (acquireNavLock(cooldown, navigationKey("push", href))) { try { router.push(href); } catch (e: any) { if (!String(e?.message).includes("mounting")) throw e; } } },
  replace (href: any, cooldown = NAV_COOLDOWN_MS): void { if (acquireNavLock(cooldown, navigationKey("replace", href))) { try { router.replace(href); } catch (e: any) { if (!String(e?.message).includes("mounting")) throw e; } } },
  navigate(href: any, cooldown = NAV_COOLDOWN_MS): void { if (acquireNavLock(cooldown, navigationKey("navigate", href))) { try { router.navigate(href); } catch (e: any) { if (!String(e?.message).includes("mounting")) throw e; } } },
  back    (fallback: string = "/(tabs)/chats", cooldown = NAV_COOLDOWN_MS): void { if (acquireNavLock(cooldown, navigationKey("back", fallback))) { try { if (router.canGoBack()) router.back(); else router.replace(fallback as any); } catch {} } },
};

// ── React hooks ───────────────────────────────────────────────────────────────

/**
 * Returns stable, debounced navigation helpers bound to the global lock.
 * Prefer this over calling `router` directly inside event handlers.
 *
 * @example
 *   const { push, back } = useSafeNavigation();
 *   <Pressable onPress={() => push("/chat/123")} />
 */
export function useSafeNavigation() {
  const push     = useCallback((href: any) => safeRouter.push(href),     []);
  const replace  = useCallback((href: any) => safeRouter.replace(href),  []);
  const navigate = useCallback((href: any) => safeRouter.navigate(href), []);
  const back     = useCallback((fallback?: string) => safeRouter.back(fallback), []);
  return { push, replace, navigate, back };
}

/**
 * Wraps a press handler with the global navigation lock.
 * Use for buttons that perform navigation indirectly (openApp, etc.).
 * The returned function is stable and safe to use as a `useCallback` dep.
 *
 * @example
 *   const handleOpen = useSafePress(() => openApp("afumarket"));
 *   <Pressable onPress={handleOpen} />
 */
export function useSafePress<T extends any[]>(
  handler : (...args: T) => void,
  cooldown: number = NAV_COOLDOWN_MS,
): (...args: T) => void {
  const ref = useRef(handler);
  ref.current = handler;              // always up-to-date without re-creating
  return useCallback(
    (...args: T) => {
      if (!acquireNavLock(cooldown)) return;
      ref.current(...args);
    },
    // cooldown intentionally omitted — it never changes in practice
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}
