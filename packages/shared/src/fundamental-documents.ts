/** Literal official-report excerpts; no generated quote or inferred page. */
export type DocumentPassage = {
  document_url: string;
  document_title: string;
  document_type: string;
  published_at: string | null;
  page_number: number | null;
  topic: "results" | "cash_flow" | "capital" | "accounting" | "outlook" | "query";
  excerpt: string;
};
export type DocumentComparison = {
  topic: string;
  current: DocumentPassage;
  previous: DocumentPassage;
  status: "different_excerpt";
  note: string;
};
export type ResearchDocument = {
  url: string;
  title: string;
  document_type: string;
  published_at: string | null;
  pages_scanned: number;
};
export type ReportedObservation = {
  metric: "total_revenue" | "net_income" | "operating_cash_flow" | "free_cash_flow" | "total_debt";
  value: number;
  currency: string;
  period_end: string;
  period_type: "annual" | "quarterly";
  source_name: string;
  source_url: string;
  filed_at: string | null;
};
export type FundamentalDocumentResearch = {
  ticker: string;
  status: "available" | "partial" | "unavailable";
  query: string | null;
  source_stale: boolean;
  documents_scanned: number;
  documents: ResearchDocument[];
  passages: DocumentPassage[];
  reported_observations: ReportedObservation[];
  comparisons: DocumentComparison[];
  limitations_fr: string[];
  limitations_en: string[];
};
