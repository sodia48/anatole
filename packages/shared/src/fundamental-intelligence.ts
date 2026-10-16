/** API contract for sourced calculations shared by web and native clients. */
export type FundamentalObservation = {
  value: number;
  period_end: string;
  period_type: "annual" | "quarterly";
  unit: "money" | "percent" | "ratio";
  currency: string | null;
  nature: "published" | "calculated";
  formula: string | null;
  inputs: string[];
  source_name: string;
  source_url: string | null;
  source_type: string | null;
  source_confidence: "official" | "secondary" | "unclassified";
  filed_at: string | null;
};

export type FundamentalMeasure = {
  key: string;
  label_fr: string;
  label_en: string;
  dimension: string;
  unit: FundamentalObservation["unit"];
  observations: FundamentalObservation[];
  status: "available" | "insufficient" | "not_applicable";
  reason_fr: string | null;
  reason_en: string | null;
  method_fr: string;
  method_en: string;
};

export type FundamentalScoreContribution = {
  measure_key: string;
  previous: number;
  current: number;
  direction: "improving" | "stable" | "deteriorating";
  points: number;
};

export type FundamentalDimension = {
  key: string;
  label_fr: string;
  label_en: string;
  measure_keys: string[];
  available_count: number;
  score: number | null;
  score_status: "directional" | "insufficient" | "not_applicable";
  contributions: FundamentalScoreContribution[];
  explanation_fr: string;
  explanation_en: string;
};

export type FundamentalFinding = {
  kind: "strength" | "vulnerability" | "observation";
  text_fr: string;
  text_en: string;
  measure_keys: string[];
};

export type FundamentalDiagnostic = {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  sector_family: string;
  generated_at: string;
  source_generated_at: string;
  stale: boolean;
  financial_currency: string | null;
  status: "available" | "partial" | "unavailable";
  measures: FundamentalMeasure[];
  dimensions: FundamentalDimension[];
  findings: FundamentalFinding[];
  methodology_fr: string;
  methodology_en: string;
  missing_data: string[];
  global_score: null;
};
