
export type EtfHistoryRange =
  | "5d"
  | "1mo"
  | "ytd"
  | "6mo"
  | "1y"
  | "5y"
  | "10y";

export type EtfHistoryPoint = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type EtfHistorySnapshot = {
  ticker: string;
  normalized_symbol: string;
  range: EtfHistoryRange;
  range_label: string;
  currency: string;
  interval: string;
  points: EtfHistoryPoint[];
  first_close: number | null;
  last_close: number | null;
  change: number | null;
  change_percent: number | null;
  period_high: number | null;
  period_low: number | null;
  status: "available" | "unavailable";
  message: string | null;
  delayed: boolean;
  source_name: string;
  source_url: string | null;
  generated_at: string;
  refresh_after_seconds: number;
};

export type EtfHoldingDriver = {
  rank: number;
  symbol: string;
  display_symbol: string;
  name: string;
  instrument_type: "equity" | "etf" | "other";
  weight_percent: number;
  price: number | null;
  currency: string | null;
  change_percent: number | null;
  contribution_percent_points: number | null;
  source: string;
  delayed: boolean;
};

export type EtfSectorAllocation = {
  key: string;
  label: string;
  weight_percent: number;
};

export type EtfAssetAllocation = {
  key: string;
  label: string;
  weight_percent: number;
};

export type EtfHoldingsSnapshot = {
  ticker: string;
  normalized_symbol: string;
  name: string;
  provider: string;
  category: string;
  exposure: string;
  description: string | null;
  currency: string;
  price: number | null;
  change_percent: number | null;
  holdings: EtfHoldingDriver[];
  sectors: EtfSectorAllocation[];
  asset_classes: EtfAssetAllocation[];
  top_holdings_weight_percent: number;
  net_driver_contribution_percent_points: number | null;
  positive_driver_contribution_percent_points: number | null;
  negative_driver_contribution_percent_points: number | null;
  quoted_holdings: number;
  total_holdings_returned: number;
  status: "available" | "partial" | "unavailable";
  message: string | null;
  source_name: string;
  source_url: string | null;
  generated_at: string;
  refresh_after_seconds: number;
};

function apiBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "https://anatole-api.onrender.com";

  return configured.replace(/\/+$/, "");
}

export async function getEtfHoldings(
  ticker: string,
  signal?: AbortSignal,
): Promise<EtfHoldingsSnapshot> {
  const url = new URL(
    `${apiBaseUrl()}/api/v1/discovery/etfs/${encodeURIComponent(
      ticker,
    )}/holdings`,
  );
  url.searchParams.set("limit", "12");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    let detail = `Erreur API ${response.status}`;

    try {
      const body = (await response.json()) as {
        detail?: string;
      };
      detail = body.detail ?? detail;
    } catch {
      // Keep the status-based message.
    }

    throw new Error(detail);
  }

  return (await response.json()) as EtfHoldingsSnapshot;
}


export async function getEtfHistory(
  ticker: string,
  range: EtfHistoryRange,
  signal?: AbortSignal,
): Promise<EtfHistorySnapshot> {
  const url = new URL(
    `${apiBaseUrl()}/api/v1/discovery/etfs/${encodeURIComponent(
      ticker,
    )}/history`,
  );
  url.searchParams.set("range", range);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    let detail = `Erreur API ${response.status}`;

    try {
      const body = (await response.json()) as {
        detail?: string;
      };
      detail = body.detail ?? detail;
    } catch {
      // Keep the status-based message.
    }

    throw new Error(detail);
  }

  return (await response.json()) as EtfHistorySnapshot;
}
