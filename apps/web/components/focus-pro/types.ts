import type { Candle } from "@/lib/types";

export type FocusChartType =
  | "candles"
  | "bars"
  | "line"
  | "area"
  | "heikin_ashi";

export type FutureChartType = "renko" | "kagi";

export type FocusTimeframe =
  | "1m"
  | "2m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1D"
  | "1W"
  | "1M";

export type TimeframeDefinition = {
  id: FocusTimeframe;
  label: string;
  range: string;
  providerInterval: string;
  aggregate?: number;
  refreshMs?: number;
};

export const TIMEFRAMES: readonly TimeframeDefinition[] = [
  { id: "1m", label: "1m", range: "1d", providerInterval: "1m", refreshMs: 15_000 },
  { id: "2m", label: "2m", range: "5d", providerInterval: "2m", refreshMs: 30_000 },
  { id: "5m", label: "5m", range: "5d", providerInterval: "5m", refreshMs: 60_000 },
  { id: "15m", label: "15m", range: "1mo", providerInterval: "15m", refreshMs: 60_000 },
  { id: "30m", label: "30m", range: "1mo", providerInterval: "30m", refreshMs: 60_000 },
  { id: "1h", label: "1h", range: "3mo", providerInterval: "60m", refreshMs: 120_000 },
  { id: "4h", label: "4h", range: "3mo", providerInterval: "60m", aggregate: 4, refreshMs: 300_000 },
  { id: "1D", label: "1D", range: "1y", providerInterval: "1d" },
  { id: "1W", label: "1W", range: "5y", providerInterval: "1wk" },
  { id: "1M", label: "1M", range: "10y", providerInterval: "1mo" },
] as const;

export type DrawingTool =
  | "cursor"
  | "trendline"
  | "horizontal_line"
  | "vertical_line"
  | "ray"
  | "rectangle"
  | "parallel_channel"
  | "fib_retracement"
  | "fib_extension"
  | "price_range"
  | "date_range"
  | "text";

export type SnapMode = "none" | "ohlc" | "high_low";

export type DrawingAnchor = {
  time: number;
  price: number;
};

export type FocusDrawing = {
  id: string;
  tool: Exclude<DrawingTool, "cursor">;
  anchors: DrawingAnchor[];
  text?: string | null;
  color: string;
  line_width: number;
  locked: boolean;
  hidden: boolean;
  fib_levels: number[];
  timeframe?: FocusTimeframe | null;
};

export type IndicatorId =
  | "sma"
  | "ema"
  | "wma"
  | "vwap"
  | "rsi"
  | "macd"
  | "bollinger"
  | "atr"
  | "stochastic"
  | "stoch_rsi"
  | "adx"
  | "cci"
  | "roc"
  | "momentum"
  | "obv"
  | "mfi"
  | "donchian"
  | "ichimoku"
  | "supertrend"
  | "parabolic_sar";

export type IndicatorInputValue = number | string | boolean;

export type FocusIndicatorConfig = {
  id: string;
  definition_id: IndicatorId;
  inputs: Record<string, IndicatorInputValue>;
  colors: string[];
  line_width: number;
  visible: boolean;
};

export type FocusComparisonConfig = {
  symbol: string;
  mode: "price" | "normalized_percent";
  color: string;
};

export type FocusPaneConfig = {
  id: string;
  height_percent: number;
  collapsed: boolean;
};

export type FocusLayout = {
  id: string;
  name: string;
  ticker: string;
  chart_type: FocusChartType;
  timeframe: FocusTimeframe;
  indicators: FocusIndicatorConfig[];
  drawings: FocusDrawing[];
  comparisons: FocusComparisonConfig[];
  panes: FocusPaneConfig[];
  fundamentals_visible: boolean;
  updated_at: string | null;
};

export type FocusScript = {
  id: string;
  name: string;
  source: string;
  updated_at: string | null;
};

export type FundamentalMarker = {
  id: string;
  time: number;
  kind: "earnings" | "revenue" | "eps" | "dividend" | "corporate_event";
  title: string;
  detail: string;
  source: string;
};

export type IndicatorPoint = {
  time: number;
  value: number;
};

export type IndicatorResult = {
  outputs: Record<string, IndicatorPoint[]>;
  pane: "main" | "separate";
};

export type ComparisonSeries = {
  symbol: string;
  name: string;
  color: string;
  mode: "price" | "normalized_percent";
  candles: Candle[];
};

export const DEFAULT_FIB_RETRACEMENT = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const DEFAULT_FIB_EXTENSION = [1, 1.272, 1.618, 2, 2.618];

export function createDefaultFocusLayout(ticker: string): FocusLayout {
  const symbol = ticker.trim().toUpperCase().replace(/\.TO$/, "");
  return {
    id: `focus-${symbol || "default"}`,
    name: `${symbol || "Focus"} · Pro`,
    ticker: symbol,
    chart_type: "candles",
    timeframe: "1D",
    indicators: [
      {
        id: "sma-20",
        definition_id: "sma",
        inputs: { period: 20, source: "close" },
        colors: ["#2c9cff"],
        line_width: 2,
        visible: true,
      },
      {
        id: "sma-50",
        definition_id: "sma",
        inputs: { period: 50, source: "close" },
        colors: ["#13d0c5"],
        line_width: 2,
        visible: true,
      },
      {
        id: "sma-200",
        definition_id: "sma",
        inputs: { period: 200, source: "close" },
        colors: ["#8a63ff"],
        line_width: 2,
        visible: true,
      },
    ],
    drawings: [],
    comparisons: [],
    panes: [],
    fundamentals_visible: false,
    updated_at: null,
  };
}
