"use client";

import Link from "next/link";
import {
  type ChangeEvent,
  type CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";

import styles from "./EtfHeatmap.module.css";

export type EtfHeatmapItem = {
  ticker: string;
  name: string;
  provider: string;
  sector: string;
  exposure: string;
  region: string;
  price: number;
  changePercent: number;
  volume: number;
  currency: string;
  delayed: boolean;
  source: string;
};

type RawItem = Partial<EtfHeatmapItem> & {
  symbol?: unknown;
  issuer?: unknown;
  category?: unknown;
  description?: unknown;
  change_percent?: unknown;
};

type GroupingMode =
  | "sector"
  | "provider"
  | "direction";

type Group = {
  key: string;
  label: string;
  items: EtfHeatmapItem[];
  weight: number;
  changePercent: number;
  quotedCount: number;
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

type Viewport = {
  width: number;
  height: number;
};

const DESKTOP_VIEWPORT: Viewport = {
  width: 1200,
  height: 690,
};

const MOBILE_VIEWPORT: Viewport = {
  width: 760,
  height: 1150,
};

const MIN_WEIGHT = 0.65;

const GROUPING_LABELS: Record<
  GroupingMode,
  string
> = {
  sector: "Par secteur",
  provider: "Par fournisseur",
  direction: "Hausses / baisses",
};

const SHORT_GROUP_LABELS:
  Record<string, string> = {
    "Obligations et liquidités":
      "Obligations",
    "Marché américain": "États-Unis",
    "Marché canadien": "Canada",
    "International et émergents":
      "International",
    "Revenu amélioré et options":
      "Revenu / options",
    "Finance et dividendes":
      "Finance",
    "Portefeuilles tout-en-un":
      "Tout-en-un",
    "Immobilier, infrastructures et services publics":
      "Immobilier / infra",
    "Matériaux et métaux":
      "Matériaux",
    "Consommation et santé":
      "Conso. / santé",
    "Technologie et innovation":
      "Technologie",
    "Actifs numériques et matières premières":
      "Actifs numériques",
    "Énergie et ressources":
      "Énergie",
  };

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

function textValue(
  value: unknown,
  fallback = "",
): string {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : fallback;
}

function numberValue(
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

function normalizeItem(
  raw: unknown,
): EtfHeatmapItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const item = raw as RawItem;
  const ticker = textValue(
    item.ticker,
    textValue(item.symbol),
  ).toUpperCase();

  if (!ticker) {
    return null;
  }

  return {
    ticker,
    name: textValue(item.name, ticker),
    provider: textValue(
      item.provider,
      textValue(
        item.issuer,
        "Autres fournisseurs",
      ),
    ),
    sector: textValue(
      item.sector,
      textValue(
        item.category,
        "Autres expositions",
      ),
    ),
    exposure: textValue(
      item.exposure,
      textValue(item.description),
    ),
    region: textValue(item.region),
    price: Math.max(
      numberValue(item.price),
      0,
    ),
    changePercent: numberValue(
      item.changePercent,
      numberValue(item.change_percent),
    ),
    volume: Math.max(
      numberValue(item.volume),
      0,
    ),
    currency:
      textValue(item.currency, "CAD")
        .toUpperCase(),
    delayed: Boolean(item.delayed),
    source: textValue(item.source),
  };
}

function liquidityWeight(
  item: EtfHeatmapItem,
): number {
  if (item.volume <= 0) {
    return MIN_WEIGHT;
  }

  return Math.max(
    1 + Math.log10(item.volume + 1),
    MIN_WEIGHT,
  );
}

function weightedChange(
  items: EtfHeatmapItem[],
): number {
  const quoted = items.filter(
    (item) => item.price > 0,
  );

  if (quoted.length === 0) {
    return 0;
  }

  const totalWeight = quoted.reduce(
    (total, item) =>
      total + liquidityWeight(item),
    0,
  );

  if (totalWeight <= 0) {
    return 0;
  }

  return (
    quoted.reduce(
      (total, item) =>
        total +
        item.changePercent *
          liquidityWeight(item),
      0,
    ) / totalWeight
  );
}

function createGroup(
  key: string,
  label: string,
  items: EtfHeatmapItem[],
): Group {
  const sorted = [...items].sort(
    (left, right) =>
      liquidityWeight(right) -
      liquidityWeight(left),
  );

  return {
    key,
    label,
    items: sorted,
    weight: sorted.reduce(
      (total, item) =>
        total + liquidityWeight(item),
      0,
    ),
    changePercent:
      weightedChange(sorted),
    quotedCount: sorted.filter(
      (item) => item.price > 0,
    ).length,
  };
}

function buildGroups(
  items: EtfHeatmapItem[],
  mode: GroupingMode,
): Group[] {
  if (mode === "direction") {
    const definitions = [
      {
        key: "gainers",
        label: "Hausses",
        items: items.filter(
          (item) =>
            item.price > 0 &&
            item.changePercent > 0.005,
        ),
      },
      {
        key: "unchanged",
        label:
          "Inchangés / sans cotation",
        items: items.filter(
          (item) =>
            item.price <= 0 ||
            (item.changePercent >=
              -0.005 &&
              item.changePercent <=
                0.005),
        ),
      },
      {
        key: "losers",
        label: "Baisses",
        items: items.filter(
          (item) =>
            item.price > 0 &&
            item.changePercent < -0.005,
        ),
      },
    ];

    return definitions
      .filter(
        (definition) =>
          definition.items.length > 0,
      )
      .map((definition) =>
        createGroup(
          definition.key,
          definition.label,
          definition.items,
        ),
      );
  }

  const grouped = new Map<
    string,
    EtfHeatmapItem[]
  >();

  for (const item of items) {
    const key =
      mode === "provider"
        ? item.provider
        : item.sector;
    const current =
      grouped.get(key) ?? [];

    current.push(item);
    grouped.set(key, current);
  }

  return [...grouped.entries()]
    .map(([key, groupItems]) =>
      createGroup(
        key,
        key,
        groupItems,
      ),
    )
    .sort(
      (left, right) =>
        right.weight - left.weight,
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
      right.weight - left.weight,
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
      totalWeight / 2 - firstWeight,
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
  const ratio = clamp(
    totalWeight > 0
      ? firstTotal / totalWeight
      : 0.5,
    0.025,
    0.975,
  );

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
        x: rect.x + firstWidth,
        y: rect.y,
        width:
          rect.width - firstWidth,
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
      y: rect.y + firstHeight,
      width: rect.width,
      height:
        rect.height - firstHeight,
    }),
  ];
}

