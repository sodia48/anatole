export type OptionIdentity = {
  symbol: string;
  underlying: string;
  market: "tsx" | "commodities";
  contract: string | null;
  side: "call" | "put";
  strike: number;
  expiration: string | null;
};

export type OptionPair<T extends OptionIdentity> = {
  key: string;
  strike: number;
  expiry: string | null;
  contract: string | null;
  call?: T;
  put?: T;
};

/** Pair only contracts with an unambiguous common maturity and underlying. */
export function pairOptions<T extends OptionIdentity>(contracts: T[]): OptionPair<T>[] {
  const buckets = new Map<string, T[]>();
  for (const option of contracts) {
    const comparable = option.expiration != null &&
      (option.market !== "commodities" || Boolean(option.contract));
    const identity = comparable
      ? JSON.stringify([option.market, option.underlying, option.contract, option.expiration, option.strike])
      : JSON.stringify(["unmatched", option.symbol, option.side]);
    const bucket = buckets.get(identity) ?? [];
    bucket.push(option);
    buckets.set(identity, bucket);
  }
  const result: OptionPair<T>[] = [];
  for (const [key, bucket] of buckets) {
    const calls = bucket.filter((item) => item.side === "call");
    const puts = bucket.filter((item) => item.side === "put");
    if (calls.length <= 1 && puts.length <= 1) {
      const item = bucket[0];
      if (!item) continue;
      result.push({ key, strike: item.strike, expiry: item.expiration, contract: item.contract, call: calls[0], put: puts[0] });
    } else {
      // Multiple distinct series cannot safely be paired from strike alone.
      for (const [index, item] of bucket.entries()) {
        result.push({ key: `${key}:${index}`, strike: item.strike, expiry: item.expiration,
          contract: item.contract, [item.side]: item });
      }
    }
  }
  return result.sort((a, b) => (a.expiry ?? "").localeCompare(b.expiry ?? "") ||
    (a.contract ?? "").localeCompare(b.contract ?? "") || a.strike - b.strike);
}

export type VolatilityOption = OptionIdentity & {
  implied_volatility: number | null;
  delta: number | null;
};

export type VolatilitySeries<T extends VolatilityOption> = {
  key: string;
  expiry: string;
  contract: string | null;
  points: T[];
  atm: T[];
  skew: { put: T; call: T; difference: number } | null;
};

/** Describe only identifiable series already present in the snapshot.
 * Never interpret a missing value as zero or join different futures months.
 * The 25-delta comparison uses the nearest points only within a 0.10 tolerance.
 */
export function volatilitySeries<T extends VolatilityOption>(contracts: T[], underlying: number | null): VolatilitySeries<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of contracts) {
    if (!item.expiration || !/^\d{4}-\d{2}-\d{2}$/.test(item.expiration) ||
      Number.isNaN(Date.parse(item.expiration)) || new Date(item.expiration).toISOString().slice(0, 10) !== item.expiration ||
      (item.market === "commodities" && !item.contract) || !Number.isFinite(item.strike) ||
      item.implied_volatility == null || !Number.isFinite(item.implied_volatility) || item.implied_volatility <= 0) continue;
    const key = JSON.stringify([item.market, item.underlying, item.contract, item.expiration]);
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  }
  const series: VolatilitySeries<T>[] = [];
  for (const [key, bucket] of buckets) {
    const counts = new Map<string, number>();
    for (const item of bucket) {
      const identity = JSON.stringify([item.side, item.strike]);
      counts.set(identity, (counts.get(identity) ?? 0) + 1);
    }
    // Distinct contracts with the same apparent identity may have different deliverables.
    const points = bucket.filter((item) => counts.get(JSON.stringify([item.side, item.strike])) === 1)
      .sort((a, b) => a.strike - b.strike || a.side.localeCompare(b.side));
    const firstPoint = points[0];
    if (!firstPoint) continue;
    const atm: T[] = [];
    // A root-level commodity price is not necessarily the price of this futures month.
    if (firstPoint.market === "tsx" && underlying != null && Number.isFinite(underlying) && underlying > 0) {
      for (const side of ["call", "put"] as const) {
        const candidates = points.filter((point) => point.side === side);
        if (candidates.length) {
          const distance = candidates.reduce((best, point) => Math.min(best, Math.abs(point.strike - underlying)), Infinity);
          atm.push(...candidates.filter((point) => Math.abs(point.strike - underlying) === distance));
        }
      }
    }
    const nearestDelta = (side: "call" | "put") => {
      const target = side === "call" ? 0.25 : -0.25;
      const candidates = points.filter((point) => point.side === side && point.delta != null &&
        Number.isFinite(point.delta) && Math.abs(point.delta - target) <= 0.1)
        .sort((a, b) => Math.abs(a.delta! - target) - Math.abs(b.delta! - target));
      // A tie is ambiguous, so do not choose one arbitrarily.
      const first = candidates[0];
      const second = candidates[1];
      return first && (!second ||
        Math.abs(Math.abs(first.delta! - target) - Math.abs(second.delta! - target)) > 1e-9) ? first : null;
    };
    const put = nearestDelta("put");
    const call = nearestDelta("call");
    series.push({ key, expiry: firstPoint.expiration!, contract: firstPoint.contract, points, atm,
      skew: put && call ? { put, call, difference: put.implied_volatility! - call.implied_volatility! } : null });
  }
  return series.sort((a, b) => a.expiry.localeCompare(b.expiry) || (a.contract ?? "").localeCompare(b.contract ?? ""));
}
