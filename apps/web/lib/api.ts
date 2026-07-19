import type { CalendarSnapshot, CockpitSnapshot, EtfDirectorySnapshot, FocusSnapshot, HealthStatus, NewsSnapshot, PsychologySnapshot, ScreenerSnapshot, SymbolSearchResponse, WatchlistSnapshot } from "./types";

const LOCAL_API_URL = "http://localhost:8000";
const BROWSER_API_BRIDGE = "/api/anatole";

function apiBaseUrl(): string {
  if (typeof window !== "undefined") return BROWSER_API_BRIDGE;
  return (process.env.ANATOLE_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? LOCAL_API_URL).replace(/\/$/, "");
}

function apiUrl(path: string): string {
  return `${apiBaseUrl()}${path}`;
}

export async function getFocusSnapshot(ticker: string): Promise<FocusSnapshot> {
  const response = await fetch(apiUrl(`/api/v1/stocks/${encodeURIComponent(ticker)}/focus?range=1y&interval=1d`), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Focus API error: ${response.status}`);
  }

  return response.json() as Promise<FocusSnapshot>;
}

export function quoteWebSocketUrl(ticker: string): string {
  const base = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  return `${base.replace(/\/$/, "")}/ws/v1/quotes/${encodeURIComponent(ticker)}`;
}

export async function getCockpitSnapshot(signal?: AbortSignal): Promise<CockpitSnapshot> {
  const response = await fetch(apiUrl("/api/v1/market/cockpit?universe=tsx60"), {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Cockpit API error: ${response.status}`);
  }
  return response.json() as Promise<CockpitSnapshot>;
}

export async function getWatchlistSnapshot(tickers: string[], signal?: AbortSignal): Promise<WatchlistSnapshot> {
  const response = await fetch(apiUrl("/api/v1/market/watchlist"), {
    method: "POST",
    cache: "no-store",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers }),
  });
  if (!response.ok) {
    throw new Error(`Watchlist API error: ${response.status}`);
  }
  return response.json() as Promise<WatchlistSnapshot>;
}

export async function getHealthStatus(signal?: AbortSignal): Promise<HealthStatus> {
  const response = await fetch(apiUrl("/health"), { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Health API error: ${response.status}`);
  return response.json() as Promise<HealthStatus>;
}

export async function searchSymbols(query: string, signal?: AbortSignal): Promise<SymbolSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: "8" });
  const response = await fetch(apiUrl(`/api/v1/search/symbols?${params.toString()}`), { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Search API error: ${response.status}`);
  return response.json() as Promise<SymbolSearchResponse>;
}


export async function getScreenerSnapshot(signal?: AbortSignal): Promise<ScreenerSnapshot> {
  const response = await fetch(apiUrl("/api/v1/discovery/screener?universe=tsx60"), { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Screener API error: ${response.status}`);
  return response.json() as Promise<ScreenerSnapshot>;
}

export async function getNewsSnapshot(signal?: AbortSignal): Promise<NewsSnapshot> {
  const response = await fetch(apiUrl("/api/v1/discovery/news"), { cache: "no-store", signal });
  if (!response.ok) throw new Error(`News API error: ${response.status}`);
  return response.json() as Promise<NewsSnapshot>;
}

export async function getCalendarSnapshot(signal?: AbortSignal): Promise<CalendarSnapshot> {
  const response = await fetch(apiUrl("/api/v1/discovery/calendar"), { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Calendar API error: ${response.status}`);
  return response.json() as Promise<CalendarSnapshot>;
}

export async function getEtfDirectory(signal?: AbortSignal): Promise<EtfDirectorySnapshot> {
  const response = await fetch(apiUrl("/api/v1/discovery/etfs"), { cache: "no-store", signal });
  if (!response.ok) throw new Error(`ETF API error: ${response.status}`);
  return response.json() as Promise<EtfDirectorySnapshot>;
}

export async function getPsychologySnapshot(signal?: AbortSignal): Promise<PsychologySnapshot> {
  const response = await fetch(apiUrl("/api/v1/discovery/psychology"), { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Psychology API error: ${response.status}`);
  return response.json() as Promise<PsychologySnapshot>;
}
