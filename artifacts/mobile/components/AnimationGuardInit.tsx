/**
 * AnimationGuardInit — zero-render root component that boots the OOM guard.
 *
 * Responsibilities:
 *  1. Calls initAnimationGuard() exactly once on first mount (idempotent).
 *  2. On Android: polls the JS heap via performance.memory every POLL_MS and
 *     triggers an emergency cancel sweep when heap usage exceeds HEAP_WARN_RATIO.
 *     Android does not surface low-memory warnings via AppState, so this is the
 *     only early signal we have before a SIGKILL.
 *  3. Web: is a strict no-op (animations are disabled on web via reanimated shim).
 *
 * Place this inside GestureHandlerRootView in _layout.tsx, before any screen
 * content mounts so the guard is ready before the first animation can start.
 */

import { useEffect } from "react";
import { Platform } from "react-native";
import {
  initAnimationGuard,
  cancelAllAnimations,
} from "@/lib/animationGuard";

/** Warn when used JS heap exceeds this fraction of the heap limit. */
const HEAP_WARN_RATIO = 0.75;
/** Android heap-pressure poll interval. */
const ANDROID_POLL_MS = 8_000;

// Typed reference to the non-standard performance.memory Chrome/V8 API.
declare const performance: {
  memory?: {
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
  };
} | undefined;

export function AnimationGuardInit(): null {
  useEffect(() => {
    initAnimationGuard();

    // Android-specific heap pressure watcher.
    // iOS handles memory pressure via the AppState "memoryWarning" event inside
    // the guard module itself, so no polling is needed there.
    if (Platform.OS !== "android") return;

    const pollId = setInterval(() => {
      try {
        const mem =
          typeof performance !== "undefined" ? performance?.memory : undefined;

        if (mem && mem.jsHeapSizeLimit > 0) {
          const ratio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
          if (ratio > HEAP_WARN_RATIO) {
            cancelAllAnimations(
              `heapPressure:${(ratio * 100).toFixed(0)}%`
            );
          }
        }
      } catch {
        // performance.memory may not be available in all Hermes versions
      }
    }, ANDROID_POLL_MS);

    return () => clearInterval(pollId);
  }, []);

  return null;
}
