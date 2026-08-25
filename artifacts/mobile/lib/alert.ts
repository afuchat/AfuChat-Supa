import { Alert } from "react-native";
import { showToast as _showToast } from "./toast";

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
  if (typeof value === "string" && value.trim()) return value;
  if (value instanceof Error && value.message) return value.message;
  if (value && typeof value === "object") {
    const error = value as Record<string, unknown>;
    for (const key of ["message", "error_description", "details", "hint"]) {
      const candidate = error[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
    const code = typeof error.code === "string" ? error.code : "";
    if (code) return `Request failed (${code}). Please try again.`;
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
    _listener({ visible: true, title, message: safeMessage, buttons });
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
        text: options?.cancelText || "Cancel",
        style: "cancel",
        onPress: () => resolve(false),
      },
      {
        text: options?.confirmText || "OK",
        style: options?.destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}
