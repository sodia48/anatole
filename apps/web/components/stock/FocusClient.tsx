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
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { FocusFundamentals, type FundamentalView } from "./FocusFundamentals";
import { KeyLevels } from "./KeyLevels";
import { QuoteHeader } from "./QuoteHeader";
import { TechnicalSummary } from "./TechnicalSummary";
import { quoteWebSocketUrl } from "@/lib/api";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";
import type {
  Candle,
  FocusSnapshot,
  Quote,
  Technicals,
} from "@/lib/types";

type LiveState = "connecting" | "live" | "offline";
type FocusSection = "chart" | FundamentalView;

const FOCUS_SECTIONS: Array<{
  key: FocusSection;
  label: readonly [string, string];
}> = [
  { key: "chart", label: ["Graphique", "Chart"] },
  { key: "fundamentals", label: ["Fondamentaux", "Fundamentals"] },
  { key: "financials", label: ["Résultats", "Financials"] },
  { key: "analysts", label: ["Analystes", "Analysts"] },
];

type PeriodKey =
  | "live"
  | "1w"
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
};

const PERIODS: PeriodDefinition[] = [
  {
    key: "live",
    label: "LIVE",
    range: "1d",
    interval: "1m",
    refreshMs: 15_000,
  },
  {
    key: "1w",
    label: "1S",
    range: "5d",
    interval: "5m",
    refreshMs: 60_000,
  },
  {
    key: "ytd",
    label: "YTD",
    range: "ytd",
    interval: "1d",
  },
  {
    key: "3mo",
    label: "3M",
    range: "3mo",
    interval: "1d",
  },
  {
    key: "6mo",
    label: "6M",
    range: "6mo",
    interval: "1d",
  },
  {
    key: "1y",
    label: "1A",
    range: "1y",
    interval: "1d",
  },
  {
    key: "5y",
    label: "5A",
    range: "5y",
    interval: "1wk",
  },
  {
    key: "10y",
    label: "10A",
    range: "10y",
    interval: "1wk",
  },
];

const MARKET_TIME_ZONE = "America/Toronto";

function isIntradayPeriod(
  period: PeriodDefinition,
): boolean {
  return [
    "1m",
    "2m",
    "5m",
    "15m",
    "30m",
    "60m",
    "90m",
  ].includes(period.interval);
}

function unixSeconds(value: string | number): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(
      value > 10_000_000_000 ? value / 1000 : value,
    );
  }

  const parsed = Date.parse(String(value));

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.floor(parsed / 1000);
}

/**
 * Lightweight Charts traite les timestamps intrajournaliers en UTC.
 * On crée donc un timestamp d'affichage dont les composantes UTC
 * correspondent à l'heure officielle de Toronto. Cela corrige le
 * décalage de +4 h l'été et de +5 h l'hiver, avec gestion automatique
 * de l'heure avancée.
 */
function torontoChartTimestamp(
  value: string | number,
): UTCTimestamp {
  const seconds = unixSeconds(value);

  if (seconds === null) {
    return 0 as UTCTimestamp;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(seconds * 1000));

  const values: Record<string, number> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = Number.parseInt(part.value, 10);
    }
  }

  return Math.floor(
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    ) / 1000,
  ) as UTCTimestamp;
}

function chartTimestamp(
  value: string | number,
  intraday: boolean,
): UTCTimestamp {
  if (intraday) {
    return torontoChartTimestamp(value);
  }

  return (unixSeconds(value) ?? 0) as UTCTimestamp;
}

function withoutFutureLiveCandles(
  candles: Candle[],
  live: boolean,
): Candle[] {
  if (!live) {
    return candles;
  }

  const latestAllowed = Math.floor(Date.now() / 1000) + 120;

  return candles.filter((candle) => {
    const seconds = unixSeconds(candle.time);
    return seconds !== null && seconds <= latestAllowed;
  });
}

type ChartRefs = {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  sma20: ISeriesApi<"Line">;
  sma50: ISeriesApi<"Line">;
  sma200: ISeriesApi<"Line">;
};

