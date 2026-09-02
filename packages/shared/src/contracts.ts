export type MarketTile = {
  ticker: string; symbol: string; name: string; sector: string; weight: number;
  price: number; change: number; change_percent: number; volume: number;
  timestamp: string; source: string; delayed: boolean;
};
export type SectorSnapshot = { sector: string; change_percent: number; weight: number; advancers: number; decliners: number; unchanged: number };
export type CockpitSnapshot = {
  universe: string; weighted_change_percent: number;
  breadth: { advancers: number; decliners: number; unchanged: number; advance_ratio: number };
  sectors: SectorSnapshot[]; constituents: MarketTile[]; top_gainers: MarketTile[]; top_losers: MarketTile[];
  generated_at: string; refresh_after_seconds: number;
};

export type ScreenerUniverse = "composite" | "tsx60";
export type ScreenerRow = {
  ticker: string; symbol: string; name: string; sector: string; price: number; change_percent: number;
  volume: number; average_volume_20d: number; relative_volume: number; momentum_20d: number;
  rsi_14: number | null; sma_20: number | null; sma_50: number | null; trend: string;
  score: number; signal: string; source: string; delayed: boolean; quote_as_of: string | null;
};
export type ScreenerSnapshot = {
  universe: string; items: ScreenerRow[]; sectors: string[]; generated_at: string;
  refresh_after_seconds: number; live_items: number; fallback_items: number;
};

