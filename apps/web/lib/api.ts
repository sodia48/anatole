import type {
  CalendarSnapshot,
  CockpitSnapshot,
  EtfDirectorySnapshot,
  FocusSnapshot,
  HealthStatus,
  NewsSnapshot,
  PsychologySnapshot,
  ScreenerSnapshot,
  SymbolSearchResponse,
  WatchlistSnapshot,
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

  return new Error(detail);
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

export function getCockpitSnapshot(
  signal?: AbortSignal,
): Promise<CockpitSnapshot> {
  return apiRequest<CockpitSnapshot>(
    "/api/v1/market/cockpit?universe=tsx60",
    {},
    signal,
    30_000,
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

export function getScreenerSnapshot(
  signal?: AbortSignal,
): Promise<ScreenerSnapshot> {
  return apiRequest<ScreenerSnapshot>(
    "/api/v1/discovery/screener?universe=tsx60",
    {},
    signal,
    45_000,
  );
}

export function getNewsSnapshot(
  signal?: AbortSignal,
): Promise<NewsSnapshot> {
  return apiRequest<NewsSnapshot>(
    "/api/v1/discovery/news",
    {},
    signal,
    30_000,
  );
}

export function getCalendarSnapshot(
  signal?: AbortSignal,
): Promise<CalendarSnapshot> {
  return apiRequest<CalendarSnapshot>(
    "/api/v1/discovery/calendar",
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
