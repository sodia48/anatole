import type { ComparisonSnapshot } from "@/src/lib/api/types";
import { normalizeTicker } from "@/src/lib/ticker";

export function normalizeComparisonSymbols(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.map(normalizeTicker).filter((symbol) => symbol && !seen.has(symbol) && Boolean(seen.add(symbol))).slice(0, 5);
}
export function comparisonDatesAreAligned(snapshot: ComparisonSnapshot): boolean {
  if (!snapshot.series.length) return true;
  const reference = snapshot.series[0]?.points.map((item) => item.time).join(",") ?? "";
  return snapshot.series.every((series) => series.points.map((item) => item.time).join(",") === reference);
}
export function comparisonValue(value: number | null | undefined, suffix = ""): string { return value == null || !Number.isFinite(value) ? "N/D" : `${value.toFixed(2)}${suffix}`; }
