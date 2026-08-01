import type {
  AdvisorProfile,
  AlertRule,
  PortfolioPositionInput,
} from "./types";

export const WORKSPACE_SYNC_EVENT = "anatole-workspace-sync-applied";

export type SyncedPreferences = {
  theme: "dark" | "blue";
  density: "comfortable" | "compact";
  decimals: 2 | 3;
  default_range: "1m" | "3m" | "6m" | "1y" | "5y";
  default_universe: "tsx60" | "composite";
};

export type SyncedWorkspaceData = {
  watchlist: string[];
  portfolio: PortfolioPositionInput[];
  alerts: AlertRule[];
  preferences: SyncedPreferences;
  advisor_profile: AdvisorProfile | null;
  cockpit_universe: "tsx60" | "composite";
  comparator_symbols: string[];
};

export type LocalWorkspaceSnapshot = {
  data: SyncedWorkspaceData;
  present: Record<keyof SyncedWorkspaceData, boolean>;
};

const KEYS = {
  watchlist: "anatole.watchlist.v1",
  portfolio: "anatole:portfolio:v1",
  alerts: "anatole:alerts:v1",
  preferences: "anatole.preferences.v0.4",
  advisor_profile: "anatole:advisor-profile:v1",
  cockpit_universe: "anatole-cockpit-universe",
  comparator_symbols: "anatole:comparison-symbols:v1",
} as const;

const DEFAULT_PREFERENCES: SyncedPreferences = {
  theme: "dark",
  density: "comfortable",
  decimals: 2,
  default_range: "1y",
  default_universe: "tsx60",
};

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function symbols(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toUpperCase().replace(/\.TO$/, ""))
      .filter((item) => /^[A-Z0-9.^-]{1,15}$/.test(item)),
  )].slice(0, max);
}

function portfolio(value: unknown): PortfolioPositionInput[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: PortfolioPositionInput[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<PortfolioPositionInput>;
    const symbol = String(item.symbol ?? "").trim().toUpperCase().replace(/\.TO$/, "");
    const quantity = Number(item.quantity);
    const averageCost = Number(item.average_cost);
    if (!symbol || seen.has(symbol) || quantity <= 0 || averageCost < 0) continue;
    seen.add(symbol);
    output.push({ symbol, quantity, average_cost: averageCost });
  }
  return output.slice(0, 30);
}

function alerts(value: unknown): AlertRule[] {
  if (!Array.isArray(value)) return [];
  const output: AlertRule[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as AlertRule;
    if (!item.id || !item.symbol || seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  return output.slice(0, 50);
}

function preferences(value: unknown): SyncedPreferences {
  if (!value || typeof value !== "object") return DEFAULT_PREFERENCES;
  const raw = value as Partial<{
    theme: string;
    density: string;
    decimals: number;
    defaultRange: string;
    default_range: string;
    defaultUniverse: string;
    default_universe: string;
  }>;
  const range = raw.default_range ?? raw.defaultRange;
  const universe = raw.default_universe ?? raw.defaultUniverse;
  return {
    theme: raw.theme === "blue" ? "blue" : "dark",
    density: raw.density === "compact" ? "compact" : "comfortable",
    decimals: raw.decimals === 3 ? 3 : 2,
    default_range: ["1m", "3m", "6m", "1y", "5y"].includes(range ?? "")
      ? (range as SyncedPreferences["default_range"])
      : "1y",
    default_universe: universe === "composite" ? "composite" : "tsx60",
  };
}

export function emptyWorkspace(): SyncedWorkspaceData {
  return {
    watchlist: [],
    portfolio: [],
    alerts: [],
    preferences: DEFAULT_PREFERENCES,
    advisor_profile: null,
    cockpit_universe: "tsx60",
    comparator_symbols: [],
  };
}

export function readLocalWorkspace(): LocalWorkspaceSnapshot {
  if (typeof window === "undefined") {
    const data = emptyWorkspace();
    return {
      data,
      present: Object.fromEntries(
        Object.keys(data).map((key) => [key, false]),
      ) as LocalWorkspaceSnapshot["present"],
    };
  }

  const raw = Object.fromEntries(
    Object.entries(KEYS).map(([key, storageKey]) => [key, window.localStorage.getItem(storageKey)]),
  ) as Record<keyof typeof KEYS, string | null>;

  const universe = raw.cockpit_universe === "composite" ? "composite" : "tsx60";
  return {
    data: {
      watchlist: symbols(parseJson(raw.watchlist, []), 30),
      portfolio: portfolio(parseJson(raw.portfolio, [])),
      alerts: alerts(parseJson(raw.alerts, [])),
      preferences: preferences(parseJson(raw.preferences, DEFAULT_PREFERENCES)),
      advisor_profile: parseJson<AdvisorProfile | null>(raw.advisor_profile, null),
      cockpit_universe: universe,
      comparator_symbols: symbols(parseJson(raw.comparator_symbols, []), 5),
    },
    present: Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, value !== null]),
    ) as LocalWorkspaceSnapshot["present"],
  };
}