function tileBackground(
  item: EtfHeatmapItem,
): string {
  if (item.price <= 0) {
    return (
      "repeating-linear-gradient(135deg, " +
      "rgba(35, 58, 74, .98) 0, " +
      "rgba(35, 58, 74, .98) 8px, " +
      "rgba(25, 45, 59, .98) 8px, " +
      "rgba(25, 45, 59, .98) 16px)"
    );
  }

  const strength = clamp(
    Math.abs(item.changePercent) / 5,
    0.16,
    1,
  );

  if (item.changePercent > 0.005) {
    return `linear-gradient(145deg, rgba(11, 154, 112, ${
      0.44 + strength * 0.48
    }), rgba(5, 78, 63, ${
      0.78 + strength * 0.18
    }))`;
  }

  if (item.changePercent < -0.005) {
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

function formatGroupChange(
  group: Group,
): string {
  return group.quotedCount > 0
    ? formatChange(
        group.changePercent,
      )
    : "N/D";
}

function formatChange(
  value: number,
): string {
  return `${
    value >= 0 ? "+" : ""
  }${value.toFixed(2)}%`;
}

function formatItemChange(
  item: EtfHeatmapItem,
): string {
  return item.price > 0
    ? formatChange(item.changePercent)
    : "N/D";
}

function formatPrice(
  item: EtfHeatmapItem,
): string {
  if (item.price <= 0) {
    return "Cotation en attente";
  }

  return item.price.toLocaleString(
    "fr-CA",
    {
      style: "currency",
      currency:
        item.currency || "CAD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  );
}

function shortGroupLabel(
  label: string,
): string {
  return (
    SHORT_GROUP_LABELS[label] ??
    label
  );
}

function detailLevel(
  rect: Rect,
  viewport: Viewport,
): 0 | 1 | 2 | 3 {
  const widthRatio =
    rect.width / viewport.width;
  const heightRatio =
    rect.height / viewport.height;
  const areaRatio =
    widthRatio * heightRatio;

  if (
    widthRatio < 0.035 ||
    heightRatio < 0.022
  ) {
    return 0;
  }

  if (
    widthRatio < 0.07 ||
    heightRatio < 0.04 ||
    areaRatio < 0.003
  ) {
    return 1;
  }

  if (
    widthRatio < 0.13 ||
    heightRatio < 0.075 ||
    areaRatio < 0.008
  ) {
    return 2;
  }

  return 3;
}

function percent(
  value: number,
  total: number,
): string {
  if (total <= 0) {
    return "0%";
  }

  return `${(
    (value / total) * 100
  ).toFixed(5)}%`;
}

function useTreemapViewport(): Viewport {
  const [viewport, setViewport] =
    useState<Viewport>(
      DESKTOP_VIEWPORT,
    );

  useEffect(() => {
    const media = window.matchMedia(
      "(max-width: 820px)",
    );

    const update = () => {
      setViewport(
        media.matches
          ? MOBILE_VIEWPORT
          : DESKTOP_VIEWPORT,
      );
    };

    update();

    if (media.addEventListener) {
      media.addEventListener(
        "change",
        update,
      );

      return () =>
        media.removeEventListener(
          "change",
          update,
        );
    }

    media.addListener(update);

    return () =>
      media.removeListener(update);
  }, []);

  return viewport;
}

export function EtfHeatmap({
  items,
}: {
  items: readonly unknown[];
}) {
  const [grouping, setGrouping] =
    useState<GroupingMode>("sector");
  const [expandedGroup, setExpandedGroup] =
    useState<string | null>(null);
  const viewport =
    useTreemapViewport();

  const normalizedItems = useMemo(
    () =>
      items
        .map(normalizeItem)
        .filter(
          (
            item,
          ): item is EtfHeatmapItem =>
            item !== null,
        ),
    [items],
  );

  const groups = useMemo(
    () =>
      buildGroups(
        normalizedItems,
        grouping,
      ),
    [grouping, normalizedItems],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setExpandedGroup(null), 0);
    return () => window.clearTimeout(timer);
  }, [grouping]);

  const visibleGroups = useMemo(() => {
    if (!expandedGroup) {
      return groups;
    }

    return groups.filter(
      (group) =>
        group.key === expandedGroup,
    );
  }, [expandedGroup, groups]);

  const positionedGroups = useMemo(() => {
    const outerPadding = 4;
    const gap = 3;
    const groupLayout = binaryTreemap(
      visibleGroups.map((group) => ({
        item: group,
        weight: group.weight,
      })),
      {
        x: outerPadding,
        y: outerPadding,
        width:
          viewport.width -
          outerPadding * 2,
        height:
          viewport.height -
          outerPadding * 2,
      },
    );

    return groupLayout.map(
      ({ item: group, rect }) => {
        const groupRect = {
          x: rect.x + gap / 2,
          y: rect.y + gap / 2,
          width: Math.max(
            rect.width - gap,
            0,
          ),
          height: Math.max(
            rect.height - gap,
            0,
          ),
        };
        const headerHeight = clamp(
          groupRect.height * 0.15,
          viewport === MOBILE_VIEWPORT
            ? 24
            : 26,
          40,
        );
        const bodyRect = {
          x: groupRect.x + 3,
          y:
            groupRect.y +
            headerHeight +
            2,
          width: Math.max(
            groupRect.width - 6,
            0,
          ),
          height: Math.max(
            groupRect.height -
              headerHeight -
              5,
            0,
          ),
        };
        const tileLayout = binaryTreemap(
          group.items.map((item) => ({
            item,
            weight:
              liquidityWeight(item),
          })),
          bodyRect,
        );

        return {
          group,
          rect: groupRect,
          headerHeight,
          tiles: tileLayout.map(
            ({ item, rect: tileRect }) => ({
              item,
              rect: {
                x: tileRect.x + 1.5,
                y: tileRect.y + 1.5,
                width: Math.max(
                  tileRect.width - 3,
                  0,
                ),
                height: Math.max(
                  tileRect.height - 3,
                  0,
                ),
              },
            }),
          ),
        };
      },
    );
  }, [viewport, visibleGroups]);

  if (normalizedItems.length === 0) {
    return (
      <section
        className={`panel ${styles.panel}`}
      >
        <div className={styles.heading}>
          <div>
            <span className="eyebrow">
              CARTE DES ETF
            </span>
            <h2>ETF canadiens</h2>
          </div>
        </div>
        <p className={styles.empty}>
          Aucun ETF n’est disponible
          pour la carte.
        </p>
      </section>
    );
  }

  return (
    <section
      className={`panel ${styles.panel}`}
    >
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">
            CARTE DES ETF
          </span>
          <h2>ETF canadiens</h2>
          <p>
            {normalizedItems.length} ETF affichés · couleur selon la variation ·
            taille proportionnelle sur ordinateur.
          </p>
        </div>

        <div className={styles.controls}>
          <label
            className={styles.selectLabel}
          >
            <span>Regroupement</span>
            <select
              aria-label="Regroupement de la carte des ETF"
              value={grouping}
              onChange={(
                event:
                  ChangeEvent<HTMLSelectElement>,
              ) =>
                setGrouping(
                  event.target
                    .value as GroupingMode,
                )
              }
            >
              {Object.entries(
                GROUPING_LABELS,
              ).map(([value, label]) => (
                <option
                  value={value}
                  key={value}
                >
                  {label}
                </option>
              ))}
            </select>
          </label>

          {expandedGroup ? (
            <button
              type="button"
              className={styles.resetButton}
              onClick={() =>
                setExpandedGroup(null)
              }
            >
              Vue complète
            </button>
          ) : (
            <span className={styles.hint}>
              Touchez un groupe pour
              l’agrandir
            </span>
          )}
        </div>
      </div>

      <div
        className={styles.mobileMap}
        aria-label={`Carte mobile de ${normalizedItems.length} ETF avec leurs variations`}
      >
        {visibleGroups.map((group) => (
          <section
            className={styles.mobileGroup}
            key={`mobile-${group.key}`}
          >
            <button
              type="button"
              className={styles.mobileGroupHeader}
              onClick={() =>
                setExpandedGroup((current) =>
                  current === group.key ? null : group.key,
                )
              }
              aria-pressed={expandedGroup === group.key}
            >
              <span>
                <strong>{shortGroupLabel(group.label)}</strong>
                <small>{group.items.length} ETF</small>
              </span>
              <b
                className={
                  group.changePercent >= 0
                    ? styles.groupPositive
                    : styles.groupNegative
                }
              >
                {formatGroupChange(group)}
              </b>
            </button>

            <div className={styles.mobileTileGrid}>
              {group.items.map((item) => {
                const accessibleLabel = `${item.ticker}, ${item.name}, ${formatItemChange(
                  item,
                )}`;

                return (
                  <Link
                    href={`/etf/${encodeURIComponent(item.ticker)}`}
                    className={styles.mobileTile}
                    data-quoted={item.price > 0 ? "true" : "false"}
                    style={{ background: tileBackground(item) }}
                    aria-label={accessibleLabel}
                    title={`${item.name} · ${item.provider} · ${formatItemChange(
                      item,
                    )}`}
                    key={`mobile-${group.key}-${item.ticker}`}
                  >
                    <span>{item.ticker}</span>
                    <strong>{formatItemChange(item)}</strong>
                    <small>{formatPrice(item)}</small>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div
        className={styles.treemap}
        aria-label={`Carte de ${normalizedItems.length} ETF canadiens`}
        data-layout-ready="true"
      >
        {positionedGroups.map(
          ({
            group,
            rect,
            headerHeight,
            tiles,
          }) => {
            const compactHeader =
              rect.width /
                viewport.width <
                0.16 ||
              rect.height /
                viewport.height <
                0.075;

            const groupStyle = {
              left: percent(
                rect.x,
                viewport.width,
              ),
              top: percent(
                rect.y,
                viewport.height,
              ),
              width: percent(
                rect.width,
                viewport.width,
              ),
              height: percent(
                rect.height,
                viewport.height,
              ),
            } as CSSProperties;

            return (
              <article
                className={styles.group}
                data-compact={
                  compactHeader
                    ? "true"
                    : "false"
                }
                key={group.key}
                style={groupStyle}
              >
                <button
                  type="button"
                  className={
                    styles.groupHeader
                  }
                  style={{
                    height: percent(
                      headerHeight,
                      rect.height,
                    ),
                    minHeight: 0,
                  }}
                  onClick={() =>
                    setExpandedGroup(
                      (current) =>
                        current === group.key
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
                      group.changePercent >= 0
                        ? styles.groupPositive
                        : styles.groupNegative
                    }
                  >
                    {formatGroupChange(group)}
                  </span>
                </button>

                {tiles.map(
                  ({ item, rect: tileRect }) => {
                    const detail =
                      detailLevel(
                        tileRect,
                        viewport,
                      );
                    const relativeX =
                      tileRect.x - rect.x;
                    const relativeY =
                      tileRect.y - rect.y;
                    const relativeStyle = {
                      left: percent(
                        relativeX,
                        rect.width,
                      ),
                      top: percent(
                        relativeY,
                        rect.height,
                      ),
                      width: percent(
                        tileRect.width,
                        rect.width,
                      ),
                      height: percent(
                        tileRect.height,
                        rect.height,
                      ),
                      background:
                        tileBackground(item),
                    } as CSSProperties;
                    const accessibleLabel = `${item.ticker}, ${item.name}, ${formatItemChange(
                      item,
                    )}`;

                    if (detail === 0) {
                      const showMicroChange =
                        tileRect.width >= 30 &&
                        tileRect.height >= 22;

                      return (
                        <Link
                          href={`/etf/${encodeURIComponent(
                            item.ticker,
                          )}`}
                          className={
                            styles.microTile
                          }
                          style={relativeStyle}
                          aria-label={
                            accessibleLabel
                          }
                          title={
                            accessibleLabel
                          }
                          key={item.ticker}
                        >
                          <span
                            className={
                              styles.microSymbol
                            }
                          >
                            {item.ticker}
                          </span>
                          {showMicroChange ? (
                            <small
                              className={
                                styles.microChange
                              }
                            >
                              {formatItemChange(
                                item,
                              )}
                            </small>
                          ) : null}
                        </Link>
                      );
                    }

                    return (
                      <Link
                        href={`/etf/${encodeURIComponent(
                          item.ticker,
                        )}`}
                        className={styles.tile}
                        data-detail={detail}
                        style={relativeStyle}
                        key={item.ticker}
                        aria-label={
                          accessibleLabel
                        }
                        title={`${item.name} · ${item.provider} · ${item.sector} · ${formatItemChange(
                          item,
                        )}`}
                      >
                        <span
                          className={
                            styles.tileSymbol
                          }
                        >
                          {item.ticker}
                        </span>

                        {detail >= 1 ? (
                          <strong>
                            {formatItemChange(
                              item,
                            )}
                          </strong>
                        ) : null}

                        {detail >= 3 ? (
                          <>
                            <small>
                              {formatPrice(item)}
                            </small>
                            <span
                              className={
                                styles.tileName
                              }
                            >
                              {item.name}
                            </span>
                          </>
                        ) : null}

                        {item.delayed &&
                        detail >= 3 ? (
                          <span
                            className={
                              styles.delayed
                            }
                          >
                            différé
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
      </div>
    </section>
  );
}
