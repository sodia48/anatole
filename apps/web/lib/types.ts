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

export type CompanyNetworkNodeType =
  | "company"
  | "private_company"
  | "government"
  | "end_market"
  | "commodity";

export type CompanyNetworkNode = {
  id: string;
  ticker: string | null;
  name: string;
  exchange: string | null;
  country: string | null;
  sector: string | null;
  industry: string | null;
  public_company: boolean;
  node_type: CompanyNetworkNodeType;
};

export type CompanyRelationshipType =
  | "supplier"
  | "customer"
  | "distributor"
  | "strategic_partner"
  | "joint_venture"
  | "parent"
  | "subsidiary"
  | "major_contract";

export type RelationshipEvidence = {
  id: string;
  relationship_id: string | null;
  source_type:
    | "issuer_filing"
    | "annual_report"
    | "sedar"
    | "sec"
    | "investor_relations"
    | "press_release"
    | "finnhub"
    | "other";
  title: string;
  url: string;
  published_at: string | null;
  document_date: string | null;
  excerpt: string;
  issuer: string;
};

export type CompanyRelationship = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relationship_type: CompanyRelationshipType;
  direction: "source_to_target";
  status: "active" | "historical" | "unknown";
  confidence: "verified" | "corroborated" | "secondary";
  materiality: "critical" | "material" | "notable" | "unknown";
  revenue_share_percent: number | null;
  contract_value: number | null;
  contract_currency: string | null;
  first_seen: string | null;
  last_seen: string | null;
  source_count: number;
  last_verified_at: string | null;
  evidence: RelationshipEvidence[];
  correlation_2w: number | null;
  correlation_1m: number | null;
  correlation_3m: number | null;
  correlation_6m: number | null;
  correlation_1y: number | null;
  correlation_2y: number | null;
};

export type CompanyNetworkSourceStatus = {
  source: string;
  status: "available" | "partial" | "unavailable";
  count: number;
  detail: string;
  detail_en?: string | null;
};

export type CompanyNetworkSnapshot = {
  center: CompanyNetworkNode;
  nodes: CompanyNetworkNode[];
  relationships: CompanyRelationship[];
  sector_exposure: Array<{
    sector: string;
    verified_relationship_count: number;
    quantified_revenue_share_percent: number | null;
  }>;
  sources: CompanyNetworkSourceStatus[];
  generated_at: string;
  stale: boolean;
  coverage: {
    depth: 1 | 2;
    node_limit: number;
    truncated: boolean;
    verified_relationships: number;
    corroborated_relationships: number;
    secondary_relationships: number;
    official_documents_scanned: number;
    build_status: "ready" | "building" | "failed";
    retry_after_seconds: number | null;
    build_error: string | null;
    message_fr: string | null;
    message_en: string | null;
  };
};

export type CompanyRelationshipPath = {
  from_company: CompanyNetworkNode;
  to_company: CompanyNetworkNode;
  nodes: CompanyNetworkNode[];
  relationships: CompanyRelationship[];
  depth: number;
  generated_at: string;
  found: boolean;
  status: "ready" | "building" | "failed";
  retry_after_seconds: number | null;
  message_fr: string | null;
  message_en: string | null;
};

export type CompanyNetworkEvidenceResponse = {
  ticker: string;
  groups: Array<{
    relationship: CompanyRelationship;
    evidence: RelationshipEvidence[];
  }>;
  generated_at: string;
  status: "ready" | "building" | "failed";
  retry_after_seconds: number | null;
  build_error: string | null;
};

export type StockHistoryResponse = {
  ticker: string;
  range: string;
  interval: string;
  candles: Candle[];
};

export type FocusFundamentalOverlaySnapshot = {
  ticker: string;
  source: string;
  quarterly_financials: Array<{
    period_end: string;
    total_revenue: number | null;
    diluted_eps: number | null;
    source: {
      source_name: string;
      source_url: string | null;
    } | null;
  }>;
  events: {
    earnings_dates: string[];
    ex_dividend_date: string | null;
    dividend_date: string | null;
  };
  metrics: {
    dividend_rate: number | null;
    dividend_yield: number | null;
  };
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
  regions?: string[];
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
  regions?: string[];
};

export type CalendarSnapshot = {
  events: EconomicEvent[];
  source_statuses: FeedStatus[];
  generated_at: string;
  refresh_after_seconds: number;
};

export type EarningsCalendarEvent = {
  ticker: string;
  symbol: string;
  company: string;
  sector: string | null;
  weight: number | null;
  starts_at: string;
  window_start: string;
  window_end: string;
  time_is_estimated: boolean;
  source: string;
  url: string;
};

