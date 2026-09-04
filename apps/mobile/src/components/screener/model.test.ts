import type { ScreenerRow } from "@/src/lib/api/types";
import { DEFAULT_SCREENER_FILTERS, filterAndSortScreenerRows, uniqueScreenerRows } from "./model";

function row(overrides: Partial<ScreenerRow>): ScreenerRow {
  return {
    ticker: "RY", symbol: "RY.TO", name: "Royal Bank of Canada", sector: "Financials", price: 284.17,
    change_percent: 0.25, volume: 1_000_000, average_volume_20d: 900_000, relative_volume: 1.32,
    momentum_20d: 4.12, rsi_14: 58.4, sma_20: 280, sma_50: 270, trend: "bullish", score: 74,
    signal: "Constructif", source: "yahoo-public", delayed: true, quote_as_of: null, ...overrides,
  };
}

const rows = [
  row({}),
  row({ ticker: "SHOP", symbol: "SHOP.TO", name: "Shopify", sector: "Technology", change_percent: 3, momentum_20d: 12, relative_volume: 0.7, score: 90, signal: "Momentum fort" }),
  row({ ticker: "ENB", symbol: "ENB.TO", name: "Enbridge", sector: "Energy", change_percent: -1, momentum_20d: 20, relative_volume: 3, score: 42, signal: "Fragile", rsi_14: null }),
];

describe("mobile screener client-side model", () => {
  it("defaults to score descending and searches ticker or company", () => {
    expect(filterAndSortScreenerRows(rows, DEFAULT_SCREENER_FILTERS).map((item) => item.ticker)).toEqual(["SHOP", "RY", "ENB"]);
    expect(filterAndSortScreenerRows(rows, { ...DEFAULT_SCREENER_FILTERS, query: "ry" }).map((item) => item.ticker)).toEqual(["RY"]);
    expect(filterAndSortScreenerRows(rows, { ...DEFAULT_SCREENER_FILTERS, query: "shopify" }).map((item) => item.ticker)).toEqual(["SHOP"]);
  });

  it("applies sector, signal, minimum score and combined filters", () => {
    expect(filterAndSortScreenerRows(rows, { ...DEFAULT_SCREENER_FILTERS, sector: "Financials" }).map((item) => item.ticker)).toEqual(["RY"]);
    expect(filterAndSortScreenerRows(rows, { ...DEFAULT_SCREENER_FILTERS, signal: "Fragile" }).map((item) => item.ticker)).toEqual(["ENB"]);
    expect(filterAndSortScreenerRows(rows, { ...DEFAULT_SCREENER_FILTERS, minimumScore: 75 }).map((item) => item.ticker)).toEqual(["SHOP"]);
    expect(filterAndSortScreenerRows(rows, { ...DEFAULT_SCREENER_FILTERS, sector: "Technology", signal: "Momentum fort", minimumScore: 85 }).map((item) => item.ticker)).toEqual(["SHOP"]);
    expect(filterAndSortScreenerRows(rows, DEFAULT_SCREENER_FILTERS)).toHaveLength(3);
  });

  it("sorts daily change, momentum and relative volume locally", () => {
    expect(filterAndSortScreenerRows(rows, { ...DEFAULT_SCREENER_FILTERS, sort: "change" }).map((item) => item.ticker)).toEqual(["SHOP", "RY", "ENB"]);
    expect(filterAndSortScreenerRows(rows, { ...DEFAULT_SCREENER_FILTERS, sort: "momentum" }).map((item) => item.ticker)).toEqual(["ENB", "SHOP", "RY"]);
    expect(filterAndSortScreenerRows(rows, { ...DEFAULT_SCREENER_FILTERS, sort: "volume" }).map((item) => item.ticker)).toEqual(["ENB", "RY", "SHOP"]);
  });

  it("preserves first-row order while guaranteeing unique FlatList keys", () => {
    const unique = uniqueScreenerRows([rows[0]!, { ...rows[0]!, score: 99 }, rows[1]!]);
    expect(unique.map((item) => item.ticker)).toEqual(["RY", "SHOP"]);
    expect(unique[0]?.score).toBe(74);
  });
});
