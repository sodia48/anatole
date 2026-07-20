"use client";

import Link from "next/link";
import { type CSSProperties, useMemo, useState } from "react";

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

type CSSVariables = CSSProperties & Record<`--${string}`, string | number>;

const UNKNOWN_SECTOR = "Autres";

const MODE_LABELS: Record<GroupingMode, string> = {
  sector: "Par secteur",
  flat: "Sans regroupement",
  direction: "Gagnants / perdants",
};

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

function normalize(raw: unknown): Tile | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as RawTile;
  const ticker = asText(source.ticker, asText(source.symbol)).toUpperCase();

  if (!ticker) {
    return null;
  }

  return {
    ticker,
    symbol: asText(source.symbol, ticker.replace(/\.TO$/i, "")).toUpperCase(),
    name: asText(source.name, ticker),
    sector: asText(source.sector, UNKNOWN_SECTOR),
    weight: Math.max(asNumber(source.weight), 0),
    price: Math.max(asNumber(source.price), 0),
    changePercent: asNumber(source.change_percent),
    delayed: Boolean(source.delayed),
  };
}

function effectiveWeight(tile: Tile): number {
  return Math.max(tile.weight, 0.25);
}

function weightedChange(tiles: Tile[]): number {
  const total = tiles.reduce((sum, tile) => sum + effectiveWeight(tile), 0);

  if (total <= 0) {
    return 0;
  }

  return (
    tiles.reduce(
      (sum, tile) => sum + tile.changePercent * effectiveWeight(tile),
      0,
    ) / total
  );
}

function createGroup(key: string, label: string, tiles: Tile[]): Group {
  const sorted = [...tiles].sort(
    (left, right) => effectiveWeight(right) - effectiveWeight(left),
  );

  return {
    key,
    label,
    tiles: sorted,
    weight: sorted.reduce((sum, tile) => sum + effectiveWeight(tile), 0),
    changePercent: weightedChange(sorted),
  };
}

function buildGroups(tiles: Tile[], mode: GroupingMode): Group[] {
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
            tile.changePercent >= -0.005 && tile.changePercent <= 0.005,
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
    .map(([sector, sectorTiles]) => createGroup(sector, sector, sectorTiles))
    .sort((left, right) => right.weight - left.weight);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
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

function focusPath(tile: Tile): string {
  return `/focus/${encodeURIComponent(tile.symbol)}`;
}

export function MarketHeatmap({ tiles }: { tiles: readonly unknown[] }) {
  const [mode, setMode] = useState<GroupingMode>("sector");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const normalizedTiles = useMemo(
    () =>
      tiles
        .map(normalize)
        .filter((tile): tile is Tile => tile !== null),
    [tiles],
  );

  const groups = useMemo(
    () => buildGroups(normalizedTiles, mode),
    [mode, normalizedTiles],
  );

  const visibleGroups = expandedGroup
    ? groups.filter((group) => group.key === expandedGroup)
    : groups;

  if (normalizedTiles.length === 0) {
    return (
      <section className={`panel ${styles.panel}`}>
        <p className={styles.empty}>Aucun titre disponible.</p>
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
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as GroupingMode);
                setExpandedGroup(null);
              }}
            >
              {Object.entries(MODE_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {expandedGroup ? (
            <button type="button" onClick={() => setExpandedGroup(null)}>
              Tous les secteurs
            </button>
          ) : null}
        </div>
      </header>

      <div
        className={[
          styles.groups,
          expandedGroup ? styles.groupsExpanded : "",
          mode !== "sector" ? styles.groupsAlternative : "",
        ].join(" ")}
      >
        {visibleGroups.map((group) => {
          const denseLevel =
            group.tiles.length >= 10
              ? "very-dense"
              : group.tiles.length >= 7
                ? "dense"
                : "normal";

          return (
            <article
              className={styles.group}
              data-density={denseLevel}
              data-expanded={expandedGroup === group.key ? "true" : "false"}
              key={group.key}
            >
              <button
                type="button"
                className={styles.groupHeader}
                onClick={() =>
                  setExpandedGroup((current) =>
                    current === group.key ? null : group.key,
                  )
                }
              >
                <span>
                  <strong>{group.label}</strong>
                  <small>
                    {group.tiles.length} titre
                    {group.tiles.length > 1 ? "s" : ""}
                  </small>
                </span>

                <span
                  className={
                    group.changePercent >= 0
                      ? styles.positive
                      : styles.negative
                  }
                >
                  {formatChange(group.changePercent)}
                </span>
              </button>

              <div className={styles.tiles}>
                {group.tiles.map((tile) => {
                  const tileStyle: CSSVariables = {
                    "--tile-background": tileBackground(tile.changePercent),
                  };

                  return (
                    <Link
                      href={focusPath(tile)}
                      className={styles.tile}
                      style={tileStyle}
                      title={`${tile.name} · ${tile.sector} · ${formatPrice(
                        tile.price,
                      )} · ${formatChange(tile.changePercent)}`}
                      key={tile.ticker}
                    >
                      <span className={styles.symbol}>{tile.symbol}</span>
                      <strong>{formatChange(tile.changePercent)}</strong>
                      <small>{formatPrice(tile.price)}</small>
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