export type EarningsCalendarSnapshot = {
  universe: string;
  universe_as_of: string | null;
  constituent_count: number;
  companies_with_dates: number;
  events: EarningsCalendarEvent[];
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

export type InstitutionHoldingStatus =
  | "new"
  | "increased"
  | "reduced"
  | "closed"
  | "unchanged";

export type InstitutionSourceState =
  | "available"
  | "partial"
  | "unavailable"
  | "stale";

export type InstitutionSourceStatus = {
  source: string;
  status: InstitutionSourceState;
  detail: string;
  url: string;
  updated_at: string | null;
};

export type InstitutionSummary = {
  cik: string;
  name: string;
  country: string;
  report_period: string;
  filed_at: string;
  filing_url: string;
  total_13f_value: number;
  holdings_count: number;
  previous_total_13f_value: number;
  top10_concentration_percent: number;
  new_positions_count: number;
  increased_positions_count: number;
  reduced_positions_count: number;
  closed_positions_count: number;
  comparison_available: boolean;
};

export type InstitutionHolding = {
  cusip: string;
  ticker: string | null;
  issuer: string;
  security_class: string;
  shares: number;
  previous_shares: number;
  share_change: number;
  share_change_percent: number | null;
  value: number;
  portfolio_weight_percent: number;
  previous_value: number;
  put_call: string | null;
  status: InstitutionHoldingStatus;
};

export type InstitutionDetail = {
  institution: InstitutionSummary;
  holdings: InstitutionHolding[];
  previous_report_period: string | null;
  source_statuses: InstitutionSourceStatus[];
  generated_at: string;
  stale: boolean;
  message: string | null;
};

export type InstitutionFlow = {
  ticker: string | null;
  cusip: string;
  issuer: string;
  institutions_holding: number;
  institutions_increased: number;
  institutions_reduced: number;
  institutions_new: number;
  institutions_closed: number;
  aggregate_share_change: number | null;
  current_reported_value: number;
  institution_names: string[];
};

export type InstitutionsSnapshot = {
  institutions: InstitutionSummary[];
  top_increased: InstitutionFlow[];
  top_new: InstitutionFlow[];
  top_reduced: InstitutionFlow[];
  top_closed: InstitutionFlow[];
  report_period: string | null;
  previous_report_period: string | null;
  generated_at: string;
  sources: InstitutionSourceStatus[];
  stale: boolean;
  message: string | null;
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

export type PortfolioPositionInput = {
  symbol: string;
  quantity: number;
  average_cost: number;
};

export type PortfolioPositionSnapshot = {
  symbol: string;
  ticker: string;
  name: string;
  sector: string;
  currency: string;
  quantity: number;
  average_cost: number;
  price: number;
  fx_rate: number;
  cost_basis: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  day_pnl: number;
  day_change_percent: number;
  weight_percent: number;
  momentum_20d: number;
  rsi_14: number | null;
  trend: string;
  score: number;
  source: string;
  delayed: boolean;
};

export type PortfolioAllocation = {
  key: string;
  label: string;
  value: number;
  weight_percent: number;
};

export type PortfolioPerformancePoint = {
  time: number;
  portfolio: number;
  benchmark: number | null;
};

export type PortfolioContributor = {
  symbol: string;
  name: string;
  value: number;
  value_percent: number;
  kind: "day" | "unrealized";
};

export type PortfolioSnapshot = {
  base_currency: string;
  benchmark: string;
  benchmark_name: string;
  total_market_value: number;
  total_cost_basis: number;
  total_unrealized_pnl: number;
  total_unrealized_pnl_percent: number;
  total_day_pnl: number;
  total_day_change_percent: number;
  portfolio_score: number;
  positions: PortfolioPositionSnapshot[];
  sector_allocation: PortfolioAllocation[];
  currency_allocation: PortfolioAllocation[];
  performance: PortfolioPerformancePoint[];
  risk: {
    volatility_percent: number | null;
    beta: number | null;
    max_drawdown_percent: number | null;
    sharpe_ratio: number | null;
    concentration_hhi: number;
    top_position_percent: number;
    top_three_percent: number;
    diversification_score: number;
    risk_level: "Faible" | "Modéré" | "Élevé" | "Très élevé";
  };
  contributors: PortfolioContributor[];
  detractors: PortfolioContributor[];
  notes: string[];
  generated_at: string;
  refresh_after_seconds: number;
};

export type AlertMetric =
  | "price"
  | "change_percent"
  | "rsi_14"
  | "momentum_20d"
  | "relative_volume"
  | "score";

export type AlertType =
  | "price_level"
  | "indicator_threshold"
  | "indicator_cross"
  | "drawing_break"
  | "strategy_signal";

export type AlertRule = {
  id: string;
  symbol: string;
  metric: AlertMetric;
  operator: "above" | "below";
  threshold: number;
  enabled: boolean;
  label?: string | null;
  alert_type?: AlertType;
  indicator_id?: string | null;
  indicator_output?: string;
  indicator_inputs?: Record<string, number | string>;
  comparison_indicator_id?: string | null;
  comparison_indicator_output?: string;
  comparison_indicator_inputs?: Record<string, number | string>;
  drawing_points?: Array<{ time: number; price: number }>;
  strategy_id?: string | null;
  strategy_parameters?: Record<string, number | string>;
  strategy_signal?: "buy" | "sell";
};

export type AlertEvaluation = {
  id: string;
  symbol: string;
  name: string;
  metric: AlertMetric;
  alert_type: AlertType;
  metric_label: string;
  operator: "above" | "below";
  threshold: number;
  current_value: number | null;
  unit: string;
  triggered: boolean;
  status: "triggered" | "monitoring" | "unavailable" | "disabled";
  message: string;
  source: string | null;
  evaluated_at: string;
};

export type AlertSnapshot = {
  items: AlertEvaluation[];
  triggered_count: number;
  monitored_count: number;
  unavailable_count: number;
  generated_at: string;
  refresh_after_seconds: number;
};

export type BacktestStrategy =
  | "sma_crossover"
  | "ema_crossover"
  | "rsi_mean_reversion"
  | "macd_crossover"
  | "bollinger_breakout"
  | "donchian_breakout"
  | "anatole_script";

export type BacktestRequest = {
  ticker: string;
  range: string;
  interval: string;
  strategy: BacktestStrategy;
  strategy_parameters: Record<string, number | string>;
  script?: string | null;
  initial_capital: number;
  position_size: number;
  commission: number;
  slippage: number;
  direction: "long" | "short" | "both";
};

export type BacktestTrade = {
  side: "long" | "short";
  entry_time: number;
  entry_price: number;
  exit_time: number;
  exit_price: number;
  quantity: number;
  pnl: number;
  pnl_percent: number;
  commission: number;
  slippage: number;
  reason: string;
};

export type BacktestResult = {
  ticker: string;
  strategy: BacktestStrategy;
  interval: string;
  initial_capital: number;
  final_equity: number;
  net_profit: number;
  net_profit_percent: number;
  cagr: number | null;
  max_drawdown: number;
  max_drawdown_percent: number;
  win_rate: number;
  trades_count: number;
  winning_trades: number;
  losing_trades: number;
  profit_factor: number | null;
  average_trade: number;
  sharpe: number | null;
  sortino: number | null;
  exposure_percent: number;
  equity_curve: Array<{ time: number; equity: number; drawdown: number; drawdown_percent: number }>;
  trades: BacktestTrade[];
  execution_convention: string;
  disclaimer: string;
};

export type AnatoleScriptValidation = {
  valid: boolean;
  name: string | null;
  kind: "indicator" | "strategy" | null;
  statements_count: number;
  indicators_count: number;
  plots: string[];
  diagnostics: Array<{ line: number; column: number; message: string }>;
};

export type PaperOrderRequest = {
  ticker: string;
  order_type: "market" | "limit" | "stop" | "stop_limit";
  side: "buy" | "sell";
  quantity: number;
  limit_price?: number | null;
  stop_price?: number | null;
};

export type PaperOrder = PaperOrderRequest & {
  id: string;
  status: "pending" | "filled" | "cancelled" | "rejected";
  submitted_market_time: string;
  created_at: string;
  activated_at: string | null;
  filled_at: string | null;
  filled_price: number | null;
  cancelled_at: string | null;
  rejection_reason: string | null;
};

export type PaperPosition = {
  ticker: string;
  quantity: number;
  average_cost: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  realized_pnl: number;
};

export type PaperTrade = {
  id: string;
  order_id: string;
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  notional: number;
  commission: number;
  realized_pnl: number;
  executed_at: string;
};

export type PaperAccount = {
  currency: "CAD";
  initial_capital: number;
  cash: number;
  equity: number;
  buying_power: number;
  market_value: number;
  total_return: number;
  total_return_percent: number;
  commission: number;
  positions: PaperPosition[];
  orders: PaperOrder[];
  trades: PaperTrade[];
  updated_at: string;
  paper: true;
};

export type PaperOrderPreview = {
  ticker: string;
  side: "buy" | "sell";
  order_type: PaperOrderRequest["order_type"];
  quantity: number;
  estimated_price: number;
  estimated_notional: number;
  estimated_commission: number;
  available_cash: number;
  existing_position: number;
  sufficient_cash: boolean;
  message: string;
};

export type AdvisorLevel = "low" | "medium" | "high";
export type AdvisorGoalType =
  | "retirement"
  | "home"
  | "education"
  | "reserve"
  | "wealth"
  | "flexible";

export type AdvisorProfile = {
  currency: "CAD" | "USD";
  goal_type: AdvisorGoalType | null;
  goal_name: string | null;
  horizon_years: number | null;
  target_amount: number | null;
  current_savings: number | null;
  monthly_contribution: number | null;
  essential_monthly_expenses: number | null;
  liquid_reserve: number | null;
  high_interest_debt: boolean | null;
  income_stability: AdvisorLevel | null;
  liquidity_need: AdvisorLevel | null;
  loss_comfort: AdvisorLevel | null;
  experience: "beginner" | "intermediate" | "advanced" | null;
};

export type AdvisorProjection = {
  key: string;
  label: string;
  annual_return_percent: number;
  projected_value: number;
  gap_to_target: number | null;
  progress_percent: number | null;
};

export type AdvisorPriority = {
  key: string;
  level: "low" | "medium" | "high";
  title: string;
  detail: string;
  action: string;
};

export type AdvisorRiskDimension = {
  key: string;
  label: string;
  value: string;
  status: "favorable" | "balanced" | "caution" | "incomplete";
  detail: string;
};

export type AdvisorStressTest = {
  label: string;
  shock_percent: number;
  estimated_loss: number;
  estimated_value: number;
  detail: string;
};

export type AdvisorPlan = {
  title: string;
  summary: string;
  currency: string;
  profile_completeness: number;
  readiness_score: number;
  capacity_profile: "Prudente" | "Équilibrée" | "Dynamique";
  capacity_score: number;
  reserve_months: number | null;
  portfolio_score: number | null;
  portfolio_risk_level: string | null;
  top_position_percent: number | null;
  projections: AdvisorProjection[];
  priorities: AdvisorPriority[];
  risk_dimensions: AdvisorRiskDimension[];
  stress_tests: AdvisorStressTest[];
  boundaries: string[];
  generated_at: string;
};

export type AssistantFact = {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral" | "info";
};

export type AssistantResponse = {
  intent: string;
  title: string;
  answer: string;
  facts: AssistantFact[];
  links: Array<{ label: string; href: string }>;
  sources: Array<{
    label: string;
    detail: string;
    status: "live" | "delayed" | "fallback" | "internal";
  }>;
  suggestions: string[];
  confidence: "élevée" | "moyenne" | "limitée";
  disclaimer: string;
  guardrail_triggered: boolean;
  plan: AdvisorPlan | null;
  generated_at: string;
};

export type DataQualitySource = {
  key: string;
  label: string;
  category: string;
  status: "healthy" | "degraded" | "stale" | "unavailable" | "idle";
  coverage_percent: number;
  freshness_seconds: number | null;
  item_count: number | null;
  source: string;
  detail: string;
};

export type DataQualityMetric = {
  key: string;
  label: string;
  value: string;
  status: "healthy" | "degraded" | "critical" | "neutral";
  detail: string;
};

export type DataQualitySnapshot = {
  overall_score: number;
  overall_status: "Excellent" | "Bon" | "Dégradé" | "Critique";
  provider_mode: string;
  uptime_seconds: number;
  metrics: DataQualityMetric[];
  sources: DataQualitySource[];
  endpoints: Array<{
    path: string;
    label: string;
    status: "available" | "degraded" | "not_warmed";
    detail: string;
  }>;
  recommendations: string[];
  generated_at: string;
  refresh_after_seconds: number;
};

export type ReliabilityRequestSample = {
  path: string;
  method: string;
  status_code: number;
  duration_ms: number;
  request_id: string;
  occurred_at: string;
};

export type ReliabilitySnapshot = {
  status: "healthy" | "degraded" | "critical";
  uptime_seconds: number;
  total_requests: number;
  total_4xx: number;
  total_5xx: number;
  total_exceptions: number;
  error_rate_5xx: number;
  average_duration_ms: number;
  p95_duration_ms: number;
  max_duration_ms: number;
  slow_requests: number;
  reports_received: number;
  last_report_at: string | null;
  upstream_metrics: Record<string, number | string | null>;
  recent_errors: ReliabilityRequestSample[];
  generated_at: string;
};
