/**
 * navigationGuard.ts
 *
 * Patches the expo-router `router` singleton so every call to
 * router.push / router.replace / router.back across the entire app
 * is automatically deduplicated — a repeated call for the same action within
 * DUPLICATE_WINDOW_MS is silently dropped. Different destinations are allowed
 * through immediately so a quick, intentional tap never feels blocked.
 *
 * Import this module once as a side-effect at the top of the root
 * _layout.tsx and you're done. No changes needed at any call site.
 */
import { router } from "expo-router";

const DUPLICATE_WINDOW_MS = 250;

let _lastActionKey = "";
let _lastActionAt = 0;

function acquire(actionKey: string): boolean {
  const now = Date.now();
  if (
    actionKey === _lastActionKey &&
    now - _lastActionAt < DUPLICATE_WINDOW_MS
  ) {
    return false;
  }
  _lastActionKey = actionKey;
  _lastActionAt = now;
  return true;
}

/** Call this to manually release early (e.g. after a back press). */
export function release(): void {
  _lastActionKey = "";
  _lastActionAt = 0;
}

function keyFor(kind: "push" | "replace" | "back", args: unknown[] = []): string {
  try {
    return `${kind}:${JSON.stringify(args)}`;
  } catch {
    // Navigation params should be serializable, but never let an unusual
    // object prevent the navigation call from reaching Expo Router.
    return kind;
  }
}

const _origPush    = router.push.bind(router);
const _origReplace = router.replace.bind(router);
const _origBack    = router.back.bind(router);

(router as any).push = (...args: Parameters<typeof router.push>) => {
  if (!acquire(keyFor("push", args))) return;
  try { _origPush(...args); } catch (e: any) {
    if (!String(e?.message).includes("mounting")) throw e;
  }
};

(router as any).replace = (...args: Parameters<typeof router.replace>) => {
  if (!acquire(keyFor("replace", args))) return;
  try { _origReplace(...args); } catch (e: any) {
    if (!String(e?.message).includes("mounting")) throw e;
  }
};

(router as any).back = () => {
  if (!acquire(keyFor("back"))) return;
  try { _origBack(); } catch (e: any) {
    if (!String(e?.message).includes("mounting")) throw e;
  }
};
