"use client";

import Link from "next/link";
import {
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./MarketHeatmap.module.css";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

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
  source?: unknown;
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
  available: boolean;
  delayed: boolean;
};

type TileGroup = {
  key: string;
  label: string;
  tiles: NormalizedTile[];
  marketWeight: number;
  layoutWeight: number;
  changePercent: number;
  advancers: number;
  decliners: number;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type WeightedItem<T> = {
  item: T;
  weight: number;
};

type PositionedItem<T> = {
  item: T;
  rect: Rect;
};

const MODE_LABELS: Record<GroupingMode, readonly [string, string]> = {
  sector: ["Secteurs", "Sectors"],
  flat: ["Vue globale", "Full market"],
  direction: ["Sens du marché", "Market direction"],
};

const UNKNOWN_SECTOR = "Autres";

const SHORT_SECTOR_LABELS: Record<string, string> = {
  "Services financiers": "Finance",
  Financials: "Finance",
  Énergie: "Énergie",
  Energy: "Énergie",
  Matériaux: "Matériaux",
  Materials: "Matériaux",
  Technologies: "Technologies",
  "Information Technology": "Technologies",
  Industries: "Industries",
  Industrials: "Industries",
  "Consommation de base": "Conso. base",
  "Consumer Staples": "Conso. base",
  "Consommation discrétionnaire": "Conso. discr.",
  "Consumer Discretionary": "Conso. discr.",
  "Services publics": "Services publics",
  Utilities: "Services publics",
  Communications: "Communications",
  "Communication Services": "Communications",
  Immobilier: "Immobilier",
  "Real Estate": "Immobilier",
  Santé: "Santé",
  "Health Care": "Santé",
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
    weight: Math.max(number(tile.weight, 0), 0),
    price: Math.max(number(tile.price, 0), 0),
    changePercent: number(tile.change_percent, 0),
    volume: Math.max(number(tile.volume, 0), 0),
    available: text(tile.source, "available") !== "unavailable",
    delayed: Boolean(tile.delayed),
  };
}

function marketWeight(tile: NormalizedTile): number {
  return Math.max(tile.weight, 0.05);
}

function layoutTileWeight(tile: NormalizedTile, totalTiles: number): number {
  const exponent = totalTiles > 150 ? 0.31 : totalTiles > 90 ? 0.4 : 0.58;
  const floor = totalTiles > 150 ? 0.42 : totalTiles > 90 ? 0.32 : 0.22;
  return Math.pow(Math.max(tile.weight, floor), exponent);
}

function weightedChange(tiles: NormalizedTile[]): number {
  const totalWeight = tiles.reduce((total, tile) => total + marketWeight(tile), 0);

  if (totalWeight <= 0) {
    return 0;
  }

  return (
    tiles.reduce(
      (total, tile) => total + tile.changePercent * marketWeight(tile),
      0,
    ) / totalWeight
  );
}

function buildGroup(
  key: string,
  label: string,
  tiles: NormalizedTile[],
  totalTiles: number,
): TileGroup {
  const sorted = [...tiles].sort(
    (left, right) =>
      layoutTileWeight(right, totalTiles) - layoutTileWeight(left, totalTiles),
  );

  return {
    key,
    label,
    tiles: sorted,
    marketWeight: sorted.reduce((total, tile) => total + marketWeight(tile), 0),
    layoutWeight: sorted.reduce(
      (total, tile) => total + layoutTileWeight(tile, totalTiles),
      0,
    ),
    changePercent: weightedChange(sorted),
    advancers: sorted.filter((tile) => tile.changePercent > 0.005).length,
    decliners: sorted.filter((tile) => tile.changePercent < -0.005).length,
  };
}

