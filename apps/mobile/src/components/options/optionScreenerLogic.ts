import type { OptionContract, OptionSide } from "@/src/lib/api/options";

export type ScreenerSort = "expiration" | "volume" | "open_interest";

export type ScreenerCriteria = {
  query: string;
  side: "both" | OptionSide;
  expiration: string;
  minVolume: number | null;
  minOpenInterest: number | null;
  sort: ScreenerSort;
};

function reported(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value >= 0 ? value : null;
}

export function screenLoadedContracts(contracts: OptionContract[], criteria: ScreenerCriteria): OptionContract[] {
  const query = criteria.query.trim().toUpperCase();
  const matches = contracts.filter((item) => {
    if (criteria.side !== "both" && item.side !== criteria.side) return false;
    if (criteria.expiration && item.expiration !== criteria.expiration) return false;
    if (query && ![item.symbol, item.underlying, item.contract ?? "", String(item.strike)]
      .some((field) => field.toUpperCase().includes(query))) return false;
    const volume = reported(item.volume);
    const interest = reported(item.open_interest);
    if (criteria.minVolume != null && (volume == null || volume < criteria.minVolume)) return false;
    if (criteria.minOpenInterest != null && (interest == null || interest < criteria.minOpenInterest)) return false;
    return true;
  });

  return matches.sort((a, b) => {
    if (criteria.sort !== "expiration") {
      const left = reported(a[criteria.sort]);
      const right = reported(b[criteria.sort]);
      if (left == null && right != null) return 1;
      if (right == null && left != null) return -1;
      if (left != null && right != null && left !== right) return right - left;
    }
    return (a.expiration ?? "9999").localeCompare(b.expiration ?? "9999") ||
      a.strike - b.strike || a.side.localeCompare(b.side) || a.symbol.localeCompare(b.symbol);
  });
}

export function heatmapScale(items: OptionContract[], field: "volume" | "open_interest"): number {
  return items.reduce((highest, item) => Math.max(highest, reported(item[field]) ?? 0), 0);
}
