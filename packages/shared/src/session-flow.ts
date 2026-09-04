export type SessionFlowClassification =
  | "aggressor"
  | "bid_ask"
  | "tick_rule"
  | "candle_estimate"
  | "unavailable";

export type SessionFlowCandle = {
  open: number;
  close: number;
  volume: number | null | undefined;
};

export type SessionFlowSnapshot = {
  ticker: string;
  range: string;
  interval: string;
  total_volume: number | null;
  buy_volume: number | null;
  sell_volume: number | null;
  neutral_volume: number | null;
  volume_delta: number | null;
  buy_ratio: number | null;
  sell_ratio: number | null;
  classification: SessionFlowClassification;
  estimated: boolean;
  source: string;
  delayed: boolean;
  generated_at: string;
};

type SessionFlowInput = {
  ticker: string;
  range: string;
  interval: string;
  candles: SessionFlowCandle[];
  source: string;
  delayed: boolean;
  generatedAt?: string | null;
};

/**
 * Estimates period buy/sell volume from OHLCV candle direction.
 * This is not transactional order flow: no bid/ask or aggressor side is inferred.
 */
export function buildCandleSessionFlow(input: SessionFlowInput): SessionFlowSnapshot {
  let buyVolume = 0;
  let sellVolume = 0;
  let neutralVolume = 0;
  let validVolumeCandles = 0;

  for (const candle of input.candles) {
    const volume = candle.volume;
    if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0) {
      continue;
    }

    validVolumeCandles += 1;
    if (candle.close > candle.open) {
      buyVolume += volume;
    } else if (candle.close < candle.open) {
      sellVolume += volume;
    } else {
      neutralVolume += volume;
    }
  }

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  if (validVolumeCandles === 0) {
    return {
      ticker: input.ticker,
      range: input.range,
      interval: input.interval,
      total_volume: null,
      buy_volume: null,
      sell_volume: null,
      neutral_volume: null,
      volume_delta: null,
      buy_ratio: null,
      sell_ratio: null,
      classification: "unavailable",
      estimated: false,
      source: input.source,
      delayed: input.delayed,
      generated_at: generatedAt,
    };
  }

  const classifiedVolume = buyVolume + sellVolume;
  return {
    ticker: input.ticker,
    range: input.range,
    interval: input.interval,
    total_volume: classifiedVolume + neutralVolume,
    buy_volume: buyVolume,
    sell_volume: sellVolume,
    neutral_volume: neutralVolume,
    volume_delta: buyVolume - sellVolume,
    buy_ratio: classifiedVolume > 0 ? buyVolume / classifiedVolume : null,
    sell_ratio: classifiedVolume > 0 ? sellVolume / classifiedVolume : null,
    classification: "candle_estimate",
    estimated: true,
    source: input.source,
    delayed: input.delayed,
    generated_at: generatedAt,
  };
}
