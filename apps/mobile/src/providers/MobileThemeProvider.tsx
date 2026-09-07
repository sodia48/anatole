import { createContext, type PropsWithChildren, useCallback, useContext, useMemo } from "react";

import { useMobileAccount } from "./MobileAccountProvider";
import {
  mobilePalettes,
  getActiveMobileTheme,
  setActiveMobileTheme,
  type MobileThemeName,
  type ThemeColors,
} from "@/src/theme/palettes";

type MobileThemeValue = {
  theme: MobileThemeName;
  colors: ThemeColors;
  isSky: boolean;
  setTheme: (theme: MobileThemeName) => Promise<void>;
};

const MobileThemeContext = createContext<MobileThemeValue | null>(null);

export function MobileThemeProvider({ children }: PropsWithChildren) {
  const { workspace, saveWorkspace } = useMobileAccount();
  const theme: MobileThemeName = workspace.data.preferences.theme === "blue" ? "blue" : "dark";
  setActiveMobileTheme(theme);

  const setTheme = useCallback(async (next: MobileThemeName) => {
    if (workspace.data.preferences.theme === next) return;
    await saveWorkspace({
      ...workspace.data,
      preferences: { ...workspace.data.preferences, theme: next },
    });
  }, [saveWorkspace, workspace.data]);

  const value = useMemo<MobileThemeValue>(() => ({
    theme,
    colors: mobilePalettes[theme],
    isSky: theme === "blue",
    setTheme,
  }), [setTheme, theme]);

  return <MobileThemeContext.Provider value={value}>{children}</MobileThemeContext.Provider>;
}

export function useMobileTheme(): MobileThemeValue {
  const value = useContext(MobileThemeContext);
  if (value) return value;
  const theme = getActiveMobileTheme();
  return {
    theme,
    colors: mobilePalettes[theme],
    isSky: theme === "blue",
    setTheme: async () => undefined,
  };
}
