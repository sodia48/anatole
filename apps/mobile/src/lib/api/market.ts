import { apiRequest } from "./base";
import type {
  CalendarSnapshot,
  CockpitSnapshot,
  CompanyNetworkEvidenceResponse,
  CompanyNetworkSnapshot,
  CompanyRelationshipPath,
  EarningsSnapshot,
  EtfDirectorySnapshot,
  EtfHistoryRange,
  EtfHistorySnapshot,
  EtfHoldingsSnapshot,
  FocusSnapshot,
  FundamentalSnapshot,
  InsiderSnapshot,
  IpoSnapshot,
  NewsSnapshot,
  PsychologySnapshot,
  ScreenerSnapshot,
  ScreenerUniverse,
  StockNewsSnapshot,
  WatchlistSnapshot,
} from "./types";

export const marketApi = {
  cockpit: (universe: "tsx60" | "composite" = "tsx60", signal?: AbortSignal) => apiRequest<CockpitSnapshot>(`/api/v1/market/cockpit?universe=${universe}`, { timeoutMs: universe === "composite" ? 12_000 : 8_000, signal }),
  screener: (universe: ScreenerUniverse = "composite", signal?: AbortSignal) => apiRequest<ScreenerSnapshot>(`/api/v1/discovery/screener?universe=${universe}`, { timeoutMs: universe === "composite" ? 15_000 : 10_000, signal }),
  terminal: (signal?: AbortSignal) => apiRequest<unknown>("/api/v1/analysis/terminal", { timeoutMs: 15_000, signal }),
  psychology: (signal?: AbortSignal) => apiRequest<PsychologySnapshot>("/api/v1/discovery/psychology", { timeoutMs: 10_000, signal }),
  focus: (ticker: string, range = "1y", interval = "1d", signal?: AbortSignal) => apiRequest<FocusSnapshot>(`/api/v1/stocks/${encodeURIComponent(ticker)}/focus?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`, { timeoutMs: 12_000, signal }),
  fundamentals: (ticker: string, signal?: AbortSignal) => apiRequest<FundamentalSnapshot>(`/api/v1/stocks/${encodeURIComponent(ticker)}/fundamentals`, { timeoutMs: 18_000, signal }),
  companyNetwork: (ticker: string, depth: 1 | 2 = 1, signal?: AbortSignal) => apiRequest<CompanyNetworkSnapshot>(`/api/v1/discovery/company-network/${encodeURIComponent(ticker)}?depth=${depth}`, { timeoutMs: 25_000, signal }),
  companyNetworkEvidence: (ticker: string, signal?: AbortSignal) => apiRequest<CompanyNetworkEvidenceResponse>(`/api/v1/discovery/company-network/${encodeURIComponent(ticker)}/evidence`, { timeoutMs: 20_000, signal }),
  companyNetworkPath: (from: string, to: string, signal?: AbortSignal) => apiRequest<CompanyRelationshipPath>(`/api/v1/discovery/company-network/path?from_ticker=${encodeURIComponent(from)}&to_ticker=${encodeURIComponent(to)}&max_depth=3`, { timeoutMs: 25_000, signal }),
  watchlist: (tickers: string[], signal?: AbortSignal) => apiRequest<WatchlistSnapshot>("/api/v1/market/watchlist", { method: "POST", body: JSON.stringify({ tickers }), timeoutMs: 10_000, signal }),
  news: (language: "fr" | "en", signal?: AbortSignal) => apiRequest<NewsSnapshot>(`/api/v1/discovery/news?lang=${language}`, { timeoutMs: 10_000, signal }),
  stockNews: (ticker: string, company: string, language: "fr" | "en", signal?: AbortSignal) => apiRequest<StockNewsSnapshot>(`/api/v1/stocks/${encodeURIComponent(ticker)}/news?company=${encodeURIComponent(company)}&lang=${language}`, { timeoutMs: 12_000, signal }),
  earnings: (signal?: AbortSignal) => apiRequest<EarningsSnapshot>("/api/v1/discovery/earnings-calendar?universe=composite", { timeoutMs: 12_000, signal }),
  calendar: (language: "fr" | "en", signal?: AbortSignal) => apiRequest<CalendarSnapshot>(`/api/v1/discovery/calendar?lang=${language}`, { timeoutMs: 12_000, signal }),
  etfDirectory: (signal?: AbortSignal) => apiRequest<EtfDirectorySnapshot>("/api/v1/discovery/etfs", { timeoutMs: 12_000, signal }),
  etfHoldings: (ticker: string, limit = 25, signal?: AbortSignal) => apiRequest<EtfHoldingsSnapshot>(`/api/v1/discovery/etfs/${encodeURIComponent(ticker)}/holdings?limit=${limit}`, { timeoutMs: 18_000, signal }),
  etfHistory: (ticker: string, range: EtfHistoryRange, signal?: AbortSignal) => apiRequest<EtfHistorySnapshot>(`/api/v1/discovery/etfs/${encodeURIComponent(ticker)}/history?range=${encodeURIComponent(range)}`, { timeoutMs: 18_000, signal }),
  ipo: (signal?: AbortSignal, refresh = false) => apiRequest<IpoSnapshot>(`/api/v1/discovery/ipo?country=all&instrument=all&limit=220${refresh ? "&refresh=true" : ""}`, { timeoutMs: 20_000, signal }),
  insiders: ({ market, ticker, days, scanLimit, refresh = false }: { market: "canada" | "us"; ticker?: string; days: number; scanLimit: number; refresh?: boolean }, signal?: AbortSignal) => {
    const query = new URLSearchParams({ market, days: String(days), scan_limit: String(scanLimit), limit: "220" });
    if (ticker?.trim()) query.set("ticker", ticker.trim().toUpperCase());
    if (refresh) query.set("refresh", "true");
    return apiRequest<InsiderSnapshot>(`/api/v1/discovery/insiders?${query.toString()}`, { timeoutMs: scanLimit <= 10 ? 12_000 : 30_000, signal });
  },
};
