import type { OptionContract } from "./options-api";

export type OptionPair = {
  key: string;
  strike: number;
  expiry: string | null;
  contract: string | null;
  call?: OptionContract;
  put?: OptionContract;
};

/** Pair only contracts with an unambiguous common maturity and underlying. */
export function pairOptions(contracts: OptionContract[]): OptionPair[] {
  const buckets = new Map<string, OptionContract[]>();
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
  const result: OptionPair[] = [];
  for (const [key, bucket] of buckets) {
    const calls = bucket.filter((item) => item.side === "call");
    const puts = bucket.filter((item) => item.side === "put");
    if (calls.length <= 1 && puts.length <= 1) {
      const item = bucket[0];
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
