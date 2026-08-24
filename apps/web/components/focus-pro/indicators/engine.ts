import type { Candle } from "@/lib/types";

import type {
  FocusIndicatorConfig,
  IndicatorId,
  IndicatorInputValue,
  IndicatorResult,
} from "../types";

type RawSeries = Array<number | null>;
type RawResult = Record<string, RawSeries>;

export type IndicatorDefinition = {
  id: IndicatorId;
  name: string;
  category: "trend" | "momentum" | "volatility" | "volume";
  pane: "main" | "separate";
  inputs: Record<string, IndicatorInputValue>;
  outputs: readonly string[];
  colors: readonly string[];
  calculate: (candles: Candle[], inputs: Record<string, IndicatorInputValue>) => RawResult;
};

function period(inputs: Record<string, IndicatorInputValue>, key: string, fallback: number): number {
  const parsed = Math.trunc(Number(inputs[key] ?? fallback));
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 500)) : fallback;
}

function source(candles: Candle[], value: IndicatorInputValue = "close"): number[] {
  const name = String(value);
  return candles.map((item) => {
    if (name === "open") return item.open;
    if (name === "high") return item.high;
    if (name === "low") return item.low;
    if (name === "hl2") return (item.high + item.low) / 2;
    if (name === "hlc3") return (item.high + item.low + item.close) / 3;
    if (name === "ohlc4") return (item.open + item.high + item.low + item.close) / 4;
    return item.close;
  });
}

export function sma(values: RawSeries, window: number): RawSeries {
  const output: RawSeries = Array(values.length).fill(null);
  let total = 0;
  let valid = 0;
  const queue: RawSeries = [];
  values.forEach((value, index) => {
    queue.push(value);
    if (value !== null) {
      total += value;
      valid += 1;
    }
    if (queue.length > window) {
      const removed = queue.shift();
      if (removed !== null && removed !== undefined) {
        total -= removed;
        valid -= 1;
      }
    }
    if (queue.length === window && valid === window) output[index] = total / window;
  });
  return output;
}

export function ema(values: RawSeries, window: number): RawSeries {
  const output: RawSeries = Array(values.length).fill(null);
  const seed: number[] = [];
  const multiplier = 2 / (window + 1);
  let current: number | null = null;
  values.forEach((value, index) => {
    if (value === null) return;
    if (current === null) {
      seed.push(value);
      if (seed.length === window) {
        current = seed.reduce((sum, item) => sum + item, 0) / window;
        output[index] = current;
      }
      return;
    }
    current += (value - current) * multiplier;
    output[index] = current;
  });
  return output;
}

function wma(values: RawSeries, window: number): RawSeries {
  const output: RawSeries = Array(values.length).fill(null);
  const denominator = window * (window + 1) / 2;
  for (let index = window - 1; index < values.length; index += 1) {
    const sample = values.slice(index - window + 1, index + 1);
    if (sample.some((value) => value === null)) continue;
    output[index] = sample.reduce<number>(
      (sum, value, itemIndex) => sum + Number(value) * (itemIndex + 1),
      0,
    ) / denominator;
  }
  return output;
}

function rma(values: number[], window: number): RawSeries {
  const output: RawSeries = Array(values.length).fill(null);
  if (values.length < window) return output;
  let current = values.slice(0, window).reduce((sum, value) => sum + value, 0) / window;
  output[window - 1] = current;
  for (let index = window; index < values.length; index += 1) {
    current = (current * (window - 1) + values[index]) / window;
    output[index] = current;
  }
  return output;
}

export function rsi(values: number[], window: number): RawSeries {
  const output: RawSeries = Array(values.length).fill(null);
  if (values.length <= window) return output;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }
  const averageGains = rma(gains, window);
  const averageLosses = rma(losses, window);
  for (let index = window; index < values.length; index += 1) {
    const gain = averageGains[index - 1];
    const loss = averageLosses[index - 1];
    if (gain === null || loss === null) continue;
    output[index] = loss === 0 ? 100 : gain === 0 ? 0 : 100 - 100 / (1 + gain / loss);
  }
  return output;
}

function highest(values: number[], window: number): RawSeries {
  return values.map((_, index) => (
    index < window - 1 ? null : Math.max(...values.slice(index - window + 1, index + 1))
  ));
}

function lowest(values: number[], window: number): RawSeries {
  return values.map((_, index) => (
    index < window - 1 ? null : Math.min(...values.slice(index - window + 1, index + 1))
  ));
}

