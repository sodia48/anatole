import type { TerminalRadarFilters, TerminalRadarItem, TerminalRadarPreset, TerminalRadarSort } from "./contracts";

export const TERMINAL_RADAR_DEFAULT_PRESETS: readonly TerminalRadarPreset[] = [
  { id: "momentum-volume", name: "Momentum + volume", filters: { momentum_20d_min: 3, relative_volume_min: 1.4 }, sort: "momentum_desc" },
  { id: "low-rsi-uptrend", name: "Faible RSI / tendance positive", filters: { rsi_max: 42, trend: "Haussière" }, sort: "score_desc" },
  { id: "leaders", name: "Leaders", filters: { score_min: 72 }, sort: "score_desc" },
  { id: "pressure", name: "Sous pression", filters: { score_max: 44 }, sort: "score_asc" },
  { id: "unusual-volume", name: "Volume inhabituel", filters: { anomaly_types: ["volume_spike"] }, sort: "volume_desc" },
] as const;

function within(value: number | null, minimum?: number | null, maximum?: number | null): boolean {
  if (value === null) return minimum == null && maximum == null;
  return (minimum == null || value >= minimum) && (maximum == null || value <= maximum);
}

export function filterTerminalRadar(
  items: readonly TerminalRadarItem[],
  filters: TerminalRadarFilters = {},
  sort: TerminalRadarSort = "score_desc",
): TerminalRadarItem[] {
  const anomalyTypes = new Set(filters.anomaly_types ?? []);
  const filtered = items.filter((item) => (
    within(item.score, filters.score_min, filters.score_max)
    && within(item.momentum_20d, filters.momentum_20d_min, filters.momentum_20d_max)
    && within(item.relative_volume, filters.relative_volume_min, null)
    && within(item.rsi_14, filters.rsi_min, filters.rsi_max)
    && within(item.change_percent, filters.change_percent_min, filters.change_percent_max)
    && (!filters.sector || item.sector === filters.sector)
    && (!filters.trend || item.trend === filters.trend)
    && (!filters.signal || item.signal === filters.signal)
    && (anomalyTypes.size === 0 || item.anomaly_types.some((type) => anomalyTypes.has(type)))
  ));
  const comparators: Record<TerminalRadarSort, (left: TerminalRadarItem, right: TerminalRadarItem) => number> = {
    score_desc: (left, right) => right.score - left.score,
    score_asc: (left, right) => left.score - right.score,
    volume_desc: (left, right) => right.relative_volume - left.relative_volume,
    momentum_desc: (left, right) => right.momentum_20d - left.momentum_20d,
    change_desc: (left, right) => right.change_percent - left.change_percent,
    change_asc: (left, right) => left.change_percent - right.change_percent,
  };
  return [...filtered].sort((left, right) => comparators[sort](left, right) || left.symbol.localeCompare(right.symbol));
}

export function upsertTerminalPreset(
  presets: readonly TerminalRadarPreset[],
  preset: TerminalRadarPreset,
): TerminalRadarPreset[] {
  const values = new Map(presets.map((item) => [item.id, item]));
  values.set(preset.id, preset);
  return [...values.values()].slice(0, 10);
}

export function deleteTerminalPreset(presets: readonly TerminalRadarPreset[], id: string): TerminalRadarPreset[] {
  return presets.filter((preset) => preset.id !== id);
}
