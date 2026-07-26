/* eslint-disable @typescript-eslint/no-explicit-any */

import { resilientFetch } from "./resilient-fetch";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000"
).replace(/\/+$/, "");

type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | readonly unknown[];

type QueryObject = Record<string, QueryValue>;

function isAbortSignal(value: unknown): value is AbortSignal {
  return Boolean(
    value &&
      typeof value === "object" &&
      "aborted" in value &&
      "addEventListener" in value,
  );
}

function signalFromArgs(args: readonly unknown[]): AbortSignal | undefined {
  return args.find(isAbortSignal);
}

function isQueryObject(value: unknown): value is QueryObject {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !isAbortSignal(value) &&
      !(value instanceof URLSearchParams) &&
      !(value instanceof Date),
  );
}

function appendQueryValue(
  query: URLSearchParams,
  key: string,
  value: QueryValue,
): void {
  if (value === null || value === undefined || value === "") {
    return;
  }

  if (Array.isArray(value)) {
    const clean = value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);

    if (clean.length > 0) {
      query.set(key, clean.join(","));
    }

    return;
  }

  if (value instanceof Date) {
    query.set(key, value.toISOString());
    return;
  }

  query.set(key, String(value));
}

function queryFromArgs(
  args: readonly unknown[],
  options: {
    stringKey?: string;
    arrayKey?: string;
  } = {},
): string {
  const query = new URLSearchParams();
  const stringKey = options.stringKey ?? "q";
  const arrayKey = options.arrayKey ?? "tickers";

  for (const argument of args) {
    if (
      argument === null ||
      argument === undefined ||
      isAbortSignal(argument)
    ) {
      continue;
    }

    if (argument instanceof URLSearchParams) {
      argument.forEach((value, key) => query.set(key, value));
      continue;
    }

    if (typeof argument === "string") {
      const clean = argument.trim();

      if (clean && !query.has(stringKey)) {
        query.set(stringKey, clean);
      }

      continue;
    }

    if (Array.isArray(argument)) {
      appendQueryValue(query, arrayKey, argument);
      continue;
    }

    if (isQueryObject(argument)) {
      for (const [key, value] of Object.entries(argument)) {
        appendQueryValue(query, key, value);
      }
    }
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      detail?: unknown;
      message?: unknown;
    };

    const detail = payload.detail ?? payload.message;

    if (typeof detail === "string" && detail.trim()) {
      return detail.trim();
    }
  } catch {
    // La réponse d'erreur n'est pas nécessairement du JSON.
  }

  return `Erreur API ${response.status}`;
}

