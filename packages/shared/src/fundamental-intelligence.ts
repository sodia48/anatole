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

export type SectorInsight = {
  key: string;
  label_fr: string;
  label_en: string;
  value: number | null;
  unit: string;
  status: "available" | "unavailable";
  period_end: string | null;
  source_name: string | null;
  source_url: string | null;
  source_confidence: "official" | "secondary" | "unclassified";
  filed_at: string | null;
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
  sector_metrics: SectorInsight[];
  methodology_fr: string;
  methodology_en: string;
  missing_data: string[];
  global_score: null;
};

export type PeerCandidate = {
  ticker: string;
  name: string;
  sector: string;
  selection_basis: string;
  comparability?: "direct" | "related" | "sector";
  industry?: string | null;
  reason?: string | null;
};

export type PeerMeasureValue = {
  ticker: string;
  value: number;
  period_end: string;
  source_name: string;
  source_url: string | null;
  source_confidence: "official" | "secondary" | "unclassified";
};

export type PeerMeasureComparison = {
  key: string;
  label_fr: string;
  label_en: string;
  basis: "annual" | "current_snapshot";
  unit: "percent" | "ratio";
  values: PeerMeasureValue[];
  median: number | null;
  rank: number | null;
  sample_size: number;
  minimum_sample_size: number;
  explanation_fr: string;
  explanation_en: string;
};

export type PeerComparison = {
  target: string;
  sector: string | null;
  sector_family: string;
  universe_source: string;
  universe_as_of: string | null;
  candidates: PeerCandidate[];
  selected: string[];
  excluded: Record<string, string>;
  measures: PeerMeasureComparison[];
  method_fr: string;
  method_en: string;
};

const exclusionFr: Record<string, string> = {
  "financial snapshot unavailable": "instantané financier indisponible",
  "different business family": "modèle économique différent",
  "different industry": "activité différente",
  "market capitalization unavailable": "capitalisation indisponible",
  "market capitalization currencies differ or are unknown": "devises de capitalisation différentes ou inconnues",
  "market capitalization outside 0.2–5× target range": "capitalisation hors de la fourchette 0,2 à 5 fois la cible",
  "outside selected Canadian sector universe": "hors de l’univers canadien du secteur sélectionné",
  "industry unverified": "activité précise non vérifiée",
  "no comparable annual metrics": "aucune donnée annuelle comparable",
  "related business only": "activité connexe, hors comparaison directe",
  "sector exploration only": "même grand secteur, hors comparaison directe",
};

export function peerExclusionReason(reason: string, language: "fr" | "en"): string {
  return language === "fr" ? exclusionFr[reason] ?? reason : reason;
}
