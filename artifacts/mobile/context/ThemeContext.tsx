import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Appearance, type ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "system" | "light" | "dark";
const THEME_MODE_KEY = "afuchat_theme_mode";

type ThemeContextType = {
  themeMode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setForceDark: (v: boolean) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  themeMode: "dark",
  isDark: true,
  setThemeMode: () => {},
  setForceDark: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("dark");
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme());
  const [forceDark, setForceDarkState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_MODE_KEY).then((saved) => {
      if (saved === "system" || saved === "light" || saved === "dark") {
        setThemeModeState(saved);
      }
    }).catch(() => {});

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => subscription.remove();
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_MODE_KEY, mode).catch(() => {});
  }, []);

  const setForceDark = useCallback((v: boolean) => {
    setForceDarkState(v);
  }, []);

  const isDark = forceDark || (themeMode === "system" ? systemScheme !== "light" : themeMode === "dark");

  return (
    <ThemeContext.Provider value={{ themeMode, isDark, setThemeMode, setForceDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useThemeContext = () => useContext(ThemeContext);
