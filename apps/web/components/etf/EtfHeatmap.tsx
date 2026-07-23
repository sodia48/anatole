"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

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

type GroupingMode = "sector" | "provider" | "direction";
type DensityMode = "100" | "all" | "50";

type Group = {
  key: string;
  label: string;
  items: EtfHeatmapItem[];
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

type LayoutItem<T> = {
  item: T;
  rect: Rect;
};

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 690;
const OUTER_GAP = 5;
const GROUP_HEADER_HEIGHT = 25;
const GROUP_INSET = 4;
const MIN_WEIGHT = 0.65;

const GROUPING_LABELS: Record<GroupingMode, string> = {
  sector: "Par secteur",
  provider: "Par fournisseur",
  direction: "Gagnants / perdants",
};

const DENSITY_LABELS: Record<DensityMode, string> = {
  "100": "100 plus liquides",
  all: "Tous les ETF",
  "50": "50 plus liquides",
};

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function liquidityWeight(item: EtfHeatmapItem): number {
  if (item.volume <= 0) {
    return MIN_WEIGHT;
  }

  // Logarithmic liquidity avoids one heavily traded ETF swallowing the map.
  return Math.max(
    1 + Math.log10(item.volume + 1),
    MIN_WEIGHT,
  );
}

function weightedChange(items: EtfHeatmapItem[]): number {
  const available = items.filter(
    (item) => item.price > 0,
  );

  if (!available.length) {
    return 0;
  }

  const totalWeight = available.reduce(
    (sum, item) => sum + liquidityWeight(item),
    0,
  );

  return available.reduce(
    (sum, item) =>
      sum + item.changePercent * liquidityWeight(item),
    0,
  ) / totalWeight;
}

function createGroup(
  key: string,
  label: string,
  items: EtfHeatmapItem[],
): Group {
  const sorted = [...items].sort(
    (left, right) =>
      liquidityWeight(right) - liquidityWeight(left),
  );

  return {
    key,
    label,
    items: sorted,
    weight: sorted.reduce(
      (sum, item) => sum + liquidityWeight(item),
      0,
    ),
    changePercent: weightedChange(sorted),
    advancers: sorted.filter(
      (item) =>
        item.price > 0 &&
        item.changePercent > 0.005,
    ).length,
    decliners: sorted.filter(
      (item) =>
        item.price > 0 &&
        item.changePercent < -0.005,
    ).length,
  };
}

function buildGroups(
  items: EtfHeatmapItem[],
  mode: GroupingMode,
): Group[] {
  if (mode === "direction") {
    return [
      createGroup(
        "gainers",
        "Hausses",
        items.filter(
          (item) =>
            item.price > 0 &&
            item.changePercent > 0.005,
        ),
      ),
      createGroup(
        "unchanged",
        "Inchangés / sans cotation",
        items.filter(
          (item) =>
            item.price <= 0 ||
            (
              item.changePercent >= -0.005 &&
              item.changePercent <= 0.005
            ),
        ),
      ),
      createGroup(
        "losers",
        "Baisses",
        items.filter(
          (item) =>
            item.price > 0 &&
            item.changePercent < -0.005,
        ),
      ),
    ].filter((group) => group.items.length > 0);
  }

  const grouped = new Map<string, EtfHeatmapItem[]>();

  for (const item of items) {
    const key =
      mode === "provider"
        ? item.provider || "Autres fournisseurs"
        : item.sector || "Autres expositions";

    const current = grouped.get(key) ?? [];
    current.push(item);
    grouped.set(key, current);
  }

  return [...grouped.entries()]
    .map(([key, groupItems]) =>
      createGroup(key, key, groupItems),
    )
    .sort(
      (left, right) => right.weight - left.weight,
    );
}

/**
 * Dependency-free binary treemap using a single SVG coordinate system.
 * It preserves the professional rectangular layout used by the stock map.
 */
function binaryTreemap<T>(
  items: T[],
  getWeight: (item: T) => number,
  rect: Rect,
): LayoutItem<T>[] {
  if (!items.length) {
    return [];
  }

  if (items.length === 1) {
    return [{ item: items[0], rect }];
  }

  const sorted = [...items].sort(
    (left, right) =>
      getWeight(right) - getWeight(left),
  );
  const weights = sorted.map((item) =>
    Math.max(getWeight(item), 0.0001),
  );
  const total = weights.reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const target = total / 2;

  let running = 0;
  let splitIndex = 1;

  for (
    let index = 0;
    index < sorted.length - 1;
    index += 1
  ) {
    const before = running;
    running += weights[index];
    splitIndex = index + 1;

    if (running >= target) {
      if (
        index > 0 &&
        Math.abs(target - before) <
          Math.abs(target - running)
      ) {
        splitIndex = index;
      }
      break;
    }
  }

  const first = sorted.slice(0, splitIndex);
  const second = sorted.slice(splitIndex);
  const firstWeight = first.reduce(
    (sum, item) =>
      sum + Math.max(getWeight(item), 0.0001),
    0,
  );
  const ratio = clamp(
    firstWeight / total,
    0.035,
    0.965,
  );

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

function marketColor(
  item: EtfHeatmapItem,
): string {
  if (item.price <= 0) {
    return "hsl(212 23% 31%)";
  }

  const intensity = clamp(
    Math.abs(item.changePercent) / 4.5,
    0.08,
    1,
  );

  if (item.changePercent > 0.005) {
    return `hsl(165 69% ${27 + intensity * 12}%)`;
  }

  if (item.changePercent < -0.005) {
    return `hsl(346 48% ${29 + intensity * 11}%)`;
  }

  return "hsl(213 25% 38%)";
}

function groupColor(
  group: Group,
): string {
  const quoted = group.items.some(
    (item) => item.price > 0,
  );

  if (!quoted) {
    return "rgba(52, 83, 105, 0.95)";
  }

  if (group.changePercent > 0.005) {
    return "rgba(12, 111, 91, 0.95)";
  }

  if (group.changePercent < -0.005) {
    return "rgba(108, 56, 75, 0.95)";
  }

  return "rgba(52, 83, 105, 0.95)";
}

function insetRect(
  rect: Rect,
  amount: number,
): Rect {
  return {
    x: rect.x + amount,
    y: rect.y + amount,
    width: Math.max(
      rect.width - amount * 2,
      1,
    ),
    height: Math.max(
      rect.height - amount * 2,
      1,
    ),
  };
}

function formatChange(
  item: EtfHeatmapItem,
): string {
  if (item.price <= 0) {
    return "N/D";
  }

  return `${
    item.changePercent >= 0 ? "+" : ""
  }${item.changePercent.toFixed(2)}%`;
}

function formatGroupChange(
  group: Group,
): string {
  if (
    !group.items.some(
      (item) => item.price > 0,
    )
  ) {
    return "N/D";
  }

  return `${
    group.changePercent >= 0 ? "+" : ""
  }${group.changePercent.toFixed(2)}%`;
}

function formatPrice(
  item: EtfHeatmapItem,
): string {
  if (item.price <= 0) {
    return "Cotation en attente";
  }

  return item.price.toLocaleString("fr-CA", {
    style: "currency",
    currency: item.currency || "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function tileTextSize(
  rect: Rect,
): {
  symbol: number;
  change: number;
  showChange: boolean;
  showPrice: boolean;
} {
  const minSide = Math.min(
    rect.width,
    rect.height,
  );
  const area = rect.width * rect.height;

  if (minSide < 26 || area < 1_150) {
    return {
      symbol: 7.5,
      change: 0,
      showChange: false,
      showPrice: false,
    };
  }

  if (minSide < 44 || area < 3_000) {
    return {
      symbol: 9.5,
      change: 8,
      showChange: true,
      showPrice: false,
    };
  }

  if (minSide > 110 && area > 18_000) {
    return {
      symbol: 18,
      change: 14,
      showChange: true,
      showPrice: true,
    };
  }

  return {
    symbol: 12.5,
    change: 10.5,
    showChange: true,
    showPrice: area > 7_000,
  };
}

function densityItems(
  items: EtfHeatmapItem[],
  density: DensityMode,
): EtfHeatmapItem[] {
  if (density === "all") {
    return items;
  }

  const limit = density === "50" ? 50 : 100;

  return [...items]
    .sort((left, right) => {
      const liquidityDifference =
        right.volume - left.volume;

      if (liquidityDifference !== 0) {
        return liquidityDifference;
      }

      const quoteDifference =
        Number(right.price > 0) -
        Number(left.price > 0);

      if (quoteDifference !== 0) {
        return quoteDifference;
      }

      return left.ticker.localeCompare(
        right.ticker,
      );
    })
    .slice(0, limit);
}

export function EtfHeatmap({
  items,
}: {
  items: EtfHeatmapItem[];
}) {
  const router = useRouter();
  const [grouping, setGrouping] =
    useState<GroupingMode>("sector");
  const [density, setDensity] =
    useState<DensityMode>("100");
  const [expandedGroup, setExpandedGroup] =
    useState<string | null>(null);

  const visibleItems = useMemo(
    () => densityItems(items, density),
    [density, items],
  );

  const groups = useMemo(
    () => buildGroups(visibleItems, grouping),
    [grouping, visibleItems],
  );

  const visibleGroups = useMemo(() => {
    if (!expandedGroup) {
      return groups;
    }

    return groups.filter(
      (group) => group.key === expandedGroup,
    );
  }, [expandedGroup, groups]);

  const groupLayout = useMemo(
    () =>
      binaryTreemap(
        visibleGroups,
        (group) => Math.max(group.weight, 0.0001),
        {
          x: OUTER_GAP,
          y: OUTER_GAP,
          width:
            VIEW_WIDTH - OUTER_GAP * 2,
          height:
            VIEW_HEIGHT - OUTER_GAP * 2,
        },
      ),
    [visibleGroups],
  );

  function openEtf(
    item: EtfHeatmapItem,
  ): void {
    router.push(
      `/focus/${encodeURIComponent(
        item.ticker,
      )}`,
    );
  }

  function handleTileKey(
    event: KeyboardEvent<SVGGElement>,
    item: EtfHeatmapItem,
  ): void {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      openEtf(item);
    }
  }

  if (!items.length) {
    return (
      <section
        className="panel"
        style={{
          minHeight: 300,
          display: "grid",
          placeItems: "center",
          color: "var(--muted)",
        }}
      >
        Aucun ETF disponible pour la carte.
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
    height: "clamp(520px, 67vh, 720px)",
    display: "block",
    overflow: "hidden",
    border:
      "1px solid rgba(92, 126, 148, 0.66)",
    borderRadius: 10,
    background:
      "linear-gradient(145deg, rgba(54, 58, 64, 0.98), rgba(28, 38, 47, 0.99))",
  };

  return (
    <section
      className="panel"
      style={sectionStyle}
    >
      <header
        style={{
          minHeight: 45,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <span className="eyebrow">
            CARTE DES ETF
          </span>
          <h2
            style={{
              margin: "3px 0 0",
              fontSize:
                "clamp(21px, 2vw, 29px)",
            }}
          >
            ETF canadiens
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              color: "#77a6c6",
              fontSize: 11,
            }}
          >
            Taille des blocs : liquidité ·
            couleur : variation de séance
          </p>
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
            aria-label="Nombre d’ETF affichés"
            value={density}
            onChange={(event) => {
              setDensity(
                event.target.value as DensityMode,
              );
              setExpandedGroup(null);
            }}
            style={{
              height: 34,
              minWidth: 158,
              padding:
                "0 30px 0 10px",
              border:
                "1px solid var(--border)",
              borderRadius: 9,
              background:
                "rgba(5, 18, 29, 0.95)",
              color: "var(--text)",
              fontSize: 11,
            }}
          >
            {Object.entries(
              DENSITY_LABELS,
            ).map(([value, label]) => (
              <option
                value={value}
                key={value}
              >
                {label}
              </option>
            ))}
          </select>

          <select
            aria-label="Regroupement des ETF"
            value={grouping}
            onChange={(event) => {
              setGrouping(
                event.target
                  .value as GroupingMode,
              );
              setExpandedGroup(null);
            }}
            style={{
              height: 34,
              minWidth: 178,
              padding:
                "0 30px 0 10px",
              border:
                "1px solid var(--border)",
              borderRadius: 9,
              background:
                "rgba(5, 18, 29, 0.95)",
              color: "var(--text)",
              fontSize: 11,
            }}
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

          {expandedGroup ? (
            <button
              type="button"
              onClick={() =>
                setExpandedGroup(null)
              }
              style={{
                height: 34,
                padding: "0 11px",
                border:
                  "1px solid var(--border)",
                borderRadius: 9,
                background:
                  "rgba(5, 18, 29, 0.95)",
                color: "var(--text)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Voir tous les groupes
            </button>
          ) : (
            <span
              style={{
                color: "#77a6c6",
                fontSize: 10,
              }}
            >
              Clique sur un groupe pour
              l’agrandir
            </span>
          )}
        </div>
      </header>

      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Carte sectorielle des ETF canadiens"
        style={canvasStyle}
      >
        {groupLayout.map(
          ({ item: group, rect }) => {
            const groupRect = insetRect(
              rect,
              1.5,
            );
            const headerHeight = Math.min(
              GROUP_HEADER_HEIGHT,
              Math.max(
                18,
                groupRect.height * 0.12,
              ),
            );

            const itemsRect: Rect = {
              x:
                groupRect.x +
                GROUP_INSET,
              y:
                groupRect.y +
                headerHeight +
                GROUP_INSET,
              width: Math.max(
                groupRect.width -
                  GROUP_INSET * 2,
                1,
              ),
              height: Math.max(
                groupRect.height -
                  headerHeight -
                  GROUP_INSET * 2,
                1,
              ),
            };

            const itemLayout =
              binaryTreemap(
                group.items,
                liquidityWeight,
                itemsRect,
              );

            return (
              <g key={group.key}>
                <rect
                  x={groupRect.x}
                  y={groupRect.y}
                  width={groupRect.width}
                  height={groupRect.height}
                  fill="rgba(50, 58, 65, 0.82)"
                  stroke="rgba(232, 238, 242, 0.82)"
                  strokeWidth={1.7}
                />

                <g
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setExpandedGroup(
                      (current) =>
                        current === group.key
                          ? null
                          : group.key,
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key ===
                        "Enter" ||
                      event.key === " "
                    ) {
                      event.preventDefault();
                      setExpandedGroup(
                        (current) =>
                          current ===
                          group.key
                            ? null
                            : group.key,
                      );
                    }
                  }}
                  style={{
                    cursor: "pointer",
                  }}
                >
                  <rect
                    x={groupRect.x}
                    y={groupRect.y}
                    width={groupRect.width}
                    height={headerHeight}
                    fill={groupColor(group)}
                    stroke="rgba(232, 238, 242, 0.72)"
                    strokeWidth={1}
                  />

                  <text
                    x={groupRect.x + 7}
                    y={
                      groupRect.y +
                      headerHeight / 2 +
                      4
                    }
                    fill="#ffffff"
                    fontSize={Math.min(
                      12,
                      Math.max(
                        7.5,
                        groupRect.width / 24,
                      ),
                    )}
                    fontWeight={700}
                    pointerEvents="none"
                  >
                    {group.label}
                  </text>

                  {groupRect.width > 120 ? (
                    <text
                      x={
                        groupRect.x +
                        groupRect.width -
                        7
                      }
                      y={
                        groupRect.y +
                        headerHeight / 2 +
                        4
                      }
                      fill="#ffffff"
                      fontSize={8.5}
                      fontWeight={800}
                      textAnchor="end"
                      pointerEvents="none"
                    >
                      {formatGroupChange(
                        group,
                      )}
                    </text>
                  ) : null}
                </g>

                {itemLayout.map(
                  ({
                    item,
                    rect: rawItemRect,
                  }) => {
                    const itemRect =
                      insetRect(
                        rawItemRect,
                        1.25,
                      );
                    const textSize =
                      tileTextSize(itemRect);
                    const textX =
                      itemRect.x + 5;
                    const textY =
                      itemRect.y +
                      textSize.symbol +
                      4;

                    return (
                      <g
                        key={item.ticker}
                        role="link"
                        tabIndex={0}
                        onClick={() =>
                          openEtf(item)
                        }
                        onKeyDown={(event) =>
                          handleTileKey(
                            event,
                            item,
                          )
                        }
                        style={{
                          cursor:
                            "pointer",
                        }}
                      >
                        <title>
                          {`${item.ticker} · ${item.name} · ${item.provider} · ${formatPrice(
                            item,
                          )} · ${formatChange(
                            item,
                          )}`}
                        </title>

                        <rect
                          x={itemRect.x}
                          y={itemRect.y}
                          width={
                            itemRect.width
                          }
                          height={
                            itemRect.height
                          }
                          rx={1}
                          fill={marketColor(
                            item,
                          )}
                          stroke="rgba(238, 242, 245, 0.88)"
                          strokeWidth={1.25}
                        />

                        <text
                          x={textX}
                          y={textY}
                          fill="#ffffff"
                          fontSize={
                            textSize.symbol
                          }
                          fontWeight={850}
                          pointerEvents="none"
                        >
                          {item.ticker}
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
                            fontSize={
                              textSize.change
                            }
                            fontWeight={700}
                            pointerEvents="none"
                          >
                            {formatChange(
                              item,
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
                            {formatPrice(
                              item,
                            )}
                          </text>
                        ) : null}
                      </g>
                    );
                  },
                )}
              </g>
            );
          },
        )}
      </svg>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: 12,
          flexWrap: "wrap",
          color: "#6f9eb9",
          fontSize: 10,
        }}
      >
        <span>
          {visibleItems.length} ETF
          affichés ·{" "}
          {
            visibleItems.filter(
              (item) => item.price > 0,
            ).length
          }{" "}
          cotations disponibles
        </span>
        <span>
          {groups.reduce(
            (sum, group) =>
              sum + group.advancers,
            0,
          )}
          ↑ ·{" "}
          {groups.reduce(
            (sum, group) =>
              sum + group.decliners,
            0,
          )}
          ↓
        </span>
      </div>
    </section>
  );
}
