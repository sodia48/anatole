import "server-only";

import type { InstitutionHistory, InstitutionPositionHistory } from "@/lib/types";

const API_URL = (
  process.env.ANATOLE_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://anatole-api.onrender.com"
).replace(/\/+$/, "");

async function readHistory<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/discovery/institutions/${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok ? (await response.json()) as T : null;
  } catch {
    return null;
  }
}

export function managerHistory(cik: string): Promise<InstitutionHistory | null> {
  return readHistory<InstitutionHistory>(`history/${encodeURIComponent(cik)}`);
}

export function positionHistory(query: string): Promise<InstitutionPositionHistory | null> {
  return readHistory<InstitutionPositionHistory>(`security/history?q=${encodeURIComponent(query)}`);
}
