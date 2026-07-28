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

export type ComparisonRange =
  | "1mo"
  | "3mo"
  | "6mo"
  | "ytd"
  | "1y"
  | "3y"
  | "5y";

export type ComparisonPoint = {
  time: number;
  value: number;
};

export type ComparisonSeries = {
  symbol: string;
  name: string;
  points: ComparisonPoint[];
};

export type ComparisonInstrument = {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  instrument_type: "action" | "etf" | "indice" | "autre";
  currency: string;
  price: number;
  change_percent: number;
  total_return_percent: number;
  annualized_return_percent: number | null;
  volatility_percent: number | null;
  beta: number | null;
  max_drawdown_percent: number | null;
  sharpe_ratio: number | null;
  momentum_20d: number;
  rsi_14: number | null;
  relative_volume: number;
  trend: string;
  market_cap: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  price_to_book: number | null;
  dividend_yield_percent: number | null;
  score: number;
  rank: number;
  strengths: string[];
  weaknesses: string[];
  source: string;
  delayed: boolean;
};

export type ComparisonSnapshot = {
  range: ComparisonRange;
  range_label: string;
  benchmark: string;
  benchmark_name: string;
  instruments: ComparisonInstrument[];
  series: ComparisonSeries[];
  correlation: {
    symbols: string[];
    values: Array<Array<number | null>>;
  };
  risk_free_rate_percent: number;
  methodology: string;
  generated_at: string;
  refresh_after_seconds: number;
};

export type TerminalComponent = {
  key: string;
  label: string;
  score: number;
  value: string;
  description: string;
};

export type TerminalSector = {
  sector: string;
  change_percent: number;
  momentum_20d: number;
  average_score: number;
  relative_volume: number;
  advancers: number;
  decliners: number;
  leadership_score: number;
  state:
    | "Leadership"
    | "Accumulation"
    | "Neutre"
    | "Distribution"
    | "Faiblesse";
};

export type TerminalOpportunity = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change_percent: number;
  momentum_20d: number;
  rsi_14: number | null;
  relative_volume: number;
  score: number;
  signal: string;
  opportunity_type: string;
  reasons: string[];
};

export type TerminalAlert = {
  id: string;
  severity: "info" | "watch" | "high";
  category: string;
  symbol: string | null;
  title: string;
  detail: string;
};

export type TerminalSnapshot = {
  universe: string;
  regime:
    | "Haussier"
    | "Constructif"
    | "Neutre"
    | "Fragile"
    | "Baissier";
  regime_score: number;
  risk_level: "Faible" | "Modéré" | "Élevé" | "Critique";
  weighted_change_percent: number;
  advance_ratio: number;
  average_anatole_score: number;
  average_momentum_20d: number;
  above_sma20_percent: number;
  above_sma50_percent: number;
  high_relative_volume_count: number;
  components: TerminalComponent[];
  sectors: TerminalSector[];
  opportunities: TerminalOpportunity[];
  alerts: TerminalAlert[];
  leaders: TerminalOpportunity[];
  laggards: TerminalOpportunity[];
  methodology: string;
  generated_at: string;
  refresh_after_seconds: number;
};
