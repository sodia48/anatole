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

type Mode = "sector" | "flat" | "direction";

const VIEW_WIDTH = 1440;
const VIEW_HEIGHT = 620;
const OUTER_GAP = 5;
const SECTOR_INSET = 3;
const MIN_TILE_WEIGHT = 0.18;
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

function binaryTreemap<T>(
  items: T[],
  getWeight: (item: T) => number,
  rect: Rect,
): LayoutItem<T>[] {
  if (items.length === 0) {
    return [];
  }

  if (items.length === 1) {
    return [{ item: items[0], rect }];
  }

  const sorted = [...items].sort(
    (left, right) => getWeight(right) - getWeight(left),
  );

  const weights = sorted.map((item) =>
    Math.max(getWeight(item), 0.0001),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const target = total / 2;

  let running = 0;
  let splitIndex = 1;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const before = running;
    running += weights[index];
    splitIndex = index + 1;

    if (running >= target) {
      if (
        index > 0 &&
        Math.abs(target - before) < Math.abs(target - running)
      ) {
        splitIndex = index;
      }
      break;
    }
  }

  const first = sorted.slice(0, splitIndex);
  const second = sorted.slice(splitIndex);

  const firstWeight = first.reduce(
    (sum, item) => sum + Math.max(getWeight(item), 0.0001),
    0,
  );
  const ratio = clamp(firstWeight / total, 0.06, 0.94);

  if (rect.width >= rect.height) {
    const firstWidth = rect.width * ratio;

    return [
      ...binaryTreemap(first, getWeight, {
        x: rect.x,
        y: rect.y,
        width: firstWidth,
        height: rect.height,
      }),
      ...binaryTreemap(second, getWeight, {
        x: rect.x + firstWidth,
        y: rect.y,
        width: rect.width - firstWidth,
        height: rect.height,
      }),
    ];
  }

  const firstHeight = rect.height * ratio;

  return [
    ...binaryTreemap(first, getWeight, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: firstHeight,
    }),
    ...binaryTreemap(second, getWeight, {
      x: rect.x,
      y: rect.y + firstHeight,
      width: rect.width,
      height: rect.height - firstHeight,
    }),
  ];
}

function marketColor(changePercent: number): string {
  const normalized = clamp(changePercent / 5, -1, 1);
  const magnitude = Math.abs(normalized);

  if (Math.abs(changePercent) < 0.08) {
    return "hsl(210 27% 37%)";
  }

  if (normalized > 0) {
    const saturation = 50 + magnitude * 32;
    const lightness = 25 + magnitude * 15;
    return `hsl(163 ${saturation}% ${lightness}%)`;
  }

  const saturation = 34 + magnitude * 38;
  const lightness = 27 + magnitude * 13;
  return `hsl(346 ${saturation}% ${lightness}%)`;
}

