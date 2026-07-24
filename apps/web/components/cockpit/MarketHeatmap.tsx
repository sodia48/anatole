"use client";

import Link from "next/link";
import {
  type ChangeEvent,
  type CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";

import styles from "./MarketHeatmap.module.css";

type GroupingMode = "sector" | "flat" | "direction";

type HeatmapTile = {
  ticker?: unknown;
  symbol?: unknown;
  name?: unknown;
  sector?: unknown;
  weight?: unknown;
  price?: unknown;
  change?: unknown;
  change_percent?: unknown;
  volume?: unknown;
  delayed?: unknown;
};

type NormalizedTile = {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  weight: number;
  price: number;
  changePercent: number;
  volume: number;
  delayed: boolean;
};

type TileGroup = {
  key: string;
  label: string;
  tiles: NormalizedTile[];
  weight: number;
  changePercent: number;
  advancers: number;
  decliners: number;
};

type CSSVariables = CSSProperties &
  Record<`--${string}`, string | number>;

const MODE_LABELS: Record<GroupingMode, string> = {
  sector: "Par secteur",
  flat: "Sans regroupement",
  direction: "Gagnants / perdants",
};

const UNKNOWN_SECTOR = "Autres";

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTile(raw: unknown): NormalizedTile | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const tile = raw as HeatmapTile;
  const ticker = text(tile.ticker, text(tile.symbol)).toUpperCase();

  if (!ticker) {
    return null;
  }

  const symbol = text(tile.symbol, ticker.replace(/\.TO$/i, "")).toUpperCase();

  return {
    ticker,
    symbol,
    name: text(tile.name, symbol),
    sector: text(tile.sector, UNKNOWN_SECTOR),
    weight: Math.max(number(tile.weight, 0), 0),
    price: Math.max(number(tile.price, 0), 0),
    changePercent: number(tile.change_percent, 0),
    volume: Math.max(number(tile.volume, 0), 0),
    delayed: Boolean(tile.delayed),
  };
}

function tileWeight(tile: NormalizedTile): number {
  // Un poids minimal garde les petites capitalisations visibles.
  return Math.max(tile.weight, 0.35);
}

function weightedChange(tiles: NormalizedTile[]): number {
  const totalWeight = tiles.reduce((total, tile) => total + tileWeight(tile), 0);

  if (totalWeight <= 0) {
    return 0;
  }

  return (
    tiles.reduce(
      (total, tile) => total + tile.changePercent * tileWeight(tile),
      0,
    ) / totalWeight
  );
}

function buildGroup(
  key: string,
  label: string,
  tiles: NormalizedTile[],
): TileGroup {
  const sorted = [...tiles].sort(
    (left, right) => tileWeight(right) - tileWeight(left),
  );

  return {
    key,
    label,
    tiles: sorted,
    weight: sorted.reduce((total, tile) => total + tileWeight(tile), 0),
    changePercent: weightedChange(sorted),
    advancers: sorted.filter((tile) => tile.changePercent > 0.005).length,
    decliners: sorted.filter((tile) => tile.changePercent < -0.005).length,
  };
}

