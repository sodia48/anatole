export type HeatmapGroupingMode = "sector" | "flat" | "direction";

export type HeatmapTileInput = {
  ticker?: unknown;
  symbol?: unknown;
  name?: unknown;
  sector?: unknown;
  weight?: unknown;
  price?: unknown;
  change?: unknown;
  change_percent?: unknown;
  volume?: unknown;
  source?: unknown;
  delayed?: unknown;
};

export type NormalizedHeatmapTile = {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  weight: number;
  price: number | null;
  changePercent: number;
  volume: number | null;
  available: boolean;
  delayed: boolean;
};

export type HeatmapGroup = {
  key: string;
  label: string;
  tiles: NormalizedHeatmapTile[];
  marketWeight: number;
  layoutWeight: number;
  changePercent: number;
  advancers: number;
  decliners: number;
};

export type HeatmapLabels = {
  fullMarket: string;
  gainers: string;
  unchanged: string;
  decliners: string;
  unknownSector?: string;
};

export type HeatmapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WeightedItem<T> = { item: T; weight: number };
export type PositionedItem<T> = { item: T; rect: HeatmapRect };

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number.parseFloat(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeHeatmapTile(
  raw: unknown,
  unknownSector = "Autres",
): NormalizedHeatmapTile | null {
  if (!raw || typeof raw !== "object") return null;
  const tile = raw as HeatmapTileInput;
  const ticker = text(tile.ticker, text(tile.symbol)).toUpperCase();
  if (!ticker) return null;

  const symbol = text(tile.symbol, ticker.replace(/\.TO$/i, "")).toUpperCase();
  const price = finiteNumber(tile.price);
  const changePercent = finiteNumber(tile.change_percent);
  const sourceAvailable = text(tile.source, "available") !== "unavailable";

  return {
    ticker,
    symbol,
    name: text(tile.name, symbol),
    sector: text(tile.sector, unknownSector),
    weight: Math.max(finiteNumber(tile.weight) ?? 0, 0),
    price: price === null ? null : Math.max(price, 0),
    changePercent: changePercent ?? 0,
    volume: finiteNumber(tile.volume),
    available: sourceAvailable && price !== null && changePercent !== null,
    delayed: Boolean(tile.delayed),
  };
}

export function marketWeight(tile: NormalizedHeatmapTile): number {
  return Math.max(tile.weight, 0.05);
}

export function layoutTileWeight(tile: NormalizedHeatmapTile, totalTiles: number): number {
  const exponent = totalTiles > 150 ? 0.31 : totalTiles > 90 ? 0.4 : 0.58;
  const floor = totalTiles > 150 ? 0.42 : totalTiles > 90 ? 0.32 : 0.22;
  return Math.pow(Math.max(tile.weight, floor), exponent);
}

export function weightedHeatmapChange(tiles: NormalizedHeatmapTile[]): number {
  const available = tiles.filter((tile) => tile.available);
  const totalWeight = available.reduce((total, tile) => total + marketWeight(tile), 0);
  if (totalWeight <= 0) return 0;
  return available.reduce(
    (total, tile) => total + tile.changePercent * marketWeight(tile),
    0,
  ) / totalWeight;
}

function buildGroup(
  key: string,
  label: string,
  tiles: NormalizedHeatmapTile[],
  totalTiles: number,
): HeatmapGroup {
  const sorted = [...tiles].sort(
    (left, right) => layoutTileWeight(right, totalTiles) - layoutTileWeight(left, totalTiles),
  );
  return {
    key,
    label,
    tiles: sorted,
    marketWeight: sorted.reduce((total, tile) => total + marketWeight(tile), 0),
    layoutWeight: sorted.reduce((total, tile) => total + layoutTileWeight(tile, totalTiles), 0),
    changePercent: weightedHeatmapChange(sorted),
    advancers: sorted.filter((tile) => tile.available && tile.changePercent > 0.005).length,
    decliners: sorted.filter((tile) => tile.available && tile.changePercent < -0.005).length,
  };
}

export function groupHeatmapTiles(
  tiles: NormalizedHeatmapTile[],
  mode: HeatmapGroupingMode,
  labels: HeatmapLabels,
): HeatmapGroup[] {
  const totalTiles = tiles.length;
  if (mode === "flat") return [buildGroup("market", labels.fullMarket, tiles, totalTiles)];
  if (mode === "direction") {
    const definitions = [
      { key: "gainers", label: labels.gainers, tiles: tiles.filter((tile) => tile.available && tile.changePercent > 0.005) },
      { key: "unchanged", label: labels.unchanged, tiles: tiles.filter((tile) => tile.available && tile.changePercent >= -0.005 && tile.changePercent <= 0.005) },
      { key: "losers", label: labels.decliners, tiles: tiles.filter((tile) => tile.available && tile.changePercent < -0.005) },
      { key: "unavailable", label: "N/D", tiles: tiles.filter((tile) => !tile.available) },
    ];
    return definitions
      .filter((definition) => definition.tiles.length > 0)
      .map((definition) => buildGroup(definition.key, definition.label, definition.tiles, totalTiles));
  }

  const sectors = new Map<string, NormalizedHeatmapTile[]>();
  for (const tile of tiles) {
    const sector = tile.sector || labels.unknownSector || "Autres";
    sectors.set(sector, [...(sectors.get(sector) ?? []), tile]);
  }
  return [...sectors.entries()]
    .map(([sector, sectorTiles]) => buildGroup(sector, sector, sectorTiles, totalTiles))
    .sort((left, right) => right.layoutWeight - left.layoutWeight);
}

export function binaryTreemap<T>(items: WeightedItem<T>[], rect: HeatmapRect): PositionedItem<T>[] {
  if (items.length === 0 || rect.width <= 0 || rect.height <= 0) return [];
  if (items.length === 1) return [{ item: items[0]!.item, rect }];
  const sorted = [...items].sort((left, right) => right.weight - left.weight);
  const totalWeight = sorted.reduce((total, entry) => total + Math.max(entry.weight, 0.001), 0);
  let firstWeight = 0;
  let splitIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < sorted.length; index += 1) {
    firstWeight += Math.max(sorted[index - 1]!.weight, 0.001);
    const distance = Math.abs(totalWeight / 2 - firstWeight);
    if (distance < bestDistance) {
      bestDistance = distance;
      splitIndex = index;
    }
  }
  const first = sorted.slice(0, splitIndex);
  const second = sorted.slice(splitIndex);
  const firstTotal = first.reduce((total, entry) => total + Math.max(entry.weight, 0.001), 0);
  const ratio = totalWeight > 0 ? firstTotal / totalWeight : 0.5;
  if (rect.width >= rect.height) {
    const firstWidth = rect.width * ratio;
    return [
      ...binaryTreemap(first, { x: rect.x, y: rect.y, width: firstWidth, height: rect.height }),
      ...binaryTreemap(second, { x: rect.x + firstWidth, y: rect.y, width: rect.width - firstWidth, height: rect.height }),
    ];
  }
  const firstHeight = rect.height * ratio;
  return [
    ...binaryTreemap(first, { x: rect.x, y: rect.y, width: rect.width, height: firstHeight }),
    ...binaryTreemap(second, { x: rect.x, y: rect.y + firstHeight, width: rect.width, height: rect.height - firstHeight }),
  ];
}

export function heatmapTileDetailLevel(
  rect: HeatmapRect,
  totalTiles: number,
  mobile: boolean,
): 0 | 1 | 2 | 3 {
  const area = rect.width * rect.height;
  const densityFactor = totalTiles > 150 ? 0.78 : totalTiles > 90 ? 0.9 : 1;
  if (rect.width < (mobile ? 12 : 18) * densityFactor || rect.height < (mobile ? 10 : 15) * densityFactor) return 0;
  if (rect.width < 30 || rect.height < 19 || area < 720) return 1;
  if (rect.width < 58 || rect.height < 34 || area < 2100) return 2;
  return 3;
}
