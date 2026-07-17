"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Technicals } from "@/lib/types";

function rollingAverage(candles: Candle[], period: number): LineData<UTCTimestamp>[] {
  const output: LineData<UTCTimestamp>[] = [];
  for (let index = period - 1; index < candles.length; index += 1) {
    const values = candles.slice(index - period + 1, index + 1).map((item) => item.close);
    const value = values.reduce((sum, item) => sum + item, 0) / period;
    output.push({ time: candles[index].time as UTCTimestamp, value });
  }
  return output;
}

export function TradingChart({ candles, technicals }: { candles: Candle[]; technicals: Technicals }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#071521" },
        textColor: "#8fa8bd",
        panes: { separatorColor: "#15354b", separatorHoverColor: "#2d76ff", enableResize: true },
      },
      grid: {
        vertLines: { color: "rgba(42, 79, 105, 0.22)" },
        horzLines: { color: "rgba(42, 79, 105, 0.22)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#24465f" },
      timeScale: { borderColor: "#24465f", timeVisible: true, secondsVisible: false },
      localization: { locale: "fr-CA" },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#16c79a",
      downColor: "#ff4d67",
      borderVisible: false,
      wickUpColor: "#16c79a",
      wickDownColor: "#ff4d67",
    });
    candleSeries.setData(candles.map((item) => ({
      time: item.time as UTCTimestamp,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    })) as CandlestickData<UTCTimestamp>[]);
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.3 } });

    const sma20 = chart.addSeries(LineSeries, { color: "#2c9cff", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    const sma50 = chart.addSeries(LineSeries, { color: "#13d0c5", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    const sma200 = chart.addSeries(LineSeries, { color: "#8a63ff", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    sma20.setData(rollingAverage(candles, 20));
    sma50.setData(rollingAverage(candles, 50));
    sma200.setData(rollingAverage(candles, 200));

    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" } }, 1);
    volume.setData(candles.map((item) => ({
      time: item.time as UTCTimestamp,
      value: item.volume,
      color: item.close >= item.open ? "rgba(22,199,154,.72)" : "rgba(255,77,103,.72)",
    })) as HistogramData<UTCTimestamp>[]);

    if (technicals.support != null) {
      candleSeries.createPriceLine({ price: technicals.support, color: "#16c79a", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Support" });
    }
    if (technicals.resistance != null) {
      candleSeries.createPriceLine({ price: technicals.resistance, color: "#ff9f43", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Résistance" });
    }

    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => chart.applyOptions({ width: containerRef.current?.clientWidth ?? 800 }));
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [candles, technicals]);

  return (
    <section className="panel chart-panel">
      <div className="chart-toolbar">
        <div><span className="eyebrow">GRAPHIQUE PROFESSIONNEL</span><h2>Prix, volume et structure</h2></div>
        <div className="chart-legend"><span className="legend-dot blue" />SMA 20 <span className="legend-dot teal" />SMA 50 <span className="legend-dot purple" />SMA 200</div>
      </div>
      <div ref={containerRef} className="chart-canvas" />
      <div className="tradingview-attribution">Graphiques propulsés par <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™</a></div>
    </section>
  );
}
