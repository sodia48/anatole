"use client";

import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type EtfHistoryPoint,
  type EtfHistoryRange,
  type EtfHistorySnapshot,
  getEtfHistory,
} from "../../lib/etf-holdings-api";

import styles from "../../app/etf/[ticker]/page.module.css";

const RANGE_OPTIONS: Array<{
  value: EtfHistoryRange;
  label: string;
}> = [
  { value: "5d", label: "5J" },
  { value: "1mo", label: "1M" },
  { value: "ytd", label: "YTD" },
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1A" },
  { value: "5y", label: "5A" },
  { value: "10y", label: "10A" },
];

const WIDTH = 1000;
const HEIGHT = 390;
const MARGIN = {
  top: 25,
  right: 76,
  bottom: 45,
  left: 26,
};

function formatMoney(
  value: number | null,
  currency: string,
): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/D";
  }

  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/D";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)} %`;
}

function formatDate(
  timestamp: string,
  range: EtfHistoryRange,
): string {
  const date = new Date(timestamp);

  if (range === "5d") {
    return new Intl.DateTimeFormat("fr-CA", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Toronto",
    }).format(date);
  }

  if (range === "5y" || range === "10y") {
    return new Intl.DateTimeFormat("fr-CA", {
      month: "short",
      year: "numeric",
      timeZone: "America/Toronto",
    }).format(date);
  }

  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric",
    month: "short",
    year:
      range === "1y" ||
      range === "ytd" ||
      range === "6mo"
        ? "2-digit"
        : undefined,
    timeZone: "America/Toronto",
  }).format(date);
}

