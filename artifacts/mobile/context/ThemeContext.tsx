import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ThemeMode = "system" | "light" | "dark";

type ThemeContextType = {
  themeMode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setForceDark: (v: boolean) => void;
};

const THEME_KEY = "@afuchat_theme";

// Module-level cache — persists across hot-reloads and navigation so the
// theme is available synchronously on every subsequent render without
// waiting for AsyncStorage again → no flash on re-mount.
let _moduleCache: ThemeMode | null = null;

const ThemeContext = createContext<ThemeContextType>({
  themeMode: "system",
  isDark: false,
  setThemeMode: () => {},
  setForceDark: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();

  // Use the module-level cache as the initial value so hot-reloads and
  // re-mounts instantly show the correct theme without an async round-trip.
  const [themeMode, setThemeModeState] = useState<ThemeMode>(
    _moduleCache ?? "system"
  );
  const [forceDark, setForceDarkState] = useState(false);

  // Populate the cache once on first mount — purely for subsequent mounts.
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    AsyncStorage.getItem(THEME_KEY)
      .then((val) => {
        if (val === "light" || val === "dark" || val === "system") {
          _moduleCache = val;
          setThemeModeState((prev) => (prev === val ? prev : val));
        }
      })
      .catch(() => {});
  }, []);

  function setThemeMode(mode: ThemeMode) {
    _moduleCache = mode;
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_KEY, mode).catch(() => {});
  }

  const setForceDark = useCallback((v: boolean) => {
    setForceDarkState(v);
  }, []);

  const baseIsDark =
    themeMode === "system" ? systemScheme === "dark" : themeMode === "dark";
  const isDark = forceDark || baseIsDark;

  return (
    <ThemeContext.Provider value={{ themeMode, isDark, setThemeMode, setForceDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useThemeContext = () => useContext(ThemeContext);