export type TerminalComponent = { key: string; label: string; score: number | null; value: string; description: string };
export type TerminalSectorState = "Leadership" | "Accumulation" | "Neutre" | "Distribution" | "Faiblesse" | "N/D";
export type TerminalSector = {
  sector: string; change_percent: number; momentum_20d: number | null; average_score: number | null;
  relative_volume: number | null; advancers: number; decliners: number; leadership_score: number | null; state: TerminalSectorState;
};
export type TerminalOpportunity = {
  symbol: string; name: string; sector: string; price: number; change_percent: number; momentum_20d: number;
  rsi_14: number | null; relative_volume: number; score: number; signal: string; opportunity_type: string; reasons: string[];
};
export type TerminalAlert = {
  id: string; severity: "info" | "watch" | "high"; category: string; symbol: string | null; title: string; detail: string;
};
export type TerminalDataQuality = {
  expected_symbols: number; real_symbols: number; unavailable_symbols: string[]; coverage_percent: number;
  history_symbols: number; history_coverage_percent: number; warnings: string[]; source_statuses: Record<string, string>;
  quotes_as_of: string | null; history_as_of: string | null;
};
export type TerminalRegime = "Haussier" | "Constructif" | "Neutre" | "Fragile" | "Baissier";
export type TerminalRisk = "Faible" | "Modéré" | "Élevé" | "Critique";
export type TerminalRegimeHorizon = {
  key: "session" | "5d" | "20d" | "3m"; label: string; regime: TerminalRegime | null; score: number | null;
  risk_level: TerminalRisk | null; change_percent: number | null; breadth_percent: number | null;
  above_sma20_percent: number | null; above_sma50_percent: number | null; average_momentum_percent: number | null;
  coverage_percent: number; as_of: string;
};
export type TerminalRegimeHistoryPoint = { timestamp: number; regime_score: number | null; regime: TerminalRegime | null; benchmark_value: number | null; breadth_percent: number | null; coverage_percent: number };
export type TerminalBreadthPoint = { timestamp: number; value: number };
export type TerminalBreadthDivergence = { active: boolean; severity: "info" | "watch" | "high"; title: string; explanation: string };
export type TerminalBreadthPro = {
  advancers: number | null; decliners: number | null; unchanged: number | null; advance_ratio: number | null;
  above_sma20_percent: number | null; above_sma50_percent: number | null; above_sma200_percent: number | null;
  new_highs_52w: number | null; new_lows_52w: number | null; high_low_52w_eligible_symbols: number;
  high_low_52w_coverage_percent: number; up_volume: number | null; down_volume: number | null;
  neutral_volume: number | null; up_volume_ratio_percent: number | null; equal_weight_change_percent: number | null;
  cap_weight_change_percent: number | null; concentration_spread_percent_points: number | null;
  positive_sectors: number | null; negative_sectors: number | null; positive_sectors_percent: number | null;
  advance_decline_line: TerminalBreadthPoint[]; coverage_percent: number; divergence: TerminalBreadthDivergence;
};
export type TerminalSectorQuadrant = "LEADERSHIP" | "AMÉLIORATION" | "AFFAIBLISSEMENT" | "SOUS PRESSION" | "N/D";
export type TerminalSectorRotation = {
  sector: string; momentum_20d: number | null; relative_strength_20d: number | null; breadth_percent: number | null;
  average_score: number | null; relative_volume: number | null; member_count: number; x: number | null; y: number | null;
  previous_x: number | null; previous_y: number | null; quadrant: TerminalSectorQuadrant; state: string; leadership_score: number | null;
};
export type TerminalAnomalyType = "volume_spike" | "gap" | "momentum_acceleration" | "rsi_extreme" | "sma_cross" | "price_volume_divergence" | "sector_dislocation" | "score_shift";
export type TerminalAnomaly = {
  id: string; symbol: string | null; sector: string | null; type: TerminalAnomalyType; severity: "info" | "watch" | "high";
  direction: "positive" | "negative" | "neutral"; rarity_score: number; z_score: number | null; observed_value: number | null;
  baseline_value: number | null; unit: string; title: string; detail: string; reasons: string[]; source: string; generated_at: string;
};
export type TerminalMarketDriver = {
  key: string; label: string; category: string; value: number | null; unit: string; change_1d: number | null;
  change_5d: number | null; change_20d: number | null; change_unit: string; correlation_60d_to_tsx: number | null;
  relationship_label: string | null; status: "available" | "stale" | "unavailable"; source_name: string;
  source_url: string; delayed: boolean; as_of: string | null;
};
export type TerminalMethodologySection = { key: string; title: string; description: string };
export type TerminalRadarFilters = {
  score_min?: number | null; score_max?: number | null; momentum_20d_min?: number | null; momentum_20d_max?: number | null;
  relative_volume_min?: number | null; rsi_min?: number | null; rsi_max?: number | null; change_percent_min?: number | null;
  change_percent_max?: number | null; sector?: string | null; trend?: string | null; signal?: string | null;
  anomaly_types?: TerminalAnomalyType[];
};
export type TerminalRadarSort = "score_desc" | "score_asc" | "volume_desc" | "momentum_desc" | "change_desc" | "change_asc";
export type TerminalRadarPreset = { id: string; name: string; filters: TerminalRadarFilters; sort: TerminalRadarSort; created_at?: string | null; updated_at?: string | null };
export type TerminalRadarItem = TerminalOpportunity & {
  volume: number; average_volume_20d: number; sma_20: number | null; sma_50: number | null; trend: string;
  source: string; delayed: boolean; anomaly_types: TerminalAnomalyType[];
};
export type TerminalSnapshot = {
  schema_version: 2; universe: string; regime: TerminalRegime | null; regime_score: number | null; risk_level: TerminalRisk | null;
  weighted_change_percent: number | null; advance_ratio: number | null; average_anatole_score: number | null;
  average_momentum_20d: number | null; above_sma20_percent: number | null; above_sma50_percent: number | null;
  high_relative_volume_count: number | null; components: TerminalComponent[]; sectors: TerminalSector[];
  opportunities: TerminalOpportunity[]; alerts: TerminalAlert[]; leaders: TerminalOpportunity[];
  laggards: TerminalOpportunity[]; data_quality: TerminalDataQuality; regime_horizons: TerminalRegimeHorizon[];
  regime_history: TerminalRegimeHistoryPoint[]; breadth_pro: TerminalBreadthPro; sector_rotation: TerminalSectorRotation[];
  anomalies: TerminalAnomaly[]; market_drivers: TerminalMarketDriver[]; radar_items: TerminalRadarItem[];
  methodology_sections: TerminalMethodologySection[]; methodology: string; generated_at: string; refresh_after_seconds: number;
};

export type PsychologyComponent = { key: string; label: string; score: number; description: string };
export type PsychologySnapshot = {
  score: number; label: string; change_20d: number; change_50d: number; volatility_20d: number;
  advance_ratio: number; components: PsychologyComponent[]; generated_at: string; refresh_after_seconds: number; source: string;
};

