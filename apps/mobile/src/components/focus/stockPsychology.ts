import type { Candle, FocusSnapshot } from "@/src/lib/api/types";

export type StockPsychologyComponent = { key: string; value: number | null; unit: string; score: number | null };
export type StockPsychologyReading = { score: number | null; coverage: number; components: StockPsychologyComponent[]; methodology: string };

function closes(candles: Candle[]): number[] { return candles.map((item) => item.close).filter((value) => Number.isFinite(value) && value > 0); }
function change(values: number[], sessions: number): number | null {
  const baseline = values[values.length - sessions - 1];
  if (values.length <= sessions || baseline == null || baseline === 0) return null;
  return (values.at(-1)! / baseline - 1) * 100;
}
function average(values: number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function clamp(value: number): number { return Math.max(0, Math.min(100, value)); }
function numeric(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }

export function buildStockPsychology(snapshot: FocusSnapshot): StockPsychologyReading {
  const values = closes(snapshot.history);
  const momentum20 = change(values, 20);
  const momentum50 = change(values, 50);
  const rsi = numeric(snapshot.technicals.rsi_14);
  const sma20 = numeric(snapshot.technicals.sma_20) ?? average(values.slice(-20));
  const sma50 = numeric(snapshot.technicals.sma_50) ?? average(values.slice(-50));
  const current = values.at(-1) ?? null;
  const recentReturns = values.slice(-21).flatMap((value, index, sample) => {
    const previous = sample[index - 1];
    return index > 0 && previous ? [value / previous - 1] : [];
  });
  const mean = average(recentReturns);
  const volatility = mean !== null && recentReturns.length >= 10 ? Math.sqrt(recentReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (recentReturns.length - 1)) * Math.sqrt(252) * 100 : null;
  const recentVolumes = snapshot.history.slice(-20).map((item) => item.volume).filter((value) => value > 0);
  const avgVolume = average(recentVolumes.slice(0, -1));
  const latestVolume = recentVolumes.at(-1) ?? null;
  const relativeVolume = avgVolume && latestVolume !== null ? latestVolume / avgVolume : null;
  const components: StockPsychologyComponent[] = [
    { key: "momentum_20d", value: momentum20, unit: "%", score: momentum20 === null ? null : clamp(50 + momentum20 * 3) },
    { key: "momentum_50d", value: momentum50, unit: "%", score: momentum50 === null ? null : clamp(50 + momentum50 * 2) },
    { key: "rsi_14", value: rsi, unit: "", score: rsi },
    { key: "volatility_20d", value: volatility, unit: "%", score: volatility === null ? null : clamp(100 - Math.max(0, volatility - 10) * 2.5) },
    { key: "relative_volume", value: relativeVolume, unit: "x", score: relativeVolume === null ? null : clamp(50 + (relativeVolume - 1) * 20) },
    { key: "price_vs_sma20", value: current !== null && sma20 ? (current / sma20 - 1) * 100 : null, unit: "%", score: current !== null && sma20 ? clamp(50 + (current / sma20 - 1) * 300) : null },
    { key: "price_vs_sma50", value: current !== null && sma50 ? (current / sma50 - 1) * 100 : null, unit: "%", score: current !== null && sma50 ? clamp(50 + (current / sma50 - 1) * 250) : null },
  ];
  const available = components.filter((item) => item.score !== null);
  const coverage = Math.round(available.length / components.length * 100);
  const score = coverage >= 70 ? Math.round(available.reduce((sum, item) => sum + item.score!, 0) / available.length * 10) / 10 : null;
  return { score, coverage, components, methodology: "Lecture Anatole déterministe fondée sur momentum, RSI, volatilité, volume relatif et position face aux moyennes mobiles. Ce score n’est pas une recommandation." };
}
