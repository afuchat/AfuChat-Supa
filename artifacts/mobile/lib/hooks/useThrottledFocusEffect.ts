/**
 * ─── useThrottledFocusEffect ───────────────────────────────────────────────────
 *
 * Like useFocusEffect but skips the callback if less than `intervalMs` has
 * elapsed since the last run. Prevents hammering the server when the user
 * rapidly switches tabs.
 *
 * The timestamp is kept in a ref (in-memory, resets on app restart). Use
 * MMKV-backed storage for cross-restart throttling by passing a `storageKey`.
 *
 * Usage:
 *   useThrottledFocusEffect(
 *     useCallback(() => { load(); }, [load]),
 *     { intervalMs: 2 * 60 * 1000 }
 *   );
 */

import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { storage } from "../storage/mmkv";

type Options = {
  /** Minimum ms between runs. Default: 60_000 (1 minute). */
  intervalMs?: number;
  /**
   * Optional MMKV key to persist the last-run timestamp across app restarts.
   * If omitted, the timestamp is in-memory only (resets on cold start).
   */
  storageKey?: string;
};

export function useThrottledFocusEffect(
  callback: () => void | (() => void),
  options: Options = {},
): void {
  const { intervalMs = 60_000, storageKey } = options;
  const lastRunRef = useRef<number>(
    storageKey ? (storage.getNumber(storageKey) ?? 0) : 0,
  );

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastRunRef.current < intervalMs) return;
      lastRunRef.current = now;
      if (storageKey) {
        try { storage.setNumber(storageKey, now); } catch {}
      }
      return callback();
    }, [callback, intervalMs, storageKey]),
  );
}