function trueRange(candles: Candle[]): number[] {
  return candles.map((item, index) => {
    const previous = candles[index - 1]?.close ?? item.close;
    return Math.max(item.high - item.low, Math.abs(item.high - previous), Math.abs(item.low - previous));
  });
}

function singleAverage(
  candles: Candle[],
  inputs: Record<string, IndicatorInputValue>,
  calculator: (values: RawSeries, window: number) => RawSeries,
): RawResult {
  return { value: calculator(source(candles, inputs.source), period(inputs, "period", 20)) };
}

function vwap(candles: Candle[]): RawResult {
  let cumulativeValue = 0;
  let cumulativeVolume = 0;
  return {
    value: candles.map((item) => {
      cumulativeValue += (item.high + item.low + item.close) / 3 * item.volume;
      cumulativeVolume += item.volume;
      return cumulativeVolume ? cumulativeValue / cumulativeVolume : null;
    }),
  };
}

function macd(candles: Candle[], inputs: Record<string, IndicatorInputValue>): RawResult {
  const values = source(candles, inputs.source);
  const fast = ema(values, period(inputs, "fast", 12));
  const slow = ema(values, period(inputs, "slow", 26));
  const line = fast.map((value, index) => (
    value === null || slow[index] === null ? null : value - Number(slow[index])
  ));
  const signal = ema(line, period(inputs, "signal", 9));
  return {
    macd: line,
    signal,
    histogram: line.map((value, index) => (
      value === null || signal[index] === null ? null : value - Number(signal[index])
    )),
  };
}

function bollinger(candles: Candle[], inputs: Record<string, IndicatorInputValue>): RawResult {
  const values = source(candles, inputs.source);
  const window = period(inputs, "period", 20);
  const deviation = Math.max(0.1, Math.min(Number(inputs.deviation ?? 2), 10));
  const middle = sma(values, window);
  const upper: RawSeries = Array(values.length).fill(null);
  const lower: RawSeries = Array(values.length).fill(null);
  for (let index = window - 1; index < values.length; index += 1) {
    const mean = middle[index];
    if (mean === null) continue;
    const sample = values.slice(index - window + 1, index + 1);
    const variance = sample.reduce((sum, value) => sum + (value - mean) ** 2, 0) / window;
    const spread = Math.sqrt(variance) * deviation;
    upper[index] = mean + spread;
    lower[index] = mean - spread;
  }
  return { upper, middle, lower };
}

function stochastic(candles: Candle[], inputs: Record<string, IndicatorInputValue>): RawResult {
  const window = period(inputs, "period", 14);
  const highs = highest(candles.map((item) => item.high), window);
  const lows = lowest(candles.map((item) => item.low), window);
  const raw = candles.map((item, index) => {
    const high = highs[index];
    const low = lows[index];
    return high === null || low === null || high === low
      ? null
      : (item.close - low) / (high - low) * 100;
  });
  const k = sma(raw, period(inputs, "smooth", 3));
  return { k, d: sma(k, period(inputs, "signal", 3)) };
}

function stochRsi(candles: Candle[], inputs: Record<string, IndicatorInputValue>): RawResult {
  const window = period(inputs, "period", 14);
  const values = rsi(source(candles, inputs.source), window);
  const raw: RawSeries = Array(values.length).fill(null);
  for (let index = window - 1; index < values.length; index += 1) {
    const sample = values.slice(index - window + 1, index + 1);
    if (sample.some((value) => value === null)) continue;
    const numeric = sample.map(Number);
    const low = Math.min(...numeric);
    const high = Math.max(...numeric);
    raw[index] = high === low ? 0 : (Number(values[index]) - low) / (high - low) * 100;
  }
  const k = sma(raw, period(inputs, "smooth", 3));
  return { k, d: sma(k, period(inputs, "signal", 3)) };
}

