import { Alert } from "react-native";
import { showToast as _showToast } from "./toast";
import { localizeUi } from "./i18n";

export type AlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

type AlertState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
};

type Listener = (state: AlertState) => void;

let _listener: Listener | null = null;

export function formatAlertMessage(value: unknown, fallback = "Something went wrong. Please try again."): string {
  const isUseful = (candidate: unknown): candidate is string =>
    typeof candidate === "string" &&
    candidate.trim().length > 0 &&
    candidate.trim() !== "{}" &&
    candidate.trim() !== "[]";

  if (isUseful(value)) return value;
  if (value instanceof Error && isUseful(value.message)) return value.message;
  if (value && typeof value === "object") {
    const error = value as Record<string, unknown>;
    for (const key of ["message", "error_description", "error", "details", "hint"]) {
      const candidate = error[key];
      if (isUseful(candidate)) return candidate;
      if (candidate && typeof candidate === "object") {
        const nested = formatAlertMessage(candidate, "");
        if (isUseful(nested)) return nested;
      }
    }
    const code = typeof error.code === "string" ? error.code : "";
    if (code) return `Request failed (${code}). Please try again.`;
    try {
      const serialized = JSON.stringify(value);
      if (isUseful(serialized)) return serialized;
    } catch {
      // Use the caller's fallback when an error object cannot be serialized.
    }
  }
  return fallback;
}

export function registerAlertListener(fn: Listener) {
  _listener = fn;
}

export function unregisterAlertListener() {
  _listener = null;
}

export function showToast(message: string, _long = false) {
  // App literals are localized by the Babel transform. Runtime messages
  // (including server/user content) must remain untouched.
  _showToast(message, { type: "info" });
}

export function showAlert(
  title: string,
  message?: unknown,
  buttons?: AlertButton[],
) {
  const safeMessage = message === undefined ? undefined : formatAlertMessage(message);
  // Always prefer the custom AlertModal — gives a consistent appearance across platforms.
  if (_listener) {
    _listener({
      visible: true,
      title,
      // Literal messages are localized by the Babel UI transform. Keep
      // runtime/server error strings intact; they are not interface copy.
      message: safeMessage,
      buttons,
    });
    return;
  }

  // Fallback: AlertModal not yet registered (very early startup edge case).
  const nativeButtons =
    buttons && buttons.length > 0
      ? buttons.map((b) => ({
          text: b.text,
          style: b.style,
          onPress: b.onPress,
        }))
      : [{ text: "OK" }];
  Alert.alert(title || "", safeMessage || "", nativeButtons, { cancelable: true });
}

export function confirmAlert(
  title: string,
  message?: unknown,
  options?: {
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
  },
): Promise<boolean> {
  return new Promise((resolve) => {
    showAlert(title, message, [
      {
        text: options?.cancelText || localizeUi("Cancel"),
        style: "cancel",
        onPress: () => resolve(false),
      },
      {
        text: options?.confirmText || localizeUi("OK"),
        style: options?.destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}
