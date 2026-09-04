import type { TerminalAlert, TerminalOpportunity, TerminalSnapshot } from "@/src/lib/api/types";

export type TerminalFeedMode = "all" | "volume" | "momentum" | "pressure";

export function uniqueRadarItems(snapshot: TerminalSnapshot): TerminalOpportunity[] {
  const items = new Map<string, TerminalOpportunity>();
  for (const item of [...snapshot.opportunities, ...snapshot.leaders, ...snapshot.laggards]) {
    const current = items.get(item.symbol);
    if (!current || item.score > current.score) items.set(item.symbol, item);
  }
  return [...items.values()];
}

export function filterAndSortRadar(items: readonly TerminalOpportunity[], mode: TerminalFeedMode, sector = "all"): TerminalOpportunity[] {
  const visible = sector === "all" ? [...items] : items.filter((item) => item.sector === sector);
  if (mode === "volume") return visible.sort((left, right) => right.relative_volume - left.relative_volume);
  if (mode === "momentum") return visible.sort((left, right) => right.momentum_20d - left.momentum_20d);
  if (mode === "pressure") return visible.sort((left, right) => {
    const leftPressure = left.score + Math.max(left.change_percent, 0) * 3;
    const rightPressure = right.score + Math.max(right.change_percent, 0) * 3;
    return leftPressure - rightPressure;
  });
  return visible.sort((left, right) => right.score - left.score);
}

export function regimeLabel(value: string, language: "fr" | "en"): string {
  if (language === "fr") return value;
  return ({ Haussier: "Bullish", Constructif: "Constructive", Neutre: "Neutral", Fragile: "Fragile", Baissier: "Bearish" } as Record<string, string>)[value] ?? value;
}

export function riskLabel(value: string, language: "fr" | "en"): string {
  if (language === "fr") return value;
  return ({ Faible: "Low", Modéré: "Moderate", Élevé: "High", Critique: "Critical" } as Record<string, string>)[value] ?? value;
}

export function sectorStateLabel(value: string, language: "fr" | "en"): string {
  if (language === "fr") return value;
  return ({ Leadership: "Leadership", Accumulation: "Accumulation", Neutre: "Neutral", Distribution: "Distribution", Faiblesse: "Weakness" } as Record<string, string>)[value] ?? value;
}

export function opportunityLabel(value: string, language: "fr" | "en"): string {
  if (language === "fr") return value;
  return ({ Leadership: "Leadership", "Sous pression": "Under pressure", Accélération: "Acceleration", Tendance: "Trend" } as Record<string, string>)[value] ?? value;
}

export function alertCopy(alert: TerminalAlert, language: "fr" | "en"): TerminalAlert {
  if (language === "fr") return alert;
  if (alert.id === "market-breadth") return { ...alert, category: "Market", title: "Weak market breadth", detail: "Only a minority of directional moves are positive; index gains may be concentrated." };
  if (alert.id.startsWith("volume:")) return { ...alert, category: "Price-volume", title: `Unusual activity in ${alert.symbol}`, detail: "Relative volume and the session move are unusually high." };
  if (alert.id.startsWith("rsi:")) return { ...alert, category: "Extension", title: `${alert.symbol} is technically extended`, detail: "The 14-session RSI is elevated; strength can persist, but consolidation risk is higher." };
  return { ...alert, category: "Dislocation", title: `Pullback within a positive trend — ${alert.symbol}`, detail: "Positive 20-day momentum contrasts with a negative session." };
}
