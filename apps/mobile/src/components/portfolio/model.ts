import type { PortfolioCoverage, PortfolioHorizon, PortfolioPositionSnapshot } from "@/src/lib/api/types";

export type PortfolioLanguage = "fr" | "en";

export function formatPortfolioNumber(value: number | null | undefined, language: PortfolioLanguage, suffix = ""): string {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return `${value.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 })}${suffix}`;
}

export function formatPortfolioMoney(value: number | null | undefined, language: PortfolioLanguage, currency = "CAD"): string {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return value.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency });
}

export function portfolioHorizonLabel(horizon: PortfolioHorizon["horizon"]): string {
  return ({ "1d": "1J", "1w": "1S", "1m": "1M", "3m": "3M", ytd: "YTD", "1y": "1A" })[horizon];
}

export function coverageIsSufficient(coverage: PortfolioCoverage): boolean {
  return coverage.coverage_percent >= 70;
}

export function topPortfolioMover(positions: readonly PortfolioPositionSnapshot[], direction: "top" | "bottom"): PortfolioPositionSnapshot | null {
  if (!positions.length) return null;
  return [...positions].sort((left, right) => direction === "top" ? right.day_change_percent - left.day_change_percent : left.day_change_percent - right.day_change_percent)[0] ?? null;
}
