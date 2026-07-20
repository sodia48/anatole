"use client";

import Link from "next/link";
import {
  type ChangeEvent,
  type CSSProperties,
  useMemo,
  useState,
} from "react";

import styles from "./MarketHeatmap.module.css";

type GroupingMode = "sector" | "flat" | "direction";

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

type PositionedGroup = {
  group: Group;
  rect: Rect;
  headerHeight: number;
  tiles: LayoutItem<Tile>[];
};

type CSSVariables = CSSProperties &
  Record<`--${string}`, string | number>;

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 620;
const UNKNOWN_SECTOR = "Autres";

const MODE_LABELS: Record<GroupingMode, string> = {
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
  return Math.max(tile.weight, 0.18);
}

function weightedChange(tiles: Tile[]): number {
  const totalWeight = tiles.reduce(
    (total, tile) => total + effectiveWeight(tile),
    0,
  );

  if (totalWeight <= 0) {
    return 0;
  }

  return (
    tiles.reduce(
      (total, tile) =>
        total + tile.changePercent * effectiveWeight(tile),
      0,
    ) / totalWeight
  );
}

function createGroup(
  key: string,
  label: string,
  tiles: Tile[],
): Group {
  const sortedTiles = [...tiles].sort(
    (left, right) =>
      effectiveWeight(right) - effectiveWeight(left),
  );

  return {
    key,
    label,
    tiles: sortedTiles,
    weight: sortedTiles.reduce(
      (total, tile) => total + effectiveWeight(tile),
      0,
    ),
    changePercent: weightedChange(sortedTiles),
  };
}

function buildGroups(
  tiles: Tile[],
  mode: GroupingMode,
): Group[] {
  if (mode === "flat") {
    return [createGroup("market", "Marché complet", tiles)];
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
 * Treemap binaire :
 * - divise récursivement la surface selon le poids;
 * - alterne automatiquement horizontal / vertical selon le rectangle;
 * - garantit que chaque titre demeure dans le canvas.
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

  const totalWeight = sorted.reduce(
    (total, item) => total + Math.max(getWeight(item), 0.0001),
    0,
  );

  const targetWeight = totalWeight / 2;
  let cumulativeWeight = 0;
  let splitIndex = 1;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    cumulativeWeight += Math.max(
      getWeight(sorted[index]),
      0.0001,
    );
    splitIndex = index + 1;

    if (cumulativeWeight >= targetWeight) {
      const previousDifference = Math.abs(
        targetWeight -
          (cumulativeWeight -
            Math.max(getWeight(sorted[index]), 0.0001)),
      );
      const currentDifference = Math.abs(
        targetWeight - cumulativeWeight,
      );

      if (previousDifference < currentDifference && index > 0) {
        splitIndex = index;
      }

      break;
    }
  }

  const firstItems = sorted.slice(0, splitIndex);
  const secondItems = sorted.slice(splitIndex);

  const firstWeight = firstItems.reduce(
    (total, item) => total + Math.max(getWeight(item), 0.0001),
    0,
  );
  const ratio = clamp(firstWeight / totalWeight, 0.08, 0.92);

  if (rect.width >= rect.height) {
    const firstWidth = rect.width * ratio;

    return [
      ...binaryTreemap(firstItems, getWeight, {
        x: rect.x,
        y: rect.y,
        width: firstWidth,
        height: rect.height,
      }),
      ...binaryTreemap(secondItems, getWeight, {
        x: rect.x + firstWidth,
        y: rect.y,
        width: rect.width - firstWidth,
        height: rect.height,
      }),
    ];
  }

  const firstHeight = rect.height * ratio;

  return [
    ...binaryTreemap(firstItems, getWeight, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: firstHeight,
    }),
    ...binaryTreemap(secondItems, getWeight, {
      x: rect.x,
      y: rect.y + firstHeight,
      width: rect.width,
      height: rect.height - firstHeight,
    }),
  ];
}

function buildTreemap(
  groups: Group[],
): PositionedGroup[] {
  const outerPadding = 5;
  const sectorLayouts = binaryTreemap(
    groups,
    (group) => Math.max(group.weight, 0.0001),
    {
      x: outerPadding,
      y: outerPadding,
      width: CANVAS_WIDTH - outerPadding * 2,
      height: CANVAS_HEIGHT - outerPadding * 2,
    },
  );

  return sectorLayouts.map(({ item: group, rect }) => {
    const groupPadding = 4;
    const headerHeight = clamp(
      rect.height * 0.095,
      20,
      31,
    );

    const innerRect: Rect = {
      x: rect.x + groupPadding,
      y: rect.y + headerHeight + groupPadding,
      width: Math.max(rect.width - groupPadding * 2, 1),
      height: Math.max(
        rect.height - headerHeight - groupPadding * 2,
        1,
      ),
    };

    return {
      group,
      rect,
      headerHeight,
      tiles: binaryTreemap(
        group.tiles,
        effectiveWeight,
        innerRect,
      ),
    };
  });
}

