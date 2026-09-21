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

  it("keeps exact market weight regardless of universe density", () => {
    const row = tile("RY", "Financials", 20, 1);
    expect(layoutTileWeight(row, 60)).toBe(20);
    expect(layoutTileWeight(row, 200)).toBe(20);
  });

  it("makes sector and company areas proportional to their real market weights", () => {
    const rows = [
      tile("RY", "Financials", 6, 1),
      tile("TD", "Financials", 4, -0.2),
      tile("CNQ", "Energy", 3, 0.5),
    ];
    const groups = groupHeatmapTiles(rows, "sector", labels);
    const financials = groups.find((group) => group.key === "Financials");
    const energy = groups.find((group) => group.key === "Energy");

    expect(financials?.layoutWeight).toBe(10);
    expect(energy?.layoutWeight).toBe(3);

    const sectorRects = binaryTreemap(
      groups.map((group) => ({ item: group, weight: group.layoutWeight })),
      { x: 0, y: 0, width: 130, height: 100 },
    );
    const financialRect = sectorRects.find(({ item }) => item.key === "Financials")?.rect;
    const energyRect = sectorRects.find(({ item }) => item.key === "Energy")?.rect;

    expect(financialRect).toBeDefined();
    expect(energyRect).toBeDefined();

    const financialArea = financialRect!.width * financialRect!.height;
    const energyArea = energyRect!.width * energyRect!.height;
    expect(financialArea / energyArea).toBeCloseTo(10 / 3, 5);

    const companyRects = binaryTreemap(
      financials!.tiles.map((company) => ({
        item: company,
        weight: layoutTileWeight(company, financials!.tiles.length),
      })),
      { x: 0, y: 0, width: 100, height: 100 },
    );
    const ryRect = companyRects.find(({ item }) => item.symbol === "RY")?.rect;
    const tdRect = companyRects.find(({ item }) => item.symbol === "TD")?.rect;

    expect(ryRect).toBeDefined();
    expect(tdRect).toBeDefined();

    const ryArea = ryRect!.width * ryRect!.height;
    const tdArea = tdRect!.width * tdRect!.height;
    expect(ryArea / tdArea).toBeCloseTo(6 / 4, 5);
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
