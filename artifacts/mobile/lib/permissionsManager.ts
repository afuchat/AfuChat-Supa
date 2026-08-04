// ─── Unified Permissions Manager ──────────────────────────────────────────────
// Single source of truth for all system permission requests.
//
// Why this exists:
//   • Permissions are requested ad-hoc across many screens; this centralises them.
//   • Statuses are cached in MMKV so we never make a redundant native call.
//   • "blocked" (permanently denied) is surfaced immediately without a native
//     round-trip, so callers can show a Settings prompt instead of re-requesting.
//   • All requires are lazy so the module is safe to import on web.
//
// Usage:
//   const status = await requestPermission("camera");
//   if (status !== "granted") { /* show guidance */ }
//
//   // Or check cached status synchronously (no native call):
//   if (isPermissionGranted("notifications")) { ... }

import { Platform } from "react-native";
import { storage } from "./storage/mmkv";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PermissionType =
  | "notifications"
  | "camera"
  | "microphone"
  | "mediaLibrary"
  | "contacts"
  | "location";

/** mirrors Expo's status strings */
export type PermissionStatus =
  | "granted"
  | "denied"      // soft-denied (can re-request)
  | "undetermined"
  | "blocked";    // permanently denied → must open Settings

// ─── Cache helpers ──────────────────────────────────────────────────────────────

const PERM_PREFIX = "perm_status_";

function _permKey(type: PermissionType): string {
  return PERM_PREFIX + type;
}

/** Synchronous — read from MMKV, no native call. */
export function getPermissionStatus(type: PermissionType): PermissionStatus {
  try {
    const cached = storage.getString(_permKey(type));
    if (cached) return cached as PermissionStatus;
  } catch {}
  return "undetermined";
}

/** Write status to MMKV. Called internally after every native query. */
export function setPermissionStatus(type: PermissionType, status: PermissionStatus): void {
  try { storage.setString(_permKey(type), status); } catch {}
}

/** Clear a cached status (e.g. user may have changed it in OS Settings). */
export function clearPermissionStatus(type: PermissionType): void {
  try { storage.delete(_permKey(type)); } catch {}
}

/** Synchronous — true only if cached status is "granted". */
export function isPermissionGranted(type: PermissionType): boolean {
  return getPermissionStatus(type) === "granted";
}

/**
 * Re-checks all permission statuses from the OS and refreshes the cache.
 * Call when the app returns to foreground so cached statuses stay accurate
 * (the user may have changed them in Settings while the app was backgrounded).
 */
