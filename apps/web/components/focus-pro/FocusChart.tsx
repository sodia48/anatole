"use client";

import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type AreaData,
  type BarData,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Candle, Quote, Technicals } from "@/lib/types";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

import { DrawingInteractionLayer } from "./drawings/DrawingInteractionLayer";
import { DrawingPrimitive } from "./drawings/primitive";
import { calculateIndicators, indicatorDefinition } from "./indicators/engine";
import { heikinAshi } from "./chart/transforms";
import type {
  ComparisonSeries,
  DrawingTool,
  FocusChartType,
  FocusDrawing,
  FocusIndicatorConfig,
  FundamentalMarker,
  SnapMode,
} from "./types";
import styles from "./FocusPro.module.css";

type PriceSeries =
  | ISeriesApi<"Candlestick">
  | ISeriesApi<"Bar">
  | ISeriesApi<"Line">
  | ISeriesApi<"Area">;

type ChartRefs = {
  chart: IChartApi;
  price: PriceSeries;
  volume: ISeriesApi<"Histogram">;
  indicators: ISeriesApi<"Line">[];
  comparisons: ISeriesApi<"Line">[];
  primitive: DrawingPrimitive;
  markers: ISeriesMarkersPluginApi<Time>;
};

function timestamp(value: number): UTCTimestamp {
  return Math.floor(value > 10_000_000_000 ? value / 1_000 : value) as UTCTimestamp;
}

function priceSeriesFor(
  chart: IChartApi,
  type: FocusChartType,
): PriceSeries {
  if (type === "bars") {
    return chart.addSeries(BarSeries, {
      upColor: "#16c79a",
      downColor: "#ff4d67",
      thinBars: false,
    });
  }
  if (type === "line") {
    return chart.addSeries(LineSeries, {
      color: "#2c9cff",
      lineWidth: 2,
      crosshairMarkerVisible: true,
    });
  }
  if (type === "area") {
    return chart.addSeries(AreaSeries, {
      lineColor: "#2c9cff",
      topColor: "rgba(44, 156, 255, .42)",
      bottomColor: "rgba(44, 156, 255, .03)",
      lineWidth: 2,
    });
  }
  return chart.addSeries(CandlestickSeries, {
    upColor: "#16c79a",
    downColor: "#ff4d67",
    borderVisible: false,
    wickUpColor: "#16c79a",
    wickDownColor: "#ff4d67",
  });
}

function setPriceData(
  series: PriceSeries,
  chartType: FocusChartType,
  candles: Candle[],
): void {
  if (chartType === "line") {
    (series as ISeriesApi<"Line">).setData(
      candles.map((item): LineData<UTCTimestamp> => ({
        time: timestamp(item.time),
        value: item.close,
      })),
    );
    return;
  }
  if (chartType === "area") {
    (series as ISeriesApi<"Area">).setData(
      candles.map((item): AreaData<UTCTimestamp> => ({
        time: timestamp(item.time),
        value: item.close,
      })),
    );
    return;
  }
  if (chartType === "bars") {
    (series as ISeriesApi<"Bar">).setData(
      candles.map((item): BarData<UTCTimestamp> => ({
        time: timestamp(item.time),
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
      })),
    );
    return;
  }
  (series as ISeriesApi<"Candlestick">).setData(
    candles.map((item): CandlestickData<UTCTimestamp> => ({
      time: timestamp(item.time),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    })),
  );
}

