import {
  binaryTreemap,
  groupHeatmapTiles,
  layoutTileWeight,
  normalizeHeatmapTile,
  weightedHeatmapChange,
  type NormalizedHeatmapTile,
} from "@anatole/shared/heatmap";

const labels = { fullMarket: "Market", gainers: "Gainers", unchanged: "Unchanged", decliners: "Decliners" };
function tile(symbol: string, sector: string, weight: number, change: number): NormalizedHeatmapTile {
  return { ticker: `${symbol}.TO`, symbol, name: symbol, sector, weight, price: 100, changePercent: change, volume: 10, available: true, delayed: false };
}

describe("shared market heatmap calculations", () => {
  it("preserves the complete rectangle area in the binary treemap", () => {
    const result = binaryTreemap([{ item: "a", weight: 6 }, { item: "b", weight: 3 }, { item: "c", weight: 1 }], { x: 0, y: 0, width: 100, height: 80 });
    expect(result).toHaveLength(3);
    expect(result.reduce((sum, entry) => sum + entry.rect.width * entry.rect.height, 0)).toBeCloseTo(8_000, 5);
  });

  it("groups by sector, full market and direction without losing tiles", () => {
    const rows = [tile("RY", "Financials", 7, 1.2), tile("TD", "Financials", 5, -0.3), tile("CNQ", "Energy", 4, 0)];
    expect(groupHeatmapTiles(rows, "sector", labels).map((group) => group.key)).toEqual(["Financials", "Energy"]);
    expect(groupHeatmapTiles(rows, "flat", labels)[0]?.tiles).toHaveLength(3);
    expect(groupHeatmapTiles(rows, "direction", labels).map((group) => group.key)).toEqual(["gainers", "unchanged", "losers"]);
  });

  it("uses the dense composite layout curve above 150 constituents", () => {
    const row = tile("RY", "Financials", 20, 1);
    expect(layoutTileWeight(row, 200)).toBeLessThan(layoutTileWeight(row, 60));
  });

  it("keeps missing weight visible but never invents missing quote values", () => {
    const normalized = normalizeHeatmapTile({ ticker: "RY", name: "Royal Bank", sector: "Financials", weight: null, price: null, change_percent: null, source: "unavailable" });
    expect(normalized?.weight).toBe(0);
    expect(normalized?.price).toBeNull();
    expect(normalized?.available).toBe(false);
    expect(groupHeatmapTiles([normalized!], "direction", labels)[0]?.key).toBe("unavailable");
  });

  it("calculates weighted change from available quotes only", () => {
    const missing = { ...tile("X", "Other", 99, 0), available: false };
    expect(weightedHeatmapChange([tile("RY", "Financials", 2, 2), tile("TD", "Financials", 1, -1), missing])).toBeCloseTo(1);
  });
});