export async function refreshAllPermissions(): Promise<void> {
  if (Platform.OS === "web") return;
  const types: PermissionType[] = [
    "notifications", "camera", "microphone", "mediaLibrary", "contacts",
  ];
  await Promise.all(types.map((t) => checkPermission(t).catch(() => {})));
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Request a permission if needed.
 *
 * • "granted"       → already granted (cache hit, no native call)
 * • "blocked"       → permanently denied; caller should open Settings
 * • "denied"        → soft-denied; caller may re-request
 * • "undetermined"  → native call made and no permission system found
 *
 * Safe to call multiple times — uses cached state to skip redundant prompts.
 */
export async function requestPermission(type: PermissionType): Promise<PermissionStatus> {
  // Web: forward to browser permission API for notifications; others auto-grant.
  if (Platform.OS === "web") return _requestWeb(type);

  // Fast path: already granted or hard-blocked → no native call needed.
  const cached = getPermissionStatus(type);
  if (cached === "granted") return "granted";
  if (cached === "blocked") return "blocked";

  try {
    switch (type) {
      case "notifications": return await _requestNotifications();
      case "camera":        return await _requestCamera();
      case "microphone":    return await _requestMicrophone();
      case "mediaLibrary":  return await _requestMediaLibrary();
      case "contacts":      return await _requestContacts();
      case "location":      return await _requestLocation();
      default:              return "undetermined";
    }
  } catch {
    return "undetermined";
  }
}

/**
 * Check live permission status without prompting (silent OS query).
 * Updates the MMKV cache with the result.
 */
export async function checkPermission(type: PermissionType): Promise<PermissionStatus> {
  if (Platform.OS === "web") return getPermissionStatus(type);
  try {
    switch (type) {
      case "notifications": return await _checkNotifications();
      case "camera":        return await _checkCamera();
      case "microphone":    return await _checkMicrophone();
      case "mediaLibrary":  return await _checkMediaLibrary();
      case "contacts":      return await _checkContacts();
      case "location":      return await _checkLocation();
      default:              return "undetermined";
    }
  } catch {
    return getPermissionStatus(type);
  }
}

// ─── Internal: normalise + cache ───────────────────────────────────────────────

function _norm(raw: string, type: PermissionType): PermissionStatus {
  let s: PermissionStatus;
  if      (raw === "granted")                  s = "granted";
  else if (raw === "denied" || raw === "restricted") s = "blocked";
  else                                         s = "undetermined";
  setPermissionStatus(type, s);
  return s;
}

// ─── Internal: web ─────────────────────────────────────────────────────────────

async function _requestWeb(type: PermissionType): Promise<PermissionStatus> {
  if (type === "notifications") {
    try {
      if (typeof Notification === "undefined") return "undetermined";
      if (Notification.permission === "granted") { setPermissionStatus(type, "granted"); return "granted"; }
      if (Notification.permission === "denied")  { setPermissionStatus(type, "blocked"); return "blocked"; }
      const result = await Notification.requestPermission();
      const s: PermissionStatus = result === "granted" ? "granted" : "blocked";
      setPermissionStatus(type, s);
      return s;
    } catch { return "undetermined"; }
  }
  // Camera/microphone use getUserMedia — we don't cache the result here
  // (the browser manages them); report as undetermined so callers fall through.
  return "undetermined";
}

// ─── Internal: notifications ───────────────────────────────────────────────────

async function _requestNotifications(): Promise<PermissionStatus> {
  try {
    const { requestPermissionsAsync } = require("expo-notifications") as typeof import("expo-notifications");
    const { status } = await requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return _norm(status, "notifications");
  } catch { return "undetermined"; }
}

async function _checkNotifications(): Promise<PermissionStatus> {
  try {
    const { getPermissionsAsync } = require("expo-notifications") as typeof import("expo-notifications");
    const { status } = await getPermissionsAsync();
    return _norm(status, "notifications");
  } catch { return getPermissionStatus("notifications"); }
}

// ─── Internal: camera ──────────────────────────────────────────────────────────

async function _requestCamera(): Promise<PermissionStatus> {
  try {
    // expo-camera v55: permission helpers are static methods on the Camera class
    const expoCamera = require("expo-camera") as any;
    const fn = expoCamera.Camera?.requestCameraPermissionsAsync
      ?? expoCamera.requestCameraPermissionsAsync;
    const { status } = await fn();
    return _norm(status, "camera");
  } catch { return "undetermined"; }
}

async function _checkCamera(): Promise<PermissionStatus> {
  try {
    const expoCamera = require("expo-camera") as any;
    const fn = expoCamera.Camera?.getCameraPermissionsAsync
      ?? expoCamera.getCameraPermissionsAsync;
    const { status } = await fn();
    return _norm(status, "camera");
  } catch { return getPermissionStatus("camera"); }
}

// ─── Internal: microphone ──────────────────────────────────────────────────────

async function _requestMicrophone(): Promise<PermissionStatus> {
  try {
    const expoCamera = require("expo-camera") as any;
    const fn = expoCamera.Camera?.requestMicrophonePermissionsAsync
      ?? expoCamera.requestMicrophonePermissionsAsync;
    const { status } = await fn();
    return _norm(status, "microphone");
  } catch { return "undetermined"; }
}

async function _checkMicrophone(): Promise<PermissionStatus> {
  try {
    const expoCamera = require("expo-camera") as any;
    const fn = expoCamera.Camera?.getMicrophonePermissionsAsync
      ?? expoCamera.getMicrophonePermissionsAsync;
    const { status } = await fn();
    return _norm(status, "microphone");
  } catch { return getPermissionStatus("microphone"); }
}

// ─── Internal: media library ───────────────────────────────────────────────────

async function _requestMediaLibrary(): Promise<PermissionStatus> {
  try {
    const { requestPermissionsAsync } = require("expo-media-library") as typeof import("expo-media-library");
    const { status } = await requestPermissionsAsync();
    return _norm(status, "mediaLibrary");
  } catch { return "undetermined"; }
}

async function _checkMediaLibrary(): Promise<PermissionStatus> {
  try {
    const { getPermissionsAsync } = require("expo-media-library") as typeof import("expo-media-library");
    const { status } = await getPermissionsAsync();
    return _norm(status, "mediaLibrary");
  } catch { return getPermissionStatus("mediaLibrary"); }
}

// ─── Internal: contacts ────────────────────────────────────────────────────────

async function _requestContacts(): Promise<PermissionStatus> {
  try {
    const { requestPermissionsAsync } = require("expo-contacts") as typeof import("expo-contacts");
    const { status } = await requestPermissionsAsync();
    return _norm(status, "contacts");
  } catch { return "undetermined"; }
}

async function _checkContacts(): Promise<PermissionStatus> {
  try {
    const { getPermissionsAsync } = require("expo-contacts") as typeof import("expo-contacts");
    const { status } = await getPermissionsAsync();
    return _norm(status, "contacts");
  } catch { return getPermissionStatus("contacts"); }
}

// ─── Internal: location ────────────────────────────────────────────────────────

async function _requestLocation(): Promise<PermissionStatus> {
  try {
    const Location = require("expo-location") as typeof import("expo-location");
    const { status } = await Location.requestForegroundPermissionsAsync();
    return _norm(status, "location");
  } catch { return "undetermined"; }
}

async function _checkLocation(): Promise<PermissionStatus> {
  try {
    const Location = require("expo-location") as typeof import("expo-location");
    const { status } = await Location.getForegroundPermissionsAsync();
    return _norm(status, "location");
  } catch { return getPermissionStatus("location"); }
}
