"use client";

import {
  type ChangeEvent,
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";

import styles from "../cockpit/MarketHeatmap.module.css";

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

function finiteNumber(
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
  raw: EtfHeatmapItem,
): EtfHeatmapItem | null {
  const ticker = String(
    raw.ticker ?? "",
  )
    .trim()
    .toUpperCase();

  if (!ticker) {
    return null;
  }

  return {
    ticker,
    name:
      String(raw.name ?? "").trim() ||
      ticker,
    provider:
      String(raw.provider ?? "").trim() ||
      "Autres fournisseurs",
    sector:
      String(raw.sector ?? "").trim() ||
      "Autres expositions",
    exposure:
      String(raw.exposure ?? "").trim(),
    region:
      String(raw.region ?? "").trim(),
    price: Math.max(
      finiteNumber(raw.price),
      0,
    ),
    changePercent: finiteNumber(
      raw.changePercent,
    ),
    volume: Math.max(
      finiteNumber(raw.volume),
      0,
    ),
    currency:
      String(raw.currency ?? "CAD")
        .trim()
        .toUpperCase() || "CAD",
    delayed: Boolean(raw.delayed),
    source: String(raw.source ?? "").trim(),
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
        label: "Inchangés / sans cotation",
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
  const ratio =
    totalWeight > 0
      ? firstTotal / totalWeight
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
      "linear-gradient(145deg, " +
      "rgba(67, 91, 111, .94), " +
      "rgba(31, 51, 67, .98))"
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
): 0 | 1 | 2 | 3 {
  const area =
    rect.width * rect.height;

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

export function EtfHeatmap({
  items,
}: {
  items: EtfHeatmapItem[];
}) {
  const [grouping, setGrouping] =
    useState<GroupingMode>("sector");
  const [expandedGroup, setExpandedGroup] =
    useState<string | null>(null);
  const canvasRef =
    useRef<HTMLDivElement | null>(
      null,
    );
  const [canvasSize, setCanvasSize] =
    useState({
      width: 0,
      height: 0,
    });

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
    setExpandedGroup(null);
  }, [grouping]);

  useEffect(() => {
    const element = canvasRef.current;

    if (!element) {
      return;
    }

    const update = () => {
      setCanvasSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    update();

    const observer =
      new ResizeObserver(update);

    observer.observe(element);

    return () =>
      observer.disconnect();
  }, []);

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
    const { width, height } =
      canvasSize;

    if (width <= 0 || height <= 0) {
      return [];
    }

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
          width - outerPadding * 2,
        height:
          height - outerPadding * 2,
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
          26,
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
  }, [canvasSize, visibleGroups]);



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
            Tous les ETF sont affichés ·
            taille selon la liquidité ·
            couleur selon la variation.
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
        ref={canvasRef}
        className={styles.treemap}
        aria-label={`Carte de ${normalizedItems.length} ETF canadiens`}
      >
        {positionedGroups.map(
          ({
            group,
            rect,
            headerHeight,
            tiles,
          }) => {
            const compactHeader =
              rect.width < 120 ||
              rect.height < 82;

            return (
              <article
                className={styles.group}
                data-compact={
                  compactHeader
                    ? "true"
                    : "false"
                }
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
                  className={
                    styles.groupHeader
                  }
                  style={{
                    height: headerHeight,
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
                    {formatChange(
                      group.changePercent,
                    )}
                  </span>
                </button>

                {tiles.map(
                  ({ item, rect: tileRect }) => {
                    const detail =
                      detailLevel(tileRect);
                    const relativeStyle = {
                      left:
                        tileRect.x - rect.x,
                      top:
                        tileRect.y - rect.y,
                      width: tileRect.width,
                      height: tileRect.height,
                      background:
                        tileBackground(item),
                    };
                    const accessibleLabel = `${item.ticker}, ${item.name}, ${formatItemChange(
                      item,
                    )}`;

                    if (detail === 0) {
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
                        />
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

                        {detail >= 2 ? (
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
