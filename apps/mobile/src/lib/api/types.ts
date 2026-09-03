export type {
  AnalystConsensus,
  CockpitSnapshot,
  CompanyNetworkEvidenceResponse,
  CompanyNetworkNode,
  CompanyNetworkSnapshot,
  CompanyRelationship,
  CompanyRelationshipPath,
  EarningsEstimate,
  EarningsQuarter,
  EtfAllocationItem,
  EtfDirectoryItem,
  EtfDirectorySnapshot,
  EtfHistoryPoint,
  EtfHistoryRange,
  EtfHistorySnapshot,
  EtfHoldingDriver,
  EtfHoldingsSnapshot,
  FinancialHighlights,
  FinancialPeriod,
  FundamentalMetrics,
  FundamentalSnapshot,
  InsiderSnapshot,
  InsiderTrade,
  InsiderTransactionType,
  IpoInstrumentType,
  IpoItem,
  IpoSnapshot,
  MarketTile,
  OfficialCoverage,
  PsychologyComponent,
  PsychologySnapshot,
  RelationshipEvidence,
  ScreenerRow,
  ScreenerSnapshot,
  ScreenerUniverse,
  SectorSnapshot,
  TTMSummary,
  TerminalAlert,
  TerminalAnomaly,
  TerminalAnomalyType,
  TerminalBreadthDivergence,
  TerminalBreadthPoint,
  TerminalBreadthPro,
  TerminalComponent,
  TerminalDataQuality,
  TerminalMarketDriver,
  TerminalMethodologySection,
  TerminalOpportunity,
  TerminalRadarFilters,
  TerminalRadarItem,
  TerminalRadarPreset,
  TerminalRadarSort,
  TerminalRegime,
  TerminalRegimeHistoryPoint,
  TerminalRegimeHorizon,
  TerminalRisk,
  TerminalSector,
  TerminalSectorQuadrant,
  TerminalSectorRotation,
  TerminalSectorState,
  TerminalSnapshot,
} from "@anatole/shared";

export type AccountUser = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  last_login_at: string | null;
  is_admin: boolean;
};

export type PortfolioPositionInput = { symbol: string; quantity: number; average_cost: number };
export type AlertRule = {
  id: string;
  symbol: string;
  metric: "price" | "change_percent" | "rsi_14" | "momentum_20d" | "relative_volume" | "score";
  operator: "above" | "below";
  threshold: number;
  enabled: boolean;
  label?: string | null;
};

export type SyncedWorkspaceData = {
  watchlist: string[];
  portfolio: PortfolioPositionInput[];
  alerts: AlertRule[];
  preferences: {
    theme: "dark" | "blue";
    density: "comfortable" | "compact";
    decimals: 2 | 3;
    default_range: "1m" | "3m" | "6m" | "1y" | "5y";
    default_universe: "tsx60" | "composite";
    language: "fr" | "en";
  };
  advisor_profile?: unknown;
  cockpit_universe: "tsx60" | "composite";
  comparator_symbols: string[];
  focus_layouts: unknown[];
  focus_scripts: unknown[];
  terminal_presets: import("@anatole/shared").TerminalRadarPreset[];
};

export type WorkspaceSnapshot = { revision: number; data: SyncedWorkspaceData; updated_at: string | null };
export type AccountSession = { token: string; token_type: "bearer"; expires_at: string; user: AccountUser; workspace: WorkspaceSnapshot };
export type AccountStatus = { user: AccountUser; workspace_revision: number; workspace_updated_at: string | null };

export type Quote = {
  ticker: string;
  symbol: string;
  name: string;
  exchange: string;
  price: number;
  previous_close: number;
  change: number;
  change_percent: number;
  volume: number;
  day_high: number;
  day_low: number;
  currency: string;
  source: string;
  delayed: boolean;
  timestamp: string;
};
export type Candle = { time: string | number; open: number; high: number; low: number; close: number; volume: number };
export type FocusSnapshot = { quote: Quote; history: Candle[]; technicals: Record<string, unknown>; profile: { name: string; sector: string | null }; generated_at: string };
export type WatchlistSnapshot = { tickers: string[]; items: Quote[]; summary: { advancers: number; decliners: number; unchanged: number; average_change_percent: number }; generated_at: string; refresh_after_seconds: number };
export type FeedStatus = { source: string; status: string; detail: string | null };
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
  regions: string[];
};
export type NewsSnapshot = { items: NewsItem[]; source_statuses: FeedStatus[]; generated_at: string; refresh_after_seconds: number };
export type StockNewsItem = { id: string; title: string; summary: string; url: string; publisher: string; published_at: string; related_tickers: string[] };
export type StockNewsSnapshot = { ticker: string; symbol: string; company: string; items: StockNewsItem[]; status: string; detail: string | null; generated_at: string; refresh_after_seconds: number };
export type EarningsItem = {
  ticker: string;
  symbol: string;
  company: string;
  sector: string | null;
  weight: number | null;
  starts_at: string;
  window_start: string;
  window_end: string;
  time_is_estimated: boolean;
  eps_estimate: number | null;
  revenue_estimate: number | null;
  estimate_currency: string | null;
  eps_analyst_count: number | null;
  revenue_analyst_count: number | null;
  source: string;
  url: string;
};
export type EarningsSnapshot = {
  universe: string;
  universe_as_of: string | null;
  constituent_count: number;
  companies_with_dates: number;
  events: EarningsItem[];
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
  regions: string[];
};
export type CalendarEvent = EconomicEvent;
export type CalendarSnapshot = { events: EconomicEvent[]; source_statuses: FeedStatus[]; generated_at: string; refresh_after_seconds: number };
export type PortfolioAllocation = { key: string; label: string; value: number; weight_percent: number };
export type PortfolioContributor = { symbol: string; name: string; value: number; value_percent: number; kind: "day" | "unrealized" };
export type PortfolioRisk = { volatility_percent: number | null; beta: number | null; max_drawdown_percent: number | null; sharpe_ratio: number | null; concentration_hhi: number; top_position_percent: number; top_three_percent: number; diversification_score: number; risk_level: string };
export type PortfolioSnapshot = { base_currency?: string; total_market_value: number; total_day_pnl: number; total_day_change_percent: number; total_unrealized_pnl: number; sector_allocation: PortfolioAllocation[]; currency_allocation?: PortfolioAllocation[]; positions: (PortfolioPositionInput & { symbol?: string; ticker: string; name: string; sector?: string; price: number; market_value: number; unrealized_pnl: number; unrealized_pnl_percent: number; day_change_percent: number; weight_percent?: number; source?: string; delayed?: boolean })[]; risk?: PortfolioRisk; contributors?: PortfolioContributor[]; detractors?: PortfolioContributor[]; notes?: string[]; generated_at?: string; refresh_after_seconds?: number };
export type AlertSnapshot = { items: { id: string; symbol: string; status: string; message: string; current_value: number | null; triggered: boolean; name?: string; metric_label?: string; unit?: string; source?: string | null; evaluated_at?: string }[]; triggered_count: number; monitored_count: number; unavailable_count: number; generated_at?: string; refresh_after_seconds?: number };
export type NotificationItem = { id: string; kind: string; title: string; message: string; severity: "info" | "attention" | "important"; symbol: string | null; route: string | null; created_at: string; read_at: string | null };
export type NotificationFeed = { items: NotificationItem[]; unread_count: number; generated_at: string };
export type MobileDevice = { id: string; platform: "ios" | "android"; device_name: string | null; app_version: string | null; push_enabled: boolean; created_at: string; updated_at: string; last_seen_at: string };
