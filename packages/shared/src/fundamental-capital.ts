export type CapitalValue = {
  value: number | null;
  status: "reported" | "calculated" | "unavailable";
  formula: string;
  missing_inputs: string[];
};
export type CapitalMetricKey = "operating_cash_flow" | "capital_expenditure" | "dividends" | "repurchases" |
  "free_cash_flow" | "cash_after_allocations" | "capex_share_of_known_uses" | "earnings_cash_conversion" | "debt_change";
export type CapitalPeriod = {
  period_end: string;
  currency: string | null;
  source_name: string;
  source_url: string | null;
  source_confidence: "official" | "secondary" | "unclassified";
  filed_at: string | null;
} & Record<CapitalMetricKey, CapitalValue>;
export type AnalystEstimatePoint = {
  period: string;
  end_date: string | null;
  eps_average: number | null;
  revenue_average: number | null;
  eps_analyst_count: number | null;
  revenue_analyst_count: number | null;
};
export type ActualVsConsensus = {
  period: string;
  actual_eps: number;
  estimated_eps: number;
  difference_eps: number;
  surprise_percent: number | null;
  period_date_verified: boolean;
};
export type AnalystContext = {
  status: "available" | "partial" | "unavailable";
  as_of: string;
  source_name: string;
  source_confidence: "secondary_snapshot";
  recommendation_key: string | null;
  distribution: Record<"strong_buy" | "buy" | "hold" | "sell" | "strong_sell", number | null>;
  target_low: number | null;
  target_mean: number | null;
  target_median: number | null;
  target_high: number | null;
  target_currency: string | null;
  estimates: AnalystEstimatePoint[];
  actual_vs_consensus: ActualVsConsensus[];
  revision_history_status: "unavailable";
  revision_history_reason_fr: string;
  revision_history_reason_en: string;
};
export type FundamentalCapitalResearch = {
  ticker: string;
  status: "available" | "partial" | "unavailable";
  financial_currency: string | null;
  stale: boolean;
  periods: CapitalPeriod[];
  analysts: AnalystContext;
  limitations_fr: string[];
  limitations_en: string[];
};
