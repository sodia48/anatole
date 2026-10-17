/** Explicit scenario inputs and calculated outputs shared by web and native. */
export type ScenarioKey = "prudent" | "central" | "optimistic";

export type ScenarioAssumptions = {
  key: ScenarioKey;
  revenue_change_percent: number;
  operating_margin_change_points: number;
  financing_cost_change_percent: number;
  incremental_cost_inflation_percent: number;
  capex_change_percent: number;
  working_capital_use_percent_revenue: number;
  commodity_price_change_percent: number | null;
  commodity_revenue_exposure_percent: number | null;
};

export type DCFSettings = {
  discount_rate_percent: number;
  terminal_growth_percent: number;
  forecast_fcf_growth_percent: number;
};

export type ScenarioRequest = { scenarios: ScenarioAssumptions[]; dcf: DCFSettings | null };
export type ScenarioValue = {
  value: number | null;
  unit: "money" | "percent" | "ratio";
  status: "calculated" | "unavailable";
  formula: string;
  missing_inputs: string[];
};
export type DCFSensitivity = { discount_rate_percent: number; terminal_growth_percent: number; per_share: number };
export type DCFResult = {
  status: "calculated" | "unavailable";
  reason: string | null;
  settings: DCFSettings | null;
  projected_fcf: number[];
  enterprise_value: number | null;
  net_debt: number | null;
  equity_value: number | null;
  shares_outstanding: number | null;
  per_share: number | null;
  sensitivity: DCFSensitivity[];
  formula: string;
};
export type ScenarioOutcome = {
  key: ScenarioKey;
  assumptions: ScenarioAssumptions;
  revenue: ScenarioValue;
  operating_income: ScenarioValue;
  net_income: ScenarioValue;
  operating_cash_flow: ScenarioValue;
  free_cash_flow: ScenarioValue;
  operating_margin: ScenarioValue;
  free_cash_flow_margin: ScenarioValue;
  dcf: DCFResult;
};
export type ScenarioSimulation = {
  ticker: string;
  sector_family: string;
  baseline_period_end: string | null;
  currency: string | null;
  baseline_source: string | null;
  baseline_source_url: string | null;
  baseline_filed_at: string | null;
  baseline_stale: boolean;
  status: "available" | "partial" | "unavailable";
  outcomes: ScenarioOutcome[];
  limitations_fr: string[];
  limitations_en: string[];
};

export const defaultScenarioRequest: ScenarioRequest = {
  scenarios: [
    { key: "prudent", revenue_change_percent: -15, operating_margin_change_points: -2,
      financing_cost_change_percent: 0, incremental_cost_inflation_percent: 0,
      capex_change_percent: 0, working_capital_use_percent_revenue: 0,
      commodity_price_change_percent: null, commodity_revenue_exposure_percent: null },
    { key: "central", revenue_change_percent: 0, operating_margin_change_points: 0,
      financing_cost_change_percent: 0, incremental_cost_inflation_percent: 0,
      capex_change_percent: 0, working_capital_use_percent_revenue: 0,
      commodity_price_change_percent: null, commodity_revenue_exposure_percent: null },
    { key: "optimistic", revenue_change_percent: 15, operating_margin_change_points: 2,
      financing_cost_change_percent: 0, incremental_cost_inflation_percent: 0,
      capex_change_percent: 0, working_capital_use_percent_revenue: 0,
      commodity_price_change_percent: null, commodity_revenue_exposure_percent: null },
  ],
  dcf: null,
};

export const scenarioKeys = ["prudent", "central", "optimistic"] as const;

const dcfReasonsFr: Record<string, string> = {
  "Explicit DCF rates and forecast growth are required": "Saisissez explicitement les taux et la croissance des flux projetés.",
  "A generic FCF DCF is not suitable for this business model": "Une DCF générique des flux disponibles ne convient pas à ce secteur.",
  "Fresh annual observations are required": "Un exercice annuel récent et non périmé est nécessaire.",
  "Financial and share currencies must match": "Les devises des états financiers et des actions doivent correspondre.",
  "Two consecutive sourced positive annual cash flows are required": "Deux exercices consécutifs avec flux disponibles positifs et sourcés sont nécessaires.",
  "Positive scenario free cash flow is required": "Le flux disponible du scénario doit être positif.",
  "Reported share count and net debt are required": "Le nombre d'actions et la dette nette publiés sont nécessaires.",
  "DCF assumptions do not produce positive finite equity value": "Les hypothèses ne produisent pas de valeur des capitaux propres positive et finie.",
};

export function scenarioDcfReason(reason: string, language: "fr" | "en"): string {
  return language === "en" ? reason : dcfReasonsFr[reason] ?? "DCF indisponible : données ou hypothèses insuffisantes.";
}
