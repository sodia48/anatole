import type { FocusSnapshot } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function getFocusSnapshot(ticker: string): Promise<FocusSnapshot> {
  const response = await fetch(`${API_URL}/api/v1/stocks/${encodeURIComponent(ticker)}/focus?range=1y&interval=1d`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Focus API error: ${response.status}`);
  }

  return response.json() as Promise<FocusSnapshot>;
}

export function quoteWebSocketUrl(ticker: string): string {
  const base = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  return `${base}/ws/v1/quotes/${encodeURIComponent(ticker)}`;
}