function groupTiles(tiles: NormalizedTile[], mode: GroupingMode, language: AnatoleLanguage): TileGroup[] {
  const totalTiles = tiles.length;

  if (mode === "flat") {
    return [buildGroup("market", pick(language, "Marché complet", "Full market"), tiles, totalTiles)];
  }

  if (mode === "direction") {
    return [
      {
        key: "gainers",
        label: pick(language, "Hausses", "Gainers"),
        tiles: tiles.filter((tile) => tile.changePercent > 0.005),
      },
      {
        key: "unchanged",
        label: pick(language, "Inchangées", "Unchanged"),
        tiles: tiles.filter(
          (tile) => tile.changePercent >= -0.005 && tile.changePercent <= 0.005,
        ),
      },
      {
        key: "losers",
        label: pick(language, "Baisses", "Decliners"),
        tiles: tiles.filter((tile) => tile.changePercent < -0.005),
      },
    ]
      .filter((definition) => definition.tiles.length > 0)
      .map((definition) =>
        buildGroup(
          definition.key,
          definition.label,
          definition.tiles,
          totalTiles,
        ),
      );
  }

  const sectors = new Map<string, NormalizedTile[]>();

  for (const tile of tiles) {
    const current = sectors.get(tile.sector) ?? [];
    current.push(tile);
    sectors.set(tile.sector, current);
  }

  return [...sectors.entries()]
    .map(([sector, sectorTiles]) =>
      buildGroup(sector, sector, sectorTiles, totalTiles),
    )
    .sort((left, right) => right.layoutWeight - left.layoutWeight);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function binaryTreemap<T>(
  items: WeightedItem<T>[],
  rect: Rect,
): PositionedItem<T>[] {
  if (items.length === 0 || rect.width <= 0 || rect.height <= 0) {
    return [];
  }

  if (items.length === 1) {
    return [{ item: items[0].item, rect }];
  }

  const sorted = [...items].sort((left, right) => right.weight - left.weight);
  const totalWeight = sorted.reduce(
    (total, entry) => total + Math.max(entry.weight, 0.001),
    0,
  );

  let firstWeight = 0;
  let splitIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < sorted.length; index += 1) {
    firstWeight += Math.max(sorted[index - 1].weight, 0.001);
    const distance = Math.abs(totalWeight / 2 - firstWeight);

    if (distance < bestDistance) {
      bestDistance = distance;
      splitIndex = index;
    }
  }

  const first = sorted.slice(0, splitIndex);
  const second = sorted.slice(splitIndex);
  const firstTotal = first.reduce(
    (total, entry) => total + Math.max(entry.weight, 0.001),
    0,
  );
  const ratio = totalWeight > 0 ? firstTotal / totalWeight : 0.5;

  if (rect.width >= rect.height) {
    const firstWidth = rect.width * ratio;
    return [
      ...binaryTreemap(first, {
        x: rect.x,
        y: rect.y,
        width: firstWidth,
        height: rect.height,
      }),
      ...binaryTreemap(second, {
        x: rect.x + firstWidth,
        y: rect.y,
        width: rect.width - firstWidth,
        height: rect.height,
      }),
    ];
  }

  const firstHeight = rect.height * ratio;
  return [
    ...binaryTreemap(first, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: firstHeight,
    }),
    ...binaryTreemap(second, {
      x: rect.x,
      y: rect.y + firstHeight,
      width: rect.width,
      height: rect.height - firstHeight,
    }),
  ];
}

function tileBackground(
  changePercent: number,
  available = true,
  highContrast = false,
): string {
  if (!available) {
    return highContrast
      ? "repeating-linear-gradient(135deg, #334454 0 6px, #263644 6px 12px)"
      : "linear-gradient(145deg, rgba(69,87,101,.92), rgba(31,48,61,.98))";
  }

  const strength = clamp(Math.abs(changePercent) / 5, 0.16, 1);

  if (changePercent > 0.005) {
    return highContrast
      ? `linear-gradient(145deg, rgba(0, 122, 204, ${0.68 + strength * 0.28}), rgba(0, 69, 116, .98))`
      : `linear-gradient(145deg, rgba(11,154,112,${0.44 + strength * 0.48}), rgba(5,78,63,${0.78 + strength * 0.18}))`;
  }

  if (changePercent < -0.005) {
    return highContrast
      ? `linear-gradient(145deg, rgba(238, 111, 20, ${0.7 + strength * 0.25}), rgba(133, 50, 0, .98))`
      : `linear-gradient(145deg, rgba(206,35,71,${0.45 + strength * 0.47}), rgba(103,35,50,${0.78 + strength * 0.18}))`;
  }

  return highContrast
    ? "linear-gradient(145deg, #586878, #334452)"
    : "linear-gradient(145deg, rgba(67,91,111,.94), rgba(31,51,67,.98))";
}

