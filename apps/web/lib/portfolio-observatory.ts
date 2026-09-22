"use client";

const STORAGE_KEY = "anatole:portfolio:observatory:v1";
const MAX_RECORDS = 24;

export type PortfolioObservation = {
  id: string;
  started_at: number;
  cache_hit: boolean | null;
  display_ms: number | null;
  price_ms: number | null;
  analysis_ms: number | null;
};

export type PortfolioObservationHandle = {
  startedAt: number;
  record: PortfolioObservation;
};

export function beginPortfolioObservation(): PortfolioObservationHandle {
  return {
    startedAt: performance.now(),
    record: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      started_at: Date.now(),
      cache_hit: null,
      display_ms: null,
      price_ms: null,
      analysis_ms: null,
    },
  };
}

export function elapsedPortfolioMs(handle: PortfolioObservationHandle): number {
  return Math.max(0, Math.round(performance.now() - handle.startedAt));
}

export function markPortfolioObservation(
  handle: PortfolioObservationHandle,
  patch: Partial<Omit<PortfolioObservation, "id" | "started_at">>,
): PortfolioObservation {
  Object.assign(handle.record, patch);
  const snapshot = { ...handle.record };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const history = raw ? JSON.parse(raw) as PortfolioObservation[] : [];
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([snapshot, ...history.filter((item) => item.id !== snapshot.id)].slice(0, MAX_RECORDS)),
    );
  } catch {
    // Observability must never affect Portfolio.
  }
  return snapshot;
}

export function formatPortfolioMs(value: number | null): string {
  if (value === null) return "—";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} s`;
}

export function portfolioSpeedGrade(
  observation: PortfolioObservation,
): "instant" | "fast" | "slow" | "pending" {
  const visible = observation.display_ms ?? observation.price_ms;
  if (visible === null) return "pending";
  if (visible <= 250) return "instant";
  if (visible <= 800) return "fast";
  return "slow";
}
