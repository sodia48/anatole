"use client";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./FocusRangeChart.module.css";

type Candle = {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type FocusSnapshot = {
  quote?: {
    symbol?: string;
    price?: number;
    delayed?: boolean;
    timestamp?: string;
    source?: string;
  };
  history: Candle[];
  technicals?: Record<string, unknown>;
  generated_at?: string;
};

type PeriodKey =
  | "live"
  | "ytd"
  | "3mo"
  | "6mo"
  | "1y"
  | "5y"
  | "10y";

type PeriodDefinition = {
  key: PeriodKey;
  label: string;
  range: string;
  interval: string;
  refreshMs?: number;
  movingAverageUnit: "bougies" | "semaines";
};

const PERIODS: PeriodDefinition[] = [
  {
    key: "live",
    label: "LIVE",
    range: "1d",
    interval: "1m",
    refreshMs: 15_000,
    movingAverageUnit: "bougies",
  },
  {
    key: "ytd",
    label: "YTD",
    range: "ytd",
    interval: "1d",
    movingAverageUnit: "bougies",
  },
  {
    key: "3mo",
    label: "3M",
    range: "3mo",
    interval: "1d",
    movingAverageUnit: "bougies",
  },
  {
    key: "6mo",
    label: "6M",
    range: "6mo",
    interval: "1d",
    movingAverageUnit: "bougies",
  },
  {
    key: "1y",
    label: "1A",
    range: "1y",
    interval: "1d",
    movingAverageUnit: "bougies",
  },
  {
    key: "5y",
    label: "5A",
    range: "5y",
    interval: "1wk",
    movingAverageUnit: "semaines",
  },
  {
    key: "10y",
    label: "10A",
    range: "10y",
    interval: "1wk",
    movingAverageUnit: "semaines",
  },
];

type ChartRefs = {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  sma20: ISeriesApi<"Line">;
  sma50: ISeriesApi<"Line">;
  sma200: ISeriesApi<"Line">;
};

function apiUrl(
  ticker: string,
  period: PeriodDefinition,
): string {
  const params = new URLSearchParams({
    range: period.range,
    interval: period.interval,
  });

  return `/api/anatole/api/v1/stocks/${encodeURIComponent(
    ticker,
  )}/focus?${params.toString()}`;
}

function toTimestamp(value: string | number): UTCTimestamp | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const seconds = value > 10_000_000_000 ? value / 1000 : value;
    return Math.floor(seconds) as UTCTimestamp;
  }

  const parsed = Date.parse(String(value));

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.floor(parsed / 1000) as UTCTimestamp;
}

function normalizedCandles(candles: Candle[]): Candle[] {
  const byTimestamp = new Map<number, Candle>();

  for (const candle of candles) {
    const timestamp = toTimestamp(candle.time);

    if (
      timestamp === null ||
      !Number.isFinite(candle.open) ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      !Number.isFinite(candle.close)
    ) {
      continue;
    }

    byTimestamp.set(timestamp, {
      ...candle,
      time: timestamp,
      volume: Number.isFinite(candle.volume) ? candle.volume : 0,
    });
  }

  return [...byTimestamp.values()].sort(
    (left, right) =>
      Number(left.time) - Number(right.time),
  );
}

