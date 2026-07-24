export type IpoInstrumentType =
  | "company"
  | "etf"
  | "cdr"
  | "fund"
  | "other";

export type IpoItem = {
  id: string;
  event_date: string | null;
  company: string;
  symbol: string;
  symbols: string[];
  exchange: string;
  country: "Canada" | "États-Unis";
  event_type: string;
  status:
    | "Cotée"
    | "Dossier déposé"
    | "À venir"
    | "Reportée"
    | "Retirée"
    | "À confirmer";
  instrument_type: IpoInstrumentType;
  instrument_label: string;
  source_name: string;
  source_url: string;
  official: boolean;
  confidence_score: number;
  focus_available: boolean;
  offer_price: number | null;
  offer_price_low: number | null;
  offer_price_high: number | null;
  offer_currency: string;
  offer_price_status:
    | "final"
    | "range"
    | "reference"
    | "not_published";
  offer_price_label: string;
  price_source_url: string | null;
};

export type IpoSnapshot = {
  items: IpoItem[];
  summary: {
    total: number;
    canada: number;
    united_states: number;
    companies: number;
    newly_listed: number;
    regulatory_filings: number;
  };
  sources: Array<{
    source: string;
    status: "available" | "partial" | "unavailable";
    count: number;
    detail: string | null;
    url: string;
  }>;
  generated_at: string;
  refresh_after_seconds: number;
  message: string | null;
};

export type InsiderTransactionType =
  | "buy"
  | "sell"
  | "grant"
  | "exercise"
  | "tax"
  | "other";

export type InsiderTrade = {
  id: string;
  ticker: string;
  company: string;
  market: "Canada" | "États-Unis";
  insider_name: string;
  role: string;
  transaction_type: InsiderTransactionType;
  transaction_label: string;
  transaction_code: string;
  trade_date: string | null;
  filing_date: string | null;
  shares: number | null;
  price: number | null;
  value: number | null;
  holdings_after: number | null;
  ownership: string;
  unusual: boolean;
  source_name: string;
  source_url: string;
  official_verification_url: string;
  official_source: boolean;
};

export type InsiderSnapshot = {
  trades: InsiderTrade[];
  summary: {
    transactions: number;
    companies: number;
    buys: number;
    sells: number;
    grants_and_exercises: number;
    buy_value: number;
    sell_value: number;
    net_value: number;
    buy_ratio_percent: number;
    unusual_transactions: number;
  };
  sources: Array<{
    source: string;
    status: "available" | "partial" | "unavailable";
    count: number;
    detail: string | null;
    url: string;
  }>;
  market: "Canada" | "États-Unis";
  requested_ticker: string | null;
  scanned_symbols: number;
  generated_at: string;
  refresh_after_seconds: number;
  message: string | null;
};

function apiBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "https://anatole-api.onrender.com";

  return configured.replace(/\/+$/, "");
}

async function apiGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(
    `${apiBaseUrl()}${path}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    let detail = `Erreur API ${response.status}`;

    try {
      const body = (await response.json()) as {
        detail?: string;
      };
      detail = body.detail ?? detail;
    } catch {
      // Conserver le message basé sur le statut.
    }

    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export function getIpoSnapshot(
  signal?: AbortSignal,
): Promise<IpoSnapshot> {
  return apiGet<IpoSnapshot>(
    "/api/v1/discovery/ipo?country=all&instrument=all&limit=220",
    signal,
  );
}

export function getInsiderSnapshot(
  options: {
    market: "canada" | "us";
    ticker?: string;
    days: number;
    scanLimit?: number;
  },
  signal?: AbortSignal,
): Promise<InsiderSnapshot> {
  const query = new URLSearchParams({
    market: options.market,
    days: String(options.days),
    scan_limit: String(options.scanLimit ?? 16),
    limit: "220",
  });

  if (options.ticker?.trim()) {
    query.set(
      "ticker",
      options.ticker.trim().toUpperCase(),
    );
  }

  return apiGet<InsiderSnapshot>(
    `/api/v1/discovery/insiders?${query.toString()}`,
    signal,
  );
}
