"use client";

import Link from "next/link";
import {
  type ChangeEvent,
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  clamp,
  insetRect,
  squarifyTreemap,
  type TreemapRect,
} from "../heatmap/treemap";
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

type CanvasSize = {
  width: number;
  height: number;
};

type Density = "micro" | "compact" | "normal" | "wide";

const MODE_LABELS: Record<GroupingMode, string> = {
  sector: "Par secteur",
  flat: "Marché complet",
  direction: "Hausses / baisses",
};

const UNKNOWN_SECTOR = "Autres";

const SHORT_SECTOR_LABELS: Record<string, string> = {
  "Services financiers": "Finance",
  Énergie: "Énergie",
  Matériaux: "Matériaux",
  Technologies: "Tech",
  Industries: "Industries",
  "Consommation de base": "Conso. base",
  "Consommation discrétionnaire": "Conso. discr.",
  "Services publics": "Services publics",
  Communications: "Communications",
  Immobilier: "Immobilier",
  Autres: "Autres",
};

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
    weight: Math.max(number(tile.weight), 0),
    price: Math.max(number(tile.price), 0),
    changePercent: number(tile.change_percent),
    volume: Math.max(number(tile.volume), 0),
    delayed: Boolean(tile.delayed),
  };
}

function rawTileWeight(tile: NormalizedTile): number {
  return Math.max(tile.weight, 0.35);
}

function layoutTileWeight(tile: NormalizedTile, mobile: boolean): number {
  const raw = rawTileWeight(tile);

  // On mobile, compress the weight range. Large caps stay larger, but no
  // constituent is reduced to an unreadable strip.
  return mobile ? 1 + Math.pow(raw, 0.22) : raw;
}

function weightedChange(tiles: NormalizedTile[]): number {
  const totalWeight = tiles.reduce((total, tile) => total + rawTileWeight(tile), 0);

  if (totalWeight <= 0) {
    return 0;
  }

  return (
    tiles.reduce(
      (total, tile) => total + tile.changePercent * rawTileWeight(tile),
      0,
    ) / totalWeight
  );
}

function buildGroup(key: string, label: string, tiles: NormalizedTile[]): TileGroup {
  const sorted = [...tiles].sort(
    (left, right) => rawTileWeight(right) - rawTileWeight(left),
  );

  return {
    key,
    label,
    tiles: sorted,
    weight: sorted.reduce((total, tile) => total + rawTileWeight(tile), 0),
    changePercent: weightedChange(sorted),
    advancers: sorted.filter((tile) => tile.changePercent > 0.005).length,
    decliners: sorted.filter((tile) => tile.changePercent < -0.005).length,
  };
}

function groupTiles(tiles: NormalizedTile[], mode: GroupingMode): TileGroup[] {
  if (mode === "flat") {
    return [buildGroup("market", "Marché complet", tiles)];
  }

  if (mode === "direction") {
    return [
      {
        key: "gainers",
        label: "Hausses",
        tiles: tiles.filter((tile) => tile.changePercent > 0.005),
      },
      {
        key: "unchanged",
        label: "Inchangées",
        tiles: tiles.filter(
          (tile) => tile.changePercent >= -0.005 && tile.changePercent <= 0.005,
        ),
      },
      {
        key: "losers",
        label: "Baisses",
        tiles: tiles.filter((tile) => tile.changePercent < -0.005),
      },
    ]
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

function tileBackground(changePercent: number): string {
  const strength = clamp(Math.abs(changePercent) / 5, 0.16, 1);

  if (changePercent > 0.005) {
    return `linear-gradient(145deg, rgba(9, 176, 124, ${
      0.52 + strength * 0.42
    }), rgba(3, 83, 65, ${0.86 + strength * 0.12}))`;
  }

  if (changePercent < -0.005) {
    return `linear-gradient(145deg, rgba(224, 45, 78, ${
      0.52 + strength * 0.42
    }), rgba(104, 25, 45, ${0.86 + strength * 0.12}))`;
  }

  return "linear-gradient(145deg, rgba(71, 99, 119, .97), rgba(29, 49, 65, .99))";
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

function stockPath(tile: NormalizedTile): string {
  return `/focus/${encodeURIComponent(tile.symbol)}`;
}

function shortGroupLabel(label: string): string {
  return SHORT_SECTOR_LABELS[label] ?? label;
}

function tileDensity(rect: TreemapRect, mobile: boolean): Density {
  const area = rect.width * rect.height;

  if (mobile) {
    if (rect.width < 34 || rect.height < 30 || area < 1_250) {
      return "micro";
    }
    if (rect.width < 54 || rect.height < 44 || area < 2_500) {
      return "compact";
    }
    if (rect.width < 94 || rect.height < 70 || area < 6_000) {
      return "normal";
    }
    return "wide";
  }

  if (rect.width < 28 || rect.height < 22) {
    return "micro";
  }
  if (rect.width < 52 || rect.height < 36 || area < 2_300) {
    return "compact";
  }
  if (rect.width < 92 || rect.height < 60 || area < 5_400) {
    return "normal";
  }
  return "wide";
}

function useMobileBreakpoint(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return mobile;
}

function useMobileViewportHeight(): number {
  const [height, setHeight] = useState(720);

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () =>
      setHeight(Math.max(viewport?.height ?? window.innerHeight, 320));

    update();
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);

    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
    };
  }, []);

  return height;
}

