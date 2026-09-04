import type { EtfAllocationItem, EtfHistoryPoint, EtfHoldingDriver, EtfHoldingsSnapshot } from "./contracts";

export type EtfXRayScore = { value: number | null; formula: string };
export type EtfXRayAnalytics = {
  holdingCount: number;
  top5ConcentrationPercent: number | null;
  top10ConcentrationPercent: number | null;
  largestHoldingPercent: number | null;
  currencyWeights: { cad: number | null; usd: number | null; other: number | null };
  geographyWeights: { canada: null; unitedStates: null; international: null };
  assetClasses: EtfAllocationItem[];
  dominantSector: EtfAllocationItem | null;
  sectorConcentrationPercent: number | null;
  averageDailyVolume: number | null;
  averageDollarVolume: number | null;
  annualizedVolatilityPercent: number | null;
  maximumDrawdownPercent: number | null;
  scores: {
    diversification: EtfXRayScore;
    concentration: EtfXRayScore;
    liquidity: EtfXRayScore;
    risk: EtfXRayScore;
  };
};

export type WeightedHolding = {
  ticker?: string;
  symbol?: string;
  display_symbol?: string;
  weight_percent: number;
};

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));
const finitePositive = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

function canonicalHoldingSymbol(holding: WeightedHolding): string {
  const raw = holding.display_symbol || holding.ticker || holding.symbol || "";
  return raw.trim().toUpperCase().replace(/\.(TO|V|NE|CN)$/u, "").replaceAll("-", ".");
}

function weightMap(holdings: readonly WeightedHolding[]): Map<string, number> {
  const output = new Map<string, number>();
  for (const holding of holdings) {
    const symbol = canonicalHoldingSymbol(holding);
    if (!symbol || !finitePositive(holding.weight_percent)) continue;
    output.set(symbol, (output.get(symbol) ?? 0) + holding.weight_percent);
  }
  return output;
}

/** Percentage overlap = sum(min(weight A, weight B)) for every normalized ticker. */
export function weightedOverlap(etfA: readonly WeightedHolding[], etfB: readonly WeightedHolding[]): number {
  const left = weightMap(etfA);
  const right = weightMap(etfB);
  let overlap = 0;
  for (const [ticker, weight] of left) overlap += Math.min(weight, right.get(ticker) ?? 0);
  return Math.round(overlap * 10_000) / 10_000;
}

function topConcentration(holdings: EtfHoldingDriver[], count: number, totalReturned: number): number | null {
  const required = Math.min(count, Math.max(totalReturned, holdings.length));
  if (required === 0 || holdings.length < required) return null;
  const sorted = holdings.filter((holding) => finitePositive(holding.weight_percent)).sort((a, b) => b.weight_percent - a.weight_percent);
  if (sorted.length < required) return null;
  return sorted.slice(0, count).reduce((sum, holding) => sum + holding.weight_percent, 0);
}

function normalizedHhi(weights: number[]): number | null {
  const valid = weights.filter(finitePositive);
  const total = valid.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return null;
  return valid.reduce((sum, weight) => sum + (weight / total) ** 2, 0) * 100;
}

function riskMetrics(points: readonly EtfHistoryPoint[]): { volatility: number | null; drawdown: number | null } {
  const closes = points.map((point) => point.close).filter(finitePositive);
  if (closes.length < 20) return { volatility: null, drawdown: null };
  const returns: number[] = [];
  let peak = closes[0]!;
  let maximumDrawdown = 0;
  for (let index = 1; index < closes.length; index += 1) {
    const previous = closes[index - 1]!;
    const current = closes[index]!;
    returns.push(current / previous - 1);
    peak = Math.max(peak, current);
    maximumDrawdown = Math.max(maximumDrawdown, (peak - current) / peak);
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, returns.length - 1);
  return { volatility: Math.sqrt(variance) * Math.sqrt(252) * 100, drawdown: maximumDrawdown * 100 };
}

function currencyWeights(holdings: readonly EtfHoldingDriver[]): EtfXRayAnalytics["currencyWeights"] {
  const known = holdings.filter((holding) => holding.currency?.trim() && finitePositive(holding.weight_percent));
  if (known.length === 0) return { cad: null, usd: null, other: null };
  return known.reduce((output, holding) => {
    const currency = holding.currency!.trim().toUpperCase();
    if (currency === "CAD") output.cad = (output.cad ?? 0) + holding.weight_percent;
    else if (currency === "USD") output.usd = (output.usd ?? 0) + holding.weight_percent;
    else output.other = (output.other ?? 0) + holding.weight_percent;
    return output;
  }, { cad: 0, usd: 0, other: 0 } as EtfXRayAnalytics["currencyWeights"]);
}

/**
 * Deterministic formulas:
 * - diversification = 35% holding-count breadth + 35% inverse Top-10 + 30% inverse sector HHI;
 * - concentration = normalized holding HHI, only with >=10 published holdings covering >=40%;
 * - liquidity = log10 average dollar volume mapped from $10k (0) to $100m (100), >=5 sessions;
 * - risk = 60% annualized-volatility band (0-60%) + 40% max-drawdown band (0-50%), >=20 closes.
 */
