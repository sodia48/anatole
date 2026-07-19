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


export type MarketTile = {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  weight: number;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  timestamp: string;
  source: string;
  delayed: boolean;
};

export type SectorSnapshot = {
  sector: string;
  weight: number;
  change_percent: number;
  advancers: number;
  decliners: number;
  unchanged: number;
};

export type MarketBreadth = {
  advancers: number;
  decliners: number;
  unchanged: number;
  advance_ratio: number;
};

export type CockpitSnapshot = {
  universe: string;
  universe_as_of: string;
  universe_source: string;
  weighted_change_percent: number;
  breadth: MarketBreadth;
  sectors: SectorSnapshot[];
  constituents: MarketTile[];
  top_gainers: MarketTile[];
  top_losers: MarketTile[];
  generated_at: string;
  refresh_after_seconds: number;
};

export type WatchlistSummary = {
  advancers: number;
  decliners: number;
  unchanged: number;
  average_change_percent: number;
};

export type WatchlistSnapshot = {
  tickers: string[];
  items: Quote[];
  summary: WatchlistSummary;
  generated_at: string;
  refresh_after_seconds: number;
};


export type HealthStatus = {
  status: string;
  service: string;
  timestamp: string;
};

export type SymbolSearchItem = {
  symbol: string;
  ticker: string;
  name: string;
  sector: string;
  exchange: string;
  universe: string;
};

export type SymbolSearchResponse = {
  query: string;
  items: SymbolSearchItem[];
  count: number;
};

export type ScreenerRow = {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change_percent: number;
  volume: number;
  average_volume_20d: number;
  relative_volume: number;
  momentum_20d: number;
  rsi_14: number | null;
  sma_20: number | null;
  sma_50: number | null;
  trend: string;
  score: number;
  signal: string;
  source: string;
  delayed: boolean;
};

export type ScreenerSnapshot = {
  universe: string;
  items: ScreenerRow[];
  sectors: string[];
  generated_at: string;
  refresh_after_seconds: number;
  live_items: number;
  fallback_items: number;
};

export type FeedStatus = {
  source: string;
  status: string;
  detail: string | null;
};

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  category: string;
  published_at: string;
  sentiment: string;
  sentiment_score: number;
};

export type NewsSnapshot = {
  items: NewsItem[];
  source_statuses: FeedStatus[];
  generated_at: string;
  refresh_after_seconds: number;
};

export type EconomicEvent = {
  id: string;
  title: string;
  country: string;
  currency: string;
  category: string;
  importance: string;
  starts_at: string;
  source: string;
  url: string | null;
  description: string | null;
};

export type CalendarSnapshot = {
  events: EconomicEvent[];
  source_statuses: FeedStatus[];
  generated_at: string;
  refresh_after_seconds: number;
};

export type EtfDirectoryItem = {
  ticker: string;
  symbol: string;
  name: string;
  provider: string;
  category: string;
  exposure: string;
  currency: string;
  price: number;
  change_percent: number;
  volume: number;
  source: string;
  delayed: boolean;
};

export type EtfDirectorySnapshot = {
  items: EtfDirectoryItem[];
  categories: string[];
  generated_at: string;
  refresh_after_seconds: number;
};

export type PsychologyComponent = {
  key: string;
  label: string;
  score: number;
  description: string;
};

export type PsychologySnapshot = {
  score: number;
  label: string;
  change_20d: number;
  change_50d: number;
  volatility_20d: number;
  advance_ratio: number;
  components: PsychologyComponent[];
  generated_at: string;
  refresh_after_seconds: number;
  source: string;
};
