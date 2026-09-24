export type OptionMarket = "tsx" | "commodities";
export type OptionSide = "call" | "put";

export type OptionSourceStatus = {
  source: string;
  status: "available" | "partial" | "unavailable";
  detail: string | null;
};

export type OptionUniverseItem = {
  symbol: string;
  name: string;
  market: OptionMarket;
  category: string;
  exchange: string;
  provider_symbol: string;
  source_url: string | null;
};

export type OptionUniverseSnapshot = {
  market: OptionMarket | "all";
  items: OptionUniverseItem[];
  source_statuses: OptionSourceStatus[];
  generated_at: string;
  refresh_after_seconds: number;
};

export type OptionContract = {
  symbol: string;
  underlying: string;
  market: OptionMarket;
  contract: string | null;
  side: OptionSide;
  strike: number;
  expiration: string;
  exchange: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  change: number | null;
  percent_change: number | null;
  volume: number | null;
  open_interest: number | null;
  implied_volatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  in_the_money: boolean | null;
  source: string;
  delayed: boolean;
};

export type OptionAnalytics = {
  contract_count: number;
  call_count: number;
  put_count: number;
  call_volume: number;
  put_volume: number;
  call_open_interest: number;
  put_open_interest: number;
  put_call_volume_ratio: number | null;
  put_call_open_interest_ratio: number | null;
  atm_implied_volatility: number | null;
  max_pain_estimate: number | null;
};

export type OptionChainSnapshot = {
  market: OptionMarket;
  symbol: string;
  provider_symbol: string;
  name: string;
  category: string;
  exchange: string;
  underlying_price: number | null;
  requested_expiration: string | null;
  expirations: string[];
  contracts: OptionContract[];
  analytics: OptionAnalytics;
  source_statuses: OptionSourceStatus[];
  generated_at: string;
  refresh_after_seconds: number;
  stale: boolean;
};

async function readApi<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/anatole${path}`, {
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    let detail = `API ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // Keep the status-based fallback.
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export function getOptionsUniverse(
  market: OptionMarket,
  signal?: AbortSignal,
): Promise<OptionUniverseSnapshot> {
  return readApi<OptionUniverseSnapshot>(
    `/api/v1/options/universe?market=${market}`,
    signal,
  );
}

export function getOptionChain(
  market: OptionMarket,
  symbol: string,
  expiration?: string,
  signal?: AbortSignal,
): Promise<OptionChainSnapshot> {
  const query = new URLSearchParams({ market, symbol });
  if (expiration) query.set("expiration", expiration);
  return readApi<OptionChainSnapshot>(
    `/api/v1/options/chain?${query.toString()}`,
    signal,
  );
}