function mergeBySymbol(
  remote: PortfolioPositionInput[],
  local: PortfolioPositionInput[],
): PortfolioPositionInput[] {
  const values = new Map<string, PortfolioPositionInput>();
  for (const item of remote) values.set(item.symbol, item);
  for (const item of local) values.set(item.symbol, item);
  return [...values.values()].slice(0, 30);
}

function mergeAlerts(remote: AlertRule[], local: AlertRule[]): AlertRule[] {
  const values = new Map<string, AlertRule>();
  for (const item of remote) values.set(item.id, item);
  for (const item of local) values.set(item.id, item);
  return [...values.values()].slice(0, 50);
}

export function mergeWorkspace(
  remote: SyncedWorkspaceData,
  local: LocalWorkspaceSnapshot,
): SyncedWorkspaceData {
  return {
    watchlist: symbols([...remote.watchlist, ...local.data.watchlist], 30),
    portfolio: local.present.portfolio
      ? mergeBySymbol(remote.portfolio, local.data.portfolio)
      : remote.portfolio,
    alerts: local.present.alerts
      ? mergeAlerts(remote.alerts, local.data.alerts)
      : remote.alerts,
    preferences: local.present.preferences ? local.data.preferences : remote.preferences,
    advisor_profile: local.present.advisor_profile
      ? local.data.advisor_profile
      : remote.advisor_profile,
    cockpit_universe: local.present.cockpit_universe
      ? local.data.cockpit_universe
      : remote.cockpit_universe,
    comparator_symbols: symbols(
      [...remote.comparator_symbols, ...local.data.comparator_symbols],
      5,
    ),
  };
}

export function writeLocalWorkspace(data: SyncedWorkspaceData): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEYS.watchlist, JSON.stringify(data.watchlist));
  window.localStorage.setItem(KEYS.portfolio, JSON.stringify(data.portfolio));
  window.localStorage.setItem(KEYS.alerts, JSON.stringify(data.alerts));
  window.localStorage.setItem(KEYS.preferences, JSON.stringify({
    theme: data.preferences.theme,
    density: data.preferences.density,
    decimals: data.preferences.decimals,
    defaultRange: data.preferences.default_range,
    defaultUniverse: data.preferences.default_universe,
  }));
  if (data.advisor_profile) {
    window.localStorage.setItem(KEYS.advisor_profile, JSON.stringify(data.advisor_profile));
  } else {
    window.localStorage.removeItem(KEYS.advisor_profile);
  }
  window.localStorage.setItem(KEYS.cockpit_universe, data.cockpit_universe);
  window.localStorage.setItem(KEYS.comparator_symbols, JSON.stringify(data.comparator_symbols));
  window.dispatchEvent(new Event("anatole-watchlist-change"));
  window.dispatchEvent(new CustomEvent(WORKSPACE_SYNC_EVENT));
}

export function workspaceFingerprint(data: SyncedWorkspaceData): string {
  return JSON.stringify(data);
}