function mobileCanvasHeight(
  viewportHeight: number,
  expanded: boolean,
  fullscreen: boolean,
): number {
  // The complete TSX 60 must fit between the fixed mobile app bar and dock.
  // The treemap is denser instead of extending the page vertically.
  const reserved = fullscreen ? 112 : expanded ? 232 : 270;
  const minimum = fullscreen ? 430 : 360;
  const maximum = fullscreen ? 900 : 620;
  return clamp(viewportHeight - reserved, minimum, maximum);
}

export function MarketHeatmap({ tiles }: { tiles: readonly unknown[] }) {
  const [mode, setMode] = useState<GroupingMode>("sector");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useMobileBreakpoint();
  const mobileViewportHeight = useMobileViewportHeight();
  const [canvasWidth, setCanvasWidth] = useState(0);

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

  useEffect(() => {
    const element = canvasRef.current;

    if (!element) {
      return;
    }

    const update = () => setCanvasWidth(Math.max(element.clientWidth, 1));
    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) {
      return;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  const visibleGroups = useMemo(() => {
    if (!expandedGroup) {
      return groups;
    }
    return groups.filter((group) => group.key === expandedGroup);
  }, [expandedGroup, groups]);

  const visibleItemCount = visibleGroups.reduce(
    (total, group) => total + group.tiles.length,
    0,
  );

  const canvasHeight = isMobile
    ? mobileCanvasHeight(
        mobileViewportHeight,
        Boolean(expandedGroup),
        fullscreen,
      )
    : clamp(canvasWidth * 0.58, 540, 760);

  const canvasSize: CanvasSize = {
    width: Math.max(canvasWidth, 1),
    height: Math.max(canvasHeight, 1),
  };

  const positionedGroups = useMemo(() => {
    if (canvasSize.width <= 1 || canvasSize.height <= 1) {
      return [];
    }

    const outerPadding = isMobile ? 3 : 4;
    const groupGap = isMobile ? 2 : 3;
    const groupLayout = squarifyTreemap(
      visibleGroups.map((group) => ({
        item: group,
        weight: isMobile
          ? group.tiles.reduce(
              (sum, tile) => sum + layoutTileWeight(tile, true),
              0,
            )
          : group.weight,
      })),
      {
        x: outerPadding,
        y: outerPadding,
        width: canvasSize.width - outerPadding * 2,
        height: canvasSize.height - outerPadding * 2,
      },
    );

    return groupLayout.map(({ item: group, rect }) => {
      const groupRect = insetRect(rect, groupGap / 2);
      const headerHeight = clamp(
        groupRect.height * (isMobile ? 0.1 : 0.15),
        isMobile ? (expandedGroup ? 22 : 15) : 26,
        isMobile ? (expandedGroup ? 30 : 22) : 40,
      );
      const bodyRect = {
        x: groupRect.x + (isMobile ? 2 : 3),
        y: groupRect.y + headerHeight + 2,
        width: Math.max(groupRect.width - (isMobile ? 4 : 6), 0),
        height: Math.max(groupRect.height - headerHeight - (isMobile ? 4 : 5), 0),
      };
      const tileLayout = squarifyTreemap(
        group.tiles.map((tile) => ({
          item: tile,
          weight: layoutTileWeight(tile, isMobile),
        })),
        bodyRect,
      );

      return {
        group,
        rect: groupRect,
        headerHeight,
        tiles: tileLayout.map(({ item: tile, rect: tileRect }) => ({
          tile,
          rect: insetRect(tileRect, isMobile ? 1 : 1.5),
        })),
      };
    });
  }, [
    canvasSize.height,
    canvasSize.width,
    expandedGroup,
    isMobile,
    visibleGroups,
  ]);

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
    <section
      className={`panel ${styles.panel} ${fullscreen ? styles.fullscreen : ""}`}
      data-fullscreen={fullscreen ? "true" : "false"}
    >
      <div className={styles.stickyTop}>
        <div className={styles.heading}>
          <div>
            <span className="eyebrow">CARTE DU MARCHÉ</span>
            <h2>S&amp;P/TSX 60</h2>
            <p>
              {normalizedTiles.length} titres · symbole et variation visibles dans chaque case ·
              touchez un secteur pour agrandir sa lecture.
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
                Vue complète
              </button>
            ) : null}

            <button
              type="button"
              className={styles.fullscreenButton}
              onClick={() => setFullscreen((current) => !current)}
              aria-pressed={fullscreen}
            >
              {fullscreen ? "Quitter" : "Plein écran"}
            </button>
          </div>
        </div>

        <div className={styles.readabilityBar}>
          <strong>{visibleItemCount}/{normalizedTiles.length} titres visibles</strong>
          <span className={styles.legend} aria-label="Légende des variations">
            <i className={styles.legendDown} /> Baisse
            <i className={styles.legendFlat} /> Stable
            <i className={styles.legendUp} /> Hausse
          </span>
          <small>Tous les titres tiennent dans la carte mobile</small>
        </div>
      </div>

      <div
        ref={canvasRef}
        className={styles.treemap}
        style={{ height: canvasHeight } as CSSProperties}
        aria-label={`Treemap du TSX 60 avec ${visibleItemCount} titres et leurs variations`}
      >
        {positionedGroups.map(({ group, rect, headerHeight, tiles: groupTilesPositioned }) => {
          const compactHeader = rect.width < 132 || rect.height < 80;

          return (
            <article
              className={styles.group}
              data-compact={compactHeader ? "true" : "false"}
              key={group.key}
              style={
                {
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                } as CSSProperties
              }
            >
              <button
                type="button"
                className={styles.groupHeader}
                style={{ height: headerHeight }}
                onClick={() =>
                  setExpandedGroup((current) =>
                    current === group.key ? null : group.key,
                  )
                }
                aria-pressed={expandedGroup === group.key}
              >
                <strong>{shortGroupLabel(group.label)}</strong>
                <span
                  className={
                    group.changePercent >= 0
                      ? styles.groupPositive
                      : styles.groupNegative
                  }
                >
                  {formatChange(group.changePercent)}
                </span>
              </button>

              {groupTilesPositioned.map(({ tile, rect: tileRect }) => {
                const density = tileDensity(tileRect, isMobile);
                const accessibleLabel = `${tile.symbol}, ${tile.name}, ${formatChange(
                  tile.changePercent,
                )}`;

                return (
                  <Link
                    href={stockPath(tile)}
                    className={styles.tile}
                    data-density={density}
                    style={
                      {
                        left: tileRect.x - rect.x,
                        top: tileRect.y - rect.y,
                        width: tileRect.width,
                        height: tileRect.height,
                        background: tileBackground(tile.changePercent),
                      } as CSSProperties
                    }
                    aria-label={accessibleLabel}
                    title={`${tile.name} · ${formatPrice(tile.price)} · ${formatChange(
                      tile.changePercent,
                    )}`}
                    key={tile.ticker}
                  >
                    <span className={styles.tileSymbol}>{tile.symbol}</span>
                    <strong className={styles.tileChange}>
                      {formatChange(tile.changePercent)}
                    </strong>
                    {density === "normal" || density === "wide" ? (
                      <small>{formatPrice(tile.price)}</small>
                    ) : null}
                    {density === "wide" ? (
                      <span className={styles.tileName}>{tile.name}</span>
                    ) : null}
                    {tile.delayed && density === "wide" ? (
                      <span className={styles.delayed}>différé</span>
                    ) : null}
                  </Link>
                );
              })}
            </article>
          );
        })}
      </div>
    </section>
  );
}