export type EtfDirectoryItem = {
  ticker: string; symbol: string; name: string; provider: string; category: string; exposure: string;
  currency: string; price: number; change_percent: number; volume: number; source: string; delayed: boolean;
};
export type EtfDirectorySnapshot = {
  items: EtfDirectoryItem[]; categories: string[]; generated_at: string; refresh_after_seconds: number;
};
export type EtfHoldingDriver = {
  rank: number; symbol: string; display_symbol: string; name: string;
  instrument_type: "equity" | "etf" | "other"; weight_percent: number;
  price: number | null; currency: string | null; change_percent: number | null;
  contribution_percent_points: number | null; source: string; delayed: boolean;
};
export type EtfAllocationItem = { key: string; label: string; weight_percent: number };
export type EtfHoldingsSnapshot = {
  ticker: string; normalized_symbol: string; name: string; provider: string; category: string; exposure: string;
  description: string | null; currency: string; price: number | null; change_percent: number | null;
  holdings: EtfHoldingDriver[]; sectors: EtfAllocationItem[]; asset_classes: EtfAllocationItem[];
  top_holdings_weight_percent: number; net_driver_contribution_percent_points: number | null;
  positive_driver_contribution_percent_points: number | null; negative_driver_contribution_percent_points: number | null;
  quoted_holdings: number; total_holdings_returned: number; status: "available" | "partial" | "unavailable";
  message: string | null; source_name: string; source_url: string | null; generated_at: string; refresh_after_seconds: number;
};
export type EtfHistoryRange = "5d" | "1mo" | "ytd" | "6mo" | "1y" | "5y" | "10y";
export type EtfHistoryPoint = { timestamp: string; open: number; high: number; low: number; close: number; volume: number };
export type EtfHistorySnapshot = {
  ticker: string; normalized_symbol: string; range: EtfHistoryRange; range_label: string; currency: string; interval: string;
  points: EtfHistoryPoint[]; first_close: number | null; last_close: number | null; change: number | null;
  change_percent: number | null; period_high: number | null; period_low: number | null;
  status: "available" | "unavailable"; message: string | null; delayed: boolean;
  source_name: string; source_url: string | null; generated_at: string; refresh_after_seconds: number;
};

export type IpoInstrumentType = "company" | "etf" | "cdr" | "fund" | "other";
export type IpoPriceStatus = "final" | "range" | "reference" | "not_published";
export type DiscoverySourceStatus = {
  source: string; status: "available" | "partial" | "unavailable"; count: number; detail: string | null; url: string;
};
export type IpoItem = {
  id: string; event_date: string | null; company: string; symbol: string; symbols: string[]; exchange: string;
  country: "Canada" | "États-Unis"; event_type: string;
  status: "Cotée" | "Dossier déposé" | "À venir" | "Reportée" | "Retirée" | "À confirmer";
  instrument_type: IpoInstrumentType; instrument_label: string; source_name: string; source_url: string;
  official: boolean; confidence_score: number; focus_available: boolean; offer_price: number | null;
  offer_price_low: number | null; offer_price_high: number | null; offer_currency: string;
  offer_price_status: IpoPriceStatus; offer_price_label: string; price_source_url: string | null;
};
export type IpoSnapshot = {
  items: IpoItem[];
  summary: { total: number; canada: number; united_states: number; companies: number; newly_listed: number; regulatory_filings: number };
  sources: DiscoverySourceStatus[]; generated_at: string; refresh_after_seconds: number; message: string | null;
};

export type InsiderTransactionType = "buy" | "sell" | "grant" | "exercise" | "tax" | "other";
export type InsiderTrade = {
  id: string; ticker: string; company: string; market: "Canada" | "États-Unis"; insider_name: string; role: string;
  transaction_type: InsiderTransactionType; transaction_label: string; transaction_code: string;
  trade_date: string | null; filing_date: string | null; shares: number | null; price: number | null; value: number | null;
  holdings_after: number | null; ownership: string; unusual: boolean; source_name: string; source_url: string;
  official_verification_url: string; official_source: boolean;
};
export type InsiderSnapshot = {
  trades: InsiderTrade[];
  summary: { transactions: number; companies: number; buys: number; sells: number; grants_and_exercises: number; buy_value: number; sell_value: number; net_value: number; buy_ratio_percent: number; unusual_transactions: number };
  sources: DiscoverySourceStatus[]; market: "Canada" | "États-Unis"; requested_ticker: string | null;
  scanned_symbols: number; generated_at: string; refresh_after_seconds: number; message: string | null;
};

