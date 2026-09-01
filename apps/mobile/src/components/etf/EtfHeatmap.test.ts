import { etfLiquidityWeight, groupEtfHeatmapTiles, normalizeEtfHeatmapTile, weightedEtfHeatmapChange } from "@anatole/shared/heatmap";
import { selectRepresentativeEtfsBySector, type RepresentativeEtfInput } from "@anatole/shared/etf-ranking";

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

  it("caps a 25-fund sector at exactly 10 and keeps a 7-fund sector intact", () => {
    const large = Array.from({ length: 25 }, (_, index) => ({ ticker: `L${String(index).padStart(2, "0")}`, category: "Equity", price: 10, volume: index + 1, source: "quotes" }));
    const small = Array.from({ length: 7 }, (_, index) => ({ ticker: `S${index}`, category: "Bonds", price: 20, volume: index + 1, source: "quotes" }));
    const selected = selectRepresentativeEtfsBySector([...large, ...small]);
    expect(selected.get("Equity")).toHaveLength(10);
    expect(selected.get("Bonds")).toHaveLength(7);
  });

  it("ranks dollar volume, then real volume, then missing values with ticker tie-breaks", () => {
    const ranked: RepresentativeEtfInput[] = [
      { ticker: "B", category: "Equity", price: 10, volume: 100, source: "quotes" },
      { ticker: "A", category: "Equity", price: 20, volume: 100, source: "quotes" },
      { ticker: "C", category: "Equity", price: null, volume: 50_000, source: "quotes" },
      { ticker: "E", category: "Equity", price: null, volume: null, source: "unavailable" },
      { ticker: "D", category: "Equity", price: null, volume: null, source: "unavailable" },
    ];
    expect(selectRepresentativeEtfsBySector(ranked).get("Equity")?.map((item) => item.ticker)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("deduplicates tickers and preserves real source values without creating AUM", () => {
    const first: RepresentativeEtfInput = { ticker: "XIU", category: "Equity", price: 40, volume: 100, source: "quotes" };
    const duplicate: RepresentativeEtfInput = { ticker: "xiu", category: "Equity", price: 40, volume: 200, source: "quotes" };
    const selected = selectRepresentativeEtfsBySector([first, duplicate]).get("Equity") ?? [];
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(duplicate);
    expect("aum" in selected[0]!).toBe(false);
    expect(selected[0]?.price).toBe(40);
    expect(selected[0]?.volume).toBe(200);
  });
});
