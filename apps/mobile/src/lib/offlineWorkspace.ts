import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AlertRule, PortfolioPositionInput, SyncedWorkspaceData, WorkspaceSnapshot } from "./api/types";
import { normalizeTicker } from "./ticker";

export const LOCAL_WORKSPACE_KEY = "anatole.mobile.workspace.v2";
export const WORKSPACE_QUEUE_KEY = "anatole.mobile.workspace-actions.v1";

type WorkspacePreferences = SyncedWorkspaceData["preferences"];
type WorkspacePatch = Pick<SyncedWorkspaceData, "cockpit_universe" | "comparator_symbols" | "focus_layouts" | "focus_scripts" | "terminal_presets">;

export type WorkspaceAction = (
  | { kind: "watchlist:add"; symbol: string }
  | { kind: "watchlist:remove"; symbol: string }
  | { kind: "portfolio:upsert"; position: PortfolioPositionInput }
  | { kind: "portfolio:remove"; symbol: string }
  | { kind: "alert:upsert"; rule: AlertRule }
  | { kind: "alert:remove"; id: string }
  | { kind: "alert:toggle"; id: string; enabled: boolean }
  | { kind: "preferences:update"; preferences: WorkspacePreferences }
  | { kind: "workspace:update"; patch: Partial<WorkspacePatch> }
) & { id: string; created_at: string };

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const actionMeta = () => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, created_at: new Date().toISOString() });

export function deriveWorkspaceActions(previous: SyncedWorkspaceData, next: SyncedWorkspaceData): WorkspaceAction[] {
  const actions: WorkspaceAction[] = [];
  const beforeSymbols = new Set(previous.watchlist.map(normalizeTicker));
  const afterSymbols = new Set(next.watchlist.map(normalizeTicker));
  for (const symbol of afterSymbols) if (symbol && !beforeSymbols.has(symbol)) actions.push({ ...actionMeta(), kind: "watchlist:add", symbol });
  for (const symbol of beforeSymbols) if (symbol && !afterSymbols.has(symbol)) actions.push({ ...actionMeta(), kind: "watchlist:remove", symbol });

  const beforePositions = new Map(previous.portfolio.map((item) => [normalizeTicker(item.symbol), item]));
  const afterPositions = new Map(next.portfolio.map((item) => [normalizeTicker(item.symbol), item]));
  for (const [symbol, position] of afterPositions) {
    if (symbol && !same(beforePositions.get(symbol), position)) actions.push({ ...actionMeta(), kind: "portfolio:upsert", position: { ...position, symbol } });
  }
  for (const symbol of beforePositions.keys()) if (symbol && !afterPositions.has(symbol)) actions.push({ ...actionMeta(), kind: "portfolio:remove", symbol });

  const beforeAlerts = new Map(previous.alerts.map((item) => [item.id, item]));
  const afterAlerts = new Map(next.alerts.map((item) => [item.id, item]));
  for (const [id, rule] of afterAlerts) {
    const before = beforeAlerts.get(id);
    if (!before) actions.push({ ...actionMeta(), kind: "alert:upsert", rule });
    else if (!same(before, rule)) {
      const { enabled: _beforeEnabled, ...beforeRest } = before;
      const { enabled: _afterEnabled, ...afterRest } = rule;
      actions.push(same(beforeRest, afterRest)
        ? { ...actionMeta(), kind: "alert:toggle", id, enabled: rule.enabled }
        : { ...actionMeta(), kind: "alert:upsert", rule });
    }
  }
  for (const id of beforeAlerts.keys()) if (!afterAlerts.has(id)) actions.push({ ...actionMeta(), kind: "alert:remove", id });

  if (!same(previous.preferences, next.preferences)) actions.push({ ...actionMeta(), kind: "preferences:update", preferences: next.preferences });
  const patch: Partial<WorkspacePatch> = {};
  for (const key of ["cockpit_universe", "comparator_symbols", "focus_layouts", "focus_scripts", "terminal_presets"] as const) {
    if (!same(previous[key], next[key])) (patch as Record<string, unknown>)[key] = next[key];
  }
  if (Object.keys(patch).length) actions.push({ ...actionMeta(), kind: "workspace:update", patch });
  return actions;
}

export function applyWorkspaceActions(base: SyncedWorkspaceData, actions: WorkspaceAction[]): SyncedWorkspaceData {
  return actions.reduce<SyncedWorkspaceData>((current, action) => {
    switch (action.kind) {
      case "watchlist:add":
        return current.watchlist.includes(action.symbol) ? current : { ...current, watchlist: [...current.watchlist, action.symbol].slice(0, 30) };
      case "watchlist:remove":
        return { ...current, watchlist: current.watchlist.filter((item) => normalizeTicker(item) !== action.symbol) };
      case "portfolio:upsert":
        return { ...current, portfolio: [...current.portfolio.filter((item) => normalizeTicker(item.symbol) !== action.position.symbol), action.position].slice(0, 30) };
      case "portfolio:remove":
        return { ...current, portfolio: current.portfolio.filter((item) => normalizeTicker(item.symbol) !== action.symbol) };
      case "alert:upsert":
        return { ...current, alerts: [...current.alerts.filter((item) => item.id !== action.rule.id), action.rule].slice(0, 50) };
      case "alert:remove":
        return { ...current, alerts: current.alerts.filter((item) => item.id !== action.id) };
      case "alert:toggle":
        return { ...current, alerts: current.alerts.map((item) => item.id === action.id ? { ...item, enabled: action.enabled } : item) };
      case "preferences:update":
        return { ...current, preferences: action.preferences };
      case "workspace:update":
        return { ...current, ...action.patch };
    }
  }, base);
}

export async function loadLocalWorkspace(): Promise<WorkspaceSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_WORKSPACE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as WorkspaceSnapshot;
    return value && typeof value.revision === "number" && value.data ? value : null;
  } catch { return null; }
}

export const persistLocalWorkspace = (workspace: WorkspaceSnapshot) => AsyncStorage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify(workspace));
export const clearLocalWorkspace = () => AsyncStorage.multiRemove([LOCAL_WORKSPACE_KEY, WORKSPACE_QUEUE_KEY]);

export async function loadWorkspaceQueue(): Promise<WorkspaceAction[]> {
  try {
    const raw = await AsyncStorage.getItem(WORKSPACE_QUEUE_KEY);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export async function appendWorkspaceActions(actions: WorkspaceAction[]): Promise<void> {
  if (!actions.length) return;
  const current = await loadWorkspaceQueue();
  await AsyncStorage.setItem(WORKSPACE_QUEUE_KEY, JSON.stringify([...current, ...actions]));
}

export async function replayWorkspaceQueue(
  fetchLatest: () => Promise<WorkspaceSnapshot>,
  save: (snapshot: WorkspaceSnapshot) => Promise<WorkspaceSnapshot>,
): Promise<WorkspaceSnapshot | null> {
  const actions = await loadWorkspaceQueue();
  if (!actions.length) return null;
  const latest = await fetchLatest();
  const saved = await save({ ...latest, data: applyWorkspaceActions(latest.data, actions) });
  await AsyncStorage.removeItem(WORKSPACE_QUEUE_KEY);
  await persistLocalWorkspace(saved);
  return saved;
}
