import type {
  CalendarSnapshot,
  EarningsCalendarSnapshot,
  ComparisonRange,
  ComparisonSnapshot,
  CockpitSnapshot,
  EtfDirectorySnapshot,
  InstitutionDetail,
  InstitutionFlow,
  InstitutionsSnapshot,
  FocusSnapshot,
  FocusFundamentalOverlaySnapshot,
  HealthStatus,
  NewsSnapshot,
  PsychologySnapshot,
  ReliabilitySnapshot,
  ScreenerSnapshot,
  SymbolSearchResponse,
  StockHistoryResponse,
  TerminalSnapshot,
  WatchlistSnapshot,
  AlertRule,
  AdvisorPlan,
  AdvisorProfile,
  AlertSnapshot,
  AssistantResponse,
  DataQualitySnapshot,
  PortfolioPositionInput,
  PortfolioSnapshot,
  AnatoleScriptValidation,
  BacktestRequest,
  BacktestResult,
  CompanyNetworkEvidenceResponse,
  CompanyNetworkSnapshot,
  CompanyRelationshipPath,
} from "./types";
import { resilientFetch } from "./resilient-fetch";

const DEFAULT_API_URL = "https://anatole-api.onrender.com";

function apiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "/api/anatole";
  }

  return (
    process.env.ANATOLE_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    DEFAULT_API_URL
  ).replace(/\/+$/, "");
}

