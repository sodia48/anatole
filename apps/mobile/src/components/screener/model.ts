import type { ScreenerRow } from "@/src/lib/api/types";

export type ScreenerSort = "score" | "change" | "momentum" | "volume";
export type ScreenerFilters = {
  query: string;
  sector: string;
  signal: string;
  minimumScore: number;
  sort: ScreenerSort;
};

export const DEFAULT_SCREENER_FILTERS: ScreenerFilters = {
  query: "",
  sector: "all",
  signal: "all",
  minimumScore: 0,
  sort: "score",
};

export function uniqueScreenerRows(rows: readonly ScreenerRow[]): ScreenerRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.ticker.trim().toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function filterAndSortScreenerRows(rows: readonly ScreenerRow[], filters: ScreenerFilters): ScreenerRow[] {
  const query = filters.query.trim().toLowerCase();
  const filtered = uniqueScreenerRows(rows).filter((row) => {
    const matchesQuery = !query || `${row.ticker} ${row.symbol} ${row.name}`.toLowerCase().includes(query);
    return matchesQuery
      && (filters.sector === "all" || row.sector === filters.sector)
      && (filters.signal === "all" || row.signal === filters.signal)
      && row.score >= filters.minimumScore;
  });
  return filtered.sort((left, right) => {
    let difference = right.score - left.score;
    if (filters.sort === "change") difference = right.change_percent - left.change_percent;
    if (filters.sort === "momentum") difference = right.momentum_20d - left.momentum_20d;
    if (filters.sort === "volume") difference = right.relative_volume - left.relative_volume;
    return difference || left.ticker.localeCompare(right.ticker, "en", { sensitivity: "base" });
  });
}

export function screenerSignalLabel(value: string, language: "fr" | "en"): string {
  if (language === "fr") return value;
  return ({ Constructif: "Constructive", Fragile: "Fragile", "Momentum fort": "Strong momentum", Neutre: "Neutral" } as Record<string, string>)[value] ?? value;
}
