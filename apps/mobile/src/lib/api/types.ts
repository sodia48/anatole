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
  metric?: "price" | "change_percent" | "rsi_14" | "momentum_20d" | "relative_volume" | "score" | null;
  operator?: "above" | "below" | null;
  threshold?: number | null;
  enabled: boolean;
  label?: string | null;
  kind?: "threshold" | "event";
  event_type?: "terminal_anomaly" | "terminal_regime" | "earnings_upcoming" | "insider_unusual" | "company_news" | null;
  cooldown_minutes?: number;
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
export type PortfolioRisk = { volatility_percent: number | null; beta: number | null; max_drawdown_percent: number | null; sharpe_ratio: number | null; concentration_hhi: number | null; top_position_percent: number | null; top_three_percent: number | null; diversification_score: number | null; risk_level: string | null };
export type PortfolioCoverage = { symbols_expected: number; symbols_available: number; coverage_percent: number };
export type PortfolioHorizon = { horizon: "1d" | "1w" | "1m" | "3m" | "ytd" | "1y"; return_percent: number | null; coverage: PortfolioCoverage; methodology: "observed_day" | "current_positions_reconstructed" };
export type PortfolioHorizonContribution = { symbol: string; contribution_percent: number; security_return_percent: number; current_weight_percent: number };
export type PortfolioContributionResult = { horizon: PortfolioHorizon["horizon"]; items: PortfolioHorizonContribution[]; coverage: PortfolioCoverage; methodology: PortfolioHorizon["methodology"] };
export type PortfolioCorrelation = { symbols: string[]; values: (number | null)[][]; observations: number[][]; average_correlation: number | null; highest_pair: [string, string, number] | null; lowest_pair: [string, string, number] | null; minimum_observations: number };
export type PortfolioStressTest = { key: "tsx" | "wti" | "cad_usd" | "canada_10y"; label: string; shock: number; shock_unit: "percent" | "basis_points"; estimated_portfolio_change_percent: number | null; coverage: PortfolioCoverage; methodology: string };
export type PortfolioPositionSnapshot = PortfolioPositionInput & { symbol: string; ticker: string; name: string; sector: string; currency?: string; price: number; market_value: number; unrealized_pnl: number; unrealized_pnl_percent: number; day_pnl?: number; day_change_percent: number; weight_percent: number; momentum_20d?: number | null; rsi_14?: number | null; relative_volume?: number | null; score?: number | null; source?: string; delayed?: boolean };
export type PortfolioSnapshot = { base_currency?: string; total_market_value: number; total_day_pnl: number; total_day_change_percent: number; total_unrealized_pnl: number; total_unrealized_pnl_percent?: number; portfolio_score?: number | null; sector_allocation: PortfolioAllocation[]; currency_allocation?: PortfolioAllocation[]; positions: PortfolioPositionSnapshot[]; risk?: PortfolioRisk | null; contributors?: PortfolioContributor[]; detractors?: PortfolioContributor[]; performance_horizons?: PortfolioHorizon[]; contribution_horizons?: PortfolioContributionResult[]; correlation?: PortfolioCorrelation | null; stress_tests?: PortfolioStressTest[]; risk_reading?: string[]; methodology?: string; notes?: string[]; generated_at?: string; refresh_after_seconds?: number };
export type AlertSnapshot = { items: { id: string; symbol: string; status: string; message: string; current_value?: number | null; triggered: boolean; name?: string; metric_label?: string; unit?: string; source?: string | null; event_type?: AlertRule["event_type"]; evaluated_at?: string }[]; triggered_count: number; monitored_count: number; unavailable_count: number; generated_at?: string; refresh_after_seconds?: number };
export type NotificationItem = { id: string; kind: string; title: string; message: string; severity: "info" | "attention" | "important"; symbol: string | null; route: string | null; created_at: string; read_at: string | null };
export type NotificationFeed = { items: NotificationItem[]; unread_count: number; generated_at: string };
export type MobileDevice = { id: string; platform: "ios" | "android"; device_name: string | null; app_version: string | null; push_enabled: boolean; created_at: string; updated_at: string; last_seen_at: string };
export type SymbolSearchItem = { symbol: string; ticker: string; name: string; sector: string; exchange: string; universe: string; instrument_type: "stock" | "etf" | string; provider: string | null; exposure: string | null };
export type SymbolSearchResponse = { query: string; items: SymbolSearchItem[]; count: number };
export type ComparisonRange = "1mo" | "3mo" | "6mo" | "ytd" | "1y" | "3y" | "5y";
export type ComparisonInstrument = { ticker: string; symbol: string; name: string; sector: string; instrument_type: "action" | "etf" | "indice" | "autre"; currency: string; price: number; change_percent: number; total_return_percent: number; annualized_return_percent: number | null; volatility_percent: number | null; beta: number | null; max_drawdown_percent: number | null; sharpe_ratio: number | null; momentum_20d: number | null; rsi_14: number | null; relative_volume: number | null; trend: string; market_cap: number | null; trailing_pe: number | null; forward_pe: number | null; price_to_book: number | null; dividend_yield_percent: number | null; score: number | null; rank: number; strengths: string[]; weaknesses: string[]; source: string; delayed: boolean };
export type ComparisonSnapshot = { range: ComparisonRange; range_label: string; benchmark: string; benchmark_name: string; instruments: ComparisonInstrument[]; series: { symbol: string; name: string; points: { time: number; value: number }[] }[]; correlation: { symbols: string[]; values: (number | null)[][] }; risk_free_rate_percent: number; methodology: string; generated_at: string; refresh_after_seconds: number };
export type AssistantResponse = { intent: string; title: string; answer: string; facts: { label: string; value: string; tone: string }[]; links: { label: string; href: string }[]; sources: { label: string; detail: string; status: string }[]; suggestions: string[]; confidence: string; disclaimer: string; guardrail_triggered: boolean; generated_at: string };