export function calculateEtfXRay(snapshot: EtfHoldingsSnapshot, history: readonly EtfHistoryPoint[]): EtfXRayAnalytics {
  const holdings = [...snapshot.holdings];
  const holdingCount = snapshot.total_holdings_returned || holdings.length;
  const top5 = topConcentration(holdings, 5, holdingCount);
  const top10 = topConcentration(holdings, 10, holdingCount);
  const largest = holdings.length ? Math.max(...holdings.map((holding) => holding.weight_percent)) : null;
  const dominantSector = snapshot.sectors.length ? [...snapshot.sectors].sort((a, b) => b.weight_percent - a.weight_percent)[0]! : null;
  const sectorHhi = snapshot.sectors.length >= 2 ? normalizedHhi(snapshot.sectors.map((sector) => sector.weight_percent)) : null;
  const holdingCoverage = holdings.reduce((sum, holding) => sum + Math.max(0, holding.weight_percent), 0);
  const holdingHhi = holdings.length >= 10 && holdingCoverage >= 40 ? normalizedHhi(holdings.map((holding) => holding.weight_percent)) : null;

  const countScore = Math.min(100, holdingCount / 50 * 100);
  const diversification = top10 !== null && sectorHhi !== null && holdingCount >= 10
    ? clampScore(countScore * 0.35 + (100 - Math.min(100, top10)) * 0.35 + (100 - sectorHhi) * 0.30)
    : null;

  const recentVolumes = history.slice(-20).map((point) => point.volume).filter(finitePositive);
  const averageDailyVolume = recentVolumes.length >= 5 ? recentVolumes.reduce((sum, volume) => sum + volume, 0) / recentVolumes.length : null;
  const referencePrice = finitePositive(snapshot.price) ? snapshot.price : history.length && finitePositive(history.at(-1)?.close) ? history.at(-1)!.close : null;
  const averageDollarVolume = averageDailyVolume !== null && referencePrice !== null ? averageDailyVolume * referencePrice : null;
  const liquidity = averageDollarVolume !== null ? clampScore((Math.log10(Math.max(averageDollarVolume, 10_000)) - 4) / 4 * 100) : null;

  const risk = riskMetrics(history);
  const riskScore = risk.volatility !== null && risk.drawdown !== null
    ? clampScore(Math.min(100, risk.volatility / 60 * 100) * 0.60 + Math.min(100, risk.drawdown / 50 * 100) * 0.40)
    : null;

  return {
    holdingCount,
    top5ConcentrationPercent: top5,
    top10ConcentrationPercent: top10,
    largestHoldingPercent: largest,
    currencyWeights: currencyWeights(holdings),
    geographyWeights: { canada: null, unitedStates: null, international: null },
    assetClasses: snapshot.asset_classes,
    dominantSector,
    sectorConcentrationPercent: sectorHhi,
    averageDailyVolume,
    averageDollarVolume,
    annualizedVolatilityPercent: risk.volatility,
    maximumDrawdownPercent: risk.drawdown,
    scores: {
      diversification: { value: diversification, formula: "35% breadth + 35% inverse Top-10 + 30% inverse sector HHI" },
      concentration: { value: holdingHhi === null ? null : clampScore(holdingHhi), formula: "Normalized HHI of published holding weights; requires >=10 holdings and >=40% coverage" },
      liquidity: { value: liquidity, formula: "log10 average dollar volume: $10k=0, $100m=100; requires >=5 sessions" },
      risk: { value: riskScore, formula: "60% annualized volatility + 40% maximum drawdown; requires >=20 closes" },
    },
  };
}

export function etfXRaySummary(ticker: string, analytics: EtfXRayAnalytics, language: "fr" | "en"): string[] {
  const output: string[] = [];
  const sector = analytics.dominantSector;
  if (sector && sector.weight_percent >= 35) {
    output.push(language === "fr" ? `${ticker} est fortement concentré dans ${sector.label} (${sector.weight_percent.toFixed(1)} %).` : `${ticker} is heavily concentrated in ${sector.label} (${sector.weight_percent.toFixed(1)}%).`);
  } else if (sector) {
    output.push(language === "fr" ? `${sector.label} est le principal secteur de ${ticker} (${sector.weight_percent.toFixed(1)} %).` : `${sector.label} is ${ticker}'s largest sector (${sector.weight_percent.toFixed(1)}%).`);
  }
  if (analytics.top10ConcentrationPercent !== null) {
    output.push(language === "fr" ? `Les 10 principales positions représentent ${analytics.top10ConcentrationPercent.toFixed(1)} % des positions publiées.` : `The 10 largest holdings represent ${analytics.top10ConcentrationPercent.toFixed(1)}% of published holdings.`);
  }
  if (output.length === 0 && analytics.holdingCount > 0) {
    output.push(language === "fr" ? `${analytics.holdingCount} positions sont disponibles pour l’analyse de ${ticker}.` : `${analytics.holdingCount} holdings are available for ${ticker}'s analysis.`);
  }
  return output;
}