function adx(candles: Candle[], inputs: Record<string, IndicatorInputValue>): RawResult {
  const window = period(inputs, "period", 14);
  const plus = [0];
  const minus = [0];
  for (let index = 1; index < candles.length; index += 1) {
    const up = candles[index].high - candles[index - 1].high;
    const down = candles[index - 1].low - candles[index].low;
    plus.push(up > down && up > 0 ? up : 0);
    minus.push(down > up && down > 0 ? down : 0);
  }
  const atr = rma(trueRange(candles), window);
  const plusSmooth = rma(plus, window);
  const minusSmooth = rma(minus, window);
  const plusDi: RawSeries = [];
  const minusDi: RawSeries = [];
  const dx: number[] = [];
  for (let index = 0; index < candles.length; index += 1) {
    const volatility = atr[index];
    if (volatility === null || plusSmooth[index] === null || minusSmooth[index] === null || volatility === 0) {
      plusDi.push(null);
      minusDi.push(null);
      dx.push(0);
      continue;
    }
    const plusValue = Number(plusSmooth[index]) / volatility * 100;
    const minusValue = Number(minusSmooth[index]) / volatility * 100;
    plusDi.push(plusValue);
    minusDi.push(minusValue);
    dx.push(plusValue + minusValue === 0 ? 0 : Math.abs(plusValue - minusValue) / (plusValue + minusValue) * 100);
  }
  return { adx: rma(dx, window), plus_di: plusDi, minus_di: minusDi };
}

function cci(candles: Candle[], inputs: Record<string, IndicatorInputValue>): RawResult {
  const window = period(inputs, "period", 20);
  const values = source(candles, "hlc3");
  const averages = sma(values, window);
  const output: RawSeries = Array(values.length).fill(null);
  for (let index = window - 1; index < values.length; index += 1) {
    const mean = averages[index];
    if (mean === null) continue;
    const sample = values.slice(index - window + 1, index + 1);
    const deviation = sample.reduce((sum, value) => sum + Math.abs(value - mean), 0) / window;
    output[index] = deviation === 0 ? 0 : (values[index] - mean) / (0.015 * deviation);
  }
  return { value: output };
}

function change(
  candles: Candle[],
  inputs: Record<string, IndicatorInputValue>,
  percentChange: boolean,
): RawResult {
  const values = source(candles, inputs.source);
  const window = period(inputs, "period", percentChange ? 12 : 10);
  return {
    value: values.map((value, index) => {
      if (index < window) return null;
      const previous = values[index - window];
      return percentChange
        ? previous === 0 ? null : (value / previous - 1) * 100
        : value - previous;
    }),
  };
}

function obv(candles: Candle[]): RawResult {
  const output = Array(candles.length).fill(0) as number[];
  for (let index = 1; index < candles.length; index += 1) {
    const direction = candles[index].close > candles[index - 1].close
      ? 1 : candles[index].close < candles[index - 1].close ? -1 : 0;
    output[index] = output[index - 1] + direction * candles[index].volume;
  }
  return { value: output };
}

function mfi(candles: Candle[], inputs: Record<string, IndicatorInputValue>): RawResult {
  const window = period(inputs, "period", 14);
  const typical = source(candles, "hlc3");
  const positive = Array(candles.length).fill(0) as number[];
  const negative = Array(candles.length).fill(0) as number[];
  for (let index = 1; index < candles.length; index += 1) {
    const flow = typical[index] * candles[index].volume;
    if (typical[index] >= typical[index - 1]) positive[index] = flow;
    else negative[index] = flow;
  }
  return {
    value: candles.map((_, index) => {
      if (index < window) return null;
      const gains = positive.slice(index - window + 1, index + 1).reduce((sum, value) => sum + value, 0);
      const losses = negative.slice(index - window + 1, index + 1).reduce((sum, value) => sum + value, 0);
      return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
    }),
  };
}

function donchian(candles: Candle[], inputs: Record<string, IndicatorInputValue>): RawResult {
  const window = period(inputs, "period", 20);
  const upper = highest(candles.map((item) => item.high), window);
  const lower = lowest(candles.map((item) => item.low), window);
  return {
    upper,
    lower,
    middle: upper.map((value, index) => (
      value === null || lower[index] === null ? null : (value + Number(lower[index])) / 2
    )),
  };
}

function ichimoku(candles: Candle[], inputs: Record<string, IndicatorInputValue>): RawResult {
  const highs = candles.map((item) => item.high);
  const lows = candles.map((item) => item.low);
  const midpoint = (window: number) => {
    const upper = highest(highs, window);
    const lower = lowest(lows, window);
    return upper.map((value, index) => (
      value === null || lower[index] === null ? null : (value + Number(lower[index])) / 2
    ));
  };
  const conversion = midpoint(period(inputs, "conversion", 9));
  const base = midpoint(period(inputs, "base", 26));
  return {
    conversion,
    base,
    span_a: conversion.map((value, index) => (
      value === null || base[index] === null ? null : (value + Number(base[index])) / 2
    )),
    span_b: midpoint(period(inputs, "span", 52)),
  };
}

