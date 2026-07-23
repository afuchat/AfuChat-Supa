let _mod: typeof import("expo-haptics") | null | undefined;

function getHaptics() {
  if (_mod === undefined) {
    try {
      _mod = require("expo-haptics");
    } catch {
      _mod = null;
    }
  }
  return _mod;
}

export function impactAsync(style?: any) {
  const h = getHaptics();
  if (h) h.impactAsync(style);
}

export function notificationAsync(type?: any) {
  const h = getHaptics();
  if (h) h.notificationAsync(type);
}

export function selectionAsync() {
  const h = getHaptics();
  if (h) h.selectionAsync();
}

export const ImpactFeedbackStyle = (() => {
  try { return require("expo-haptics").ImpactFeedbackStyle; } catch { return { Light: "light", Medium: "medium", Heavy: "heavy" }; }
})();

export const NotificationFeedbackType = (() => {
  try { return require("expo-haptics").NotificationFeedbackType; } catch { return { Success: "success", Warning: "warning", Error: "error" }; }
})();
