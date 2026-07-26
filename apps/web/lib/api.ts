import type { FocusSnapshot } from "./types";
import { resilientFetch } from "./resilient-fetch";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000"
).replace(/\/+$/, "");

export async function getFocusSnapshot(
  ticker: string,
  signal?: AbortSignal,
): Promise<FocusSnapshot> {
  const response = await resilientFetch(
    `${API_URL}/api/v1/stocks/${encodeURIComponent(
      ticker,
    )}/focus?range=1y&interval=1d`,
    {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
      retries: 2,
      timeoutMs: 15_000,
    },
  );

  if (!response.ok) {
    throw new Error(`Focus API error: ${response.status}`);
  }

  return response.json() as Promise<FocusSnapshot>;
}

export function quoteWebSocketUrl(ticker: string): string {
  const base = (
    process.env.NEXT_PUBLIC_WS_URL ??
    "ws://localhost:8000"
  ).replace(/\/+$/, "");

  return `${base}/ws/v1/quotes/${encodeURIComponent(ticker)}`;
}