async function apiGet<T>(
  path: string,
  signal?: AbortSignal,
  timeoutMs = 15_000,
): Promise<T> {
  const response = await resilientFetch(`${API_URL}${path}`, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
    retries: 2,
    timeoutMs,
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return (await response.json()) as T;
}

async function apiGetCandidates<T>(
  paths: readonly string[],
  signal?: AbortSignal,
  timeoutMs = 15_000,
): Promise<T> {
  let lastError: Error | null = null;

  for (const path of paths) {
    try {
      const response = await resilientFetch(`${API_URL}${path}`, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
        retries: 2,
        timeoutMs,
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      const message = await errorMessage(response);
      lastError = new Error(message);

      // Essaie l'ancien chemin uniquement lorsqu'une route n'existe plus.
      if (response.status !== 404 && response.status !== 405) {
        throw lastError;
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw error;
      }

      lastError =
        error instanceof Error
          ? error
          : new Error("API temporairement indisponible");
    }
  }

  throw lastError ?? new Error("Aucune route API compatible n'a répondu.");
}

/* -------------------------------------------------------------------------- */
/* Marché                                                                     */
/* -------------------------------------------------------------------------- */

export function getCockpitSnapshot(
  signal?: AbortSignal,
): Promise<any> {
  return apiGetCandidates<any>(
    [
      "/api/v1/market/tsx60",
      "/api/v1/market/cockpit",
      "/api/v1/market/cockpit/tsx60",
    ],
    signal,
    20_000,
  );
}

export function getWatchlistSnapshot(
  ...args: unknown[]
): Promise<any> {
  const signal = signalFromArgs(args);
  const query = queryFromArgs(args, {
    stringKey: "ticker",
    arrayKey: "tickers",
  });

  return apiGetCandidates<any>(
    [
      `/api/v1/market/watchlist${query}`,
      `/api/v1/market/quotes${query}`,
    ],
    signal,
    20_000,
  );
}

/* -------------------------------------------------------------------------- */
/* Focus et données par titre                                                 */
/* -------------------------------------------------------------------------- */

export function getFocusSnapshot(
  ticker: string,
  signal?: AbortSignal,
): Promise<any> {
  return apiGet<any>(
    `/api/v1/stocks/${encodeURIComponent(
      ticker,
    )}/focus?range=1y&interval=1d`,
    signal,
    20_000,
  );
}

export function getStockQuote(
  ticker: string,
  signal?: AbortSignal,
): Promise<any> {
  return apiGet<any>(
    `/api/v1/stocks/${encodeURIComponent(ticker)}/quote`,
    signal,
  );
}

export const getQuote = getStockQuote;

export function getStockHistory(
  ticker: string,
  options: {
    range?: string;
    interval?: string;
  } = {},
  signal?: AbortSignal,
): Promise<any> {
  const query = new URLSearchParams({
    range: options.range ?? "1y",
    interval: options.interval ?? "1d",
  });

  return apiGet<any>(
    `/api/v1/stocks/${encodeURIComponent(
      ticker,
    )}/history?${query.toString()}`,
    signal,
    20_000,
  );
}

export const getHistory = getStockHistory;

export function getStockTechnicals(
  ticker: string,
  options: {
    range?: string;
    interval?: string;
  } = {},
  signal?: AbortSignal,
): Promise<any> {
  const query = new URLSearchParams({
    range: options.range ?? "1y",
    interval: options.interval ?? "1d",
  });

  return apiGet<any>(
    `/api/v1/stocks/${encodeURIComponent(
      ticker,
    )}/technicals?${query.toString()}`,
    signal,
    20_000,
  );
}

export const getTechnicals = getStockTechnicals;

export function getStockProfile(
  ticker: string,
  signal?: AbortSignal,
): Promise<any> {
  return apiGet<any>(
    `/api/v1/stocks/${encodeURIComponent(ticker)}/profile`,
    signal,
  );
}

export const getProfile = getStockProfile;

/* -------------------------------------------------------------------------- */
/* Découverte : Screener, actualités, calendrier, ETF et psychologie          */
/* -------------------------------------------------------------------------- */

export function getScreenerSnapshot(
  ...args: unknown[]
): Promise<any> {
  const signal = signalFromArgs(args);
  const query = queryFromArgs(args);

  return apiGetCandidates<any>(
    [
      `/api/v1/discovery/screener${query}`,
      `/api/v1/discovery/stocks${query}`,
    ],
    signal,
    30_000,
  );
}

export function getNewsSnapshot(
  ...args: unknown[]
): Promise<any> {
  const signal = signalFromArgs(args);
  const query = queryFromArgs(args, {
    stringKey: "ticker",
  });

  return apiGetCandidates<any>(
    [
      `/api/v1/discovery/news${query}`,
      `/api/v1/discovery/actualites${query}`,
    ],
    signal,
    25_000,
  );
}

export const getActualitesSnapshot = getNewsSnapshot;

export function getCalendarSnapshot(
  ...args: unknown[]
): Promise<any> {
  const signal = signalFromArgs(args);
  const query = queryFromArgs(args);

  return apiGetCandidates<any>(
    [
      `/api/v1/discovery/calendar${query}`,
      `/api/v1/discovery/economic-calendar${query}`,
      `/api/v1/discovery/calendrier${query}`,
    ],
    signal,
    35_000,
  );
}

export const getEconomicCalendarSnapshot = getCalendarSnapshot;

export function getPsychologySnapshot(
  ...args: unknown[]
): Promise<any> {
  const signal = signalFromArgs(args);
  const query = queryFromArgs(args, {
    stringKey: "ticker",
  });

  return apiGetCandidates<any>(
    [
      `/api/v1/discovery/psychology${query}`,
      `/api/v1/discovery/sentiment${query}`,
      `/api/v1/discovery/psychologie${query}`,
    ],
    signal,
    30_000,
  );
}

export const getMarketPsychologySnapshot = getPsychologySnapshot;

export function getEtfSnapshot(
  ...args: unknown[]
): Promise<any> {
  const signal = signalFromArgs(args);
  const query = queryFromArgs(args, {
    stringKey: "ticker",
  });

  return apiGetCandidates<any>(
    [
      `/api/v1/discovery/etf${query}`,
      `/api/v1/discovery/etfs${query}`,
      `/api/v1/discovery/etf/directory${query}`,
    ],
    signal,
    35_000,
  );
}

// Alias conservés pour les différentes versions du frontend Anatole.
export const getEtfDirectory = getEtfSnapshot;
export const getEtfDirectorySnapshot = getEtfSnapshot;
export const getEtfsSnapshot = getEtfSnapshot;

/* -------------------------------------------------------------------------- */
/* Recherche                                                                  */
/* -------------------------------------------------------------------------- */

export function searchSymbols(
  query: string,
  signal?: AbortSignal,
): Promise<any> {
  const params = new URLSearchParams({ q: query.trim() });

  return apiGetCandidates<any>(
    [
      `/api/v1/search?${params.toString()}`,
      `/api/v1/search/symbols?${params.toString()}`,
    ],
    signal,
  );
}

export const getSearchResults = searchSymbols;

/* -------------------------------------------------------------------------- */
/* WebSocket                                                                  */
/* -------------------------------------------------------------------------- */

export function quoteWebSocketUrl(ticker: string): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL?.replace(/\/+$/, "");

  const base =
    configured ||
    API_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

  return `${base}/ws/v1/quotes/${encodeURIComponent(ticker)}`;
}