async function apiError(response: Response): Promise<Error> {
  let detail = `Erreur API ${response.status}`;

  try {
    const payload = (await response.json()) as {
      detail?: unknown;
      message?: unknown;
    };
    const candidate = payload.detail ?? payload.message;
    if (typeof candidate === "string" && candidate.trim()) {
      detail = candidate.trim();
    }
  } catch {
    // Une réponse proxy peut être du texte ou du HTML.
  }

  const requestId = response.headers.get("X-Request-ID");
  const error = new Error(
    requestId ? `${detail} · Référence ${requestId}` : detail,
  ) as Error & { requestId?: string };
  if (requestId) error.requestId = requestId;
  return error;
}

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
  timeoutMs = 20_000,
): Promise<T> {
  const response = await resilientFetch(`${apiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal,
    retries: 2,
    timeoutMs,
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  return (await response.json()) as T;
}

export function getHealthStatus(
  signal?: AbortSignal,
): Promise<HealthStatus> {
  return apiRequest<HealthStatus>("/health", {}, signal, 10_000);
}

export type CockpitUniverse = "tsx60" | "composite";

export function getCockpitSnapshot(
  universe: CockpitUniverse = "tsx60",
  signal?: AbortSignal,
): Promise<CockpitSnapshot> {
  const timeoutMs = universe === "composite" ? 95_000 : 30_000;

  return apiRequest<CockpitSnapshot>(
    `/api/v1/market/cockpit?universe=${encodeURIComponent(universe)}`,
    {},
    signal,
    timeoutMs,
  );
}

export function getWatchlistSnapshot(
  tickers: string[],
  signal?: AbortSignal,
): Promise<WatchlistSnapshot> {
  return apiRequest<WatchlistSnapshot>(
    "/api/v1/market/watchlist",
    {
      method: "POST",
      body: JSON.stringify({ tickers }),
    },
    signal,
    30_000,
  );
}

export function getFocusSnapshot(
  ticker: string,
  signal?: AbortSignal,
): Promise<FocusSnapshot> {
  return apiRequest<FocusSnapshot>(
    `/api/v1/stocks/${encodeURIComponent(
      ticker,
    )}/focus?range=1y&interval=1d`,
    {},
    signal,
    30_000,
  );
}

export type ScreenerUniverse =
  | "composite"
  | "tsx60";

export function getScreenerSnapshot(
  universe: ScreenerUniverse =
    "composite",
  signal?: AbortSignal,
): Promise<ScreenerSnapshot> {
  return apiRequest<ScreenerSnapshot>(
    `/api/v1/discovery/screener?universe=${universe}`,
    {},
    signal,
    universe === "composite"
      ? 120_000
      : 45_000,
  );
}

export type NewsLanguage =
  | "fr"
  | "en";

export function getNewsSnapshot(
  language: NewsLanguage = "fr",
  signal?: AbortSignal,
): Promise<NewsSnapshot> {
  return apiRequest<NewsSnapshot>(
    `/api/v1/discovery/news?lang=${language}`,
    {},
    signal,
    30_000,
  );
}

export type CalendarLanguage =
  | "fr"
  | "en";

export function getCalendarSnapshot(
  language: CalendarLanguage = "fr",
  signal?: AbortSignal,
): Promise<CalendarSnapshot> {
  return apiRequest<CalendarSnapshot>(
    `/api/v1/discovery/calendar?lang=${language}`,
    {},
    signal,
    35_000,
  );
}

export function getEarningsCalendarSnapshot(
  universe: "composite" | "tsx60" = "composite",
  signal?: AbortSignal,
): Promise<EarningsCalendarSnapshot> {
  return apiRequest<EarningsCalendarSnapshot>(
    `/api/v1/discovery/earnings-calendar?universe=${universe}`,
    {},
    signal,
    35_000,
  );
}

export function getPsychologySnapshot(
  signal?: AbortSignal,
): Promise<PsychologySnapshot> {
  return apiRequest<PsychologySnapshot>(
    "/api/v1/discovery/psychology",
    {},
    signal,
    45_000,
  );
}

export function getEtfDirectory(
  signal?: AbortSignal,
): Promise<EtfDirectorySnapshot> {
  return apiRequest<EtfDirectorySnapshot>(
    "/api/v1/discovery/etfs",
    {},
    signal,
    35_000,
  );
}

export function getFocusSnapshotForRange(
  ticker: string,
  range: string,
  interval: string,
  signal?: AbortSignal,
): Promise<FocusSnapshot> {
  const params = new URLSearchParams({ range, interval });
  return apiRequest<FocusSnapshot>(
    `/api/v1/stocks/${encodeURIComponent(ticker)}/focus?${params.toString()}`,
    {},
    signal,
    45_000,
  );
}

export function getCompanyNetwork(
  ticker: string,
  depth: 1 | 2 = 1,
  includeSecondary = true,
  signal?: AbortSignal,
  refresh = false,
): Promise<CompanyNetworkSnapshot> {
  const params = new URLSearchParams({
    depth: String(depth),
    include_secondary: String(includeSecondary),
    refresh: String(refresh),
  });
  return apiRequest<CompanyNetworkSnapshot>(
    `/api/v1/discovery/company-network/${encodeURIComponent(ticker)}?${params.toString()}`,
    {},
    signal,
    60_000,
  );
}

export function getCompanyNetworkEvidence(
  ticker: string,
  includeSecondary = true,
  signal?: AbortSignal,
): Promise<CompanyNetworkEvidenceResponse> {
  const params = new URLSearchParams({ include_secondary: String(includeSecondary) });
  return apiRequest<CompanyNetworkEvidenceResponse>(
    `/api/v1/discovery/company-network/${encodeURIComponent(ticker)}/evidence?${params.toString()}`,
    {},
    signal,
    45_000,
  );
}

export function findCompanyRelationshipPath(
  fromTicker: string,
  toTicker: string,
  includeSecondary = true,
  signal?: AbortSignal,
): Promise<CompanyRelationshipPath> {
  const params = new URLSearchParams({
    from_ticker: fromTicker,
    to_ticker: toTicker,
    max_depth: "3",
    include_secondary: String(includeSecondary),
  });
  return apiRequest<CompanyRelationshipPath>(
    `/api/v1/discovery/company-network/path?${params.toString()}`,
    {},
    signal,
    60_000,
  );
}

export function getStockHistory(
  ticker: string,
  range: string,
  interval: string,
  signal?: AbortSignal,
): Promise<StockHistoryResponse> {
  const params = new URLSearchParams({ range, interval });
  return apiRequest<StockHistoryResponse>(
    `/api/v1/stocks/${encodeURIComponent(ticker)}/history?${params.toString()}`,
    {},
    signal,
    45_000,
  );
}

export function getFocusFundamentalOverlay(
  ticker: string,
  signal?: AbortSignal,
): Promise<FocusFundamentalOverlaySnapshot> {
  return apiRequest<FocusFundamentalOverlaySnapshot>(
    `/api/v1/stocks/${encodeURIComponent(ticker)}/fundamentals`,
    {},
    signal,
    45_000,
  );
}

export function runFocusBacktest(
  request: BacktestRequest,
  signal?: AbortSignal,
): Promise<BacktestResult> {
  return apiRequest<BacktestResult>(
    "/api/v1/backtest",
    { method: "POST", body: JSON.stringify(request) },
    signal,
    90_000,
  );
}

export function validateAnatoleScript(
  source: string,
  signal?: AbortSignal,
): Promise<AnatoleScriptValidation> {
  return apiRequest<AnatoleScriptValidation>(
    "/api/v1/backtest/script/validate",
    { method: "POST", body: JSON.stringify({ source }) },
    signal,
    20_000,
  );
}

export function getInstitutionsSnapshot(
  limit = 50,
  refresh = false,
  signal?: AbortSignal,
): Promise<InstitutionsSnapshot> {
  const params = new URLSearchParams({
    limit: String(limit),
    refresh: String(refresh),
  });

  return apiRequest<InstitutionsSnapshot>(
    `/api/v1/discovery/institutions?${params.toString()}`,
    {},
    signal,
    60_000,
  );
}

export function getInstitutionDetail(
  cik: string,
  refresh = false,
  signal?: AbortSignal,
): Promise<InstitutionDetail> {
  const params = new URLSearchParams({
    refresh: String(refresh),
  });

  return apiRequest<InstitutionDetail>(
    `/api/v1/discovery/institutions/${encodeURIComponent(cik)}?${params.toString()}`,
    {},
    signal,
    90_000,
  );
}

export function getInstitutionSecurityActivity(
  query: string,
  signal?: AbortSignal,
): Promise<InstitutionFlow> {
  const params = new URLSearchParams({ q: query.trim() });

  return apiRequest<InstitutionFlow>(
    `/api/v1/discovery/institutions/security/activity?${params.toString()}`,
    {},
    signal,
    120_000,
  );
}

export function searchSymbols(
  query: string,
  signal?: AbortSignal,
): Promise<SymbolSearchResponse> {
  const params = new URLSearchParams({
    q: query.trim(),
    limit: "12",
  });

  return apiRequest<SymbolSearchResponse>(
    `/api/v1/search/symbols?${params.toString()}`,
    {},
    signal,
    15_000,
  );
}

export function quoteWebSocketUrl(ticker: string): string {
  const configured =
    process.env.NEXT_PUBLIC_WS_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    DEFAULT_API_URL;
  const base = configured
    .replace(/\/+$/, "")
    .replace(/^https:/, "wss:")
    .replace(/^http:/, "ws:");

  return `${base}/ws/v1/quotes/${encodeURIComponent(ticker)}`;
}


export function compareInstruments(
  symbols: string[],
  range: ComparisonRange,
  signal?: AbortSignal,
): Promise<ComparisonSnapshot> {
  return apiRequest<ComparisonSnapshot>(
    "/api/v1/analysis/compare",
    {
      method: "POST",
      body: JSON.stringify({ symbols, range }),
    },
    signal,
    60_000,
  );
}

export function getTerminalSnapshot(
  signal?: AbortSignal,
): Promise<TerminalSnapshot> {
  return apiRequest<TerminalSnapshot>(
    "/api/v1/analysis/terminal",
    {},
    signal,
    60_000,
  );
}


export function analyzePortfolio(
  positions: PortfolioPositionInput[],
  signal?: AbortSignal,
): Promise<PortfolioSnapshot> {
  return apiRequest<PortfolioSnapshot>(
    "/api/v1/workspace/portfolio",
    { method: "POST", body: JSON.stringify({ positions, base_currency: "CAD" }) },
    signal,
    60_000,
  );
}

export function evaluateAlerts(
  rules: AlertRule[],
  signal?: AbortSignal,
): Promise<AlertSnapshot> {
  return apiRequest<AlertSnapshot>(
    "/api/v1/workspace/alerts/evaluate",
    { method: "POST", body: JSON.stringify({ rules }) },
    signal,
    45_000,
  );
}

export function getAdvisorPlan(
  profile: AdvisorProfile,
  portfolioPositions: PortfolioPositionInput[] = [],
  signal?: AbortSignal,
): Promise<AdvisorPlan> {
  return apiRequest<AdvisorPlan>(
    "/api/v1/workspace/advisor-plan",
    {
      method: "POST",
      body: JSON.stringify({
        profile,
        portfolio_positions: portfolioPositions,
      }),
    },
    signal,
    60_000,
  );
}

export function askAnatole(
  message: string,
  options: {
    contextSymbol?: string;
    portfolioPositions?: PortfolioPositionInput[];
    advisorProfile?: AdvisorProfile;
  } = {},
  signal?: AbortSignal,
): Promise<AssistantResponse> {
  return apiRequest<AssistantResponse>(
    "/api/v1/workspace/assistant",
    {
      method: "POST",
      body: JSON.stringify({
        message,
        context_symbol: options.contextSymbol ?? null,
        portfolio_positions: options.portfolioPositions ?? [],
        advisor_profile: options.advisorProfile ?? null,
      }),
    },
    signal,
    60_000,
  );
}

export function getDataQuality(
  signal?: AbortSignal,
): Promise<DataQualitySnapshot> {
  return apiRequest<DataQualitySnapshot>(
    "/api/v1/workspace/data-quality",
    {},
    signal,
    20_000,
  );
}

export function getReliabilityStatus(
  signal?: AbortSignal,
): Promise<ReliabilitySnapshot> {
  return apiRequest<ReliabilitySnapshot>(
    "/api/v1/reliability/status",
    {},
    signal,
    12_000,
  );
}