function formatChange(value: number, available = true): string {
  if (!available) {
    return "N/D";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPrice(value: number, language: AnatoleLanguage): string {
  return value.toLocaleString(localeFor(language), {
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

function tileDetailLevel(
  rect: Rect,
  totalTiles: number,
  mobile: boolean,
): 0 | 1 | 2 | 3 {
  const area = rect.width * rect.height;
  const densityFactor = totalTiles > 150 ? 0.78 : totalTiles > 90 ? 0.9 : 1;
  const minimumWidth = (mobile ? 12 : 18) * densityFactor;
  const minimumHeight = (mobile ? 10 : 15) * densityFactor;

  if (rect.width < minimumWidth || rect.height < minimumHeight) {
    return 0;
  }

  if (rect.width < 30 || rect.height < 19 || area < 720) {
    return 1;
  }

  if (rect.width < 58 || rect.height < 34 || area < 2100) {
    return 2;
  }

  return 3;
}

function directionLabel(tile: NormalizedTile, language: AnatoleLanguage): string {
  if (!tile.available) {
    return pick(language, "cotation indisponible", "quote unavailable");
  }
  if (tile.changePercent > 0.005) {
    return pick(language, "en hausse", "up");
  }
  if (tile.changePercent < -0.005) {
    return pick(language, "en baisse", "down");
  }
  return pick(language, "inchangé", "unchanged");
}

export function MarketHeatmap({
  tiles,
  universeLabel = "S&P/TSX 60",
}: {
  tiles: readonly unknown[];
  universeLabel?: string;
}) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [mode, setMode] = useState<GroupingMode>("sector");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [highContrast, setHighContrast] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const normalizedTiles = useMemo(
    () =>
      tiles
        .map(normalizeTile)
        .filter((tile): tile is NormalizedTile => tile !== null),
    [tiles],
  );

  const groups = useMemo(
    () => groupTiles(normalizedTiles, mode, language),
    [language, mode, normalizedTiles],
  );

  const selectedTile = useMemo(
    () => normalizedTiles.find((tile) => tile.ticker === selectedTicker) ?? null,
    [normalizedTiles, selectedTicker],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setExpandedGroup(null), 0);
    return () => window.clearTimeout(timer);
  }, [mode]);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarsePointer(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("anatole-heatmap-focus", focusMode);
    return () => document.body.classList.remove("anatole-heatmap-focus");
  }, [focusMode]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) {
      return;
    }

    const update = () => {
      setCanvasSize({ width: element.clientWidth, height: element.clientHeight });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const visibleGroups = useMemo(() => {
    if (!expandedGroup) {
      return groups;
    }
    return groups.filter((group) => group.key === expandedGroup);
  }, [expandedGroup, groups]);

  const positionedGroups = useMemo(() => {
    const { width, height } = canvasSize;
    if (width <= 0 || height <= 0) {
      return [];
    }

    const mobile = width <= 820;
    const outerPadding = mobile ? 2 : 4;
    const gap = mobile ? 2 : 3;
    const totalTiles = normalizedTiles.length;
    const groupLayout = binaryTreemap(
      visibleGroups.map((group) => ({
        item: group,
        weight: group.layoutWeight,
      })),
      {
        x: outerPadding,
        y: outerPadding,
        width: width - outerPadding * 2,
        height: height - outerPadding * 2,
      },
    );

    return groupLayout.map(({ item: group, rect }) => {
      const groupRect = {
        x: rect.x + gap / 2,
        y: rect.y + gap / 2,
        width: Math.max(rect.width - gap, 0),
        height: Math.max(rect.height - gap, 0),
      };
      const headerHeight = clamp(
        groupRect.height * (mobile ? 0.12 : 0.15),
        mobile ? 18 : 26,
        mobile ? 30 : 40,
      );
      const innerGap = mobile ? 1 : 1.5;
      const bodyRect = {
        x: groupRect.x + innerGap,
        y: groupRect.y + headerHeight + innerGap,
        width: Math.max(groupRect.width - innerGap * 2, 0),
        height: Math.max(groupRect.height - headerHeight - innerGap * 2, 0),
      };
      const tileLayout = binaryTreemap(
        group.tiles.map((tile) => ({
          item: tile,
          weight: layoutTileWeight(tile, totalTiles),
        })),
        bodyRect,
      );

      return {
        group,
        rect: groupRect,
        headerHeight,
        mobile,
        tiles: tileLayout.map(({ item: tile, rect: tileRect }) => ({
          tile,
          rect: {
            x: tileRect.x + innerGap,
            y: tileRect.y + innerGap,
            width: Math.max(tileRect.width - innerGap * 2, 0),
            height: Math.max(tileRect.height - innerGap * 2, 0),
          },
        })),
      };
    });
  }, [canvasSize, normalizedTiles.length, visibleGroups]);

  const runSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim().toUpperCase();
    if (!query) {
      return;
    }

    const match =
      normalizedTiles.find((tile) => tile.symbol === query || tile.ticker === query) ??
      normalizedTiles.find((tile) => tile.symbol.startsWith(query)) ??
      normalizedTiles.find((tile) => tile.name.toUpperCase().includes(query));

    if (!match) {
      return;
    }

    setSelectedTicker(match.ticker);
    if (mode === "sector") {
      setExpandedGroup(match.sector);
    }
  };

  const resetView = () => {
    setExpandedGroup(null);
    setSelectedTicker(null);
    setSearchQuery("");
  };

  const toggleFullscreen = async () => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    if (focusMode) {
      setFocusMode(false);
      return;
    }

    if (document.fullscreenElement === panel) {
      await document.exitFullscreen();
      return;
    }

    try {
      if (typeof panel.requestFullscreen === "function") {
        await panel.requestFullscreen();
        return;
      }
    } catch {
      // iOS peut refuser le plein écran d’un élément. Le mode focus prend le relais.
    }

    setFocusMode(true);
  };

  const handleTileClick = (
    event: MouseEvent<HTMLAnchorElement>,
    tile: NormalizedTile,
  ) => {
    if (coarsePointer || canvasSize.width <= 820) {
      event.preventDefault();
      setSelectedTicker((current) => current === tile.ticker ? null : tile.ticker);
    }
  };

  if (normalizedTiles.length === 0) {
    return (
      <section className={`panel ${styles.panel}`}>
        <div className={styles.heading}>
          <div>
            <span className="eyebrow">{pick(language, "CARTE DU MARCHÉ", "MARKET MAP")}</span>
            <h2>{universeLabel}</h2>
          </div>
        </div>
        <p className={styles.empty}>{pick(language, "Aucun titre n’est disponible pour la carte.", "No securities are available for the map.")}</p>
      </section>
    );
  }

  return (
    <section
      ref={panelRef}
      className={`panel ${styles.panel}`}
      data-contrast={highContrast ? "true" : "false"}
      data-fullscreen={fullscreen || focusMode ? "true" : "false"}
    >
      <div className={styles.heading}>
        <div className={styles.headingCopy}>
          <span className="eyebrow">{pick(language, "CARTE DU MARCHÉ", "MARKET MAP")}</span>
          <h2>{universeLabel}</h2>
          <p>
            {pick(language, "Tous les titres restent dans la carte. Touchez une case pour lire ses détails, puis ouvrez Focus au besoin.", "Every security remains on the map. Select a tile to read its details, then open Focus if needed.")}
          </p>
        </div>
        <div className={styles.countBadge}>
          <strong>{normalizedTiles.length}</strong>
          <span>{pick(language, "titres inclus", "securities included")}</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.modeButtons} role="group" aria-label={pick(language, "Regroupement de la carte", "Map grouping")}>
          {(Object.keys(MODE_LABELS) as GroupingMode[]).map((value) => (
            <button
              type="button"
              key={value}
              className={mode === value ? styles.modeButtonActive : styles.modeButton}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {pick(language, MODE_LABELS[value][0], MODE_LABELS[value][1])}
            </button>
          ))}
        </div>

        <form className={styles.searchForm} onSubmit={runSearch}>
          <label htmlFor="heatmap-symbol-search">{pick(language, "Trouver dans la carte", "Find on the map")}</label>
          <div>
            <input
              id="heatmap-symbol-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="RY, SHOP, MDA…"
              autoComplete="off"
            />
            <button type="submit">{pick(language, "Trouver", "Find")}</button>
          </div>
        </form>

        <div className={styles.actionButtons}>
          <button
            type="button"
            className={styles.utilityButton}
            aria-pressed={highContrast}
            onClick={() => setHighContrast((current) => !current)}
          >
            {highContrast ? pick(language, "Contraste actif", "Contrast on") : pick(language, "Contraste", "Contrast")}
          </button>
          <button type="button" className={styles.utilityButton} onClick={() => void toggleFullscreen()}>
            {fullscreen || focusMode ? pick(language, "Quitter plein écran", "Exit full screen") : pick(language, "Plein écran", "Full screen")}
          </button>
          {expandedGroup || selectedTile || searchQuery ? (
            <button type="button" className={styles.resetButton} onClick={resetView}>
              {pick(language, "Vue complète", "Full view")}
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.legend} aria-label={pick(language, "Légende de la carte", "Map legend")}>
        <span><i className={styles.legendPositive} /> + {pick(language, "Hausse", "Up")}</span>
        <span><i className={styles.legendNegative} /> − {pick(language, "Baisse", "Down")}</span>
        <span><i className={styles.legendNeutral} /> {pick(language, "N/D ou inchangé", "N/A or unchanged")}</span>
        <span className={styles.legendHint}>{pick(language, "Touchez un secteur pour l’agrandir", "Select a sector to expand it")}</span>
      </div>

      <div
        ref={canvasRef}
        className={styles.treemap}
        aria-label={pick(language, `Carte du marché ${universeLabel}, ${normalizedTiles.length} titres`, `${universeLabel} market map, ${normalizedTiles.length} securities`)}
      >
        {positionedGroups.map(({ group, rect, headerHeight, mobile, tiles: positionedTiles }) => {
          const compactHeader = rect.width < 112 || rect.height < 70;

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
                  setExpandedGroup((current) => (current === group.key ? null : group.key))
                }
                aria-pressed={expandedGroup === group.key}
                aria-label={pick(language, `${group.label}, ${group.tiles.length} titres, ${formatChange(group.changePercent)}`, `${group.label}, ${group.tiles.length} securities, ${formatChange(group.changePercent)}`)}
              >
                <strong>{shortGroupLabel(group.label)}</strong>
                <span className={group.changePercent >= 0 ? styles.groupPositive : styles.groupNegative}>
                  {formatChange(group.changePercent)}
                </span>
              </button>

              {positionedTiles.map(({ tile, rect: tileRect }) => {
                const detail = tileDetailLevel(tileRect, normalizedTiles.length, mobile);
                const selected = selectedTicker === tile.ticker;
                const commonStyle = {
                  left: tileRect.x - rect.x,
                  top: tileRect.y - rect.y,
                  width: tileRect.width,
                  height: tileRect.height,
                  background: tileBackground(tile.changePercent, tile.available, highContrast),
                };
                const ariaLabel = `${tile.symbol}, ${tile.name}, ${directionLabel(tile, language)}, ${formatChange(tile.changePercent, tile.available)}, ${formatPrice(tile.price, language)}`;

                return (
                  <Link
                    href={stockPath(tile)}
                    className={`${detail === 0 ? styles.microTile : styles.tile} ${selected ? styles.tileSelected : ""}`}
                    data-detail={detail}
                    data-direction={
                      !tile.available
                        ? "unavailable"
                        : tile.changePercent > 0.005
                          ? "up"
                          : tile.changePercent < -0.005
                            ? "down"
                            : "flat"
                    }
                    style={commonStyle}
                    aria-label={ariaLabel}
                    title={`${tile.name} · ${tile.sector} · ${formatChange(tile.changePercent, tile.available)}`}
                    key={tile.ticker}
                    onClick={(event) => handleTileClick(event, tile)}
                    onFocus={() => setSelectedTicker(tile.ticker)}
                  >
                    <span className={detail === 0 ? styles.microSymbol : styles.tileSymbol}>
                      {tile.symbol}
                    </span>
                    {detail >= 1 ? (
                      <strong>{formatChange(tile.changePercent, tile.available)}</strong>
                    ) : null}
                    {detail >= 3 ? (
                      <>
                        <small>{formatPrice(tile.price, language)}</small>
                        <span className={styles.tileName}>{tile.name}</span>
                      </>
                    ) : null}
                    {tile.delayed && detail >= 3 ? (
                      <span className={styles.delayed}>{pick(language, "Différé", "Delayed")}</span>
                    ) : null}
                  </Link>
                );
              })}
            </article>
          );
        })}

        {positionedGroups.length === 0 ? (
          <div className={styles.loadingCanvas}>{pick(language, "Construction de la carte…", "Building the map…")}</div>
        ) : null}
      </div>

      {selectedTile ? (
        <aside className={styles.inspector} aria-live="polite">
          <div className={styles.inspectorIdentity}>
            <span>{pick(language, "Titre sélectionné", "Selected security")}</span>
            <strong>{selectedTile.symbol}</strong>
            <p>{selectedTile.name} · {selectedTile.sector}</p>
          </div>
          <div className={styles.inspectorMetrics}>
            <div>
              <span>{pick(language, "Prix", "Price")}</span>
              <strong>{formatPrice(selectedTile.price, language)}</strong>
            </div>
            <div>
              <span>{pick(language, "Séance", "Session")}</span>
              <strong className={selectedTile.changePercent >= 0 ? styles.inspectorPositive : styles.inspectorNegative}>
                {formatChange(selectedTile.changePercent, selectedTile.available)}
              </strong>
            </div>
          </div>
          <div className={styles.inspectorActions}>
            <Link href={stockPath(selectedTile)}>{pick(language, "Ouvrir Focus", "Open Focus")}</Link>
            <button type="button" onClick={() => setSelectedTicker(null)}>{pick(language, "Fermer", "Close")}</button>
          </div>
        </aside>
      ) : null}
    </section>
  );
}
