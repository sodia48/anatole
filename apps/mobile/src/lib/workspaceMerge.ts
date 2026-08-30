import type { AlertRule, PortfolioPositionInput, SyncedWorkspaceData } from "./api/types";
import { normalizeTicker } from "./ticker";

function mergeBy<T>(remote: T[], local: T[], key: (item: T) => string, max: number): T[] {
  const values = new Map<string, T>();
  for (const item of remote) values.set(key(item), item);
  for (const item of local) values.set(key(item), item);
  return [...values.values()].slice(0, max);
}

export function mergeWorkspaceData(remote: SyncedWorkspaceData, local: SyncedWorkspaceData): SyncedWorkspaceData {
  const watchlist = [...new Set([...remote.watchlist, ...local.watchlist].map(normalizeTicker).filter(Boolean))].slice(0, 30);
  const portfolio = mergeBy<PortfolioPositionInput>(remote.portfolio, local.portfolio, (item) => normalizeTicker(item.symbol), 30);
  const alerts = mergeBy<AlertRule>(remote.alerts, local.alerts, (item) => item.id, 50);
  return {
    ...remote,
    watchlist,
    portfolio,
    alerts,
    preferences: remote.preferences,
    cockpit_universe: remote.cockpit_universe,
    comparator_symbols: [...new Set([...remote.comparator_symbols, ...local.comparator_symbols].map(normalizeTicker).filter(Boolean))].slice(0, 5),
    focus_layouts: local.focus_layouts.length ? local.focus_layouts : remote.focus_layouts,
    focus_scripts: local.focus_scripts.length ? local.focus_scripts : remote.focus_scripts,
  };
}
