"use client";

import {
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

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 690;
const OUTER_GAP = 5;
const SECTOR_HEADER_HEIGHT = 25;
const SECTOR_INSET = 4;
const MIN_TILE_WEIGHT = 0.18;
const UNKNOWN_SECTOR = "Autres";

const MODE_LABELS: Record<Mode, string> = {
  sector: "Par secteur",
  flat: "Sans regroupement",
  direction: "Gagnants / perdants",
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

/**
 * Treemap binaire sans dépendance :
 * toutes les coordonnées sont calculées dans le même repère SVG.
 * Aucun bloc ne peut donc se transformer en liste verticale.
 */
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
  const intensity = clamp(Math.abs(changePercent) / 4.5, 0.08, 1);

  if (changePercent > 0.005) {
    const lightness = 27 + intensity * 12;
    return `hsl(165 69% ${lightness}%)`;
  }

  if (changePercent < -0.005) {
    const lightness = 29 + intensity * 11;
    return `hsl(346 48% ${lightness}%)`;
  }

  return "hsl(213 25% 38%)";
}

function sectorColor(changePercent: number): string {
  if (changePercent > 0.005) {
    return "rgba(12, 111, 91, 0.95)";
  }

  if (changePercent < -0.005) {
    return "rgba(108, 56, 75, 0.95)";
  }

  return "rgba(52, 83, 105, 0.95)";
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

function tileTextSize(rect: Rect): {
  symbol: number;
  change: number;
  showChange: boolean;
  showPrice: boolean;
} {
  const minSide = Math.min(rect.width, rect.height);
  const area = rect.width * rect.height;

  if (minSide < 31 || area < 1_650) {
    return {
      symbol: 9,
      change: 0,
      showChange: false,
      showPrice: false,
    };
  }

  if (minSide < 52 || area < 4_300) {
    return {
      symbol: 11,
      change: 9,
      showChange: true,
      showPrice: false,
    };
  }

  if (minSide > 115 && area > 19_000) {
    return {
      symbol: 18,
      change: 14,
      showChange: true,
      showPrice: true,
    };
  }

  return {
    symbol: 13,
    change: 11,
    showChange: true,
    showPrice: area > 8_000,
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

export function MarketHeatmap({
  tiles,
}: {
  tiles: readonly unknown[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sector");
  const [expandedGroup, setExpandedGroup] =
    useState<string | null>(null);

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
    gap: 10,
    padding: 14,
    overflow: "hidden",
  };

  const canvasStyle: CSSProperties = {
    width: "100%",
    height: "clamp(500px, 62vh, 690px)",
    display: "block",
    overflow: "hidden",
    border: "1px solid rgba(92, 126, 148, 0.66)",
    borderRadius: 10,
    background:
      "linear-gradient(145deg, rgba(54, 58, 64, 0.98), rgba(28, 38, 47, 0.99))",
  };

  return (
    <section className="panel" style={sectionStyle}>
      <header
        style={{
          minHeight: 42,
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
          <select
            aria-label="Regroupement de la carte"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as Mode);
              setExpandedGroup(null);
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

      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Carte sectorielle du S&P TSX 60"
        style={canvasStyle}
      >
        {sectorLayout.map(({ item: group, rect }) => {
          const sectorRect = insetRect(rect, 1.5);
          const headerHeight = Math.min(
            SECTOR_HEADER_HEIGHT,
            Math.max(18, sectorRect.height * 0.12),
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
                fill="rgba(50, 58, 65, 0.82)"
                stroke="rgba(232, 238, 242, 0.82)"
                strokeWidth={1.7}
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
                  x={sectorRect.x}
                  y={sectorRect.y}
                  width={sectorRect.width}
                  height={headerHeight}
                  fill={sectorColor(group.changePercent)}
                  stroke="rgba(232, 238, 242, 0.72)"
                  strokeWidth={1}
                />
                <text
                  x={sectorRect.x + 7}
                  y={
                    sectorRect.y +
                    headerHeight / 2 +
                    4
                  }
                  fill="#ffffff"
                  fontSize={Math.min(
                    12,
                    Math.max(8, sectorRect.width / 22),
                  )}
                  fontWeight={700}
                  pointerEvents="none"
                >
                  {group.label}
                </text>

                {sectorRect.width > 125 ? (
                  <text
                    x={
                      sectorRect.x +
                      sectorRect.width -
                      7
                    }
                    y={
                      sectorRect.y +
                      headerHeight / 2 +
                      4
                    }
                    fill="#ffffff"
                    fontSize={9}
                    fontWeight={800}
                    textAnchor="end"
                    pointerEvents="none"
                  >
                    {formatChange(
                      group.changePercent,
                    )}
                  </text>
                ) : null}
              </g>

              {stockLayout.map(
                ({ item: tile, rect: rawTileRect }) => {
                  const tileRect = insetRect(
                    rawTileRect,
                    1.4,
                  );
                  const textSize = tileTextSize(tileRect);
                  const textX = tileRect.x + 6;
                  const textY = tileRect.y + textSize.symbol + 5;

                  return (
                    <g
                      key={tile.ticker}
                      role="link"
                      tabIndex={0}
                      onClick={() => openTicker(tile)}
                      onKeyDown={(event) =>
                        handleTileKey(event, tile)
                      }
                      style={{ cursor: "pointer" }}
                    >
                      <title>
                        {`${tile.name} · ${group.label} · ${formatPrice(
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
                        rx={1}
                        fill={marketColor(
                          tile.changePercent,
                        )}
                        stroke="rgba(238, 242, 245, 0.88)"
                        strokeWidth={1.4}
                      />

                      <text
                        x={textX}
                        y={textY}
                        fill="#ffffff"
                        fontSize={textSize.symbol}
                        fontWeight={850}
                        pointerEvents="none"
                      >
                        {tile.symbol}
                      </text>

                      {textSize.showChange ? (
                        <text
                          x={textX}
                          y={
                            textY +
                            textSize.change +
                            3
                          }
                          fill="#ffffff"
                          fontSize={textSize.change}
                          fontWeight={700}
                          pointerEvents="none"
                        >
                          {formatChange(
                            tile.changePercent,
                          )}
                        </text>
                      ) : null}

                      {textSize.showPrice ? (
                        <text
                          x={textX}
                          y={
                            textY +
                            textSize.change +
                            16
                          }
                          fill="rgba(245, 249, 252, 0.82)"
                          fontSize={8}
                          pointerEvents="none"
                        >
                          {formatPrice(tile.price)}
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
    </section>
  );
}