function focusApiUrl(
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

function movingAverage(
  candles: Candle[],
  period: number,
  intraday: boolean,
): LineData<UTCTimestamp>[] {
  if (candles.length < period) {
    return [];
  }

  const output: LineData<UTCTimestamp>[] = [];
  let rollingTotal = 0;

  for (let index = 0; index < candles.length; index += 1) {
    rollingTotal += candles[index].close;

    if (index >= period) {
      rollingTotal -= candles[index - period].close;
    }

    if (index >= period - 1) {
      output.push({
        time: chartTimestamp(
          candles[index].time,
          intraday,
        ),
        value: rollingTotal / period,
      });
    }
  }

  return output;
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

function formatPerformance(value: number | null): string {
  if (value === null) {
    return "N/D";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} %`;
}

function formatGeneratedAt(value: string, language: AnatoleLanguage): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "N/D";
  }

  return date.toLocaleString(localeFor(language), {
    timeZone: "America/Toronto",
  });
}

function chartButtonStyle(active: boolean): CSSProperties {
  return {
    minWidth: 45,
    height: 32,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "0 10px",
    border: active
      ? "1px solid rgba(54, 163, 241, .72)"
      : "1px solid transparent",
    borderRadius: 8,
    background: active
      ? "rgba(27, 105, 159, .82)"
      : "transparent",
    color: active ? "#ffffff" : "#86a4b8",
    fontSize: 11,
    fontWeight: 800,
    cursor: "pointer",
  };
}

function ChartPanel({
  candles,
  technicals,
  period,
  quote,
  loading,
  refreshing,
  error,
  delayed,
  language,
}: {
  candles: Candle[];
  technicals: Technicals;
  period: PeriodDefinition;
  quote: Quote;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  delayed: boolean;
  language: AnatoleLanguage;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<ChartRefs | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const previousPeriod = useRef<PeriodKey | null>(null);

  const displayCandles = useMemo(
    () =>
      withoutFutureLiveCandles(
        candles,
        period.key === "live",
      ),
    [candles, period.key],
  );

  const performance = useMemo(
    () => periodPerformance(displayCandles),
    [displayCandles],
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: {
          type: ColorType.Solid,
          color: "#071521",
        },
        textColor: "#8fa8bd",
        panes: {
          separatorColor: "#15354b",
          separatorHoverColor: "#2d76ff",
          enableResize: true,
        },
      },
      grid: {
        vertLines: {
          color: "rgba(42, 79, 105, 0.22)",
        },
        horzLines: {
          color: "rgba(42, 79, 105, 0.22)",
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: "#24465f",
      },
      timeScale: {
        borderColor: "#24465f",
        timeVisible: isIntradayPeriod(period),
        secondsVisible: false,
      },
      localization: {
        locale: localeFor(language),
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#16c79a",
      downColor: "#ff4d67",
      borderVisible: false,
      wickUpColor: "#16c79a",
      wickDownColor: "#ff4d67",
      priceLineColor: "#2c9cff",
      priceLineStyle: LineStyle.Dotted,
      lastValueVisible: true,
    });

    candleSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.08,
        bottom: 0.3,
      },
    });

    const sma20 = chart.addSeries(LineSeries, {
      color: "#2c9cff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const sma50 = chart.addSeries(LineSeries, {
      color: "#13d0c5",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const sma200 = chart.addSeries(LineSeries, {
      color: "#8a63ff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const volume = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: {
          type: "volume",
        },
        priceLineVisible: false,
        lastValueVisible: false,
      },
      1,
    );

    refs.current = {
      chart,
      candles: candleSeries,
      volume,
      sma20,
      sma50,
      sma200,
    };

    return () => {
      chart.remove();
      refs.current = null;
      priceLines.current = [];
    };
  }, [language, period]);

  useEffect(() => {
    const chartRefs = refs.current;

    if (!chartRefs || displayCandles.length === 0) {
      return;
    }

    chartRefs.chart.timeScale().applyOptions({
      timeVisible: isIntradayPeriod(period),
      secondsVisible: false,
      rightOffset: period.key === "live" ? 6 : 2,
      barSpacing: period.key === "live" ? 7 : 5,
      minBarSpacing: period.key === "10y" ? 0.04 : 0.08,
    });

    const intraday = isIntradayPeriod(period);

    const candleData: CandlestickData<UTCTimestamp>[] =
      displayCandles.map((item) => ({
        time: chartTimestamp(item.time, intraday),
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      }));

    const volumeData: HistogramData<UTCTimestamp>[] =
      displayCandles.map((item) => ({
        time: chartTimestamp(item.time, intraday),
        value: item.volume,
        color:
          item.close >= item.open
            ? "rgba(22,199,154,.72)"
            : "rgba(255,77,103,.72)",
      }));

    chartRefs.candles.setData(candleData);
    chartRefs.volume.setData(volumeData);
    chartRefs.sma20.setData(
      movingAverage(displayCandles, 20, intraday),
    );
    chartRefs.sma50.setData(
      movingAverage(displayCandles, 50, intraday),
    );
    chartRefs.sma200.setData(
      movingAverage(displayCandles, 200, intraday),
    );

    for (const line of priceLines.current) {
      chartRefs.candles.removePriceLine(line);
    }

    priceLines.current = [];

    if (technicals.support != null) {
      priceLines.current.push(
        chartRefs.candles.createPriceLine({
          price: technicals.support,
          color: "#16c79a",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: "Support",
        }),
      );
    }

    if (technicals.resistance != null) {
      priceLines.current.push(
        chartRefs.candles.createPriceLine({
          price: technicals.resistance,
          color: "#ff9f43",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: pick(language, "Résistance", "Resistance"),
        }),
      );
    }

    const changed = previousPeriod.current !== period.key;
    previousPeriod.current = period.key;

    if (changed) {
      chartRefs.chart.timeScale().fitContent();
    } else if (period.key === "live") {
      chartRefs.chart.timeScale().scrollToRealTime();
    }
  }, [displayCandles, language, period, technicals]);

  useEffect(() => {
    if (period.key !== "live" || displayCandles.length === 0) {
      return;
    }

    const tick = () => {
      const chartRefs = refs.current;
      const latest = displayCandles.at(-1);

      if (!chartRefs || !latest) {
        return;
      }

      const sourcePrice =
        Number.isFinite(quote.price) && quote.price > 0
          ? quote.price
          : latest.close;
      const latestTime = chartTimestamp(latest.time, true);
      const quoteTime = chartTimestamp(quote.timestamp, true);
      const quoteMinute = Math.floor(Number(quoteTime) / 60) * 60;
      const barTime = Math.max(Number(latestTime), quoteMinute) as UTCTimestamp;
      const sameBar = Number(barTime) === Number(latestTime);
      const open = sameBar ? latest.open : latest.close;
      const high = Math.max(sameBar ? latest.high : sourcePrice, sourcePrice);
      const low = Math.min(sameBar ? latest.low : sourcePrice, sourcePrice);

      chartRefs.candles.update({
        time: barTime,
        open,
        high,
        low,
        close: sourcePrice,
      });
      chartRefs.chart.timeScale().scrollToRealTime();
    };

    tick();
    const timer = window.setInterval(tick, 1_000);

    return () => window.clearInterval(timer);
  }, [displayCandles, period, quote.price, quote.timestamp]);

  return (
    <section className="panel chart-panel">
      <div className="chart-toolbar">
        <div>
          <span className="eyebrow">
            {pick(language, "GRAPHIQUE PROFESSIONNEL", "PROFESSIONAL CHART")}
          </span>
          <h2>{pick(language, "Prix, volume et structure", "Price, volume, and structure")}</h2>
        </div>

        <div className="chart-legend">
          <span className="legend-dot blue" />
          SMA 20
          <span className="legend-dot teal" />
          SMA 50
          <span className="legend-dot purple" />
          SMA 200
        </div>
      </div>

      <div
        style={{
          minHeight: 34,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          margin: "8px 0 10px",
          padding: "6px 9px",
          border: "1px solid rgba(39, 78, 102, .72)",
          borderRadius: 9,
          background: "rgba(5, 22, 34, .72)",
          color: "#7f9db1",
          fontSize: 10,
        }}
      >
        <strong
          style={{
            color:
              performance === null
                ? "#dcecf6"
                : performance >= 0
                  ? "#16c79a"
                  : "#ff4d67",
            fontSize: 12,
          }}
        >
          {period.label} : {formatPerformance(performance)}
        </strong>

        <span>
          {displayCandles.length.toLocaleString(localeFor(language))} {pick(language, "bougies", "candles")}
        </span>

        {period.key === "live" ? (
          <span
            style={{
              color: "#16c79a",
              fontWeight: 750,
            }}
          >
            {pick(language, "● graphique actualisé chaque seconde", "● chart refreshed every second")}
          </span>
        ) : period.key === "1w" ? (
          <span
            style={{
              color: "#65b8f5",
              fontWeight: 750,
            }}
          >
            {pick(language, "5 séances · bougies 5 min · actualisation 60 s", "5 sessions · 5-minute candles · 60-second refresh")}
          </span>
        ) : null}

        {refreshing ? (
          <span style={{ color: "#65b8f5" }}>
            {pick(language, "Actualisation…", "Refreshing…")}
          </span>
        ) : null}

        {delayed ? (
          <span style={{ color: "#d2a45e" }}>
            {pick(language, "Donnée potentiellement différée", "Potentially delayed data")}
          </span>
        ) : null}
      </div>

      <div style={{ position: "relative" }}>
        <div
          ref={containerRef}
          className="chart-canvas"
          style={{
            height: "clamp(470px, 55vh, 640px)",
          }}
        />

        {loading && displayCandles.length === 0 ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              background: "rgba(4, 17, 27, .72)",
              color: "#b9d0df",
              fontSize: 12,
            }}
          >
            {pick(language, "Chargement de la période…", "Loading period…")}
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: 12,
              padding: "9px 11px",
              border: "1px solid rgba(255,77,112,.5)",
              borderRadius: 8,
              background: "rgba(91,26,42,.94)",
              color: "#ffd9e0",
              fontSize: 11,
            }}
          >
            {error}
          </div>
        ) : null}
      </div>

      <div className="tradingview-attribution">
        {pick(language, "Graphiques propulsés par", "Charts powered by")}{" "}
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noreferrer"
        >
          TradingView Lightweight Charts™
        </a>
      </div>
    </section>
  );
}

export function FocusClient({
  initialSnapshot,
}: {
  initialSnapshot: FocusSnapshot;
}) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [quote, setQuote] = useState<Quote>(
    initialSnapshot.quote,
  );
  const [liveState, setLiveState] =
    useState<LiveState>("connecting");
  const [activeSection, setActiveSection] =
    useState<FocusSection>("chart");

  const [periodKey, setPeriodKey] =
    useState<PeriodKey>("live");
  const [periodSnapshot, setPeriodSnapshot] =
    useState<FocusSnapshot>(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsUrl = useMemo(
    () =>
      quoteWebSocketUrl(initialSnapshot.quote.ticker),
    [initialSnapshot.quote.ticker],
  );

  const period =
    PERIODS.find((candidate) => candidate.key === periodKey) ??
    PERIODS[0];

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) {
        return;
      }

      setLiveState("connecting");
      socket = new WebSocket(wsUrl);

      socket.onopen = () => setLiveState("live");

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as Quote;
          setQuote(payload);
        } catch {
          // Ignore les messages WebSocket invalides.
        }
      };

      socket.onerror = () => socket?.close();

      socket.onclose = () => {
        if (stopped) {
          return;
        }

        setLiveState("offline");
        retry = setTimeout(connect, 3500);
      };
    };

    connect();

    return () => {
      stopped = true;

      if (retry) {
        clearTimeout(retry);
      }

      socket?.close();
    };
  }, [wsUrl]);

  useEffect(() => {
    if (period.key === "1y") {
      const timer = window.setTimeout(() => {
        setPeriodSnapshot(initialSnapshot);
        setError(null);
        setLoading(false);
        setRefreshing(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    let disposed = false;
    let controller: AbortController | null = null;

    async function load(
      silent: boolean,
    ): Promise<void> {
      controller?.abort();
      controller = new AbortController();

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await fetch(
          focusApiUrl(
            initialSnapshot.quote.ticker,
            period,
          ),
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(pick(language, `API Focus indisponible — HTTP ${response.status}`, `Focus API unavailable — HTTP ${response.status}`));
        }

        const nextSnapshot =
          (await response.json()) as FocusSnapshot;

        if (!disposed) {
          setPeriodSnapshot(nextSnapshot);
          setError(null);
        }
      } catch (requestError) {
        if (
          !disposed &&
          !(
            requestError instanceof DOMException &&
            requestError.name === "AbortError"
          )
        ) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : pick(language, "Impossible de charger cette période.", "Unable to load this period."),
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    const initialTimer = window.setTimeout(() => void load(false), 0);

    const timer =
      period.refreshMs === undefined
        ? null
        : window.setInterval(() => {
            void load(true);
          }, period.refreshMs);

    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      controller?.abort();

      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [
    initialSnapshot,
    initialSnapshot.quote.ticker,
    language,
    period,
  ]);

  return (
    <div className="focus-page">
      <QuoteHeader
        quote={quote}
        liveState={liveState}
      />

      <nav
        className="focus-section-tabs"
        aria-label={pick(language, "Sections de Focus", "Focus sections")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          width: "100%",
          maxWidth: "100%",
          margin: "0 0 12px",
          padding: 4,
          overflowX: "visible",
          flexWrap: "wrap",
          border: "1px solid rgba(39,78,102,.8)",
          borderRadius: 11,
          background: "rgba(4,18,29,.82)",
        }}
      >
        {FOCUS_SECTIONS.map((section) => {
          const active = activeSection === section.key;

          return (
            <button
              type="button"
              key={section.key}
              aria-pressed={active}
              onClick={() => setActiveSection(section.key)}
              className="focus-section-tab"
              style={{
                minWidth: 0,
                flex: "1 1 140px",
                height: 35,
                padding: "0 13px",
                border: active
                  ? "1px solid rgba(54,163,241,.72)"
                  : "1px solid transparent",
                borderRadius: 8,
                background: active
                  ? "rgba(27,105,159,.82)"
                  : "transparent",
                color: active ? "#ffffff" : "#86a4b8",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {pick(language, section.label[0], section.label[1])}
            </button>
          );
        })}
      </nav>

      {activeSection === "chart" ? (
        <>
          <div
            className="focus-period-tabs"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexWrap: "wrap",
              margin: "0 0 12px",
              padding: 4,
              width: "100%",
              maxWidth: "100%",
              border: "1px solid rgba(39,78,102,.8)",
              borderRadius: 11,
              background: "rgba(4,18,29,.82)",
              overflowX: "visible",
            }}
            role="group"
            aria-label={pick(language, "Période du graphique Focus", "Focus chart period")}
          >
            {PERIODS.map((candidate) => {
              const active = candidate.key === periodKey;

              return (
                <button
                  type="button"
                  key={candidate.key}
                  aria-pressed={active}
                  onClick={() =>
                    setPeriodKey(candidate.key)
                  }
                  className="focus-period-button"
                  style={chartButtonStyle(active)}
                >
                  {candidate.key === "live" ? (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: "#16c79a",
                        boxShadow:
                          "0 0 9px rgba(22,199,154,.86)",
                      }}
                    />
                  ) : null}

                  {candidate.label}
                </button>
              );
            })}
          </div>

          <div className="focus-grid">
            <ChartPanel
              candles={periodSnapshot.history}
              technicals={periodSnapshot.technicals}
              period={period}
              quote={quote}
              loading={loading}
              refreshing={refreshing}
              error={error}
              delayed={Boolean(
                periodSnapshot.quote.delayed,
              )}
              language={language}
            />

            <aside className="right-column">
              <section className="panel info-card profile-card">
                <div className="section-title-row">
                  <h2>
                    {periodSnapshot.profile.name}
                  </h2>
                  <span className="eyebrow">
                    {periodSnapshot.profile.exchange}
                  </span>
                </div>

                <p>
                  {periodSnapshot.profile.description ??
                    pick(language, "Profil détaillé disponible lors du branchement des données Anatole.", "A detailed profile will be available when Anatole data is connected.")}
                </p>

                <div className="profile-tags">
                  <span>
                    {periodSnapshot.profile.sector ??
                      pick(language, "Marché canadien", "Canadian market")}
                  </span>
                  <span>
                    {periodSnapshot.profile.industry ??
                      pick(language, "Titre coté", "Listed security")}
                  </span>
                </div>
              </section>

              <TechnicalSummary
                technicals={periodSnapshot.technicals}
              />

              <KeyLevels
                technicals={periodSnapshot.technicals}
              />
            </aside>
          </div>

          <footer className="status-footer">
            {pick(language, "Période", "Period")} {period.label} · {pick(language, "Généré à", "Generated at")}{" "}
            {formatGeneratedAt(
              periodSnapshot.generated_at,
              language,
            )}{" "}
            · Source {quote.source}
          </footer>
        </>
      ) : (
        <FocusFundamentals
          ticker={initialSnapshot.quote.ticker}
          view={activeSection}
        />
      )}
    </div>
  );
}
