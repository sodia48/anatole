import type { Candle } from "@/lib/types";

export type DerivedChartPoint = {
  time: number;
  value: number;
  source: "derived";
};

export type ExtensibleChartTransform = {
  id: "renko" | "kagi";
  label: string;
  provenance: "derived_from_real_ohlc";
  transform: (candles: Candle[], input?: number) => DerivedChartPoint[];
};

export function heikinAshi(candles: Candle[]): Candle[] {
  let previousOpen: number | null = null;
  let previousClose: number | null = null;
  return candles.map((candle) => {
    const close = (
      candle.open + candle.high + candle.low + candle.close
    ) / 4;
    const open = previousOpen === null || previousClose === null
      ? (candle.open + candle.close) / 2
      : (previousOpen + previousClose) / 2;
    const transformed = {
      ...candle,
      open,
      close,
      high: Math.max(candle.high, open, close),
      low: Math.min(candle.low, open, close),
    };
    previousOpen = open;
    previousClose = close;
    return transformed;
  });
}

function torontoSessionKey(timestamp: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp * 1_000));
}

export function aggregateIntraday(
  candles: Candle[],
  factor: number,
): Candle[] {
  if (factor <= 1) return candles;
  const sessions = new Map<string, Candle[]>();
  for (const candle of candles) {
    const key = torontoSessionKey(candle.time);
    const session = sessions.get(key) ?? [];
    session.push(candle);
    sessions.set(key, session);
  }
  const output: Candle[] = [];
  for (const session of sessions.values()) {
    for (let offset = 0; offset < session.length; offset += factor) {
      const batch = session.slice(offset, offset + factor);
      if (!batch.length) continue;
      output.push({
        time: batch[0].time,
        open: batch[0].open,
        high: Math.max(...batch.map((item) => item.high)),
        low: Math.min(...batch.map((item) => item.low)),
        close: batch.at(-1)?.close ?? batch[0].close,
        volume: batch.reduce((total, item) => total + item.volume, 0),
      });
    }
  }
  return output.sort((left, right) => left.time - right.time);
}

function renko(candles: Candle[], requestedBrick?: number): DerivedChartPoint[] {
  if (!candles.length) return [];
  const ranges = candles.map((item) => item.high - item.low).filter((value) => value > 0);
  const brick = Math.max(
    requestedBrick ?? ranges.reduce((sum, value) => sum + value, 0) / Math.max(ranges.length, 1),
    0.0001,
  );
  const output: DerivedChartPoint[] = [];
  let level = candles[0].close;
  for (const candle of candles) {
    while (Math.abs(candle.close - level) >= brick) {
      level += Math.sign(candle.close - level) * brick;
      output.push({ time: candle.time, value: level, source: "derived" });
    }
  }
  return output;
}

function kagi(candles: Candle[], reversalPercent = 4): DerivedChartPoint[] {
  if (!candles.length) return [];
  const output: DerivedChartPoint[] = [{
    time: candles[0].time,
    value: candles[0].close,
    source: "derived",
  }];
  let extreme = candles[0].close;
  let direction = 0;
  for (const candle of candles.slice(1)) {
    const price = candle.close;
    const reversal = Math.max(Math.abs(extreme) * reversalPercent / 100, 0.0001);
    if (direction >= 0 && price >= extreme) {
      direction = 1;
      extreme = price;
      output.push({ time: candle.time, value: price, source: "derived" });
    } else if (direction <= 0 && price <= extreme) {
      direction = -1;
      extreme = price;
      output.push({ time: candle.time, value: price, source: "derived" });
    } else if (Math.abs(price - extreme) >= reversal) {
      direction *= -1;
      extreme = price;
      output.push({ time: candle.time, value: price, source: "derived" });
    }
  }
  return output;
}

export const EXTENSIBLE_CHART_TRANSFORMS: readonly ExtensibleChartTransform[] = [
  {
    id: "renko",
    label: "Renko · dérivé",
    provenance: "derived_from_real_ohlc",
    transform: renko,
  },
  {
    id: "kagi",
    label: "Kagi · dérivé",
    provenance: "derived_from_real_ohlc",
    transform: kagi,
  },
] as const;
