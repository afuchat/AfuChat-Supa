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
  message?: string,
  buttons?: AlertButton[],
) {
  // Always prefer the custom AlertModal — gives a consistent appearance across platforms.
  if (_listener) {
    _listener({ visible: true, title, message, buttons });
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
  Alert.alert(title || "", message || "", nativeButtons, { cancelable: true });
}

export function confirmAlert(
  title: string,
  message?: string,
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