export type FundamentalMetrics = {
  market_cap: number | null; enterprise_value: number | null; trailing_pe: number | null;
  forward_pe: number | null; price_to_book: number | null; price_to_sales: number | null;
  enterprise_to_revenue: number | null; enterprise_to_ebitda: number | null;
  trailing_eps: number | null; forward_eps: number | null; beta: number | null;
  fifty_two_week_high: number | null; fifty_two_week_low: number | null;
  average_volume_10d: number | null; average_volume_3m: number | null;
  shares_outstanding: number | null; dividend_rate: number | null; dividend_yield: number | null;
  payout_ratio: number | null; total_revenue: number | null; revenue_per_share: number | null;
  gross_profit: number | null; ebitda: number | null; net_income_to_common: number | null;
  free_cash_flow: number | null; operating_cash_flow: number | null; total_cash: number | null;
  total_debt: number | null; debt_to_equity: number | null; current_ratio: number | null;
  quick_ratio: number | null; gross_margin: number | null; operating_margin: number | null;
  profit_margin: number | null; return_on_assets: number | null; return_on_equity: number | null;
  revenue_growth: number | null; earnings_growth: number | null;
};

export type FinancialSource = {
  source_type: "sec_edgar_xbrl" | "issuer_official_normalized" | "issuer_official_document" | "yahoo_structured" | "yahoo_public";
  source_name: string; source_url: string | null; filed_at: string | null; form: string | null;
  confidence: "official" | "secondary";
};

export type FinancialPeriod = {
  period_end: string; period_type: "annual" | "quarterly"; currency: string | null;
  total_revenue: number | null; cost_of_revenue: number | null; gross_profit: number | null;
  research_development: number | null; selling_general_administrative: number | null;
  total_operating_expenses: number | null; operating_income: number | null; ebit: number | null;
  depreciation_amortization: number | null; ebitda: number | null; interest_expense: number | null;
  income_before_tax: number | null; income_tax_expense: number | null; net_income: number | null;
  basic_eps: number | null; diluted_eps: number | null; diluted_average_shares: number | null;
  operating_cash_flow: number | null; capital_expenditure: number | null; free_cash_flow: number | null;
  dividends_paid: number | null; share_repurchases: number | null; total_cash: number | null;
  total_debt: number | null; net_debt: number | null; current_assets: number | null;
  current_liabilities: number | null; total_assets: number | null; total_liabilities: number | null;
  stockholder_equity: number | null; gross_margin: number | null; operating_margin: number | null;
  net_margin: number | null; free_cash_flow_margin: number | null; revenue_growth_yoy: number | null;
  operating_income_growth_yoy: number | null; net_income_growth_yoy: number | null;
  eps_growth_yoy: number | null; free_cash_flow_growth_yoy: number | null;
  calculated_fields: string[]; source: FinancialSource | null;
};

export type TTMSummary = Partial<Record<
  "total_revenue" | "gross_profit" | "operating_income" | "ebitda" | "net_income" |
  "diluted_eps" | "operating_cash_flow" | "capital_expenditure" | "free_cash_flow" |
  "dividends_paid" | "share_repurchases" | "total_cash" | "total_debt" | "net_debt" |
  "gross_margin" | "operating_margin" | "net_margin" | "free_cash_flow_margin",
  number | null
>> & { period_end: string | null; currency: string | null };

export type FinancialHighlights = {
  latest_period_end: string | null; revenue_growth_yoy: number | null;
  operating_income_growth_yoy: number | null; net_income_growth_yoy: number | null;
  eps_growth_yoy: number | null; free_cash_flow_growth_yoy: number | null;
  three_year_revenue_cagr: number | null; three_year_net_income_cagr: number | null;
  three_year_free_cash_flow_cagr: number | null; cash_conversion_percent: number | null;
  net_debt_to_ebitda: number | null;
};

