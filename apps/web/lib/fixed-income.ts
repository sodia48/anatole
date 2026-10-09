export type DataQuality = {
  scope: string;
  status: "full" | "partial" | "limited" | "unavailable";
  source: string | null;
  observed_at: string | null;
  freshness: "delayed" | "stale" | "unavailable";
  coverage: string;
};

export type CurvePoint = {
  official_series_id: string;
  label: string;
  tenor: string;
  latest: number | null;
  previous: number | null;
  bp_change: number | null;
  observed_at: string | null;
  source_url: string;
  freshness: DataQuality["freshness"];
};

export type CanadaCurve = {
  points: CurvePoint[];
  marketable_averages: CurvePoint[];
  spread_2s10s_bps: number | null;
  spread_2s5s_bps: number | null;
  spread_5s_long_bps: number | null;
  spread_10s_long_bps: number | null;
  policy_rate: CurvePoint | null;
  real_long_yield: CurvePoint | null;
  curve_shape: "inverted" | "flat" | "normal" | "unknown";
  signals: { kind: string; detail: string; observed_at: string; source_url: string }[];
  generated_at: string;
  source: string;
  debt_management_url: string;
  quality: DataQuality;
};

export type BondIssue = {
  issuer_level: string;
  issuer: string;
  jurisdiction: string | null;
  city: string | null;
  cusip: string | null;
  maturity_date: string | null;
  settlement_date: string | null;
  coupon_percent: number | null;
  issue_amount: number | null;
  currency: string | null;
  outstanding_amount: number | null;
  bond_type: string | null;
  official_url: string;
  yield_percent: number | null;
  spread_to_canada_bps: number | null;
};

export type ProvinceProfile = {
  code: string;
  name: string;
  issuer: string;
  coverage: DataQuality["status"];
  borrowing_program_amount: number | null;
  fiscal_year: string | null;
  debt_outstanding: number | null;
  average_term: number | null;
  green_social_sustainable_program: string | null;
  source_urls: string[];
  recent_issues: BondIssue[];
  quality: DataQuality;
};

export type MunicipalityProfile = {
  slug: string;
  city: string;
  province: string;
  coverage: DataQuality["status"];
  debt_outstanding: number | null;
  borrowing_program_amount: number | null;
  green_social_sustainable_program: string | null;
  recent_issues: BondIssue[];
  source_urls: string[];
  quality: DataQuality;
};

export type CurveHistory = {
  period: string;
  observations: { observed_at: string; yields_percent: Record<string, number> }[];
  source_url: string;
  quality: DataQuality;
};

const ROOT = "/api/anatole/api/v1/fixed-income";
const CACHE = new Map<string, { at: number; data: unknown }>();

export async function fixedIncomeGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const key = `${ROOT}${path}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.at < 15 * 60_000) return cached.data as T;
  try {
    const response = await fetch(key, { signal });
    if (!response.ok) throw new Error(`Fixed income API ${response.status}`);
    const data = (await response.json()) as T;
    CACHE.set(key, { at: Date.now(), data });
    return data;
  } catch (error) {
    if (cached && !signal?.aborted) return cached.data as T;
    throw error;
  }
}

export function formatYield(value: number | null, language: "fr" | "en"): string {
  return value === null ? (language === "fr" ? "N/D" : "N/A") : `${value.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

export function formatBps(value: number | null, language: "fr" | "en"): string {
  return value === null ? (language === "fr" ? "N/D" : "N/A") : `${value > 0 ? "+" : ""}${value.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 1 })} ${language === "fr" ? "pb" : "bp"}`;
}
