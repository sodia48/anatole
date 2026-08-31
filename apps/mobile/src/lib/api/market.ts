import { apiRequest } from "./base";
import type {
  CalendarSnapshot,
  CockpitSnapshot,
  CompanyNetworkEvidenceResponse,
  CompanyNetworkSnapshot,
  CompanyRelationshipPath,
  EarningsSnapshot,
  FocusSnapshot,
  FundamentalSnapshot,
  NewsSnapshot,
  StockNewsSnapshot,
  WatchlistSnapshot,
} from "./types";

export const marketApi = {
  cockpit: (universe: "tsx60" | "composite" = "tsx60") => apiRequest<CockpitSnapshot>(`/api/v1/market/cockpit?universe=${universe}`, { timeoutMs: universe === "composite" ? 95_000 : 35_000 }),
  focus: (ticker: string, range = "1y", interval = "1d", signal?: AbortSignal) => apiRequest<FocusSnapshot>(`/api/v1/stocks/${encodeURIComponent(ticker)}/focus?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`, { timeoutMs: 45_000, signal }),
  fundamentals: (ticker: string, signal?: AbortSignal) => apiRequest<FundamentalSnapshot>(`/api/v1/stocks/${encodeURIComponent(ticker)}/fundamentals`, { timeoutMs: 75_000, signal }),
  companyNetwork: (ticker: string, depth: 1 | 2 = 1, signal?: AbortSignal) => apiRequest<CompanyNetworkSnapshot>(`/api/v1/discovery/company-network/${encodeURIComponent(ticker)}?depth=${depth}`, { timeoutMs: 90_000, signal }),
  companyNetworkEvidence: (ticker: string, signal?: AbortSignal) => apiRequest<CompanyNetworkEvidenceResponse>(`/api/v1/discovery/company-network/${encodeURIComponent(ticker)}/evidence`, { timeoutMs: 75_000, signal }),
  companyNetworkPath: (from: string, to: string, signal?: AbortSignal) => apiRequest<CompanyRelationshipPath>(`/api/v1/discovery/company-network/path?from_ticker=${encodeURIComponent(from)}&to_ticker=${encodeURIComponent(to)}&max_depth=3`, { timeoutMs: 90_000, signal }),
  watchlist: (tickers: string[]) => apiRequest<WatchlistSnapshot>("/api/v1/market/watchlist", { method: "POST", body: JSON.stringify({ tickers }), timeoutMs: 35_000 }),
  news: (language: "fr" | "en") => apiRequest<NewsSnapshot>(`/api/v1/discovery/news?lang=${language}`, { timeoutMs: 35_000 }),
  stockNews: (ticker: string, company: string, language: "fr" | "en") => apiRequest<StockNewsSnapshot>(`/api/v1/stocks/${encodeURIComponent(ticker)}/news?company=${encodeURIComponent(company)}&lang=${language}`, { timeoutMs: 35_000 }),
  earnings: () => apiRequest<EarningsSnapshot>("/api/v1/discovery/earnings-calendar?universe=composite", { timeoutMs: 40_000 }),
  calendar: (language: "fr" | "en") => apiRequest<CalendarSnapshot>(`/api/v1/discovery/calendar?lang=${language}`, { timeoutMs: 40_000 }),
};