export type EarningsEstimate = {
  period: string; end_date: string | null; eps_average: number | null; eps_low: number | null;
  eps_high: number | null; eps_year_ago: number | null; eps_growth: number | null;
  eps_analyst_count: number | null; revenue_average: number | null; revenue_low: number | null;
  revenue_high: number | null; revenue_year_ago: number | null; revenue_growth: number | null;
  revenue_analyst_count: number | null;
};
export type EarningsQuarter = { period: string; actual: number | null; estimate: number | null; surprise_percent: number | null };
export type AnalystConsensus = {
  recommendation_key: string | null; recommendation_mean: number | null; analyst_count: number | null;
  target_low: number | null; target_mean: number | null; target_median: number | null; target_high: number | null;
  current_price: number | null; upside_to_mean_percent: number | null; strong_buy: number | null;
  buy: number | null; hold: number | null; sell: number | null; strong_sell: number | null;
};
export type OfficialCoverage = {
  is_tsx_composite: boolean; status: "official" | "mixed" | "fallback" | "unavailable";
  official_periods: number; annual_official_periods: number; quarterly_official_periods: number;
  official_fields: number; sec_cik: string | null; source_types: string[]; documents_found: number;
  documents_parsed: number; structured_periods: number; annual_structured_periods: number;
  quarterly_structured_periods: number; structured_fields: number; calculated_fields: number;
  yahoo_statements_error: string | null; discovery_url: string | null; message: string | null;
};
export type FundamentalSnapshot = {
  ticker: string; symbol: string; name: string; exchange: string | null; currency: string | null;
  financial_currency: string | null; website: string | null; sector: string | null; industry: string | null;
  status: "available" | "partial" | "unavailable"; message: string | null; metrics: FundamentalMetrics;
  annual_financials: FinancialPeriod[]; quarterly_financials: FinancialPeriod[]; ttm: TTMSummary;
  highlights: FinancialHighlights; earnings_history: EarningsQuarter[]; earnings_estimates: EarningsEstimate[];
  analysts: AnalystConsensus; events: { earnings_dates: string[]; ex_dividend_date: string | null; dividend_date: string | null };
  official_coverage: OfficialCoverage; source: string; generated_at: string; refresh_after_seconds: number;
};

export type CompanyNetworkNode = {
  id: string; ticker: string | null; name: string; exchange: string | null; country: string | null;
  sector: string | null; industry: string | null; public_company: boolean;
  node_type: "company" | "private_company" | "government" | "end_market" | "commodity";
};
export type RelationshipEvidence = {
  id: string; relationship_id: string | null; source_type: string; title: string; url: string;
  published_at: string | null; document_date: string | null; excerpt: string; issuer: string;
};
export type CompanyRelationship = {
  id: string; source_node_id: string; target_node_id: string;
  relationship_type: "supplier" | "customer" | "distributor" | "strategic_partner" | "joint_venture" | "parent" | "subsidiary" | "major_contract";
  direction: "source_to_target"; status: "active" | "historical" | "unknown";
  confidence: "verified" | "corroborated" | "secondary"; materiality: "critical" | "material" | "notable" | "unknown";
  revenue_share_percent: number | null; contract_value: number | null; contract_currency: string | null;
  first_seen: string | null; last_seen: string | null; source_count: number; last_verified_at: string | null;
  evidence: RelationshipEvidence[]; correlation_2w: number | null; correlation_1m: number | null;
  correlation_3m: number | null; correlation_6m: number | null; correlation_1y: number | null; correlation_2y: number | null;
};
export type CompanyNetworkSnapshot = {
  center: CompanyNetworkNode; nodes: CompanyNetworkNode[]; relationships: CompanyRelationship[];
  sector_exposure: { sector: string; verified_relationship_count: number; quantified_revenue_share_percent: number | null }[];
  sources: { source: string; status: "available" | "partial" | "unavailable"; count: number; detail: string; detail_en: string | null }[];
  generated_at: string; stale: boolean; coverage: {
    depth: 1 | 2; node_limit: number; truncated: boolean; verified_relationships: number;
    corroborated_relationships: number; secondary_relationships: number; official_documents_scanned: number;
    build_status: "ready" | "building" | "failed"; retry_after_seconds: number | null;
    build_error: string | null; message_fr: string | null; message_en: string | null;
  };
};

export type CompanyNetworkEvidenceResponse = {
  ticker: string;
  groups: { relationship: CompanyRelationship; evidence: RelationshipEvidence[] }[];
  generated_at: string;
  status: "ready" | "building" | "failed";
  retry_after_seconds: number | null;
  build_error: string | null;
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
