import type { ScreenerRow } from "@/src/lib/api/types";
export type DiscoverStrategy = "momentum" | "oversold" | "unusual_volume" | "breakout" | "sector_leaders" | "insiders" | "value" | "quality" | "dividend";
export type DiscoverResult = { ticker: string; name: string; reasons: string[] };
export const discoverStrategies: DiscoverStrategy[] = ["momentum", "oversold", "unusual_volume", "breakout", "sector_leaders", "insiders", "value", "quality", "dividend"];
export function strategyAvailable(strategy: DiscoverStrategy): boolean { return !["breakout", "value", "quality", "dividend"].includes(strategy); }
export function screenDiscover(rows: ScreenerRow[], strategy: DiscoverStrategy): DiscoverResult[] {
  if (!strategyAvailable(strategy) || strategy === "insiders") return [];
  let selected: ScreenerRow[] = [];
  if (strategy === "momentum") selected = rows.filter((row) => row.momentum_20d >= 5).sort((a, b) => b.momentum_20d - a.momentum_20d);
  if (strategy === "oversold") selected = rows.filter((row) => row.rsi_14 !== null && row.rsi_14 < 30).sort((a, b) => (a.rsi_14 ?? 100) - (b.rsi_14 ?? 100));
  if (strategy === "unusual_volume") selected = rows.filter((row) => row.relative_volume >= 1.8).sort((a, b) => b.relative_volume - a.relative_volume);
  if (strategy === "sector_leaders") { const seen = new Set<string>(); selected = [...rows].sort((a, b) => b.score - a.score).filter((row) => !seen.has(row.sector) && Boolean(seen.add(row.sector))); }
  return selected.slice(0, 30).map((row) => ({ ticker: row.ticker, name: row.name, reasons: [strategy === "oversold" ? `RSI ${row.rsi_14?.toFixed(1)}` : strategy === "unusual_volume" ? `Volume relatif ${row.relative_volume.toFixed(1)}x` : strategy === "sector_leaders" ? `${row.sector} · Score ${row.score.toFixed(1)}` : `Momentum 20J ${row.momentum_20d >= 0 ? "+" : ""}${row.momentum_20d.toFixed(1)} %`] }));
}
