// expo-secure-store is native-only; on web all PIN/biometric ops are no-ops.
let SecureStore: typeof import("expo-secure-store") | null = null;
try { SecureStore = require("expo-secure-store"); } catch {}

const PIN_KEY = "afuchat_app_pin";
const BIOMETRIC_KEY = "afuchat_biometric_enabled";
const SCREENSHOT_KEY = "afuchat_screenshot_protection";

let ScreenCapture: typeof import("expo-screen-capture") | null = null;
try {
  ScreenCapture = require("expo-screen-capture");
} catch {}

function simpleHash(pin: string): string {
  let hash = 5381;
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) + hash) + pin.charCodeAt(i);
    hash = hash & hash;
  }
  return String(Math.abs(hash)) + "_" + pin.length;
}

export async function storePIN(pin: string): Promise<void> {
  try {
    await SecureStore?.setItemAsync(PIN_KEY, simpleHash(pin));
  } catch {}
}

export async function verifyPIN(pin: string): Promise<boolean> {
  try {
    const stored = await SecureStore?.getItemAsync(PIN_KEY);
    if (!stored) return false;
    return stored === simpleHash(pin);
  } catch {
    return false;
  }
}

export async function hasPIN(): Promise<boolean> {
  try {
    const stored = await SecureStore?.getItemAsync(PIN_KEY);
    return !!stored;
  } catch {
    return false;
  }
}

export async function clearPIN(): Promise<void> {
  try {
    await SecureStore?.deleteItemAsync(PIN_KEY);
  } catch {}
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    await SecureStore?.setItemAsync(BIOMETRIC_KEY, enabled ? "1" : "0");
  } catch {}
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const val = await SecureStore?.getItemAsync(BIOMETRIC_KEY);
    return val === "1";
  } catch {
    return false;
  }
}

export async function setScreenshotProtectionEnabled(enabled: boolean): Promise<void> {
  try {
    await SecureStore?.setItemAsync(SCREENSHOT_KEY, enabled ? "1" : "0");
    await applyScreenshotProtection(enabled);
  } catch {}
}

export async function isScreenshotProtectionEnabled(): Promise<boolean> {
  try {
    const val = await SecureStore?.getItemAsync(SCREENSHOT_KEY);
    return val === "1";
  } catch {
    return false;
  }
}

export async function applyScreenshotProtection(enabled: boolean): Promise<void> {
  if (!ScreenCapture) return;
  try {
    if (enabled) {
      await ScreenCapture.preventScreenCaptureAsync();
    } else {
      await ScreenCapture.allowScreenCaptureAsync();
    }
  } catch {}
}

export async function restoreScreenshotProtection(): Promise<void> {
  try {
    const enabled = await isScreenshotProtectionEnabled();
    await applyScreenshotProtection(enabled);
  } catch {}
}