function groupTiles(
  tiles: NormalizedTile[],
  mode: GroupingMode,
): TileGroup[] {
  if (mode === "flat") {
    return [buildGroup("market", "Marché complet", tiles)];
  }

  if (mode === "direction") {
    const definitions = [
      {
        key: "gainers",
        label: "Hausses",
        tiles: tiles.filter((tile) => tile.changePercent > 0.005),
      },
      {
        key: "unchanged",
        label: "Inchangées",
        tiles: tiles.filter(
          (tile) =>
            tile.changePercent >= -0.005 && tile.changePercent <= 0.005,
        ),
      },
      {
        key: "losers",
        label: "Baisses",
        tiles: tiles.filter((tile) => tile.changePercent < -0.005),
      },
    ];

    return definitions
      .filter((definition) => definition.tiles.length > 0)
      .map((definition) =>
        buildGroup(definition.key, definition.label, definition.tiles),
      );
  }

  const sectors = new Map<string, NormalizedTile[]>();

  for (const tile of tiles) {
    const current = sectors.get(tile.sector) ?? [];
    current.push(tile);
    sectors.set(tile.sector, current);
  }

  return [...sectors.entries()]
    .map(([sector, sectorTiles]) => buildGroup(sector, sector, sectorTiles))
    .sort((left, right) => right.weight - left.weight);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function groupMobileColumnSpan(
  group: TileGroup,
  totalWeight: number,
  expanded: boolean,
): number {
  if (expanded) {
    return 12;
  }

  if (totalWeight <= 0) {
    return 4;
  }

  const ratio = group.weight / totalWeight;
  return clamp(Math.round(ratio * 12), 2, 5);
}

function groupColumnSpan(
  group: TileGroup,
  largestWeight: number,
  expanded: boolean,
): number {
  if (expanded) {
    return 12;
  }

  if (largestWeight <= 0) {
    return 6;
  }

  const ratio = group.weight / largestWeight;
  return clamp(Math.round(4 + ratio * 8), 4, 12);
}

function tileColumnSpan(tile: NormalizedTile, largestWeight: number): number {
  if (largestWeight <= 0) {
    return 2;
  }

  const ratio = tileWeight(tile) / largestWeight;
  return clamp(Math.round(2 + ratio * 4), 2, 6);
}

function tileMobileColumnSpan(tile: NormalizedTile, largestWeight: number): number {
  if (largestWeight <= 0) {
    return 2;
  }

  const ratio = tileWeight(tile) / largestWeight;
  return clamp(Math.round(1 + ratio * 3), 1, 4);
}

function tileRowSpan(tile: NormalizedTile, largestWeight: number): number {
  if (largestWeight <= 0) {
    return 1;
  }

  const ratio = tileWeight(tile) / largestWeight;
  return clamp(Math.round(1 + ratio * 2), 1, 3);
}

function tileBackground(changePercent: number): string {
  const strength = clamp(Math.abs(changePercent) / 5, 0.16, 1);

  if (changePercent > 0.005) {
    return `linear-gradient(145deg, rgba(10, 140, 103, ${
      0.4 + strength * 0.48
    }), rgba(7, 82, 66, ${0.76 + strength * 0.2}))`;
  }

  if (changePercent < -0.005) {
    return `linear-gradient(145deg, rgba(194, 38, 69, ${
      0.42 + strength * 0.48
    }), rgba(105, 38, 51, ${0.76 + strength * 0.2}))`;
  }

  return "linear-gradient(145deg, rgba(57, 79, 96, .88), rgba(29, 48, 63, .96))";
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
  return `${value.toFixed(1)}% du panier`;
}

function stockPath(tile: NormalizedTile): string {
  return `/focus/${encodeURIComponent(tile.symbol)}`;
}

export function MarketHeatmap({ tiles }: { tiles: readonly unknown[] }) {
  const [mode, setMode] = useState<GroupingMode>("sector");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const normalizedTiles = useMemo(
    () =>
      tiles
        .map(normalizeTile)
        .filter((tile): tile is NormalizedTile => tile !== null),
    [tiles],
  );

  const groups = useMemo(
    () => groupTiles(normalizedTiles, mode),
    [mode, normalizedTiles],
  );

  useEffect(() => {
    setExpandedGroup(null);
  }, [mode]);

  const visibleGroups = useMemo(() => {
    if (!expandedGroup) {
      return groups;
    }

    return groups.filter((group) => group.key === expandedGroup);
  }, [expandedGroup, groups]);

  const largestGroupWeight = Math.max(
    ...visibleGroups.map((group) => group.weight),
    0,
  );

  const totalVisibleGroupWeight = visibleGroups.reduce(
    (total, group) => total + group.weight,
    0,
  );

  if (normalizedTiles.length === 0) {
    return (
      <section className={`panel ${styles.panel}`}>
        <div className={styles.heading}>
          <div>
            <span className="eyebrow">CARTE DU MARCHÉ</span>
            <h2>S&amp;P/TSX 60</h2>
          </div>
        </div>
        <p className={styles.empty}>Aucun titre n’est disponible pour la carte.</p>
      </section>
    );
  }

  return (
    <section className={`panel ${styles.panel}`}>
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">CARTE DU MARCHÉ</span>
          <h2>S&amp;P/TSX 60</h2>
          <p>
            Les blocs sont dimensionnés selon le poids du titre. La couleur
            représente la variation de séance.
          </p>
        </div>

        <div className={styles.controls}>
          <label className={styles.selectLabel}>
            <span>Regroupement</span>
            <select
              aria-label="Regroupement de la carte"
              value={mode}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setMode(event.target.value as GroupingMode)
              }
            >
              {Object.entries(MODE_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {expandedGroup ? (
            <button
              type="button"
              className={styles.resetButton}
              onClick={() => setExpandedGroup(null)}
            >
              Afficher tous les groupes
            </button>
          ) : (
            <span className={styles.hint}>
              Clique sur un secteur pour l’agrandir
            </span>
          )}
        </div>
      </div>

      <div className={styles.groups}>
        {visibleGroups.map((group) => {
          const groupStyle: CSSVariables = {
            "--group-span": groupColumnSpan(
              group,
              largestGroupWeight,
              Boolean(expandedGroup),
            ),
            "--group-mobile-span": groupMobileColumnSpan(
              group,
              totalVisibleGroupWeight,
              Boolean(expandedGroup),
            ),
          };

          const largestTileWeight = Math.max(
            ...group.tiles.map(tileWeight),
            0,
          );

          return (
            <article
              className={styles.group}
              key={group.key}
              style={groupStyle}
            >
              <button
                type="button"
                className={styles.groupHeader}
                onClick={() =>
                  setExpandedGroup((current) =>
                    current === group.key ? null : group.key,
                  )
                }
                aria-pressed={expandedGroup === group.key}
              >
                <span>
                  <strong>{group.label}</strong>
                  <small>
                    {group.tiles.length} titre
                    {group.tiles.length > 1 ? "s" : ""} ·{" "}
                    {formatWeight(group.weight)}
                  </small>
                </span>

                <span
                  className={
                    group.changePercent >= 0
                      ? styles.groupPositive
                      : styles.groupNegative
                  }
                >
                  <strong>{formatChange(group.changePercent)}</strong>
                  <small>
                    {group.advancers}↑ · {group.decliners}↓
                  </small>
                </span>
              </button>

              <div className={styles.tiles}>
                {group.tiles.map((tile) => {
                  const tileStyle: CSSVariables = {
                    "--tile-column-span": tileColumnSpan(
                      tile,
                      largestTileWeight,
                    ),
                    "--tile-mobile-column-span": tileMobileColumnSpan(
                      tile,
                      largestTileWeight,
                    ),
                    "--tile-row-span": tileRowSpan(
                      tile,
                      largestTileWeight,
                    ),
                    "--tile-background": tileBackground(tile.changePercent),
                  };

                  return (
                    <Link
                      href={stockPath(tile)}
                      className={styles.tile}
                      style={tileStyle}
                      key={tile.ticker}
                      title={`${tile.name} · ${tile.sector} · ${formatChange(
                        tile.changePercent,
                      )}`}
                    >
                      <span className={styles.tileSymbol}>{tile.symbol}</span>
                      <strong>{formatChange(tile.changePercent)}</strong>
                      <small>{formatPrice(tile.price)}</small>
                      <span className={styles.tileName}>{tile.name}</span>
                      {tile.delayed ? (
                        <span className={styles.delayed}>Différé</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
