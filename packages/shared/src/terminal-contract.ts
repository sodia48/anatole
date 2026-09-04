import type { TerminalSnapshot } from "./contracts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNumber(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "number" && Number.isFinite(record[key]);
}

export function isTerminalV2Snapshot(value: unknown): value is TerminalSnapshot {
  if (!isRecord(value) || value.schema_version !== 2) return false;
  const quality = value.data_quality;
  const breadth = value.breadth_pro;
  if (!isRecord(quality) || !isRecord(breadth) || !isRecord(breadth.divergence)) return false;
  if (!["expected_symbols", "real_symbols", "history_symbols"].every((key) => hasNumber(quality, key))) return false;
  if (!Array.isArray(quality.warnings)) return false;
  return [
    "components",
    "sectors",
    "opportunities",
    "alerts",
    "leaders",
    "laggards",
    "regime_horizons",
    "regime_history",
    "sector_rotation",
    "market_drivers",
    "anomalies",
    "radar_items",
    "methodology_sections",
  ].every((key) => Array.isArray(value[key]));
}
