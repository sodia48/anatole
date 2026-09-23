"use client";

import { RefreshCw } from "lucide-react";
import { useRef, useState } from "react";

import { getPortfolioPerformance } from "@/lib/api";
import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type {
  PortfolioPerformancePoint,
  PortfolioPerformanceRange,
  PortfolioPerformanceView,
  PortfolioSnapshot,
} from "@/lib/types";

import styles from "./Workspace.module.css";

const RANGE_OPTIONS: Array<{
  value: PortfolioPerformanceRange;
  label: string;
}> = [
  { value: "1w", label: "1S" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "ytd", label: "YTD" },
  { value: "1y", label: "1A" },
  { value: "5y", label: "5A" },
  { value: "10y", label: "10A" },
  { value: "max", label: "MAX" },
];

const BENCHMARKS = [
  { value: "^GSPTSE", label: "S&P/TSX Composite" },
  { value: "^GSPC", label: "S&P 500" },
  { value: "VFV", label: "VFV · S&P 500 CAD" },
  { value: "XIC", label: "XIC · TSX Composite" },
  { value: "XIU", label: "XIU · TSX 60" },
  { value: "custom", label: "ETF / ticker personnalisé" },
] as const;

function cutoffForRange(
  range: PortfolioPerformanceRange,
  lastTime: number,
): number | null {
  if (range === "max" || range === "1y") return null;

  const end = new Date(lastTime * 1000);
  if (range === "ytd") {
    return Date.UTC(end.getUTCFullYear(), 0, 1) / 1000;
  }

  const days = range === "1w" ? 9 : range === "1m" ? 33 : 96;
  return lastTime - days * 86_400;
}

function rebaseLocalPoints(
  points: PortfolioPerformancePoint[],
  range: PortfolioPerformanceRange,
): PortfolioPerformancePoint[] {
  if (!points.length || range === "max") return [];

  const lastTime = points[points.length - 1].time;
  const cutoff = cutoffForRange(range, lastTime);
  const filtered = cutoff === null
    ? points
    : points.filter((point) => point.time >= cutoff);

  if (filtered.length < 2) return filtered;

  const first = filtered[0];
  const firstPortfolio = first.portfolio || 100;
  const firstBenchmark = first.benchmark;

  return filtered.map((point) => ({
    time: point.time,
    portfolio: Number(
      ((point.portfolio / firstPortfolio) * 100).toFixed(4),
    ),
    benchmark:
      point.benchmark !== null
      && firstBenchmark !== null
      && firstBenchmark !== 0
        ? Number(
            ((point.benchmark / firstBenchmark) * 100).toFixed(4),
          )
        : null,
  }));
}

function returnsFromPoints(points: PortfolioPerformancePoint[]): {
  portfolio: number | null;
  benchmark: number | null;
  excess: number | null;
} {
  if (points.length < 2) {
    return { portfolio: null, benchmark: null, excess: null };
  }

  const last = points[points.length - 1];
  const portfolio = last.portfolio - 100;
  const benchmark = last.benchmark === null
    ? null
    : last.benchmark - 100;

  return {
    portfolio,
    benchmark,
    excess: benchmark === null ? null : portfolio - benchmark,
  };
}

