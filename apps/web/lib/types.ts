export type Quote = {
  ticker: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  previous_close: number;
  change: number;
  change_percent: number;
  day_high: number;
  day_low: number;
  volume: number;
  timestamp: string;
  source: string;
  delayed: boolean;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Technicals = {
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  support: number | null;
  resistance: number | null;
  trend: string;
};

export type StockProfile = {
  ticker: string;
  name: string;
  exchange: string;
  currency: string;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  website: string | null;
  description: string | null;
};

export type FocusSnapshot = {
  quote: Quote;
  history: Candle[];
  technicals: Technicals;
  profile: StockProfile;
  generated_at: string;
};