function updatePrice(
  series: PriceSeries,
  chartType: FocusChartType,
  candle: Candle,
): void {
  if (chartType === "line") {
    (series as ISeriesApi<"Line">).update({
      time: timestamp(candle.time), value: candle.close,
    });
  } else if (chartType === "area") {
    (series as ISeriesApi<"Area">).update({
      time: timestamp(candle.time), value: candle.close,
    });
  } else if (chartType === "bars") {
    (series as ISeriesApi<"Bar">).update({
      time: timestamp(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });
  } else {
    (series as ISeriesApi<"Candlestick">).update({
      time: timestamp(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });
  }
}

function chartLabel(type: FocusChartType, language: AnatoleLanguage): string {
  const labels: Record<FocusChartType, readonly [string, string]> = {
    candles: ["Bougies", "Candles"],
    bars: ["Barres OHLC", "OHLC bars"],
    line: ["Ligne", "Line"],
    area: ["Aire", "Area"],
    heikin_ashi: ["Heikin Ashi · dérivé", "Heikin Ashi · derived"],
  };
  return pick(language, labels[type][0], labels[type][1]);
}

function markerShape(kind: FundamentalMarker["kind"]): SeriesMarker<Time>["shape"] {
  return kind === "dividend" ? "circle" : kind === "corporate_event" ? "square" : "arrowUp";
}

export function FocusChart({
  candles,
  quote,
  technicals,
  chartType,
  timeframe,
  indicators,
  drawings,
  comparisons,
  fundamentalMarkers,
  activeDrawingTool,
  snapMode,
  language,
  loading,
  refreshing,
  error,
  onAddDrawing,
  onUpdateDrawing,
  onSelectDrawing,
  onSelectMarker,
  selectedDrawingId,
}: {
  candles: Candle[];
  quote: Quote;
  technicals: Technicals;
  chartType: FocusChartType;
  timeframe: string;
  indicators: FocusIndicatorConfig[];
  drawings: FocusDrawing[];
  comparisons: ComparisonSeries[];
  fundamentalMarkers: FundamentalMarker[];
  activeDrawingTool: DrawingTool;
  snapMode: SnapMode;
  language: AnatoleLanguage;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onAddDrawing: (drawing: FocusDrawing) => void;
  onUpdateDrawing: (id: string, update: Partial<FocusDrawing>) => void;
  onSelectDrawing: (id: string | null) => void;
  onSelectMarker: (marker: FundamentalMarker) => void;
  selectedDrawingId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<ChartRefs | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const firstDataSet = useRef(true);
  const markerSelection = useRef(onSelectMarker);
  const markerItems = useRef(fundamentalMarkers);
  const [interaction, setInteraction] = useState<{
    chart: IChartApi | null;
    series: ISeriesApi<SeriesType> | null;
  }>({ chart: null, series: null });
  const [viewportVersion, setViewportVersion] = useState(0);

  useEffect(() => {
    markerSelection.current = onSelectMarker;
  }, [onSelectMarker]);

  useEffect(() => {
    markerItems.current = fundamentalMarkers;
  }, [fundamentalMarkers]);

  const displayCandles = useMemo(
    () => chartType === "heikin_ashi" ? heikinAshi(candles) : candles,
    [candles, chartType],
  );
  const indicatorResults = useMemo(
    () => calculateIndicators(candles, indicators),
    [candles, indicators],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    firstDataSet.current = true;
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#06131e" },
        textColor: "#8fa8bd",
        panes: {
          separatorColor: "#15354b",
          separatorHoverColor: "#2d76ff",
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: "rgba(42, 79, 105, .2)" },
        horzLines: { color: "rgba(42, 79, 105, .2)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#24465f" },
      leftPriceScale: { visible: false, borderColor: "#24465f" },
      timeScale: {
        borderColor: "#24465f",
        timeVisible: timeframe.includes("m") || timeframe.includes("h"),
        secondsVisible: false,
      },
      localization: {
        locale: localeFor(language),
        timeFormatter: (time: Time) => new Date(Number(time) * 1_000).toLocaleString(
          localeFor(language),
          {
            timeZone: "America/Toronto",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          },
        ),
      },
    });
    const price = priceSeriesFor(chart, chartType);
    price.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.3 } });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    }, 1);
    const primitive = new DrawingPrimitive();
    const primitiveSeries = price as unknown as ISeriesApi<SeriesType>;
    primitiveSeries.attachPrimitive(primitive);
    const markers = createSeriesMarkers(primitiveSeries, []);
    refs.current = {
      chart,
      price,
      volume,
      indicators: [],
      comparisons: [],
      primitive,
      markers,
    };
    setInteraction({ chart, series: primitiveSeries });
    const refreshProjection = () => setViewportVersion((value) => value + 1);
    const selectMarker = (parameter: { hoveredObjectId?: unknown }) => {
      const id = typeof parameter.hoveredObjectId === "string"
        ? parameter.hoveredObjectId
        : null;
      const marker = markerItems.current.find((item) => item.id === id);
      if (marker) markerSelection.current(marker);
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(refreshProjection);
    chart.subscribeClick(selectMarker);
    const observer = new ResizeObserver(refreshProjection);
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.timeScale().unsubscribeVisibleTimeRangeChange(refreshProjection);
      chart.unsubscribeClick(selectMarker);
      markers.detach();
      chart.remove();
      refs.current = null;
      setInteraction({ chart: null, series: null });
    };
  }, [chartType, language, timeframe]);

  useEffect(() => {
    const current = refs.current;
    if (!current || !displayCandles.length) return;
    setPriceData(current.price, chartType, displayCandles);
    const volumeData: HistogramData<UTCTimestamp>[] = candles.map((item) => ({
      time: timestamp(item.time),
      value: item.volume,
      color: item.close >= item.open
        ? "rgba(22, 199, 154, .65)"
        : "rgba(255, 77, 103, .65)",
    }));
    current.volume.setData(volumeData);
    for (const item of current.indicators) current.chart.removeSeries(item);
    current.indicators = [];
    let paneIndex = 2;
    for (const config of indicators.filter((item) => item.visible).slice(0, 20)) {
      const definition = indicatorDefinition(config.definition_id);
      const result = indicatorResults.get(config.id);
      if (!result) continue;
      const targetPane = definition.pane === "main" ? 0 : paneIndex++;
      definition.outputs.forEach((output, outputIndex) => {
        const points = result.outputs[output] ?? [];
        if (!points.length) return;
        const series = current.chart.addSeries(LineSeries, {
          color: config.colors[outputIndex] ?? definition.colors[outputIndex] ?? "#2c9cff",
          lineWidth: Math.max(1, Math.min(config.line_width, 4)) as 1 | 2 | 3 | 4,
          priceLineVisible: false,
          lastValueVisible: definition.pane === "separate",
          crosshairMarkerVisible: false,
          title: `${definition.name} ${output}`,
        }, targetPane);
        series.setData(points.map((point) => ({
          time: timestamp(point.time),
          value: point.value,
        })));
        current.indicators.push(series);
      });
    }
    for (const item of current.comparisons) current.chart.removeSeries(item);
    current.comparisons = [];
    const primaryTimes = new Set(candles.map((item) => item.time));
    for (const comparison of comparisons.slice(0, 5)) {
      const shared = comparison.candles.filter((item) => primaryTimes.has(item.time));
      const base = shared[0]?.close;
      if (!base) continue;
      const series = current.chart.addSeries(LineSeries, {
        color: comparison.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: comparison.symbol,
        priceScaleId: "left",
        priceFormat: comparison.mode === "normalized_percent"
          ? { type: "custom", formatter: (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)} %` }
          : { type: "price", precision: 2, minMove: 0.01 },
      });
      series.setData(shared.map((item) => ({
        time: timestamp(item.time),
        value: comparison.mode === "normalized_percent"
          ? (item.close / base - 1) * 100
          : item.close,
      })));
      current.comparisons.push(series);
    }
    current.chart.applyOptions({
      leftPriceScale: { visible: current.comparisons.length > 0 },
    });
    for (const line of priceLines.current) current.price.removePriceLine(line);
    priceLines.current = [];
    if (technicals.support !== null) {
      priceLines.current.push(current.price.createPriceLine({
        price: technicals.support,
        color: "#16c79a",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "Support",
      }));
    }
    if (technicals.resistance !== null) {
      priceLines.current.push(current.price.createPriceLine({
        price: technicals.resistance,
        color: "#ff9f43",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: pick(language, "Résistance", "Resistance"),
      }));
    }
    if (firstDataSet.current) {
      current.chart.timeScale().fitContent();
      firstDataSet.current = false;
    }
  }, [candles, chartType, comparisons, displayCandles, indicatorResults, indicators, language, technicals]);

  useEffect(() => {
    refs.current?.primitive.setDrawings(drawings);
  }, [drawings]);

  useEffect(() => {
    const current = refs.current;
    if (!current) return;
    current.markers.setMarkers(fundamentalMarkers.map((marker) => ({
      time: timestamp(marker.time),
      position: marker.source === "PAPER"
        ? marker.title === "B" ? "belowBar" : "aboveBar"
        : marker.kind === "dividend" ? "belowBar" : "aboveBar",
      color: marker.source === "PAPER"
        ? marker.title === "B" ? "#16c79a" : "#ff5f76"
        : marker.kind === "dividend" ? "#16c79a" : "#f6b94a",
      shape: markerShape(marker.kind),
      text: marker.title,
      id: marker.id,
    })));
  }, [fundamentalMarkers]);

  useEffect(() => {
    const current = refs.current;
    const latestRaw = candles.at(-1);
    if (!current || !latestRaw || !Number.isFinite(quote.price) || quote.price <= 0) return;
    const liveRaw: Candle = {
      ...latestRaw,
      high: Math.max(latestRaw.high, quote.price),
      low: Math.min(latestRaw.low, quote.price),
      close: quote.price,
    };
    const live = chartType === "heikin_ashi"
      ? heikinAshi([...candles.slice(0, -1), liveRaw]).at(-1)
      : liveRaw;
    if (live) updatePrice(current.price, chartType, live);
  }, [candles, chartType, quote.price]);

  return (
    <section className={styles.chartPanel} aria-label="Focus Pro chart">
      <header className={styles.chartHeader}>
        <div>
          <span className={styles.eyebrow}>FOCUS PRO · {pick(language, "POSTE PROFESSIONNEL", "PROFESSIONAL CHART")} · {chartLabel(chartType, language)}</span>
          <h2>{quote.symbol} · {timeframe}</h2>
        </div>
        <div className={styles.chartStatus}>
          <span>{displayCandles.length.toLocaleString(localeFor(language))} {pick(language, "observations", "observations")}</span>
          {chartType === "heikin_ashi" ? <strong>{pick(language, "OHLC transformé — source réelle conservée", "Transformed OHLC — real source retained")}</strong> : null}
          {refreshing ? <i>{pick(language, "Actualisation…", "Refreshing…")}</i> : null}
        </div>
      </header>
      <div className={styles.chartStage}>
        <div ref={containerRef} className={styles.chartCanvas} />
        <DrawingInteractionLayer
          key={activeDrawingTool}
          chart={interaction.chart}
          series={interaction.series}
          drawings={drawings}
          activeTool={activeDrawingTool}
          snapMode={snapMode}
          candles={candles}
          selectedId={selectedDrawingId}
          viewportVersion={viewportVersion}
          onAdd={onAddDrawing}
          onUpdate={onUpdateDrawing}
          onSelect={onSelectDrawing}
        />
        {loading && !candles.length ? <div className={styles.chartOverlay}>{pick(language, "Chargement du graphique…", "Loading chart…")}</div> : null}
        {error ? <div className={styles.chartError}>{error}</div> : null}
      </div>
      <footer className={styles.chartFooter}>
        <span>{pick(language, "Source", "Source")} {quote.source}{quote.delayed ? ` · ${pick(language, "différée", "delayed")}` : ""}</span>
        <span>{pick(language, "Heure de marché", "Market time")} · America/Toronto</span>
      </footer>
    </section>
  );
}
