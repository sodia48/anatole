import { apiRequest } from "./base";

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
  analytics: {
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
  source_statuses: OptionSourceStatus[];
  generated_at: string;
  refresh_after_seconds: number;
  stale: boolean;
};

export const optionsApi = {
  universe: (market: OptionMarket, signal?: AbortSignal) =>
    apiRequest<OptionUniverseSnapshot>(
      `/api/v1/options/universe?market=${market}`,
      { timeoutMs: 15_000, signal },
    ),
  chain: (
    market: OptionMarket,
    symbol: string,
    expiration?: string,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({ market, symbol });
    if (expiration) query.set("expiration", expiration);
    return apiRequest<OptionChainSnapshot>(
      `/api/v1/options/chain?${query.toString()}`,
      { timeoutMs: market === "commodities" ? 20_000 : 15_000, signal },
    );
  },
};