function chartGeometry(points: EtfHistoryPoint[]) {
  if (!points.length) {
    return null;
  }

  const closes = points.map((point) => point.close);
  const rawMinimum = Math.min(...closes);
  const rawMaximum = Math.max(...closes);
  const rawRange = Math.max(
    rawMaximum - rawMinimum,
    rawMaximum * 0.01,
    0.01,
  );
  const minimum = rawMinimum - rawRange * 0.12;
  const maximum = rawMaximum + rawRange * 0.12;
  const plotWidth =
    WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight =
    HEIGHT - MARGIN.top - MARGIN.bottom;

  const x = (index: number): number =>
    MARGIN.left +
    (points.length === 1
      ? plotWidth / 2
      : (index / (points.length - 1)) * plotWidth);

  const y = (value: number): number =>
    MARGIN.top +
    ((maximum - value) / (maximum - minimum)) *
      plotHeight;

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${x(index).toFixed(
          2,
        )} ${y(point.close).toFixed(2)}`,
    )
    .join(" ");

  const areaPath = `${linePath} L ${x(
    points.length - 1,
  ).toFixed(2)} ${(MARGIN.top + plotHeight).toFixed(
    2,
  )} L ${x(0).toFixed(2)} ${(
    MARGIN.top + plotHeight
  ).toFixed(2)} Z`;

  const yTicks = Array.from(
    { length: 5 },
    (_, index) => {
      const ratio = index / 4;
      const value =
        maximum - ratio * (maximum - minimum);

      return {
        value,
        y: MARGIN.top + ratio * plotHeight,
      };
    },
  );

  const xTickIndexes = Array.from(
    new Set(
      Array.from({ length: 5 }, (_, index) =>
        Math.round(
          (index / 4) * (points.length - 1),
        ),
      ),
    ),
  );

  return {
    minimum,
    maximum,
    plotWidth,
    plotHeight,
    x,
    y,
    linePath,
    areaPath,
    yTicks,
    xTickIndexes,
  };
}

export function EtfPerformanceChart({
  ticker,
  currency,
}: {
  ticker: string;
  currency: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedRange, setSelectedRange] =
    useState<EtfHistoryRange>("1y");
  const [snapshot, setSnapshot] =
    useState<EtfHistorySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] =
    useState<string | null>(null);
  const [hoverIndex, setHoverIndex] =
    useState<number | null>(null);

  const load = useCallback(async () => {
    const controller = new AbortController();
    setLoading(true);

    try {
      const result = await getEtfHistory(
        ticker,
        selectedRange,
        controller.signal,
      );

      setSnapshot(result);
      setError(null);
      setHoverIndex(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "L’historique de cet ETF est indisponible.",
      );
    } finally {
      setLoading(false);
    }

    return () => controller.abort();
  }, [selectedRange, ticker]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const seconds =
      snapshot?.refresh_after_seconds ?? 300;
    const interval = window.setInterval(
      () => void load(),
      Math.max(seconds, 30) * 1000,
    );

    return () => window.clearInterval(interval);
  }, [load, snapshot?.refresh_after_seconds]);

  const geometry = useMemo(
    () => chartGeometry(snapshot?.points ?? []),
    [snapshot?.points],
  );

  const positive =
    (snapshot?.change_percent ?? 0) >= 0;
  const chartColor = positive
    ? "#20d5a6"
    : "#ff4c70";
  const gradientId = `etf-area-${ticker.replace(
    /[^a-z0-9]/gi,
    "-",
  )}`;

  const hoverPoint =
    hoverIndex !== null
      ? snapshot?.points[hoverIndex] ?? null
      : null;

  function handlePointer(
    event: MouseEvent<SVGSVGElement>,
  ): void {
    if (
      !svgRef.current ||
      !snapshot?.points.length ||
      !geometry
    ) {
      return;
    }

    const rect =
      svgRef.current.getBoundingClientRect();
    const relativeX =
      ((event.clientX - rect.left) / rect.width) *
      WIDTH;
    const boundedX = Math.min(
      MARGIN.left + geometry.plotWidth,
      Math.max(MARGIN.left, relativeX),
    );
    const ratio =
      (boundedX - MARGIN.left) /
      geometry.plotWidth;
    const index = Math.round(
      ratio * (snapshot.points.length - 1),
    );

    setHoverIndex(index);
  }

  return (
    <section className={styles.performancePanel}>
      <header className={styles.performanceHeader}>
        <div>
          <span className={styles.eyebrow}>
            PROGRESSION DE L’ETF
          </span>
          <h2>Historique du prix</h2>
          <p>
            Évolution du cours selon la période
            sélectionnée.
          </p>
        </div>

        <div className={styles.rangeTabs}>
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={
                selectedRange === option.value
                  ? styles.rangeTabActive
                  : styles.rangeTab
              }
              onClick={() =>
                setSelectedRange(option.value)
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.performanceSummary}>
        <div>
          <span>Performance</span>
          <strong
            className={
              positive
                ? styles.positive
                : styles.negative
            }
          >
            {formatPercent(
              snapshot?.change_percent ?? null,
            )}
          </strong>
        </div>
        <div>
          <span>Début</span>
          <strong>
            {formatMoney(
              snapshot?.first_close ?? null,
              snapshot?.currency ?? currency,
            )}
          </strong>
        </div>
        <div>
          <span>Dernier cours</span>
          <strong>
            {formatMoney(
              snapshot?.last_close ?? null,
              snapshot?.currency ?? currency,
            )}
          </strong>
        </div>
        <div>
          <span>Sommet</span>
          <strong>
            {formatMoney(
              snapshot?.period_high ?? null,
              snapshot?.currency ?? currency,
            )}
          </strong>
        </div>
        <div>
          <span>Creux</span>
          <strong>
            {formatMoney(
              snapshot?.period_low ?? null,
              snapshot?.currency ?? currency,
            )}
          </strong>
        </div>
      </div>

      <div className={styles.chartFrame}>
        {loading && snapshot === null ? (
          <div className={styles.chartLoading}>
            Chargement de la progression…
          </div>
        ) : null}

        {!loading &&
        (!snapshot ||
          snapshot.status === "unavailable" ||
          !snapshot.points.length) ? (
          <div className={styles.chartLoading}>
            {error ??
              snapshot?.message ??
              "Aucun historique disponible pour cette période."}
          </div>
        ) : null}

        {snapshot?.points.length && geometry ? (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            className={styles.performanceChart}
            onMouseMove={handlePointer}
            onMouseLeave={() => setHoverIndex(null)}
            role="img"
            aria-label={`Progression de ${ticker} sur ${snapshot.range_label}`}
          >
            <defs>
              <linearGradient
                id={gradientId}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={chartColor}
                  stopOpacity="0.32"
                />
                <stop
                  offset="100%"
                  stopColor={chartColor}
                  stopOpacity="0.01"
                />
              </linearGradient>
            </defs>

            {geometry.yTicks.map((tick) => (
              <g key={tick.y}>
                <line
                  x1={MARGIN.left}
                  x2={WIDTH - MARGIN.right}
                  y1={tick.y}
                  y2={tick.y}
                  stroke="rgba(91, 132, 155, 0.18)"
                  strokeWidth="1"
                />
                <text
                  x={WIDTH - MARGIN.right + 9}
                  y={tick.y + 4}
                  fill="#769db4"
                  fontSize="10"
                >
                  {tick.value.toFixed(2)}
                </text>
              </g>
            ))}

            {geometry.xTickIndexes.map((index) => (
              <text
                key={index}
                x={geometry.x(index)}
                y={HEIGHT - 15}
                fill="#769db4"
                fontSize="10"
                textAnchor={
                  index === 0
                    ? "start"
                    : index ===
                        snapshot.points.length - 1
                      ? "end"
                      : "middle"
                }
              >
                {formatDate(
                  snapshot.points[index].timestamp,
                  selectedRange,
                )}
              </text>
            ))}

            <path
              d={geometry.areaPath}
              fill={`url(#${gradientId})`}
            />
            <path
              d={geometry.linePath}
              fill="none"
              stroke={chartColor}
              strokeWidth="2.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {hoverPoint !== null &&
            hoverIndex !== null ? (
              <g pointerEvents="none">
                <line
                  x1={geometry.x(hoverIndex)}
                  x2={geometry.x(hoverIndex)}
                  y1={MARGIN.top}
                  y2={
                    MARGIN.top +
                    geometry.plotHeight
                  }
                  stroke="rgba(221, 237, 246, 0.52)"
                  strokeDasharray="4 4"
                />
                <circle
                  cx={geometry.x(hoverIndex)}
                  cy={geometry.y(hoverPoint.close)}
                  r="5"
                  fill={chartColor}
                  stroke="#f7fbfd"
                  strokeWidth="2"
                />
                <g
                  transform={`translate(${Math.min(
                    WIDTH - 220,
                    Math.max(
                      18,
                      geometry.x(hoverIndex) - 92,
                    ),
                  )}, ${Math.max(
                    18,
                    geometry.y(hoverPoint.close) - 74,
                  )})`}
                >
                  <rect
                    width="184"
                    height="57"
                    rx="9"
                    fill="rgba(4, 23, 35, 0.96)"
                    stroke="rgba(74, 130, 160, 0.8)"
                  />
                  <text
                    x="12"
                    y="20"
                    fill="#80abc3"
                    fontSize="10"
                  >
                    {formatDate(
                      hoverPoint.timestamp,
                      selectedRange,
                    )}
                  </text>
                  <text
                    x="12"
                    y="43"
                    fill="#f3f8fb"
                    fontSize="15"
                    fontWeight="800"
                  >
                    {formatMoney(
                      hoverPoint.close,
                      snapshot.currency,
                    )}
                  </text>
                </g>
              </g>
            ) : null}
          </svg>
        ) : null}
      </div>

      {error && snapshot?.points.length ? (
        <p className={styles.chartWarning}>
          {error} La dernière série chargée reste
          affichée.
        </p>
      ) : null}
    </section>
  );
}
