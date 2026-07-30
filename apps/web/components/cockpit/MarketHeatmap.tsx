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

import styles from "./MarketHeatmap.module.css";

type GroupingMode =
  | "sector"
  | "flat"
  | "direction";

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
  weight: number;
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

const MODE_LABELS: Record<
  GroupingMode,
  string
> = {
  sector: "Par secteur",
  flat: "Marché complet",
  direction: "Hausses / baisses",
};

const UNKNOWN_SECTOR = "Autres";

const SHORT_SECTOR_LABELS:
  Record<string, string> = {
    "Services financiers": "Finance",
    Énergie: "Énergie",
    Matériaux: "Matériaux",
    Technologies: "Tech",
    Industries: "Industries",
    "Consommation de base": "Conso. base",
    "Consommation discrétionnaire":
      "Conso. discr.",
    "Services publics":
      "Services publics",
    Communications: "Communications",
    Immobilier: "Immobilier",
    Autres: "Autres",
  };

function text(
  value: unknown,
  fallback = "",
): string {
  return (
    typeof value === "string" &&
    value.trim()
      ? value.trim()
      : fallback
  );
}

function number(
  value: unknown,
  fallback = 0,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function normalizeTile(
  raw: unknown,
): NormalizedTile | null {
  if (
    !raw ||
    typeof raw !== "object"
  ) {
    return null;
  }

  const tile = raw as HeatmapTile;
  const ticker = text(
    tile.ticker,
    text(tile.symbol),
  ).toUpperCase();

  if (!ticker) {
    return null;
  }

  const symbol = text(
    tile.symbol,
    ticker.replace(/\.TO$/i, ""),
  ).toUpperCase();

  return {
    ticker,
    symbol,
    name: text(tile.name, symbol),
    sector: text(
      tile.sector,
      UNKNOWN_SECTOR,
    ),
    weight: Math.max(
      number(tile.weight, 0),
      0,
    ),
    price: Math.max(
      number(tile.price, 0),
      0,
    ),
    changePercent: number(
      tile.change_percent,
      0,
    ),
    volume: Math.max(
      number(tile.volume, 0),
      0,
    ),
    available: text(tile.source, "available") !== "unavailable",
    delayed: Boolean(tile.delayed),
  };
}

function tileWeight(
  tile: NormalizedTile,
): number {
  return Math.max(tile.weight, 0.35);
}

function weightedChange(
  tiles: NormalizedTile[],
): number {
  const totalWeight = tiles.reduce(
    (total, tile) =>
      total + tileWeight(tile),
    0,
  );

  if (totalWeight <= 0) {
    return 0;
  }

  return (
    tiles.reduce(
      (total, tile) =>
        total +
        tile.changePercent *
          tileWeight(tile),
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
    (left, right) =>
      tileWeight(right) -
      tileWeight(left),
  );

  return {
    key,
    label,
    tiles: sorted,
    weight: sorted.reduce(
      (total, tile) =>
        total + tileWeight(tile),
      0,
    ),
    changePercent:
      weightedChange(sorted),
    advancers: sorted.filter(
      (tile) =>
        tile.changePercent >
        0.005,
    ).length,
    decliners: sorted.filter(
      (tile) =>
        tile.changePercent <
        -0.005,
    ).length,
  };
}

function groupTiles(
  tiles: NormalizedTile[],
  mode: GroupingMode,
): TileGroup[] {
  if (mode === "flat") {
    return [
      buildGroup(
        "market",
        "Marché complet",
        tiles,
      ),
    ];
  }

  if (mode === "direction") {
    const definitions = [
      {
        key: "gainers",
        label: "Hausses",
        tiles: tiles.filter(
          (tile) =>
            tile.changePercent >
            0.005,
        ),
      },
      {
        key: "unchanged",
        label: "Inchangées",
        tiles: tiles.filter(
          (tile) =>
            tile.changePercent >=
              -0.005 &&
            tile.changePercent <=
              0.005,
        ),
      },
      {
        key: "losers",
        label: "Baisses",
        tiles: tiles.filter(
          (tile) =>
            tile.changePercent <
            -0.005,
        ),
      },
    ];

    return definitions
      .filter(
        (definition) =>
          definition.tiles.length >
          0,
      )
      .map((definition) =>
        buildGroup(
          definition.key,
          definition.label,
          definition.tiles,
        ),
      );
  }

  const sectors = new Map<
    string,
    NormalizedTile[]
  >();

  for (const tile of tiles) {
    const current =
      sectors.get(tile.sector) ??
      [];

    current.push(tile);
    sectors.set(
      tile.sector,
      current,
    );
  }

  return [...sectors.entries()]
    .map(
      ([sector, sectorTiles]) =>
        buildGroup(
          sector,
          sector,
          sectorTiles,
        ),
    )
    .sort(
      (left, right) =>
        right.weight -
        left.weight,
    );
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(
    Math.max(value, minimum),
    maximum,
  );
}

function binaryTreemap<T>(
  items: WeightedItem<T>[],
  rect: Rect,
): PositionedItem<T>[] {
  if (
    items.length === 0 ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return [];
  }

  if (items.length === 1) {
    return [
      {
        item: items[0].item,
        rect,
      },
    ];
  }

  const sorted = [...items].sort(
    (left, right) =>
      right.weight -
      left.weight,
  );

  const totalWeight = sorted.reduce(
    (total, entry) =>
      total +
      Math.max(entry.weight, 0.001),
    0,
  );

  let firstWeight = 0;
  let splitIndex = 1;
  let bestDistance =
    Number.POSITIVE_INFINITY;

  for (
    let index = 1;
    index < sorted.length;
    index += 1
  ) {
    firstWeight += Math.max(
      sorted[index - 1].weight,
      0.001,
    );

    const distance = Math.abs(
      totalWeight / 2 -
        firstWeight,
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      splitIndex = index;
    }
  }

  const first = sorted.slice(
    0,
    splitIndex,
  );
  const second = sorted.slice(
    splitIndex,
  );

  const firstTotal = first.reduce(
    (total, entry) =>
      total +
      Math.max(entry.weight, 0.001),
    0,
  );

  const ratio =
    totalWeight > 0
      ? firstTotal /
        totalWeight
      : 0.5;

  if (rect.width >= rect.height) {
    const firstWidth =
      rect.width * ratio;

    return [
      ...binaryTreemap(first, {
        x: rect.x,
        y: rect.y,
        width: firstWidth,
        height: rect.height,
      }),
      ...binaryTreemap(second, {
        x:
          rect.x +
          firstWidth,
        y: rect.y,
        width:
          rect.width -
          firstWidth,
        height: rect.height,
      }),
    ];
  }

  const firstHeight =
    rect.height * ratio;

  return [
    ...binaryTreemap(first, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: firstHeight,
    }),
    ...binaryTreemap(second, {
      x: rect.x,
      y:
        rect.y +
        firstHeight,
      width: rect.width,
      height:
        rect.height -
        firstHeight,
    }),
  ];
}

function tileBackground(
  changePercent: number,
  available = true,
): string {
  if (!available) {
    return (
      "linear-gradient(145deg, " +
      "rgba(69, 87, 101, .9), " +
      "rgba(31, 48, 61, .98))"
    );
  }
  const strength = clamp(
    Math.abs(changePercent) / 5,
    0.16,
    1,
  );

  if (
    changePercent >
    0.005
  ) {
    return `linear-gradient(145deg, rgba(11, 154, 112, ${
      0.44 + strength * 0.48
    }), rgba(5, 78, 63, ${
      0.78 + strength * 0.18
    }))`;
  }

  if (
    changePercent <
    -0.005
  ) {
    return `linear-gradient(145deg, rgba(206, 35, 71, ${
      0.45 + strength * 0.47
    }), rgba(103, 35, 50, ${
      0.78 + strength * 0.18
    }))`;
  }

  return (
    "linear-gradient(145deg, " +
    "rgba(67, 91, 111, .94), " +
    "rgba(31, 51, 67, .98))"
  );
}

function formatChange(
  value: number,
  available = true,
): string {
  if (!available) {
    return "N/D";
  }

  return `${
    value >= 0 ? "+" : ""
  }${value.toFixed(2)}%`;
}

function formatPrice(
  value: number,
): string {
  return value.toLocaleString(
    "fr-CA",
    {
      style: "currency",
      currency: "CAD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  );
}

function stockPath(
  tile: NormalizedTile,
): string {
  return `/focus/${encodeURIComponent(
    tile.symbol,
  )}`;
}

function shortGroupLabel(
  label: string,
): string {
  return (
    SHORT_SECTOR_LABELS[label] ??
    label
  );
}

function tileDetailLevel(
  rect: Rect,
): 0 | 1 | 2 | 3 {
  const area =
    rect.width *
    rect.height;

  if (
    rect.width < 28 ||
    rect.height < 22
  ) {
    return 0;
  }

  if (
    rect.width < 52 ||
    rect.height < 36 ||
    area < 2300
  ) {
    return 1;
  }

  if (
    rect.width < 92 ||
    rect.height < 60 ||
    area < 5400
  ) {
    return 2;
  }

  return 3;
}

export function MarketHeatmap({
  tiles,
  universeLabel = "S&P/TSX 60",
}: {
  tiles: readonly unknown[];
  universeLabel?: string;
}) {
  const [mode, setMode] =
    useState<GroupingMode>(
      "sector",
    );
  const [
    expandedGroup,
    setExpandedGroup,
  ] =
    useState<string | null>(
      null,
    );
  const canvasRef =
    useRef<HTMLDivElement | null>(
      null,
    );
  const [canvasSize, setCanvasSize] =
    useState({
      width: 0,
      height: 0,
    });

  const normalizedTiles =
    useMemo(
      () =>
        tiles
          .map(normalizeTile)
          .filter(
            (
              tile,
            ): tile is NormalizedTile =>
              tile !== null,
          ),
      [tiles],
    );

  const groups = useMemo(
    () =>
      groupTiles(
        normalizedTiles,
        mode,
      ),
    [mode, normalizedTiles],
  );

  useEffect(() => {
    setExpandedGroup(null);
  }, [mode]);

  useEffect(() => {
    const element =
      canvasRef.current;

    if (!element) {
      return;
    }

    const update = () => {
      setCanvasSize({
        width:
          element.clientWidth,
        height:
          element.clientHeight,
      });
    };

    update();

    const observer =
      new ResizeObserver(update);

    observer.observe(element);

    return () =>
      observer.disconnect();
  }, []);

  const visibleGroups =
    useMemo(() => {
      if (!expandedGroup) {
        return groups;
      }

      return groups.filter(
        (group) =>
          group.key ===
          expandedGroup,
      );
    }, [
      expandedGroup,
      groups,
    ]);

  const positionedGroups =
    useMemo(() => {
      const {
        width,
        height,
      } = canvasSize;

      if (
        width <= 0 ||
        height <= 0
      ) {
        return [];
      }

      const outerPadding = 4;
      const gap = 3;

      const groupLayout =
        binaryTreemap(
          visibleGroups.map(
            (group) => ({
              item: group,
              weight:
                group.weight,
            }),
          ),
          {
            x: outerPadding,
            y: outerPadding,
            width:
              width -
              outerPadding * 2,
            height:
              height -
              outerPadding * 2,
          },
        );

      return groupLayout.map(
        ({
          item: group,
          rect,
        }) => {
          const groupRect = {
            x:
              rect.x +
              gap / 2,
            y:
              rect.y +
              gap / 2,
            width: Math.max(
              rect.width -
                gap,
              0,
            ),
            height: Math.max(
              rect.height -
                gap,
              0,
            ),
          };

          const headerHeight =
            clamp(
              groupRect.height *
                0.15,
              26,
              40,
            );

          const bodyRect = {
            x:
              groupRect.x + 3,
            y:
              groupRect.y +
              headerHeight +
              2,
            width: Math.max(
              groupRect.width -
                6,
              0,
            ),
            height: Math.max(
              groupRect.height -
                headerHeight -
                5,
              0,
            ),
          };

          const tileLayout =
            binaryTreemap(
              group.tiles.map(
                (tile) => ({
                  item: tile,
                  weight:
                    tileWeight(
                      tile,
                    ),
                }),
              ),
              bodyRect,
            );

          return {
            group,
            rect: groupRect,
            headerHeight,
            tiles:
              tileLayout.map(
                ({
                  item: tile,
                  rect: tileRect,
                }) => ({
                  tile,
                  rect: {
                    x:
                      tileRect.x +
                      1.5,
                    y:
                      tileRect.y +
                      1.5,
                    width:
                      Math.max(
                        tileRect.width -
                          3,
                        0,
                      ),
                    height:
                      Math.max(
                        tileRect.height -
                          3,
                        0,
                      ),
                  },
                }),
              ),
          };
        },
      );
    }, [
      canvasSize,
      visibleGroups,
    ]);

  if (
    normalizedTiles.length === 0
  ) {
    return (
      <section
        className={`panel ${styles.panel}`}
      >
        <div
          className={
            styles.heading
          }
        >
          <div>
            <span className="eyebrow">
              CARTE DU MARCHÉ
            </span>
            <h2>
              {universeLabel}
            </h2>
          </div>
        </div>
        <p
          className={
            styles.empty
          }
        >
          Aucun titre n’est
          disponible pour la carte.
        </p>
      </section>
    );
  }

  return (
    <section
      className={`panel ${styles.panel}`}
    >
      <div
        className={
          styles.heading
        }
      >
        <div>
          <span className="eyebrow">
            CARTE DU MARCHÉ
          </span>
          <h2>
            {universeLabel}
          </h2>
          <p>
            Taille selon le poids du
            titre · couleur selon la
            variation de séance.
          </p>
        </div>

        <div
          className={
            styles.controls
          }
        >
          <label
            className={
              styles.selectLabel
            }
          >
            <span>
              Regroupement
            </span>
            <select
              aria-label="Regroupement de la carte"
              value={mode}
              onChange={(
                event:
                  ChangeEvent<HTMLSelectElement>,
              ) =>
                setMode(
                  event.target
                    .value as GroupingMode,
                )
              }
            >
              {Object.entries(
                MODE_LABELS,
              ).map(
                ([
                  value,
                  label,
                ]) => (
                  <option
                    value={
                      value
                    }
                    key={
                      value
                    }
                  >
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>

          {expandedGroup ? (
            <button
              type="button"
              className={
                styles.resetButton
              }
              onClick={() =>
                setExpandedGroup(
                  null,
                )
              }
            >
              Vue complète
            </button>
          ) : (
            <span
              className={
                styles.hint
              }
            >
              Touchez un secteur
              pour l’agrandir
            </span>
          )}
        </div>
      </div>

      <div
        ref={canvasRef}
        className={
          styles.treemap
        }
        aria-label={`Carte du marché ${universeLabel}`}
      >
        {positionedGroups.map(
          ({
            group,
            rect,
            headerHeight,
            tiles:
              positionedTiles,
          }) => {
            const compactHeader =
              rect.width < 120 ||
              rect.height < 82;

            return (
              <article
                className={
                  styles.group
                }
                data-compact={
                  compactHeader
                    ? "true"
                    : "false"
                }
                key={group.key}
                style={
                  {
                    left:
                      rect.x,
                    top:
                      rect.y,
                    width:
                      rect.width,
                    height:
                      rect.height,
                  } as CSSProperties
                }
              >
                <button
                  type="button"
                  className={
                    styles.groupHeader
                  }
                  style={{
                    height:
                      headerHeight,
                  }}
                  onClick={() =>
                    setExpandedGroup(
                      (
                        current,
                      ) =>
                        current ===
                        group.key
                          ? null
                          : group.key,
                    )
                  }
                  aria-pressed={
                    expandedGroup ===
                    group.key
                  }
                >
                  <strong>
                    {shortGroupLabel(
                      group.label,
                    )}
                  </strong>
                  <span
                    className={
                      group.changePercent >=
                      0
                        ? styles.groupPositive
                        : styles.groupNegative
                    }
                  >
                    {formatChange(
                      group.changePercent,
                    )}
                  </span>
                </button>

                {positionedTiles.map(
                  ({
                    tile,
                    rect:
                      tileRect,
                  }) => {
                    const detail =
                      tileDetailLevel(
                        tileRect,
                      );

                    if (
                      detail === 0
                    ) {
                      return (
                        <Link
                          href={stockPath(
                            tile,
                          )}
                          className={
                            styles.microTile
                          }
                          style={{
                            left:
                              tileRect.x -
                              rect.x,
                            top:
                              tileRect.y -
                              rect.y,
                            width:
                              tileRect.width,
                            height:
                              tileRect.height,
                            background:
                              tileBackground(
                                tile.changePercent,
                                tile.available,
                              ),
                          }}
                          aria-label={`${tile.symbol}, ${formatChange(
                            tile.changePercent,
                            tile.available,
                          )}`}
                          key={
                            tile.ticker
                          }
                        />
                      );
                    }

                    return (
                      <Link
                        href={stockPath(
                          tile,
                        )}
                        className={
                          styles.tile
                        }
                        data-detail={
                          detail
                        }
                        style={{
                          left:
                            tileRect.x -
                            rect.x,
                          top:
                            tileRect.y -
                            rect.y,
                          width:
                            tileRect.width,
                          height:
                            tileRect.height,
                          background:
                            tileBackground(
                              tile.changePercent,
                              tile.available,
                            ),
                        }}
                        key={
                          tile.ticker
                        }
                        title={`${tile.name} · ${tile.sector} · ${formatChange(
                          tile.changePercent,
                          tile.available,
                        )}`}
                      >
                        <span
                          className={
                            styles.tileSymbol
                          }
                        >
                          {
                            tile.symbol
                          }
                        </span>

                        {detail >=
                        2 ? (
                          <strong>
                            {formatChange(
                              tile.changePercent,
                              tile.available,
                            )}
                          </strong>
                        ) : null}

                        {detail >=
                        3 ? (
                          <>
                            <small>
                              {formatPrice(
                                tile.price,
                              )}
                            </small>
                            <span
                              className={
                                styles.tileName
                              }
                            >
                              {
                                tile.name
                              }
                            </span>
                          </>
                        ) : null}

                        {tile.delayed &&
                        detail >=
                          3 ? (
                          <span
                            className={
                              styles.delayed
                            }
                          >
                            Différé
                          </span>
                        ) : null}
                      </Link>
                    );
                  },
                )}
              </article>
            );
          },
        )}

        {positionedGroups.length ===
        0 ? (
          <div
            className={
              styles.loadingCanvas
            }
          >
            Construction de la carte…
          </div>
        ) : null}
      </div>
    </section>
  );
}
