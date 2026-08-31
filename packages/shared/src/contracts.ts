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
