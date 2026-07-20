"use client";

import {
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

type RawTile = {
  ticker?: unknown;
  symbol?: unknown;
  name?: unknown;
  sector?: unknown;
  weight?: unknown;
  price?: unknown;
  change_percent?: unknown;
  delayed?: unknown;
};

type Tile = {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  weight: number;
  price: number;
  changePercent: number;
  delayed: boolean;
};

type Group = {
  key: string;
  label: string;
  tiles: Tile[];
  weight: number;
  changePercent: number;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutItem<T> = {
  item: T;
  rect: Rect;
};

type AreaItem<T> = {
  item: T;
  area: number;
};

type Mode = "sector" | "flat" | "direction";

const VIEW_WIDTH = 1440;
const VIEW_HEIGHT = 660;
const OUTER_GAP = 5;
const SECTOR_INSET = 3;
const MIN_TILE_WEIGHT = 0.16;
const UNKNOWN_SECTOR = "Autres";

const MODE_LABELS: Record<Mode, string> = {
  sector: "Par secteur",
  flat: "Sans regroupement",
  direction: "Gagnants / perdants",
};

const SECTOR_LABELS: Record<
  string,
  { full: string; medium: string; short: string }
> = {
  Financials: {
    full: "Services financiers",
    medium: "Finances",
    short: "FIN",
  },
  Energy: {
    full: "Énergie",
    medium: "Énergie",
    short: "ÉNER",
  },
  Materials: {
    full: "Matériaux",
    medium: "Matériaux",
    short: "MAT",
  },
  "Information Technology": {
    full: "Technologies",
    medium: "Technologies",
    short: "TECH",
  },
  Industrials: {
    full: "Industries",
    medium: "Industries",
    short: "IND",
  },
  "Consumer Staples": {
    full: "Consommation de base",
    medium: "Conso. de base",
    short: "BASE",
  },
  "Consumer Discretionary": {
    full: "Consommation discrétionnaire",
    medium: "Conso. discrétionnaire",
    short: "DISC",
  },
  Utilities: {
    full: "Services publics",
    medium: "Services publics",
    short: "UTIL",
  },
  Communication: {
    full: "Communications",
    medium: "Communications",
    short: "COM",
  },
  "Communication Services": {
    full: "Communications",
    medium: "Communications",
    short: "COM",
  },
  "Real Estate": {
    full: "Immobilier",
    medium: "Immobilier",
    short: "IMMO",
  },
  Healthcare: {
    full: "Santé",
    medium: "Santé",
    short: "SANTÉ",
  },
  "Health Care": {
    full: "Santé",
    medium: "Santé",
    short: "SANTÉ",
  },
};

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTile(raw: unknown): Tile | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as RawTile;
  const ticker = asText(
    source.ticker,
    asText(source.symbol),
  ).toUpperCase();

  if (!ticker) {
    return null;
  }

  const symbol = asText(
    source.symbol,
    ticker.replace(/\.TO$/i, ""),
  ).toUpperCase();

  return {
    ticker,
    symbol,
    name: asText(source.name, symbol),
    sector: asText(source.sector, UNKNOWN_SECTOR),
    weight: Math.max(asNumber(source.weight), 0),
    price: Math.max(asNumber(source.price), 0),
    changePercent: asNumber(source.change_percent),
    delayed: Boolean(source.delayed),
  };
}

function effectiveWeight(tile: Tile): number {
  return Math.max(tile.weight, MIN_TILE_WEIGHT);
}

function weightedChange(tiles: Tile[]): number {
  const total = tiles.reduce(
    (sum, tile) => sum + effectiveWeight(tile),
    0,
  );

  if (total <= 0) {
    return 0;
  }

  return (
    tiles.reduce(
      (sum, tile) =>
        sum + tile.changePercent * effectiveWeight(tile),
      0,
    ) / total
  );
}

function createGroup(
  key: string,
  label: string,
  tiles: Tile[],
): Group {
  const sorted = [...tiles].sort(
    (left, right) =>
      effectiveWeight(right) - effectiveWeight(left),
  );

  return {
    key,
    label,
    tiles: sorted,
    weight: sorted.reduce(
      (sum, tile) => sum + effectiveWeight(tile),
      0,
    ),
    changePercent: weightedChange(sorted),
  };
}

function buildGroups(tiles: Tile[], mode: Mode): Group[] {
  if (mode === "flat") {
    return [createGroup("market", "S&P/TSX 60", tiles)];
  }

  if (mode === "direction") {
    return [
      createGroup(
        "gainers",
        "Hausses",
        tiles.filter((tile) => tile.changePercent > 0.005),
      ),
      createGroup(
        "unchanged",
        "Inchangées",
        tiles.filter(
          (tile) =>
            tile.changePercent >= -0.005 &&
            tile.changePercent <= 0.005,
        ),
      ),
      createGroup(
        "losers",
        "Baisses",
        tiles.filter((tile) => tile.changePercent < -0.005),
      ),
    ].filter((group) => group.tiles.length > 0);
  }

  const sectors = new Map<string, Tile[]>();

  for (const tile of tiles) {
    const current = sectors.get(tile.sector) ?? [];
    current.push(tile);
    sectors.set(tile.sector, current);
  }

  return [...sectors.entries()]
    .map(([sector, sectorTiles]) =>
      createGroup(sector, sector, sectorTiles),
    )
    .sort((left, right) => right.weight - left.weight);
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function rowWorst<T>(
  row: AreaItem<T>[],
  side: number,
): number {
  if (row.length === 0 || side <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const areas = row.map((entry) => entry.area);
  const sum = areas.reduce((total, area) => total + area, 0);
  const maximum = Math.max(...areas);
  const minimum = Math.min(...areas);
  const sideSquared = side * side;
  const sumSquared = sum * sum;

  return Math.max(
    (sideSquared * maximum) / sumSquared,
    sumSquared / (sideSquared * minimum),
  );
}

function layoutRow<T>(
  row: AreaItem<T>[],
  rect: Rect,
): {
  layouts: LayoutItem<T>[];
  remaining: Rect;
} {
  const rowArea = row.reduce(
    (total, entry) => total + entry.area,
    0,
  );

  if (rect.width >= rect.height) {
    const rowHeight = clamp(
      rowArea / Math.max(rect.width, 1),
      0,
      rect.height,
    );
    let x = rect.x;

    const layouts = row.map((entry, index) => {
      const width =
        index === row.length - 1
          ? rect.x + rect.width - x
          : entry.area / Math.max(rowHeight, 0.0001);

      const itemRect = {
        x,
        y: rect.y,
        width: Math.max(width, 0),
        height: Math.max(rowHeight, 0),
      };

      x += width;

      return {
        item: entry.item,
        rect: itemRect,
      };
    });

    return {
      layouts,
      remaining: {
        x: rect.x,
        y: rect.y + rowHeight,
        width: rect.width,
        height: Math.max(rect.height - rowHeight, 0),
      },
    };
  }

  const rowWidth = clamp(
    rowArea / Math.max(rect.height, 1),
    0,
    rect.width,
  );
  let y = rect.y;

  const layouts = row.map((entry, index) => {
    const height =
      index === row.length - 1
        ? rect.y + rect.height - y
        : entry.area / Math.max(rowWidth, 0.0001);

    const itemRect = {
      x: rect.x,
      y,
      width: Math.max(rowWidth, 0),
      height: Math.max(height, 0),
    };

    y += height;

    return {
      item: entry.item,
      rect: itemRect,
    };
  });

  return {
    layouts,
    remaining: {
      x: rect.x + rowWidth,
      y: rect.y,
      width: Math.max(rect.width - rowWidth, 0),
      height: rect.height,
    },
  };
}

/**
 * Treemap "squarified" :
 * réduit les rectangles trop longs ou trop étroits et garde une
 * présentation stable et professionnelle sur les écrans larges.
 */
function squarifiedTreemap<T>(
  items: T[],
  getWeight: (item: T) => number,
  rect: Rect,
): LayoutItem<T>[] {
  if (items.length === 0) {
    return [];
  }

  const totalWeight = items.reduce(
    (total, item) =>
      total + Math.max(getWeight(item), 0.0001),
    0,
  );
  const scale =
    (rect.width * rect.height) /
    Math.max(totalWeight, 0.0001);

  const remainingItems: AreaItem<T>[] = [...items]
    .sort(
      (left, right) =>
        getWeight(right) - getWeight(left),
    )
    .map((item) => ({
      item,
      area: Math.max(getWeight(item), 0.0001) * scale,
    }));

  const output: LayoutItem<T>[] = [];
  let currentRect = { ...rect };
  let row: AreaItem<T>[] = [];

  while (remainingItems.length > 0) {
    const next = remainingItems[0];
    const side = Math.max(
      Math.min(currentRect.width, currentRect.height),
      0.0001,
    );

    if (
      row.length === 0 ||
      rowWorst([...row, next], side) <= rowWorst(row, side)
    ) {
      row.push(next);
      remainingItems.shift();
      continue;
    }

    const laidOut = layoutRow(row, currentRect);
    output.push(...laidOut.layouts);
    currentRect = laidOut.remaining;
    row = [];
  }

  if (row.length > 0) {
    const laidOut = layoutRow(row, currentRect);
    output.push(...laidOut.layouts);
  }

  return output;
}

function marketColor(changePercent: number): string {
  const normalized = clamp(changePercent / 5, -1, 1);
  const magnitude = Math.abs(normalized);

  if (Math.abs(changePercent) < 0.08) {
    return "hsl(210 26% 36%)";
  }

  if (normalized > 0) {
    const saturation = 48 + magnitude * 34;
    const lightness = 24 + magnitude * 15;
    return `hsl(163 ${saturation}% ${lightness}%)`;
  }

  const saturation = 35 + magnitude * 38;
  const lightness = 27 + magnitude * 12;
  return `hsl(346 ${saturation}% ${lightness}%)`;
}

function formatChange(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPrice(value: number): string {
  return value.toLocaleString("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatWeight(value: number): string {
  return `${value.toFixed(2)}%`;
}

function insetRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x + amount,
    y: rect.y + amount,
    width: Math.max(rect.width - amount * 2, 1),
    height: Math.max(rect.height - amount * 2, 1),
  };
}

function sectorLabel(
  sector: string,
  width: number,
): string {
  const translated = SECTOR_LABELS[sector];

  if (!translated) {
    if (width > 180) {
      return sector;
    }

    return sector.slice(0, width > 100 ? 15 : 6);
  }

  if (width > 230) {
    return translated.full;
  }

  if (width > 125) {
    return translated.medium;
  }

  return translated.short;
}

function tilePresentation(rect: Rect): {
  symbolSize: number;
  changeSize: number;
  showChange: boolean;
  centered: boolean;
} {
  const minSide = Math.min(rect.width, rect.height);
  const area = rect.width * rect.height;

  if (minSide < 26 || area < 1_250) {
    return {
      symbolSize: 8,
      changeSize: 0,
      showChange: false,
      centered: true,
    };
  }

  if (minSide < 46 || area < 3_700) {
    return {
      symbolSize: 10,
      changeSize: 8,
      showChange: true,
      centered: false,
    };
  }

  if (minSide > 105 && area > 15_000) {
    return {
      symbolSize: 20,
      changeSize: 14,
      showChange: true,
      centered: true,
    };
  }

  return {
    symbolSize: 13,
    changeSize: 10,
    showChange: true,
    centered: false,
  };
}

export function MarketHeatmap({
  tiles,
}: {
  tiles: readonly unknown[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sector");
  const [expandedGroup, setExpandedGroup] =
    useState<string | null>(null);
  const [hoveredTile, setHoveredTile] =
    useState<Tile | null>(null);

  const normalizedTiles = useMemo(
    () =>
      tiles
        .map(normalizeTile)
        .filter((tile): tile is Tile => tile !== null),
    [tiles],
  );

  const groups = useMemo(
    () => buildGroups(normalizedTiles, mode),
    [mode, normalizedTiles],
  );

  const visibleGroups = useMemo(() => {
    if (!expandedGroup) {
      return groups;
    }

    return groups.filter(
      (group) => group.key === expandedGroup,
    );
  }, [expandedGroup, groups]);

  const sectorLayout = useMemo(
    () =>
      squarifiedTreemap(
        visibleGroups,
        (group) => Math.max(group.weight, 0.0001),
        {
          x: OUTER_GAP,
          y: OUTER_GAP,
          width: VIEW_WIDTH - OUTER_GAP * 2,
          height: VIEW_HEIGHT - OUTER_GAP * 2,
        },
      ),
    [visibleGroups],
  );

  function openTicker(tile: Tile): void {
    router.push(
      `/focus/${encodeURIComponent(tile.symbol)}`,
    );
  }

  function handleTileKey(
    event: KeyboardEvent<SVGGElement>,
    tile: Tile,
  ): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openTicker(tile);
    }
  }

  if (normalizedTiles.length === 0) {
    return (
      <section
        className="panel"
        style={{
          minHeight: 260,
          display: "grid",
          placeItems: "center",
          color: "var(--muted)",
        }}
      >
        Aucun titre disponible pour la carte.
      </section>
    );
  }

  const sectionStyle: CSSProperties = {
    display: "grid",
    gap: 9,
    padding: 13,
    overflow: "hidden",
  };

  const activeSector =
    hoveredTile &&
    (SECTOR_LABELS[hoveredTile.sector]?.full ??
      hoveredTile.sector);

  return (
    <section className="panel" style={sectionStyle}>
      <header
        style={{
          minHeight: 44,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <span className="eyebrow">
            CARTE DU MARCHÉ
          </span>
          <h2
            style={{
              margin: "3px 0 0",
              fontSize: "clamp(21px, 2vw, 29px)",
            }}
          >
            S&amp;P/TSX 60
          </h2>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            aria-label="Échelle des variations"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#7f9db2",
              fontSize: 9,
            }}
          >
            <span>-5%</span>
            <span
              style={{
                width: 98,
                height: 6,
                borderRadius: 999,
                background:
                  "linear-gradient(90deg, hsl(346 72% 39%), hsl(210 26% 36%), hsl(163 82% 39%))",
                boxShadow:
                  "inset 0 0 0 1px rgba(255,255,255,.12)",
              }}
            />
            <span>+5%</span>
          </div>

          <select
            aria-label="Regroupement de la carte"
            value={mode}
            onChange={(
              event: ChangeEvent<HTMLSelectElement>,
            ) => {
              setMode(event.target.value as Mode);
              setExpandedGroup(null);
              setHoveredTile(null);
            }}
            style={{
              height: 34,
              minWidth: 178,
              padding: "0 30px 0 10px",
              border: "1px solid var(--border)",
              borderRadius: 9,
              background: "rgba(5, 18, 29, 0.95)",
              color: "var(--text)",
              fontSize: 11,
            }}
          >
            {Object.entries(MODE_LABELS).map(
              ([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ),
            )}
          </select>

          {expandedGroup ? (
            <button
              type="button"
              onClick={() => setExpandedGroup(null)}
              style={{
                height: 34,
                padding: "0 11px",
                border: "1px solid var(--border)",
                borderRadius: 9,
                background: "rgba(5, 18, 29, 0.95)",
                color: "var(--text)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Voir tout le TSX 60
            </button>
          ) : (
            <span
              style={{
                color: "#77a6c6",
                fontSize: 10,
              }}
            >
              Clique sur un secteur pour l’agrandir
            </span>
          )}
        </div>
      </header>

      <div
        style={{
          minHeight: 25,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "4px 9px",
          border: "1px solid rgba(42, 82, 105, 0.55)",
          borderRadius: 7,
          background: "rgba(7, 24, 35, 0.72)",
          color: hoveredTile ? "#ddecf5" : "#728fa3",
          fontSize: 10,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {hoveredTile ? (
          <>
            <strong>{hoveredTile.symbol}</strong>
            <span>{activeSector}</span>
            <span>{formatChange(hoveredTile.changePercent)}</span>
            <span>{formatPrice(hoveredTile.price)}</span>
            <span>Poids : {formatWeight(hoveredTile.weight)}</span>
            {hoveredTile.delayed ? (
              <span>Données différées</span>
            ) : null}
          </>
        ) : (
          "Survole un titre pour afficher ses données."
        )}
      </div>

      <div
        style={{
          width: "100%",
          overflowX: "auto",
          overflowY: "hidden",
          border: "1px solid rgba(45, 83, 105, 0.88)",
          borderRadius: 11,
          background:
            "linear-gradient(145deg, rgba(19, 34, 44, 0.99), rgba(7, 20, 29, 0.99))",
        }}
      >
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Carte sectorielle du S&P TSX 60"
          onMouseLeave={() => setHoveredTile(null)}
          style={{
            width: "100%",
            minWidth: 920,
            height: "auto",
            aspectRatio: `${VIEW_WIDTH} / ${VIEW_HEIGHT}`,
            display: "block",
          }}
        >
          <defs>
            <linearGradient
              id="tile-sheen"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="#ffffff"
                stopOpacity="0.055"
              />
              <stop
                offset="42%"
                stopColor="#ffffff"
                stopOpacity="0.012"
              />
              <stop
                offset="100%"
                stopColor="#000000"
                stopOpacity="0.07"
              />
            </linearGradient>
          </defs>

          {sectorLayout.map(({ item: group, rect }) => {
            const sectorRect = insetRect(rect, 2.6);
            const headerHeight = Math.min(
              27,
              Math.max(19, sectorRect.height * 0.105),
            );
            const accentColor = marketColor(
              group.changePercent,
            );

            const stocksRect: Rect = {
              x: sectorRect.x + SECTOR_INSET,
              y:
                sectorRect.y +
                headerHeight +
                SECTOR_INSET,
              width: Math.max(
                sectorRect.width - SECTOR_INSET * 2,
                1,
              ),
              height: Math.max(
                sectorRect.height -
                  headerHeight -
                  SECTOR_INSET * 2,
                1,
              ),
            };

            const stockLayout = squarifiedTreemap(
              group.tiles,
              effectiveWeight,
              stocksRect,
            );

            const showSectorChange =
              sectorRect.width > 112;
            const changePillWidth =
              sectorRect.width > 170 ? 58 : 48;

            return (
              <g key={group.key}>
                <rect
                  x={sectorRect.x}
                  y={sectorRect.y}
                  width={sectorRect.width}
                  height={sectorRect.height}
                  rx={4}
                  fill="rgba(6, 22, 32, 0.98)"
                  stroke="rgba(23, 58, 79, 0.98)"
                  strokeWidth={1.8}
                />

                <g
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setExpandedGroup((current) =>
                      current === group.key
                        ? null
                        : group.key,
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" ||
                      event.key === " "
                    ) {
                      event.preventDefault();
                      setExpandedGroup((current) =>
                        current === group.key
                          ? null
                          : group.key,
                      );
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    x={sectorRect.x + 1}
                    y={sectorRect.y + 1}
                    width={Math.max(
                      sectorRect.width - 2,
                      1,
                    )}
                    height={Math.max(headerHeight - 1, 1)}
                    rx={3}
                    fill="rgba(10, 34, 48, 0.98)"
                    stroke="none"
                  />

                  <rect
                    x={sectorRect.x + 1}
                    y={sectorRect.y + 1}
                    width={4}
                    height={Math.max(headerHeight - 1, 1)}
                    rx={2}
                    fill={accentColor}
                    stroke="none"
                  />

                  <text
                    x={sectorRect.x + 10}
                    y={
                      sectorRect.y +
                      headerHeight / 2 +
                      4
                    }
                    fill="#eaf6fd"
                    fontSize={Math.min(
                      11.5,
                      Math.max(
                        7.5,
                        sectorRect.width / 24,
                      ),
                    )}
                    fontWeight={760}
                    pointerEvents="none"
                  >
                    {sectorLabel(
                      group.label,
                      sectorRect.width,
                    )}
                  </text>

                  {showSectorChange ? (
                    <>
                      <rect
                        x={
                          sectorRect.x +
                          sectorRect.width -
                          changePillWidth -
                          6
                        }
                        y={sectorRect.y + 4}
                        width={changePillWidth}
                        height={Math.max(
                          headerHeight - 8,
                          12,
                        )}
                        rx={8}
                        fill={accentColor}
                        opacity={0.96}
                        stroke="rgba(255,255,255,.08)"
                        strokeWidth={0.7}
                      />
                      <text
                        x={
                          sectorRect.x +
                          sectorRect.width -
                          changePillWidth / 2 -
                          6
                        }
                        y={
                          sectorRect.y +
                          headerHeight / 2 +
                          3
                        }
                        fill="#ffffff"
                        fontSize={8.5}
                        fontWeight={850}
                        textAnchor="middle"
                        pointerEvents="none"
                      >
                        {formatChange(
                          group.changePercent,
                        )}
                      </text>
                    </>
                  ) : null}
                </g>

                {stockLayout.map(
                  ({ item: tile, rect: rawTileRect }) => {
                    const tileRect = insetRect(
                      rawTileRect,
                      1.7,
                    );
                    const presentation =
                      tilePresentation(tileRect);
                    const isHovered =
                      hoveredTile?.ticker === tile.ticker;

                    const textX = presentation.centered
                      ? tileRect.x + tileRect.width / 2
                      : tileRect.x + 7;
                    const textAnchor = presentation.centered
                      ? "middle"
                      : "start";
                    const symbolY = presentation.centered
                      ? tileRect.y +
                        tileRect.height / 2 -
                        (presentation.showChange ? 2 : -3)
                      : tileRect.y +
                        presentation.symbolSize +
                        6;

                    return (
                      <g
                        key={tile.ticker}
                        role="link"
                        tabIndex={0}
                        onClick={() => openTicker(tile)}
                        onKeyDown={(event) =>
                          handleTileKey(event, tile)
                        }
                        onMouseEnter={() =>
                          setHoveredTile(tile)
                        }
                        onFocus={() => setHoveredTile(tile)}
                        onBlur={() => setHoveredTile(null)}
                        style={{ cursor: "pointer" }}
                        aria-label={`${tile.symbol}, ${tile.name}, ${formatChange(
                          tile.changePercent,
                        )}`}
                      >
                        <title>
                          {`${tile.symbol} · ${tile.name} · ${formatPrice(
                            tile.price,
                          )} · ${formatChange(
                            tile.changePercent,
                          )}`}
                        </title>

                        <rect
                          x={tileRect.x}
                          y={tileRect.y}
                          width={tileRect.width}
                          height={tileRect.height}
                          rx={2.5}
                          fill={marketColor(
                            tile.changePercent,
                          )}
                          stroke={
                            isHovered
                              ? "rgba(255,255,255,0.96)"
                              : "rgba(3, 18, 27, 0.98)"
                          }
                          strokeWidth={
                            isHovered ? 2.2 : 1.2
                          }
                        />

                        <rect
                          x={tileRect.x}
                          y={tileRect.y}
                          width={tileRect.width}
                          height={tileRect.height}
                          rx={2.5}
                          fill="url(#tile-sheen)"
                          pointerEvents="none"
                        />

                        <text
                          x={textX}
                          y={symbolY}
                          fill="#ffffff"
                          fontSize={
                            presentation.symbolSize
                          }
                          fontWeight={880}
                          textAnchor={textAnchor}
                          dominantBaseline={
                            presentation.centered
                              ? "middle"
                              : "auto"
                          }
                          pointerEvents="none"
                        >
                          {tile.symbol}
                        </text>

                        {presentation.showChange ? (
                          <text
                            x={textX}
                            y={
                              presentation.centered
                                ? symbolY +
                                  presentation.changeSize +
                                  8
                                : symbolY +
                                  presentation.changeSize +
                                  3
                            }
                            fill="rgba(255,255,255,.92)"
                            fontSize={
                              presentation.changeSize
                            }
                            fontWeight={720}
                            textAnchor={textAnchor}
                            dominantBaseline={
                              presentation.centered
                                ? "middle"
                                : "auto"
                            }
                            pointerEvents="none"
                          >
                            {formatChange(
                              tile.changePercent,
                            )}
                          </text>
                        ) : null}
                      </g>
                    );
                  },
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