function supertrend(candles: Candle[], inputs: Record<string, IndicatorInputValue>): RawResult {
  const atr = rma(trueRange(candles), period(inputs, "period", 10));
  const multiplier = Math.max(0.1, Math.min(Number(inputs.multiplier ?? 3), 20));
  const value: RawSeries = Array(candles.length).fill(null);
  const direction: RawSeries = Array(candles.length).fill(null);
  let upper: number | null = null;
  let lower: number | null = null;
  let bullish = true;
  candles.forEach((item, index) => {
    if (atr[index] === null) return;
    const middle = (item.high + item.low) / 2;
    const basicUpper = middle + multiplier * Number(atr[index]);
    const basicLower = middle - multiplier * Number(atr[index]);
    const previousClose = candles[index - 1]?.close ?? item.close;
    upper = upper === null || basicUpper < upper || previousClose > upper ? basicUpper : upper;
    lower = lower === null || basicLower > lower || previousClose < lower ? basicLower : lower;
    if (bullish && item.close < lower) bullish = false;
    else if (!bullish && item.close > upper) bullish = true;
    value[index] = bullish ? lower : upper;
    direction[index] = bullish ? 1 : -1;
  });
  return { value, direction };
}

function parabolicSar(candles: Candle[], inputs: Record<string, IndicatorInputValue>): RawResult {
  const output: RawSeries = Array(candles.length).fill(null);
  if (candles.length < 2) return { value: output };
  const step = Math.max(0.001, Math.min(Number(inputs.step ?? 0.02), 0.2));
  const maximum = Math.max(step, Math.min(Number(inputs.maximum ?? 0.2), 1));
  let bullish = candles[1].close >= candles[0].close;
  let current = bullish ? candles[0].low : candles[0].high;
  let extreme = bullish ? candles[0].high : candles[0].low;
  let acceleration = step;
  output[0] = current;
  for (let index = 1; index < candles.length; index += 1) {
    const item = candles[index];
    current += acceleration * (extreme - current);
    if (bullish) {
      current = Math.min(current, candles[index - 1].low, candles[index - 2]?.low ?? candles[index - 1].low);
      if (item.low < current) {
        bullish = false;
        current = extreme;
        extreme = item.low;
        acceleration = step;
      } else if (item.high > extreme) {
        extreme = item.high;
        acceleration = Math.min(maximum, acceleration + step);
      }
    } else {
      current = Math.max(current, candles[index - 1].high, candles[index - 2]?.high ?? candles[index - 1].high);
      if (item.high > current) {
        bullish = true;
        current = extreme;
        extreme = item.high;
        acceleration = step;
      } else if (item.low < extreme) {
        extreme = item.low;
        acceleration = Math.min(maximum, acceleration + step);
      }
    }
    output[index] = current;
  }
  return { value: output };
}

const BLUE = "#2c9cff";
const TEAL = "#13d0c5";
const PURPLE = "#8a63ff";
const ORANGE = "#f6b94a";
const RED = "#ff5f76";