function headerColor(changePercent: number): string {
  if (Math.abs(changePercent) < 0.08) {
    return "rgba(34, 66, 85, 0.96)";
  }

  return changePercent > 0
    ? "rgba(9, 96, 77, 0.96)"
    : "rgba(94, 47, 65, 0.96)";
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

function tileTextSize(rect: Rect): {
  symbol: number;
  change: number;
  showChange: boolean;
  centered: boolean;
} {
  const minSide = Math.min(rect.width, rect.height);
  const area = rect.width * rect.height;

  if (minSide < 25 || area < 1_250) {
    return {
      symbol: 8,
      change: 0,
      showChange: false,
      centered: true,
    };
  }

  if (minSide < 46 || area < 3_700) {
    return {
      symbol: 10,
      change: 8,
      showChange: true,
      centered: false,
    };
  }

  if (minSide > 110 && area > 18_000) {
    return {
      symbol: 20,
      change: 14,
      showChange: true,
      centered: true,
    };
  }

  return {
    symbol: 13,
    change: 10,
    showChange: true,
    centered: false,
  };
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
    if (width > 170) {
      return sector;
    }

    return sector.slice(0, width > 95 ? 15 : 6);
  }

  if (width > 210) {
    return translated.full;
  }

  if (width > 115) {
    return translated.medium;
  }

  return translated.short;
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
  const [hoveredTile, setHoveredTile] = useState<Tile | null>(
    null,
  );

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
      binaryTreemap(
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

  const canvasStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    display: "block",
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
          <span className="eyebrow">CARTE DU MARCHÉ</span>
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
            gap: 9,
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
                width: 94,
                height: 6,
                borderRadius: 999,
                background:
                  "linear-gradient(90deg, hsl(346 72% 39%), hsl(210 27% 37%), hsl(163 82% 40%))",
                boxShadow:
                  "inset 0 0 0 1px rgba(255,255,255,.12)",
              }}
            />
            <span>+5%</span>
          </div>

          <select
            aria-label="Regroupement de la carte"
            value={mode}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
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
          minHeight: 24,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "3px 8px",
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
            <span>{hoveredTile.name}</span>
            <span>{activeSector}</span>
            <span>{formatPrice(hoveredTile.price)}</span>
            <span>{formatChange(hoveredTile.changePercent)}</span>
            <span>Poids : {formatWeight(hoveredTile.weight)}</span>
            {hoveredTile.delayed ? <span>Données différées</span> : null}
          </>
        ) : (
          "Survole un titre pour afficher ses détails."
        )}
      </div>

      <div
        style={{
          width: "100%",
          overflowX: "auto",
          overflowY: "hidden",
          border: "1px solid rgba(45, 83, 105, 0.88)",
          borderRadius: 10,
          background:
            "linear-gradient(145deg, rgba(30, 43, 53, 0.98), rgba(17, 28, 37, 0.99))",
        }}
      >
        <div
          style={{
            width: "100%",
            minWidth: 920,
            aspectRatio: `${VIEW_WIDTH} / ${VIEW_HEIGHT}`,
          }}
        >
          <svg
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Carte sectorielle du S&P TSX 60"
            style={canvasStyle}
            onMouseLeave={() => setHoveredTile(null)}
          >
        {sectorLayout.map(({ item: group, rect }) => {
          const sectorRect = insetRect(rect, 2.2);
          const headerHeight = Math.min(
            24,
            Math.max(17, sectorRect.height * 0.11),
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

          const stockLayout = binaryTreemap(
            group.tiles,
            effectiveWeight,
            stocksRect,
          );

          return (
            <g key={group.key}>
              <rect
                x={sectorRect.x}
                y={sectorRect.y}
                width={sectorRect.width}
                height={sectorRect.height}
                rx={2}
                fill="rgba(16, 31, 41, 0.96)"
                stroke="rgba(24, 57, 76, 0.98)"
                strokeWidth={2.4}
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
                  width={Math.max(sectorRect.width - 2, 1)}
                  height={Math.max(headerHeight - 1, 1)}
                  rx={1.5}
                  fill={headerColor(group.changePercent)}
                  stroke="none"
                />

                <text
                  x={sectorRect.x + 7}
                  y={
                    sectorRect.y +
                    headerHeight / 2 +
                    3.5
                  }
                  fill="#ffffff"
                  fontSize={Math.min(
                    11,
                    Math.max(7.5, sectorRect.width / 23),
                  )}
                  fontWeight={750}
                  pointerEvents="none"
                >
                  {sectorLabel(group.label, sectorRect.width)}
                </text>

                {sectorRect.width > 105 ? (
                  <text
                    x={
                      sectorRect.x +
                      sectorRect.width -
                      7
                    }
                    y={
                      sectorRect.y +
                      headerHeight / 2 +
                      3.5
                    }
                    fill="#ffffff"
                    fontSize={8}
                    fontWeight={800}
                    textAnchor="end"
                    pointerEvents="none"
                  >
                    {formatChange(group.changePercent)}
                  </text>
                ) : null}
              </g>

              {stockLayout.map(
                ({ item: tile, rect: rawTileRect }) => {
                  const tileRect = insetRect(
                    rawTileRect,
                    1.35,
                  );
                  const textSize = tileTextSize(tileRect);
                  const textX = tileRect.x + 5;
                  const textY = tileRect.y + textSize.symbol + 4;
                  const isHovered =
                    hoveredTile?.ticker === tile.ticker;

                  return (
                    <g
                      key={tile.ticker}
                      role="link"
                      tabIndex={0}
                      onClick={() => openTicker(tile)}
                      onKeyDown={(event) =>
                        handleTileKey(event, tile)
                      }
                      onMouseEnter={() => setHoveredTile(tile)}
                      onFocus={() => setHoveredTile(tile)}
                      onBlur={() => setHoveredTile(null)}
                      style={{ cursor: "pointer" }}
                    >
                      <title>
                        {`${tile.name} · ${group.label} · ${formatPrice(
                          tile.price,
                        )} · ${formatChange(
                          tile.changePercent,
                        )} · poids ${formatWeight(tile.weight)}`}
                      </title>

                      <rect
                        x={tileRect.x}
                        y={tileRect.y}
                        width={tileRect.width}
                        height={tileRect.height}
                        rx={1.5}
                        fill={marketColor(
                          tile.changePercent,
                        )}
                        stroke={
                          isHovered
                            ? "rgba(255,255,255,0.95)"
                            : "rgba(8, 26, 37, 0.95)"
                        }
                        strokeWidth={isHovered ? 2 : 1.15}
                      />

                      <text
                        x={
                          textSize.centered
                            ? tileRect.x + tileRect.width / 2
                            : textX
                        }
                        y={
                          textSize.centered
                            ? tileRect.y +
                              tileRect.height / 2 -
                              (textSize.showChange ? 3 : 0)
                            : textY
                        }
                        fill="#ffffff"
                        fontSize={textSize.symbol}
                        fontWeight={850}
                        textAnchor={
                          textSize.centered ? "middle" : "start"
                        }
                        dominantBaseline={
                          textSize.centered ? "middle" : "auto"
                        }
                        pointerEvents="none"
                      >
                        {tile.symbol}
                      </text>

                      {textSize.showChange ? (
                        <text
                          x={
                            textSize.centered
                              ? tileRect.x + tileRect.width / 2
                              : textX
                          }
                          y={
                            textSize.centered
                              ? tileRect.y +
                                tileRect.height / 2 +
                                textSize.change +
                                8
                              : textY +
                                textSize.change +
                                2
                          }
                          fill="rgba(255,255,255,0.92)"
                          fontSize={textSize.change}
                          fontWeight={700}
                          textAnchor={
                            textSize.centered ? "middle" : "start"
                          }
                          dominantBaseline={
                            textSize.centered ? "middle" : "auto"
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
      </div>
    </section>
  );
}