function linePath(
  values: Array<{ time: number; value: number }>,
  minValue: number,
  maxValue: number,
  width: number,
  height: number,
): string {
  if (!values.length) return "";

  const left = 46;
  const right = 18;
  const top = 18;
  const bottom = 30;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const minTime = values[0].time;
  const maxTime = values[values.length - 1].time || minTime + 1;
  const range = Math.max(maxValue - minValue, 1);

  return values
    .map((point, index) => {
      const x = left + (
        (point.time - minTime)
        / Math.max(maxTime - minTime, 1)
      ) * chartWidth;
      const y = top + (
        1 - (point.value - minValue) / range
      ) * chartHeight;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function percent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/D";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} %`;
}

function chartDateLabel(
  time: number,
  range: PortfolioPerformanceRange,
  language: AnatoleLanguage,
): string {
  const date = new Date(time * 1000);
  const locale = language === "fr" ? "fr-CA" : "en-CA";

  if (["5y", "10y", "max"].includes(range)) {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  if (range === "1w" || range === "1m") {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function PerformanceChart({
  points,
  benchmarkName,
  language,
  range,
  loading,
  error,
  onRetry,
}: {
  points: PortfolioPerformancePoint[];
  benchmarkName: string;
  language: AnatoleLanguage;
  range: PortfolioPerformanceRange;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const width = 980;
  const height = 330;
  const portfolio = points.map((point) => ({
    time: point.time,
    value: point.portfolio,
  }));
  const benchmark = points
    .filter((point) => point.benchmark !== null)
    .map((point) => ({
      time: point.time,
      value: point.benchmark as number,
    }));

  const allValues = [...portfolio, ...benchmark].map(
    (point) => point.value,
  );
  const minValue = allValues.length ? Math.min(...allValues) : 90;
  const maxValue = allValues.length ? Math.max(...allValues) : 110;
  const padding = Math.max((maxValue - minValue) * 0.12, 2);
  const low = minValue - padding;
  const high = maxValue + padding;
  const ticks = Array.from(
    { length: 5 },
    (_, index) => high - ((high - low) / 4) * index,
  );
  const xTickIndexes = points.length >= 2
    ? [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
        Math.round((points.length - 1) * ratio))
    : [];

  if (loading && !points.length) {
    return (
      <div
        aria-busy="true"
        aria-label={pick(
          language,
          "Chargement de l’historique",
          "Loading history",
        )}
        className={`${styles.chartWrap} ${styles.chartState}`}
      >
        <div className={styles.skeleton} />
      </div>
    );
  }

  if (!points.length) {
    return (
      <div
        className={`${styles.chartWrap} ${styles.chartState}`}
        role={error ? "alert" : "status"}
      >
        <strong>
          {pick(
            language,
            "Historique du portefeuille temporairement indisponible.",
            "Portfolio history is temporarily unavailable.",
          )}
        </strong>
        <button
          className={styles.secondaryButton}
          onClick={onRetry}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={15} />
          {pick(language, "Réessayer", "Retry")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.chartWrap}>
        <svg
          className={styles.chart}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={
            benchmarkName === "S&P/TSX Composite"
              ? pick(
                  language,
                  "Performance du portefeuille et du TSX Composite",
                  "Portfolio and TSX Composite performance",
                )
              : pick(
                  language,
                  `Performance du portefeuille et de ${benchmarkName}`,
                  `Portfolio and ${benchmarkName} performance`,
                )
          }
        >
          {ticks.map((tick, index) => {
            const y = 18 + (index / 4) * (height - 48);
            return (
              <g key={`${tick}-${index}`}>
                <line
                  x1="46"
                  x2={width - 18}
                  y1={y}
                  y2={y}
                  stroke="rgba(75,111,135,.22)"
                />
                <text
                  className={styles.chartAxis}
                  x="8"
                  y={y + 4}
                >
                  {tick.toFixed(0)}
                </text>
              </g>
            );
          })}
          {xTickIndexes.map((pointIndex, index) => {
            const point = points[pointIndex];
            const x = 46 + (index / 4) * (width - 64);
            return (
              <text
                key={`x-${point.time}-${index}`}
                className={styles.chartAxis}
                x={x}
                y={height - 8}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === xTickIndexes.length - 1
                      ? "end"
                      : "middle"
                }
              >
                {chartDateLabel(point.time, range, language)}
              </text>
            );
          })}
          <path
            d={linePath(portfolio, low, high, width, height)}
            fill="none"
            stroke="#2d76ff"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d={linePath(benchmark, low, high, width, height)}
            fill="none"
            stroke="#16c79a"
            strokeWidth="2"
            strokeDasharray="7 6"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {error ? (
        <div className={styles.chartNotice}>{error}</div>
      ) : benchmark.length === 0 ? (
        <div className={styles.chartNotice}>
          {benchmarkName === "S&P/TSX Composite"
            ? pick(
                language,
                "La courbe du portefeuille reste disponible; l’historique du TSX Composite est temporairement indisponible.",
                "The portfolio curve remains available; TSX Composite history is temporarily unavailable.",
              )
            : pick(
                language,
                `La courbe du portefeuille reste disponible; l’historique de ${benchmarkName} est temporairement indisponible.`,
                `The portfolio curve remains available; ${benchmarkName} history is temporarily unavailable.`,
              )}
        </div>
      ) : null}
    </div>
  );
}

export function PortfolioPerformancePanel({
  snapshot,
  language,
}: {
  snapshot: PortfolioSnapshot;
  language: AnatoleLanguage;
}) {
  const [range, setRange] = useState<PortfolioPerformanceRange>("1y");
  const [benchmarkChoice, setBenchmarkChoice] = useState("^GSPTSE");
  const [customBenchmark, setCustomBenchmark] = useState("");
  const [remoteKey, setRemoteKey] = useState<string | null>(null);
  const [remote, setRemote] = useState<PortfolioPerformanceView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const cache = useRef(new Map<string, PortfolioPerformanceView>());

  const currentBenchmark = benchmarkChoice === "custom"
    ? customBenchmark.trim().toUpperCase()
    : benchmarkChoice;

  const useLocal =
    currentBenchmark === "^GSPTSE"
    && !["5y", "10y", "max"].includes(range);
  const localPoints = useLocal
    ? rebaseLocalPoints(snapshot.performance, range)
    : [];
  const key = `${range}:${currentBenchmark}`;
  const activeRemote = !useLocal && remoteKey === key ? remote : null;
  const points = activeRemote?.points ?? localPoints;
  const localReturns = returnsFromPoints(localPoints);
  const portfolioReturn = activeRemote?.portfolio_return_percent
    ?? localReturns.portfolio;
  const benchmarkReturn = activeRemote?.benchmark_return_percent
    ?? localReturns.benchmark;
  const excessReturn = activeRemote?.excess_return_percent
    ?? localReturns.excess;
  const coverage = activeRemote?.coverage_percent
    ?? snapshot.risk?.history_coverage_percent
    ?? 0;
  const historyStartYear = points.length
    ? new Date(points[0].time * 1000).getUTCFullYear()
    : null;

  const benchmarkName = activeRemote?.benchmark_name
    ?? (
      currentBenchmark === "^GSPTSE"
        ? "S&P/TSX Composite"
        : currentBenchmark
          ? BENCHMARKS.find(
              (item) => item.value === currentBenchmark,
            )?.label ?? currentBenchmark
          : pick(language, "Benchmark personnalisé", "Custom benchmark")
    );

  async function loadRemote(
    nextRange: PortfolioPerformanceRange,
    nextBenchmark: string,
  ): Promise<void> {
    const normalized = nextBenchmark.trim().toUpperCase();
    if (!normalized) return;

    const nextKey = `${nextRange}:${normalized}`;
    const cached = cache.current.get(nextKey);
    if (cached) {
      setRemote(cached);
      setRemoteKey(nextKey);
      setError(null);
      setLoading(false);
      return;
    }

    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    setRemoteKey(nextKey);

    try {
      const result = await getPortfolioPerformance(
        snapshot.positions.map((item) => ({
          symbol: item.symbol,
          market: item.market ?? "CA",
          weight_percent: item.weight_percent,
        })),
        normalized,
        nextRange,
      );

      if (sequence !== requestSequence.current) return;
      cache.current.set(nextKey, result);
      setRemote(result);
    } catch (reason) {
      if (sequence !== requestSequence.current) return;
      setRemote(null);
      setError(
        reason instanceof Error
          ? reason.message
          : pick(
              language,
              "Performance comparative indisponible.",
              "Comparative performance is unavailable.",
            ),
      );
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }

  function selectRange(nextRange: PortfolioPerformanceRange): void {
    setRange(nextRange);
    setError(null);

    if (
      currentBenchmark === "^GSPTSE"
      && !["5y", "10y", "max"].includes(nextRange)
    ) {
      requestSequence.current += 1;
      setRemote(null);
      setRemoteKey(null);
      setLoading(false);
      return;
    }

    void loadRemote(nextRange, currentBenchmark);
  }

  function selectBenchmark(value: string): void {
    setBenchmarkChoice(value);
    setError(null);

    if (value === "custom") {
      requestSequence.current += 1;
      setRemote(null);
      setRemoteKey(null);
      setLoading(false);
      return;
    }

    if (
      value === "^GSPTSE"
      && !["5y", "10y", "max"].includes(range)
    ) {
      requestSequence.current += 1;
      setRemote(null);
      setRemoteKey(null);
      setLoading(false);
      return;
    }

    void loadRemote(range, value);
  }

  function applyCustom(): void {
    const normalized = customBenchmark.trim().toUpperCase();
    if (!normalized) return;
    void loadRemote(range, normalized);
  }

  return (
    <section className={`panel ${styles.panel}`}>
      <div className={styles.performancePanelHeader}>
        <div>
          <span className="eyebrow">PERFORMANCE</span>
          <h2>
            {pick(
              language,
              `Portefeuille vs ${benchmarkName}`,
              `Portfolio vs ${benchmarkName}`,
            )}
          </h2>
          <p>
            {pick(
              language,
              "Base 100 reconstituée avec les poids actuels. Les flux réels seront intégrés à la prochaine phase.",
              "Base-100 reconstruction using current weights. Actual cash flows are coming in the next phase.",
            )}
          </p>
        </div>

        <div className={styles.performanceBenchmarkControls}>
          <label>
            <span>{pick(language, "Benchmark", "Benchmark")}</span>
            <select
              aria-label={pick(
                language,
                "Benchmark de performance",
                "Performance benchmark",
              )}
              value={benchmarkChoice}
              onChange={(event) => selectBenchmark(event.target.value)}
            >
              {BENCHMARKS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {benchmarkChoice === "custom" ? (
            <div className={styles.performanceCustomBenchmark}>
              <input
                aria-label={pick(
                  language,
                  "Ticker du benchmark",
                  "Benchmark ticker",
                )}
                placeholder="VFV, XIC, XIU…"
                value={customBenchmark}
                onChange={(event) => setCustomBenchmark(event.target.value)}
              />
              <button
                className={styles.secondaryButton}
                type="button"
                disabled={!customBenchmark.trim() || loading}
                onClick={applyCustom}
              >
                {pick(language, "Appliquer", "Apply")}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={styles.performanceRanges}
        role="group"
        aria-label={pick(
          language,
          "Période de performance",
          "Performance period",
        )}
      >
        {RANGE_OPTIONS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={
              range === item.value
                ? styles.performanceRangeActive
                : ""
            }
            aria-pressed={range === item.value}
            onClick={() => selectRange(item.value)}
          >
            {item.label}
          </button>
        ))}
        {range === "max" ? (
          <span className={styles.performanceRangeMeta}>
            {historyStartYear
              ? pick(
                  language,
                  `MAX : depuis ${historyStartYear}`,
                  `MAX: since ${historyStartYear}`,
                )
              : loading
                ? pick(
                    language,
                    "MAX : recherche du premier historique…",
                    "MAX: finding earliest history…",
                  )
                : pick(
                    language,
                    "MAX : historique indisponible",
                    "MAX: history unavailable",
                  )}
          </span>
        ) : null}
      </div>

      <div className={styles.performanceSummary}>
        <div>
          <span>{pick(language, "Portefeuille", "Portfolio")}</span>
          <strong>{percent(portfolioReturn)}</strong>
        </div>
        <div>
          <span>{benchmarkName}</span>
          <strong>{percent(benchmarkReturn)}</strong>
        </div>
        <div>
          <span>
            {pick(language, "Écart vs benchmark", "Excess vs benchmark")}
          </span>
          <strong>{percent(excessReturn)}</strong>
        </div>
        <div>
          <span>{pick(language, "Couverture", "Coverage")}</span>
          <strong>{coverage.toFixed(0)} %</strong>
        </div>
      </div>

      <div className={styles.legend}>
        <span style={{ color: "var(--accent-text)" }}>
          <i /> {pick(language, "Portefeuille", "Portfolio")}
        </span>
        <span style={{ color: "var(--positive-text)" }}>
          <i /> {benchmarkName}
        </span>
      </div>

      <PerformanceChart
        benchmarkName={benchmarkName}
        error={error}
        language={language}
        range={range}
        loading={loading}
        onRetry={() => void loadRemote(range, currentBenchmark)}
        points={points}
      />

      <div className={styles.performanceMethodology}>
        {activeRemote?.methodology
          ?? pick(
            language,
            "Les périodes jusqu’à 1 an réutilisent le snapshot déjà chargé : aucun appel réseau supplémentaire avec le TSX. MAX et les benchmarks alternatifs sont chargés à la demande puis mis en cache.",
            "Periods up to 1 year reuse the loaded snapshot: no extra network request with the TSX. MAX and alternate benchmarks load on demand and are then cached.",
          )}
      </div>
    </section>
  );
}