export const INDICATOR_DEFINITIONS: readonly IndicatorDefinition[] = [
  { id: "sma", name: "SMA", category: "trend", pane: "main", inputs: { period: 20, source: "close" }, outputs: ["value"], colors: [BLUE], calculate: (c, i) => singleAverage(c, i, sma) },
  { id: "ema", name: "EMA", category: "trend", pane: "main", inputs: { period: 20, source: "close" }, outputs: ["value"], colors: [TEAL], calculate: (c, i) => singleAverage(c, i, ema) },
  { id: "wma", name: "WMA", category: "trend", pane: "main", inputs: { period: 20, source: "close" }, outputs: ["value"], colors: [PURPLE], calculate: (c, i) => singleAverage(c, i, wma) },
  { id: "vwap", name: "VWAP", category: "volume", pane: "main", inputs: {}, outputs: ["value"], colors: [ORANGE], calculate: vwap },
  { id: "rsi", name: "RSI", category: "momentum", pane: "separate", inputs: { period: 14, source: "close" }, outputs: ["value"], colors: [PURPLE], calculate: (c, i) => ({ value: rsi(source(c, i.source), period(i, "period", 14)) }) },
  { id: "macd", name: "MACD", category: "momentum", pane: "separate", inputs: { fast: 12, slow: 26, signal: 9, source: "close" }, outputs: ["macd", "signal", "histogram"], colors: [BLUE, ORANGE, TEAL], calculate: macd },
  { id: "bollinger", name: "Bollinger Bands", category: "volatility", pane: "main", inputs: { period: 20, deviation: 2, source: "close" }, outputs: ["upper", "middle", "lower"], colors: [BLUE, "#7f9db1", BLUE], calculate: bollinger },
  { id: "atr", name: "ATR", category: "volatility", pane: "separate", inputs: { period: 14 }, outputs: ["value"], colors: [ORANGE], calculate: (c, i) => ({ value: rma(trueRange(c), period(i, "period", 14)) }) },
  { id: "stochastic", name: "Stochastic", category: "momentum", pane: "separate", inputs: { period: 14, smooth: 3, signal: 3 }, outputs: ["k", "d"], colors: [BLUE, ORANGE], calculate: stochastic },
  { id: "stoch_rsi", name: "Stoch RSI", category: "momentum", pane: "separate", inputs: { period: 14, smooth: 3, signal: 3, source: "close" }, outputs: ["k", "d"], colors: [TEAL, PURPLE], calculate: stochRsi },
  { id: "adx", name: "ADX", category: "trend", pane: "separate", inputs: { period: 14 }, outputs: ["adx", "plus_di", "minus_di"], colors: [ORANGE, TEAL, RED], calculate: adx },
  { id: "cci", name: "CCI", category: "momentum", pane: "separate", inputs: { period: 20 }, outputs: ["value"], colors: [PURPLE], calculate: cci },
  { id: "roc", name: "ROC", category: "momentum", pane: "separate", inputs: { period: 12, source: "close" }, outputs: ["value"], colors: [BLUE], calculate: (c, i) => change(c, i, true) },
  { id: "momentum", name: "Momentum", category: "momentum", pane: "separate", inputs: { period: 10, source: "close" }, outputs: ["value"], colors: [TEAL], calculate: (c, i) => change(c, i, false) },
  { id: "obv", name: "OBV", category: "volume", pane: "separate", inputs: {}, outputs: ["value"], colors: [BLUE], calculate: obv },
  { id: "mfi", name: "MFI", category: "volume", pane: "separate", inputs: { period: 14 }, outputs: ["value"], colors: [TEAL], calculate: mfi },
  { id: "donchian", name: "Donchian", category: "volatility", pane: "main", inputs: { period: 20 }, outputs: ["upper", "middle", "lower"], colors: [ORANGE, "#7f9db1", ORANGE], calculate: donchian },
  { id: "ichimoku", name: "Ichimoku", category: "trend", pane: "main", inputs: { conversion: 9, base: 26, span: 52 }, outputs: ["conversion", "base", "span_a", "span_b"], colors: [BLUE, RED, TEAL, PURPLE], calculate: ichimoku },
  { id: "supertrend", name: "Supertrend", category: "trend", pane: "main", inputs: { period: 10, multiplier: 3 }, outputs: ["value"], colors: [TEAL], calculate: supertrend },
  { id: "parabolic_sar", name: "Parabolic SAR", category: "trend", pane: "main", inputs: { step: 0.02, maximum: 0.2 }, outputs: ["value"], colors: [ORANGE], calculate: parabolicSar },
] as const;

export function indicatorDefinition(id: IndicatorId): IndicatorDefinition {
  const definition = INDICATOR_DEFINITIONS.find((item) => item.id === id);
  if (!definition) throw new Error(`Indicateur inconnu : ${id}`);
  return definition;
}

export function calculateIndicator(
  candles: Candle[],
  config: FocusIndicatorConfig,
): IndicatorResult {
  const definition = indicatorDefinition(config.definition_id);
  const raw = definition.calculate(candles, { ...definition.inputs, ...config.inputs });
  const outputs = Object.fromEntries(
    Object.entries(raw).map(([name, values]) => [
      name,
      values.flatMap((value, index) => (
        value === null || !Number.isFinite(value)
          ? []
          : [{ time: candles[index].time, value }]
      )),
    ]),
  );
  return { outputs, pane: definition.pane };
}

export function calculateIndicators(
  candles: Candle[],
  indicators: FocusIndicatorConfig[],
): Map<string, IndicatorResult> {
  return new Map(
    indicators
      .filter((item) => item.visible)
      .slice(0, 20)
      .map((item) => [item.id, calculateIndicator(candles, item)]),
  );
}
