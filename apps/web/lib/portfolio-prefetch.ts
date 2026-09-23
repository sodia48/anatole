"use client";

import { analyzePortfolio } from "@/lib/api";
import type {
  PortfolioPositionInput,
  PortfolioSnapshot,
} from "@/lib/types";

const POSITIONS_KEY = "anatole:portfolio:v1";
const SNAPSHOT_KEY = "anatole:portfolio:snapshot:v2";
const HISTORY_KEY = "anatole:portfolio:history:v1";
const FAST_FRESH_MS = 20_000;
const HISTORY_FRESH_MS = 20 * 60 * 1000;

type CachedPortfolioSnapshot = {
  fingerprint: string;
  saved_at: number;
  snapshot: PortfolioSnapshot;
};

let fastInFlight: Promise<void> | null = null;
let fullInFlight: Promise<void> | null = null;
let fastFingerprint = "";
let fullFingerprint = "";

function fingerprint(positions: PortfolioPositionInput[]): string {
  return JSON.stringify(positions.map((position) => ({
    symbol: position.symbol,
    market: position.market ?? "CA",
    quantity: position.quantity,
    average_cost: position.average_cost,
  })));
}

function readPositions(): PortfolioPositionInput[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(POSITIONS_KEY);
    const parsed = raw ? JSON.parse(raw) as PortfolioPositionInput[] : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) =>
      item
      && typeof item.symbol === "string"
      && Number(item.quantity) > 0
      && Number(item.average_cost) >= 0,
    );
  } catch {
    return [];
  }
}

function readEntry(
  key: string,
  expectedFingerprint: string,
): CachedPortfolioSnapshot | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedPortfolioSnapshot;
    if (
      entry.fingerprint !== expectedFingerprint
      || !entry.snapshot
      || !Number.isFinite(Number(entry.saved_at))
    ) {
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function isFresh(
  key: string,
  expectedFingerprint: string,
  maxAgeMs: number,
): boolean {
  const entry = readEntry(key, expectedFingerprint);
  return Boolean(entry && Date.now() - Number(entry.saved_at) <= maxAgeMs);
}

function hasUsefulHistory(snapshot: PortfolioSnapshot): boolean {
  return (
    snapshot.performance.length > 0
    && (snapshot.risk?.history_coverage_percent ?? 0) >= 70
  );
}

function persist(
  key: string,
  portfolioFingerprint: string,
  snapshot: PortfolioSnapshot,
): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({
      fingerprint: portfolioFingerprint,
      saved_at: Date.now(),
      snapshot,
    } satisfies CachedPortfolioSnapshot));
  } catch {
    // Le préchargement est best-effort.
  }
}

function announceCacheUpdate(): void {
  window.dispatchEvent(new Event("anatole:portfolio-cache-updated"));
}

async function warmFast(
  positions: PortfolioPositionInput[],
  portfolioFingerprint: string,
): Promise<void> {
  if (isFresh(SNAPSHOT_KEY, portfolioFingerprint, FAST_FRESH_MS)) return;

  if (fastInFlight && fastFingerprint === portfolioFingerprint) {
    await fastInFlight;
    return;
  }

  fastFingerprint = portfolioFingerprint;
  fastInFlight = analyzePortfolio(positions, undefined, true)
    .then((snapshot) => {
      persist(SNAPSHOT_KEY, portfolioFingerprint, snapshot);
      announceCacheUpdate();
    })
    .catch(() => undefined)
    .finally(() => {
      fastInFlight = null;
      fastFingerprint = "";
    });

  await fastInFlight;
}

async function warmFull(
  positions: PortfolioPositionInput[],
  portfolioFingerprint: string,
): Promise<void> {
  if (isFresh(HISTORY_KEY, portfolioFingerprint, HISTORY_FRESH_MS)) return;

  if (fullInFlight && fullFingerprint === portfolioFingerprint) {
    await fullInFlight;
    return;
  }

  fullFingerprint = portfolioFingerprint;
  fullInFlight = analyzePortfolio(positions)
    .then((snapshot) => {
      persist(SNAPSHOT_KEY, portfolioFingerprint, snapshot);
      if (hasUsefulHistory(snapshot)) {
        persist(HISTORY_KEY, portfolioFingerprint, snapshot);
      }
      announceCacheUpdate();
    })
    .catch(() => undefined)
    .finally(() => {
      fullInFlight = null;
      fullFingerprint = "";
    });

  await fullInFlight;
}

export async function prewarmPortfolio(
  mode: "fast" | "full" = "fast",
): Promise<void> {
  if (typeof window === "undefined" || document.visibilityState === "hidden") {
    return;
  }

  const positions = readPositions();
  if (!positions.length) return;

  const portfolioFingerprint = fingerprint(positions);
  await warmFast(positions, portfolioFingerprint);

  if (mode === "full") {
    await warmFull(positions, portfolioFingerprint);
  }
}
