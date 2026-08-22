import React, { createContext, useCallback, useContext, useState } from "react";
type ThemeMode = "system" | "light" | "dark";

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
  const themeMode: ThemeMode = "dark";
  const [forceDark, setForceDarkState] = useState(false);

  function setThemeMode(_mode: ThemeMode) {}

  const setForceDark = useCallback((v: boolean) => {
    setForceDarkState(v);
  }, []);

  const isDark = forceDark || true;

  return (
    <ThemeContext.Provider value={{ themeMode, isDark, setThemeMode, setForceDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useThemeContext = () => useContext(ThemeContext);
