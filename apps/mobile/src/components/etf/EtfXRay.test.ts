import { calculateEtfXRay, etfXRaySummary, weightedOverlap } from "@anatole/shared/etf-xray";
import type { EtfHistoryPoint, EtfHoldingDriver, EtfHoldingsSnapshot } from "@anatole/shared";

const weights = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2];

function holding(index: number): EtfHoldingDriver {
  return {
    rank: index + 1,
    symbol: `T${index + 1}.TO`,
    display_symbol: `T${index + 1}`,
    name: `Holding ${index + 1}`,
    instrument_type: "equity",
    weight_percent: weights[index]!,
    price: 100 + index,
    currency: index < 7 ? "CAD" : index < 9 ? "USD" : "EUR",
    change_percent: index % 2 === 0 ? 1 : -1,
    contribution_percent_points: 0,
    source: "Official holdings",
    delayed: true,
  };
}

function snapshot(): EtfHoldingsSnapshot {
  return {
    ticker: "XRAY",
    normalized_symbol: "XRAY.TO",
    name: "X-Ray Test ETF",
    provider: "Test Provider",
    category: "Equity",
    exposure: "Published exposure",
    description: null,
    currency: "CAD",
    price: 100,
    change_percent: 0.5,
    holdings: weights.map((_, index) => holding(index)),
    sectors: [
      { key: "financials", label: "Services financiers", weight_percent: 45 },
      { key: "energy", label: "Énergie", weight_percent: 30 },
      { key: "technology", label: "Technologie", weight_percent: 25 },
    ],
    asset_classes: [{ key: "equity", label: "Actions", weight_percent: 100 }],
    top_holdings_weight_percent: 72,
    net_driver_contribution_percent_points: 0,
    positive_driver_contribution_percent_points: 0.1,
    negative_driver_contribution_percent_points: -0.1,
    quoted_holdings: 10,
    total_holdings_returned: 10,
    status: "available",
    message: null,
    source_name: "Official holdings",
    source_url: null,
    generated_at: "2026-08-31T12:00:00Z",
    refresh_after_seconds: 600,
  };
}

function history(count = 30): EtfHistoryPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.5 + (index % 5 === 0 ? -2 : 1);
    return {
      timestamp: new Date(Date.UTC(2026, 6, index + 1)).toISOString(),
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000 + index * 10_000,
    };
  });
}

describe("ETF X-Ray pure analytics", () => {
  it("calculates published exposure, concentration, liquidity and risk deterministically", () => {
    const result = calculateEtfXRay(snapshot(), history());

    expect(result.holdingCount).toBe(10);
    expect(result.top5ConcentrationPercent).toBe(52);
    expect(result.top10ConcentrationPercent).toBe(72);
    expect(result.largestHoldingPercent).toBe(15);
    expect(result.dominantSector).toEqual(expect.objectContaining({ key: "financials", weight_percent: 45 }));
    expect(result.currencyWeights).toEqual({ cad: 63, usd: 7, other: 2 });
    expect(result.assetClasses).toEqual([{ key: "equity", label: "Actions", weight_percent: 100 }]);
    expect(result.averageDailyVolume).toBeGreaterThan(0);
    expect(result.averageDollarVolume).toBeGreaterThan(0);
    expect(result.annualizedVolatilityPercent).toBeGreaterThan(0);
    expect(result.maximumDrawdownPercent).toBeGreaterThanOrEqual(0);
    expect(result.scores.diversification.value).not.toBeNull();
    expect(result.scores.concentration.value).not.toBeNull();
    expect(result.scores.liquidity.value).not.toBeNull();
    expect(result.scores.risk.value).not.toBeNull();
  });

  it("returns N/D values when the backend has not published enough evidence", () => {
    const base = snapshot();
    const sparse = {
      ...base,
      price: null,
      holdings: base.holdings.slice(0, 2).map((item) => ({ ...item, currency: null })),
      sectors: [],
      total_holdings_returned: 2,
    };
    const result = calculateEtfXRay(sparse, history(4));

    expect(result.currencyWeights).toEqual({ cad: null, usd: null, other: null });
    expect(result.geographyWeights).toEqual({ canada: null, unitedStates: null, international: null });
    expect(result.scores.diversification.value).toBeNull();
    expect(result.scores.concentration.value).toBeNull();
    expect(result.scores.liquidity.value).toBeNull();
    expect(result.scores.risk.value).toBeNull();
    expect(result.annualizedVolatilityPercent).toBeNull();
  });

  it("computes weighted overlap with normalized Canadian ticker suffixes", () => {
    expect(weightedOverlap(
      [{ symbol: "RY.TO", weight_percent: 6 }, { ticker: "TD", weight_percent: 4 }, { display_symbol: "ENB", weight_percent: 3 }],
      [{ ticker: "RY", weight_percent: 5 }, { ticker: "SHOP", weight_percent: 4 }, { symbol: "ENB.TO", weight_percent: 2 }],
    )).toBe(7);
  });

  it("builds a rule-based summary only from calculated facts", () => {
    const summary = etfXRaySummary("XRAY", calculateEtfXRay(snapshot(), history()), "fr");
    expect(summary).toEqual(expect.arrayContaining([
      expect.stringContaining("XRAY"),
      expect.stringContaining("Services financiers (45.0 %)"),
      expect.stringContaining("72.0 %"),
    ]));
  });
});
