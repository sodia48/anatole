// Loaded only inside Focus → Simuler. Bounds mirror ScenarioAssumptions and DCFSettings.
export const metrics = [
  { key: "revenue", fr: "Revenus", en: "Revenue" },
  { key: "operating_income", fr: "Résultat opérationnel", en: "Operating income" },
  { key: "net_income", fr: "Bénéfice net", en: "Net income" },
  { key: "operating_cash_flow", fr: "Flux opérationnel", en: "Operating cash flow" },
  { key: "free_cash_flow", fr: "Flux disponible", en: "Free cash flow" },
  { key: "operating_margin", fr: "Marge opérationnelle", en: "Operating margin" },
  { key: "free_cash_flow_margin", fr: "Marge de flux disponible", en: "Free cash flow margin" },
];
export const fields = [
  { key: "revenue_change_percent", fr: "Variation des revenus (%)", en: "Revenue change (%)", min: -80, max: 200 },
  { key: "operating_margin_change_points", fr: "Variation de marge (points)", en: "Margin change (points)", min: -20, max: 20 },
  { key: "financing_cost_change_percent", fr: "Variation du coût de financement (%)", en: "Financing cost change (%)", min: -100, max: 300, advanced: true },
  { key: "incremental_cost_inflation_percent", fr: "Inflation additionnelle des coûts (%)", en: "Incremental cost inflation (%)", min: 0, max: 20, advanced: true },
  { key: "capex_change_percent", fr: "Variation des investissements (%)", en: "Capex change (%)", min: -80, max: 300, advanced: true },
  { key: "working_capital_use_percent_revenue", fr: "Besoin en fonds de roulement (% revenus)", en: "Working capital use (% revenue)", min: -20, max: 20, advanced: true },
];
export const rateFields = [
  ["discount_rate_percent", "Taux d’actualisation (%)", "Discount rate (%)", 2, 30],
  ["terminal_growth_percent", "Croissance terminale (%)", "Terminal growth (%)", -5, 8],
  ["forecast_fcf_growth_percent", "Croissance des flux projetés (%)", "Projected cash-flow growth (%)", -20, 25],
];
const dcfReasonsFr = {
  "Explicit DCF rates and forecast growth are required": "Saisissez explicitement les taux et la croissance des flux projetés.",
  "A generic FCF DCF is not suitable for this business model": "Une DCF générique des flux disponibles ne convient pas à ce secteur.",
  "Fresh annual observations are required": "Un exercice annuel récent et non périmé est nécessaire.",
  "Financial and share currencies must match": "Les devises des états financiers et des actions doivent correspondre.",
  "Two consecutive sourced positive annual cash flows are required": "Deux exercices consécutifs avec flux disponibles positifs et sourcés sont nécessaires.",
  "Positive scenario free cash flow is required": "Le flux disponible du scénario doit être positif.",
  "Reported share count and net debt are required": "Le nombre d'actions et la dette nette publiés sont nécessaires.",
  "DCF assumptions do not produce positive finite equity value": "Les hypothèses ne produisent pas de valeur des capitaux propres positive et finie.",
};
export const dcfReason = (reason, language) => language === "en" ? reason :
  dcfReasonsFr[reason] ?? "DCF indisponible : données ou hypothèses insuffisantes.";

export function validResult(value, ticker) {
  return value?.ticker?.replace(/\.TO$/i, "").toUpperCase() === ticker.toUpperCase() &&
    Array.isArray(value.outcomes) && Array.isArray(value.limitations_fr) && Array.isArray(value.limitations_en) &&
    ["prudent", "central", "optimistic"].every(key => value.outcomes.some(item => item?.key === key && item.dcf &&
      metrics.every(metric => item[metric.key] && (item[metric.key].value === null || Number.isFinite(item[metric.key].value)))));
}

export function errorMessage(cause, language) {
  const message = cause instanceof Error ? cause.message : "";
  if (/\b(?:400|422)\b/.test(message)) return language === "fr"
    ? "Hypothèses refusées. Vérifiez les bornes et les taux saisis." : "Assumptions rejected. Check the entered ranges and rates.";
  if (/timeout|timed.?out|délai|aborted/i.test(message)) return language === "fr"
    ? "Le calcul a dépassé le délai. Réessayez." : "The calculation timed out. Please retry.";
  return language === "fr" ? "Le calcul a échoué. Réessayez; les derniers résultats fiables restent affichés."
    : "The calculation failed. Retry; the last reliable results remain visible.";
}

export function dcfEligible(current) {
  return current && !["bank", "insurance", "real_estate"].includes(current.sector_family) &&
    current.outcomes.some(item => item.dcf.status === "calculated" ||
      item.dcf.reason === "Explicit DCF rates and forecast growth are required" || item.dcf.reason === "Explicit rates required");
}

export function createRequest(draft, defaults, financial, family, dcfEnabled, dcfEligible, rates) {
  const applicable = fields.filter(item => !financial || item.key === "revenue_change_percent");
  const checked = family === "mining" ? [...applicable,
    { key: "commodity_price_change_percent", min: -80, max: 200 },
    { key: "commodity_revenue_exposure_percent", min: 0, max: 100 }] : applicable;
  const value = (key, name) => Number(draft[key][name]);
  if (defaults.scenarios.some(({ key }) => checked.some(item => !draft[key][item.key].trim() ||
    !Number.isFinite(value(key, item.key)) || value(key, item.key) < item.min || value(key, item.key) > item.max))) {
    throw new Error("assumptions");
  }
  const discount = Number(rates.discount_rate_percent);
  const terminal = Number(rates.terminal_growth_percent);
  const forecast = Number(rates.forecast_fcf_growth_percent);
  if (dcfEnabled && (!dcfEligible || Object.values(rates).some(item => !item.trim()) ||
    !Number.isFinite(discount) || !Number.isFinite(terminal) || !Number.isFinite(forecast) ||
    discount < 2 || discount > 30 || terminal < -5 || terminal > 8 || forecast < -20 || forecast > 25 ||
    discount - terminal < 2)) throw new Error("rates");
  return { scenarios: defaults.scenarios.map(item => ({ ...item,
    ...Object.fromEntries(applicable.map(field => [field.key, value(item.key, field.key)])),
    commodity_price_change_percent: family === "mining" ? value(item.key, "commodity_price_change_percent") : null,
    commodity_revenue_exposure_percent: family === "mining" ? value(item.key, "commodity_revenue_exposure_percent") : null,
  })), dcf: dcfEnabled ? { discount_rate_percent: discount, terminal_growth_percent: terminal,
    forecast_fcf_growth_percent: forecast } : null };
}
