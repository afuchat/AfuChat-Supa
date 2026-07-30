// ─── AfuChat Mic Permission Helper ───────────────────────────────────────────
// Cross-platform microphone permission utilities.
//
// Platform behaviour:
//   web     — uses navigator.permissions.query (where available) for pre-check;
//             actual prompt is deferred to getUserMedia inside the call engine.
//   Android — expo-av Audio.getPermissionsAsync / requestPermissionsAsync.
//   iOS     — same as Android (expo-av owns mic permission on iOS too).
//
// The helpers are lazy-imported so this module is safe to import on web
// (no native module is required at the top level).
// ─────────────────────────────────────────────────────────────────────────────

import { Platform, Linking } from "react-native";
import { useEffect, useState } from "react";

export type MicPermState = "granted" | "denied" | "prompt";

// ── Low-level check ──────────────────────────────────────────────────────────

/**
 * Returns the current microphone permission state without triggering a dialog.
 * Falls back to "prompt" if the state cannot be determined.
 */
export async function getMicPermissionState(): Promise<MicPermState> {
  if (Platform.OS === "web") {
    if (typeof navigator === "undefined" || !navigator.permissions) return "prompt";
    try {
      const status = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      if (status.state === "denied") return "denied";
      if (status.state === "granted") return "granted";
      return "prompt";
    } catch {
      return "prompt";
    }
  }

  // Native (iOS / Android)
  let Audio: typeof import("expo-av").Audio | null = null;
  try {
    const { NativeModules: _NM } = require("react-native");
    if (_NM.ExponentAV) Audio = require("expo-av").Audio;
  } catch {}
  if (!Audio) return "prompt";

  try {
    const { status, canAskAgain } = await Audio.getPermissionsAsync();
    if (status === "granted") return "granted";
    // "denied" + canAskAgain=false means OS-level permanent denial → settings required
    if (status === "denied" && !canAskAgain) return "denied";
    return "prompt";
  } catch {
    return "prompt";
  }
}

// ── Request permission (native only) ─────────────────────────────────────────

/**
 * Asks the OS to show the microphone permission dialog (native only).
 * On web the prompt is deferred to getUserMedia — do not call this on web.
 * Returns "granted" or "denied".
 */
export async function requestMicPermission(): Promise<"granted" | "denied"> {
  if (Platform.OS === "web") {
    // On web we probe by attempting getUserMedia directly
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return "granted";
    } catch {
      return "denied";
    }
  }

  let Audio: typeof import("expo-av").Audio | null = null;
  try { Audio = require("expo-av").Audio; } catch {}
  if (!Audio) return "denied";

  try {
    const { status } = await Audio.requestPermissionsAsync();
    return status === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

// ── Open OS settings ─────────────────────────────────────────────────────────

/**
 * Opens the OS app-settings page so the user can re-enable microphone access.
 * No-op on web (the user must interact with browser UI directly).
 */
export function openMicSettings(): void {
  if (Platform.OS !== "web") {
    Linking.openSettings().catch(() => {});
  }
}

// ── React hook ───────────────────────────────────────────────────────────────

/**
 * Hook that resolves the mic permission state on mount.
 * Returns null while the async check is still in flight.
 */
export function useMicPermissionState(): MicPermState | null {
  const [state, setState] = useState<MicPermState | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMicPermissionState().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => { cancelled = true; };
  }, []);

  return state;
}