function movingAverage(
  candles: Candle[],
  period: number,
): LineData<UTCTimestamp>[] {
  const output: LineData<UTCTimestamp>[] = [];
  let rollingTotal = 0;

  for (let index = 0; index < candles.length; index += 1) {
    rollingTotal += candles[index].close;

    if (index >= period) {
      rollingTotal -= candles[index - period].close;
    }

    if (index >= period - 1) {
      output.push({
        time: candles[index].time as UTCTimestamp,
        value: rollingTotal / period,
      });
    }
  }

  return output;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function periodPerformance(candles: Candle[]): number | null {
  const first = candles.at(0)?.close;
  const last = candles.at(-1)?.close;

  if (
    first === undefined ||
    last === undefined ||
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    first === 0
  ) {
    return null;
  }

  return ((last - first) / first) * 100;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "N/D";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} %`;
}

function formatDate(value: string | number | undefined): string {
  if (value === undefined) {
    return "N/D";
  }

  const timestamp = toTimestamp(value);

  if (timestamp === null) {
    return "N/D";
  }

  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(new Date(timestamp * 1000));
}

function chartOptions(
  container: HTMLDivElement,
  live: boolean,
) {
  return {
    width: Math.max(container.clientWidth, 320),
    height: Math.max(container.clientHeight, 360),
    layout: {
      background: {
        type: ColorType.Solid,
        color: "#061622",
      },
      textColor: "#91aabd",
      fontFamily:
        "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    },
    grid: {
      vertLines: {
        color: "rgba(60, 95, 117, 0.22)",
      },
      horzLines: {
        color: "rgba(60, 95, 117, 0.22)",
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: "rgba(120, 171, 204, 0.58)",
        labelBackgroundColor: "#16384d",
      },
      horzLine: {
        color: "rgba(120, 171, 204, 0.58)",
        labelBackgroundColor: "#16384d",
      },
    },
    rightPriceScale: {
      borderColor: "rgba(67, 106, 131, 0.58)",
      scaleMargins: {
        top: 0.08,
        bottom: 0.24,
      },
    },
    timeScale: {
      borderColor: "rgba(67, 106, 131, 0.58)",
      timeVisible: live,
      secondsVisible: false,
      rightOffset: live ? 6 : 2,
      barSpacing: live ? 7 : 5,
      minBarSpacing: 0.08,
      fixLeftEdge: false,
      fixRightEdge: false,
    },
    localization: {
      locale: "fr-CA",
      priceFormatter: (price: number) =>
        price.toLocaleString("fr-CA", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
    },
  };
}

function createSeries(chart: IChartApi): Omit<ChartRefs, "chart"> {
  const candles = chart.addSeries(CandlestickSeries, {
    upColor: "#00cba1",
    downColor: "#ff365f",
    borderVisible: false,
    wickUpColor: "#00cba1",
    wickDownColor: "#ff365f",
    priceLineColor: "#3aa9ff",
    priceLineStyle: LineStyle.Dotted,
    lastValueVisible: true,
  });

  const volume = chart.addSeries(HistogramSeries, {
    priceScaleId: "volume",
    priceFormat: {
      type: "volume",
    },
    lastValueVisible: false,
    priceLineVisible: false,
  });

  chart.priceScale("volume").applyOptions({
    scaleMargins: {
      top: 0.79,
      bottom: 0,
    },
    borderVisible: false,
  });

  const sma20 = chart.addSeries(LineSeries, {
    color: "#2f9bff",
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });

  const sma50 = chart.addSeries(LineSeries, {
    color: "#00d1c7",
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });

  const sma200 = chart.addSeries(LineSeries, {
    color: "#8c6cff",
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });

  return {
    candles,
    volume,
    sma20,
    sma50,
    sma200,
  };
}

export function FocusRangeChart({
  ticker,
  initialSnapshot,
}: {
  ticker: string;
  initialSnapshot?: FocusSnapshot;
}) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRefs = useRef<ChartRefs | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const previousPeriodRef = useRef<PeriodKey | null>(null);

  const [periodKey, setPeriodKey] = useState<PeriodKey>("1y");
  const [snapshot, setSnapshot] = useState<FocusSnapshot | null>(
    initialSnapshot ?? null,
  );
  const [loading, setLoading] = useState(initialSnapshot === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const period =
    PERIODS.find((candidate) => candidate.key === periodKey) ??
    PERIODS[4];

  const candles = useMemo(
    () => normalizedCandles(snapshot?.history ?? []),
    [snapshot],
  );

  const performance = useMemo(
    () => periodPerformance(candles),
    [candles],
  );

  useEffect(() => {
    const container = chartContainerRef.current;

    if (!container) {
      return;
    }

    const chart = createChart(
      container,
      chartOptions(container, periodKey === "live"),
    );
    const series = createSeries(chart);

    chartRefs.current = {
      chart,
      ...series,
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(0);

      if (!entry) {
        return;
      }

      const { width, height } = entry.contentRect;
      chart.resize(
        Math.max(Math.floor(width), 320),
        Math.max(Math.floor(height), 360),
      );
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRefs.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const refs = chartRefs.current;

    if (!refs || candles.length === 0) {
      return;
    }

    refs.chart.timeScale().applyOptions({
      timeVisible: periodKey === "live",
      secondsVisible: false,
      rightOffset: periodKey === "live" ? 6 : 2,
      barSpacing: periodKey === "live" ? 7 : 5,
      minBarSpacing: periodKey === "10y" ? 0.04 : 0.08,
    });

    const candleData: CandlestickData<UTCTimestamp>[] = candles.map(
      (candle) => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }),
    );

    const volumeData: HistogramData<UTCTimestamp>[] = candles.map(
      (candle) => ({
        time: candle.time as UTCTimestamp,
        value: candle.volume,
        color:
          candle.close >= candle.open
            ? "rgba(0, 203, 161, 0.72)"
            : "rgba(255, 54, 95, 0.72)",
      }),
    );

    refs.candles.setData(candleData);
    refs.volume.setData(volumeData);
    refs.sma20.setData(movingAverage(candles, 20));
    refs.sma50.setData(movingAverage(candles, 50));
    refs.sma200.setData(movingAverage(candles, 200));

    for (const line of priceLinesRef.current) {
      refs.candles.removePriceLine(line);
    }
    priceLinesRef.current = [];

    const support = readNumber(snapshot?.technicals?.support);
    const resistance = readNumber(snapshot?.technicals?.resistance);

    if (support !== null) {
      priceLinesRef.current.push(
        refs.candles.createPriceLine({
          price: support,
          color: "#00d7ad",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: "Support",
        }),
      );
    }

    if (resistance !== null) {
      priceLinesRef.current.push(
        refs.candles.createPriceLine({
          price: resistance,
          color: "#ff9b37",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: "Résistance",
        }),
      );
    }

    const periodChanged = previousPeriodRef.current !== periodKey;
    previousPeriodRef.current = periodKey;

    if (periodChanged) {
      refs.chart.timeScale().fitContent();
    } else if (periodKey === "live") {
      refs.chart.timeScale().scrollToRealTime();
    }
  }, [candles, periodKey, snapshot]);

  useEffect(() => {
    let disposed = false;
    let activeController: AbortController | null = null;

    async function load(silent = false): Promise<void> {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await fetch(apiUrl(ticker, period), {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API Focus : HTTP ${response.status}`);
        }

        const nextSnapshot =
          (await response.json()) as FocusSnapshot;

        if (!disposed) {
          setSnapshot(nextSnapshot);
          setError(null);
        }
      } catch (requestError) {
        if (
          !disposed &&
          !(requestError instanceof DOMException &&
            requestError.name === "AbortError")
        ) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Impossible de charger cette période.",
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void load(false);

    const timer =
      period.refreshMs === undefined
        ? null
        : window.setInterval(() => {
            void load(true);
          }, period.refreshMs);

    return () => {
      disposed = true;
      activeController?.abort();

      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [period, ticker]);

  const lastCandle = candles.at(-1);
  const delayed = Boolean(snapshot?.quote?.delayed);
  const positive =
    performance !== null && performance >= 0;

  return (
    <section className={styles.root}>
      <div className={styles.toolbar}>
        <div
          className={styles.periods}
          role="group"
          aria-label="Période du graphique"
        >
          {PERIODS.map((candidate) => (
            <button
              type="button"
              key={candidate.key}
              className={[
                styles.periodButton,
                candidate.key === periodKey
                  ? styles.activePeriod
                  : "",
                candidate.key === "live"
                  ? styles.livePeriod
                  : "",
              ].join(" ")}
              aria-pressed={candidate.key === periodKey}
              onClick={() => setPeriodKey(candidate.key)}
            >
              {candidate.key === "live" ? (
                <span className={styles.liveDot} />
              ) : null}
              {candidate.label}
            </button>
          ))}
        </div>

        <div className={styles.legend} aria-label="Moyennes mobiles">
          <span>
            <i className={styles.sma20} />
            SMA 20
          </span>
          <span>
            <i className={styles.sma50} />
            SMA 50
          </span>
          <span>
            <i className={styles.sma200} />
            SMA 200
          </span>
        </div>
      </div>

      <div className={styles.summary}>
        <span className={styles.periodName}>
          {periodKey === "live"
            ? "Séance en cours"
            : `Évolution ${period.label}`}
        </span>

        <strong
          className={
            performance === null
              ? styles.neutral
              : positive
                ? styles.positive
                : styles.negative
          }
        >
          {formatPercent(performance)}
        </strong>

        <span>
          {candles.length.toLocaleString("fr-CA")} bougies
        </span>

        <span>
          Dernière donnée : {formatDate(lastCandle?.time)}
        </span>

        {periodKey === "live" ? (
          <span className={styles.liveStatus}>
            <span className={styles.liveDot} />
            actualisation 15 s
          </span>
        ) : null}

        {refreshing ? (
          <span className={styles.refreshing}>Actualisation…</span>
        ) : null}

        {delayed ? (
          <span className={styles.delayed}>
            Source potentiellement différée
          </span>
        ) : null}
      </div>

      <div className={styles.chartShell}>
        <div ref={chartContainerRef} className={styles.chart} />

        {loading && candles.length === 0 ? (
          <div className={styles.overlay}>
            Chargement de la période…
          </div>
        ) : null}

        {error ? (
          <div className={styles.errorBanner}>
            {error}
          </div>
        ) : null}
      </div>

      <p className={styles.note}>
        Pour 5A et 10A, les bougies et les SMA utilisent une
        fréquence hebdomadaire. Le mode LIVE dépend du délai de la
        source de marché.
      </p>
    </section>
  );
}
