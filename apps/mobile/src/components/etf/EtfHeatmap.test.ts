import { etfLiquidityWeight, groupEtfHeatmapTiles, normalizeEtfHeatmapTile, weightedEtfHeatmapChange } from "@anatole/shared/heatmap";

const labels = { otherProviders: "Other providers", otherExposures: "Other exposures", fullMarket: "Market", gainers: "Gainers", unchanged: "Unchanged", decliners: "Decliners" };
const items = [
  { ticker: "XIU", symbol: "XIU.TO", name: "TSX 60", provider: "BlackRock", category: "Equity", exposure: "Canada", price: 40, change_percent: 1.5, volume: 1_000_000, currency: "CAD", source: "quotes", delayed: true },
  { ticker: "ZAG", symbol: "ZAG.TO", name: "Bonds", provider: "BMO", category: "Fixed income", exposure: "Canada", price: 14, change_percent: -0.5, volume: 100_000, currency: "CAD", source: "quotes", delayed: true },
  { ticker: "CGL", symbol: "CGL.TO", name: "Gold", provider: "CIBC", category: "Commodity", exposure: "Gold", price: 0, change_percent: 4, volume: 0, currency: "CAD", source: "unavailable", delayed: true },
].map((item) => normalizeEtfHeatmapTile(item, labels));

describe("ETF heatmap web-parity calculations", () => {
  it("uses the web liquidity/volume weighting including its minimum floor", () => {
    expect(etfLiquidityWeight(0)).toBe(0.65);
    expect(etfLiquidityWeight(999)).toBeCloseTo(4);
    expect(weightedEtfHeatmapChange(items)).toBeGreaterThan(0.4);
  });

  it("groups by sector, provider and market direction without losing N/D tiles", () => {
    expect(groupEtfHeatmapTiles(items, "sector", labels).map((group) => group.key)).toEqual(expect.arrayContaining(["Equity", "Fixed income", "Commodity"]));
    expect(groupEtfHeatmapTiles(items, "provider", labels).map((group) => group.key)).toEqual(expect.arrayContaining(["BlackRock", "BMO", "CIBC"]));
    const direction = groupEtfHeatmapTiles(items, "direction", labels);
    expect(direction.flatMap((group) => group.tiles)).toHaveLength(3);
    expect(direction.find((group) => group.key === "Unchanged")?.tiles[0]?.available).toBe(false);
  });

  it("never invents a quote for unavailable ETF data", () => {
    expect(items[2]?.price).toBeNull();
    expect(items[2]?.available).toBe(false);
  });
});