function toPercentX(value: number): string {
  return `${(value / CANVAS_WIDTH) * 100}%`;
}

function toPercentY(value: number): string {
  return `${(value / CANVAS_HEIGHT) * 100}%`;
}

function rectStyle(rect: Rect): CSSVariables {
  return {
    "--x": toPercentX(rect.x),
    "--y": toPercentY(rect.y),
    "--w": toPercentX(rect.width),
    "--h": toPercentY(rect.height),
  };
}

function tileBackground(changePercent: number): string {
  const strength = clamp(
    Math.abs(changePercent) / 5,
    0.13,
    1,
  );

  if (changePercent > 0.005) {
    return `linear-gradient(145deg, rgba(9, 150, 108, ${
      0.42 + strength * 0.46
    }), rgba(7, 87, 70, ${0.78 + strength * 0.18}))`;
  }

  if (changePercent < -0.005) {
    return `linear-gradient(145deg, rgba(201, 42, 73, ${
      0.42 + strength * 0.46
    }), rgba(111, 42, 57, ${0.78 + strength * 0.18}))`;
  }

  return "linear-gradient(145deg, rgba(65, 92, 117, .92), rgba(38, 57, 78, .98))";
}

function tileSizeClass(rect: Rect): string {
  const area = rect.width * rect.height;

  if (
    rect.width < 48 ||
    rect.height < 32 ||
    area < 2100
  ) {
    return styles.tiny;
  }

  if (
    rect.width < 92 ||
    rect.height < 52 ||
    area < 6000
  ) {
    return styles.small;
  }

  if (
    rect.width > 190 &&
    rect.height > 110
  ) {
    return styles.large;
  }

  return styles.medium;
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

function focusPath(tile: Tile): string {
  return `/focus/${encodeURIComponent(tile.symbol)}`;
}

export function MarketHeatmap({
  tiles,
}: {
  tiles: readonly unknown[];
}) {
  const [mode, setMode] =
    useState<GroupingMode>("sector");
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

  const layout = useMemo(
    () => buildTreemap(visibleGroups),
    [visibleGroups],
  );

  if (normalizedTiles.length === 0) {
    return (
      <section className={`panel ${styles.panel}`}>
        <p className={styles.empty}>
          Aucun titre disponible pour la carte.
        </p>
      </section>
    );
  }

  return (
    <section className={`panel ${styles.panel}`}>
      <header className={styles.heading}>
        <div>
          <span className="eyebrow">CARTE DU MARCHÉ</span>
          <h2>S&amp;P/TSX 60</h2>
        </div>

        <div className={styles.controls}>
          <label>
            <span>Regroupement</span>
            <select
              aria-label="Regroupement de la carte"
              value={mode}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setMode(event.target.value as GroupingMode);
                setExpandedGroup(null);
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
          </label>

          {expandedGroup ? (
            <button
              type="button"
              onClick={() => setExpandedGroup(null)}
            >
              Voir tout le TSX 60
            </button>
          ) : (
            <span className={styles.hint}>
              Clique sur un secteur pour l’agrandir
            </span>
          )}
        </div>
      </header>

      <div className={styles.canvas}>
        {layout.map(
          ({
            group,
            rect,
            headerHeight,
            tiles: groupTiles,
          }) => (
            <div
              className={styles.group}
              style={rectStyle(rect)}
              key={group.key}
            >
              <button
                type="button"
                className={styles.groupHeader}
                style={
                  {
                    "--header-height": toPercentY(
                      headerHeight,
                    ),
                  } as CSSVariables
                }
                onClick={() =>
                  setExpandedGroup((current) =>
                    current === group.key
                      ? null
                      : group.key,
                  )
                }
                title={`Agrandir ${group.label}`}
              >
                <span>{group.label}</span>
                <strong>
                  {formatChange(group.changePercent)}
                </strong>
              </button>

              {groupTiles.map(
                ({ item: tile, rect: tileRect }) => {
                  const style: CSSVariables = {
                    ...rectStyle(tileRect),
                    "--tile-background":
                      tileBackground(
                        tile.changePercent,
                      ),
                  };

                  return (
                    <Link
                      href={focusPath(tile)}
                      className={`${styles.tile} ${tileSizeClass(
                        tileRect,
                      )}`}
                      style={style}
                      title={`${tile.name} · ${group.label} · ${formatPrice(
                        tile.price,
                      )} · ${formatChange(
                        tile.changePercent,
                      )}`}
                      key={tile.ticker}
                    >
                      <span className={styles.symbol}>
                        {tile.symbol}
                      </span>
                      <strong>
                        {formatChange(
                          tile.changePercent,
                        )}
                      </strong>
                      <small>
                        {formatPrice(tile.price)}
                      </small>
                      {tile.delayed ? (
                        <span
                          className={styles.delayed}
                        >
                          Différé
                        </span>
                      ) : null}
                    </Link>
                  );
                },
              )}
            </div>
          ),
        )}
      </div>
    </section>
  );
}
