export const PREFERENCES_STORAGE_KEY = "anatole.preferences.v0.4";

export type AnatoleTheme = "dark" | "blue";
export type AnatoleDensity = "comfortable" | "compact";
export type AnatoleDecimals = 2 | 3;
export type AnatoleTimeRange = "1m" | "3m" | "6m" | "1y" | "5y";

export type AnatolePreferences = {
  theme: AnatoleTheme;
  density: AnatoleDensity;
  decimals: AnatoleDecimals;
  defaultRange: AnatoleTimeRange;
  defaultUniverse: "tsx60";
};

export const DEFAULT_PREFERENCES: AnatolePreferences = {
  theme: "dark",
  density: "comfortable",
  decimals: 2,
  defaultRange: "1y",
  defaultUniverse: "tsx60",
};

export function readPreferences(): AnatolePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AnatolePreferences>;
    return {
      theme: parsed.theme === "blue" ? "blue" : "dark",
      density: parsed.density === "compact" ? "compact" : "comfortable",
      decimals: parsed.decimals === 3 ? 3 : 2,
      defaultRange: ["1m", "3m", "6m", "1y", "5y"].includes(parsed.defaultRange ?? "")
        ? (parsed.defaultRange as AnatoleTimeRange)
        : "1y",
      defaultUniverse: "tsx60",
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function writePreferences(preferences: AnatolePreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}
