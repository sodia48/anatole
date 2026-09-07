import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";

export type MobileThemeName = "dark" | "blue";

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  primaryPressed: string;
  cyan: string;
  positive: string;
  negative: string;
  warning: string;
  onPrimary: string;
  onDanger: string;
  primarySurface: string;
  primarySurfaceStrong: string;
  positiveSurface: string;
  negativeSurface: string;
  warningSurface: string;
  overlay: string;
  shadow: string;
  dataCanvas: string;
  dataCanvasText: string;
};

export const originalPalette: ThemeColors = {
  background: "#050D15",
  surface: "#081B29",
  surfaceRaised: "#0C2435",
  border: "#17445F",
  borderStrong: "#256A91",
  text: "#EDF8FF",
  textMuted: "#8FB1C6",
  textSubtle: "#5F849B",
  primary: "#2C9CFF",
  primaryPressed: "#1777C5",
  cyan: "#21D4D2",
  positive: "#00D7AD",
  negative: "#FF365F",
  warning: "#F6B94A",
  onPrimary: "#FFFFFF",
  onDanger: "#FFFFFF",
  primarySurface: "rgba(44, 156, 255, 0.18)",
  primarySurfaceStrong: "#12588B",
  positiveSurface: "rgba(0, 215, 173, 0.13)",
  negativeSurface: "rgba(255, 54, 95, 0.13)",
  warningSurface: "rgba(246, 185, 74, 0.13)",
  overlay: "rgba(5, 13, 21, 0.78)",
  shadow: "#000000",
  dataCanvas: "#050D15",
  dataCanvasText: "#EDF8FF",
};

export const skyPalette: ThemeColors = {
  background: "#DDF3FF",
  surface: "#F7FCFF",
  surfaceRaised: "#EAF6FD",
  border: "#B7DAEC",
  borderStrong: "#7FB9D8",
  text: "#082033",
  textMuted: "#56758A",
  textSubtle: "#7897AA",
  primary: "#168FE0",
  primaryPressed: "#0E73BA",
  cyan: "#0D9FAF",
  positive: "#008F73",
  negative: "#CC3150",
  warning: "#A96900",
  onPrimary: "#FFFFFF",
  onDanger: "#FFFFFF",
  primarySurface: "rgba(22, 143, 224, 0.14)",
  primarySurfaceStrong: "#0E73BA",
  positiveSurface: "rgba(0, 143, 115, 0.12)",
  negativeSurface: "rgba(204, 49, 80, 0.11)",
  warningSurface: "rgba(169, 105, 0, 0.11)",
  overlay: "rgba(8, 32, 51, 0.34)",
  shadow: "#44758F",
  dataCanvas: "#061722",
  dataCanvasText: "#EDF8FF",
};

export const mobilePalettes: Record<MobileThemeName, ThemeColors> = {
  dark: originalPalette,
  blue: skyPalette,
};

let activeTheme: MobileThemeName = "dark";

export function setActiveMobileTheme(theme: MobileThemeName): void {
  activeTheme = theme;
}

export function getActiveMobileTheme(): MobileThemeName {
  return activeTheme;
}

export const colors = new Proxy({} as ThemeColors, {
  get(_target, property: string | symbol) {
    return mobilePalettes[activeTheme][property as keyof ThemeColors];
  },
});

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function createThemedStyles<T extends NamedStyles<T>>(
  factory: (palette: ThemeColors) => T,
): T {
  const cache = new Map<MobileThemeName, T>();
  const resolve = (): T => {
    const cached = cache.get(activeTheme);
    if (cached) return cached;
    const created = StyleSheet.create(factory(mobilePalettes[activeTheme])) as T;
    cache.set(activeTheme, created);
    return created;
  };
  return new Proxy({} as T, {
    get(_target, property: string | symbol) {
      return resolve()[property as keyof T];
    },
    ownKeys() {
      return Reflect.ownKeys(resolve());
    },
    getOwnPropertyDescriptor(_target, property) {
      return Object.getOwnPropertyDescriptor(resolve(), property) ?? {
        configurable: true,
        enumerable: true,
        writable: false,
        value: resolve()[property as keyof T],
      };
    },
  });
}
