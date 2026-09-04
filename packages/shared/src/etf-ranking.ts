export type RepresentativeEtfInput = {
  ticker: string;
  category?: string | null;
  price?: number | null;
  volume?: number | null;
  /** Only populate from a real, already-fetched and sourced fund-assets field. */
  aum?: number | null;
  source?: string | null;
};

type LiquidityRank = { tier: 0 | 1 | 2; value: number };

function realPositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function liquidityRank(item: RepresentativeEtfInput): LiquidityRank {
  if (item.source?.trim().toLowerCase() === "unavailable") return { tier: 0, value: 0 };
  if (realPositive(item.price) && realPositive(item.volume)) return { tier: 2, value: item.price * item.volume };
  if (realPositive(item.volume)) return { tier: 1, value: item.volume };
  return { tier: 0, value: 0 };
}

function compareLiquidity(left: RepresentativeEtfInput, right: RepresentativeEtfInput): number {
  const a = liquidityRank(left);
  const b = liquidityRank(right);
  return b.tier - a.tier || b.value - a.value || left.ticker.localeCompare(right.ticker, "en", { sensitivity: "base" });
}

function compareAum(left: RepresentativeEtfInput, right: RepresentativeEtfInput): number {
  const a = realPositive(left.aum) ? left.aum : -1;
  const b = realPositive(right.aum) ? right.aum : -1;
  return b - a || compareLiquidity(left, right);
}

function dedupeByTicker<T extends RepresentativeEtfInput>(items: readonly T[]): T[] {
  const unique = new Map<string, T>();
  for (const item of items) {
    const key = item.ticker.trim().toUpperCase();
    if (!key) continue;
    const current = unique.get(key);
    if (!current || compareLiquidity(item, current) < 0) unique.set(key, item);
  }
  return [...unique.values()];
}

/**
 * Selects at most ten representative funds per published category.
 *
 * The current ETF directory has no reliable fund-assets field, so selection
 * uses price × volume, then real volume when price is absent. Missing market
 * data sorts last. If a future already-fetched payload provides real AUM,
 * the policy automatically becomes Top 5 AUM ∪ Top 5 liquidity, without any
 * per-fund request fan-out.
 */
export function selectRepresentativeEtfsBySector<T extends RepresentativeEtfInput>(
  items: readonly T[],
  limit = 10,
): Map<string, T[]> {
  const sectors = new Map<string, T[]>();
  for (const item of items) {
    const sector = item.category?.trim() || "N/D";
    sectors.set(sector, [...(sectors.get(sector) ?? []), item]);
  }

  const selected = new Map<string, T[]>();
  for (const [sector, candidates] of sectors) {
    const unique = dedupeByTicker(candidates);
    const hasRealAum = unique.some((item) => realPositive(item.aum));
    if (!hasRealAum) {
      selected.set(sector, [...unique].sort(compareLiquidity).slice(0, Math.max(0, limit)));
      continue;
    }

    const aumLeaders = unique.filter((item) => realPositive(item.aum)).sort(compareAum).slice(0, 5);
    const liquidityLeaders = [...unique].sort(compareLiquidity).slice(0, 5);
    selected.set(sector, dedupeByTicker([...aumLeaders, ...liquidityLeaders]).slice(0, Math.max(0, limit)));
  }
  return selected;
}
