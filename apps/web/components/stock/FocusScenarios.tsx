"use client";

import { useEffect, useState, type FormEvent } from "react";
import { defaultScenarioRequest, scenarioDcfReason, scenarioKeys, type ScenarioAssumptions, type ScenarioKey,
  type ScenarioRequest, type ScenarioSimulation, type ScenarioValue } from "@anatole/shared/fundamental-scenarios";
import { formatFinancialNumber, signedBar } from "@anatole/shared/financial-display";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { runFundamentalScenarios } from "@/lib/api";
import { pick } from "@/lib/i18n";
import { FocusViewMode, useFocusMode } from "./FocusViewMode";
import styles from "./FocusScenarios.module.css";

const modes = ["table", "cards", "charts"] as const;
type Language = "fr" | "en";
type MetricKey = "revenue" | "operating_income" | "net_income" | "operating_cash_flow" | "free_cash_flow" | "operating_margin" | "free_cash_flow_margin";
const metrics: { key: MetricKey; fr: string; en: string }[] = [
  { key: "revenue", fr: "Revenus", en: "Revenue" }, { key: "operating_income", fr: "Résultat opérationnel", en: "Operating income" },
  { key: "net_income", fr: "Bénéfice net", en: "Net income" }, { key: "operating_cash_flow", fr: "Flux opérationnel", en: "Operating cash flow" },
  { key: "free_cash_flow", fr: "Flux disponible", en: "Free cash flow" }, { key: "operating_margin", fr: "Marge opérationnelle", en: "Operating margin" },
  { key: "free_cash_flow_margin", fr: "Marge de flux disponible", en: "Free cash flow margin" },
];
const fields: { key: keyof Omit<ScenarioAssumptions, "key">; fr: string; en: string; min: number; max: number }[] = [
  { key: "revenue_change_percent", fr: "Variation des revenus (%)", en: "Revenue change (%)", min: -80, max: 200 },
  { key: "operating_margin_change_points", fr: "Variation de marge (points)", en: "Margin change (points)", min: -20, max: 20 },
  { key: "financing_cost_change_percent", fr: "Variation du coût de financement (%)", en: "Financing cost change (%)", min: -100, max: 300 },
  { key: "incremental_cost_inflation_percent", fr: "Inflation additionnelle des coûts (%)", en: "Incremental cost inflation (%)", min: 0, max: 20 },
  { key: "capex_change_percent", fr: "Variation des investissements (%)", en: "Capex change (%)", min: -80, max: 300 },
  { key: "working_capital_use_percent_revenue", fr: "Besoin en fonds de roulement (% revenus)", en: "Working capital use (% revenue)", min: -20, max: 20 },
];
const labels: Record<ScenarioKey, { fr: string; en: string }> = {
  prudent: { fr: "Prudent", en: "Prudent" }, central: { fr: "Central", en: "Central" }, optimistic: { fr: "Optimiste", en: "Optimistic" },
};

function formatted(value: ScenarioValue | undefined, currency: string | null, language: Language): string {
  return formatFinancialNumber(value?.value, { language, unit: value?.unit ?? "plain", currency });
}

function Measure({ value, currency, language }: { value: ScenarioValue; currency: string | null; language: Language }) {
  return <div>{formatted(value, currency, language)}
    {value.value === null ? <small>{pick(language, "Entrées manquantes", "Missing inputs")} : {value.missing_inputs.join(", ")}</small> : null}
    <details><summary>{pick(language, "Formule", "Formula")}</summary>{value.formula}</details>
  </div>;
}

export function FocusScenarios({ ticker }: { ticker: string }) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [mode, choose] = useFocusMode("anatole.focus.scenarios.view.v1", modes);
  const [data, setData] = useState<ScenarioSimulation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dcfEnabled, setDcfEnabled] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(["revenue", "net_income", "free_cash_flow"]);
  useEffect(() => {
    const controller = new AbortController();
    void runFundamentalScenarios(ticker, defaultScenarioRequest, controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result); setLoading(false); setError(false); }
    }).catch(() => { if (!controller.signal.aborted) { setLoading(false); setError(true); } });
    return () => controller.abort();
  }, [ticker]);

  const calculate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (key: string) => Number(form.get(key));
    const scenarios = scenarioKeys.map(key => {
      const values = Object.fromEntries(fields.map(field => [field.key, read(`${key}_${field.key}`)])) as Record<string, number>;
      return { key, ...values,
        commodity_price_change_percent: data?.sector_family === "mining" ? read(`${key}_commodity_price_change_percent`) : null,
        commodity_revenue_exposure_percent: data?.sector_family === "mining" ? read(`${key}_commodity_revenue_exposure_percent`) : null,
      } as ScenarioAssumptions;
    });
    const request: ScenarioRequest = { scenarios,
      dcf: dcfEnabled ? { discount_rate_percent: read("discount_rate_percent"), terminal_growth_percent: read("terminal_growth_percent"),
        forecast_fcf_growth_percent: read("forecast_fcf_growth_percent") } : null };
    setLoading(true); setError(false);
    try { setData(await runFundamentalScenarios(ticker, request)); }
    catch { setError(true); }
    finally { setLoading(false); }
  };
  const current = data?.ticker.replace(/\.TO$/i, "").toUpperCase() === ticker.replace(/\.TO$/i, "").toUpperCase() ? data : null;
  return <section className={styles.panel} aria-label={pick(language, "Simulateur fondamental", "Fundamental simulator")}>
    <header><span className="eyebrow">FUNDAMENTAL INTELLIGENCE 360</span><h2>{pick(language, "Simulateur et valorisation", "Scenario simulator and valuation")}</h2>
      <p>{pick(language, "Hypothèses illustratives modifiables; aucun résultat n'est un cours certain.",
        "Editable illustrative assumptions; no result is a certain market price.")}</p></header>
    <form onSubmit={calculate} className={styles.form}>
      {defaultScenarioRequest.scenarios.map(defaults => <fieldset key={defaults.key}>
        <legend>{pick(language, labels[defaults.key].fr, labels[defaults.key].en)}</legend>
        {fields.map(field => <label key={field.key}>{pick(language, field.fr, field.en)}
          <input type="number" name={`${defaults.key}_${field.key}`} min={field.min} max={field.max} step="0.1" required defaultValue={defaults[field.key] ?? 0} /></label>)}
        {current?.sector_family === "mining" ? <>
          <label>{pick(language, "Variation du prix de la matière première (%)", "Commodity price change (%)")}
            <input type="number" name={`${defaults.key}_commodity_price_change_percent`} min={-80} max={200} step="0.1" defaultValue="0" required /></label>
          <label>{pick(language, "Part des revenus exposée (%)", "Exposed revenue share (%)")}
            <input type="number" name={`${defaults.key}_commodity_revenue_exposure_percent`} min={0} max={100} step="0.1" defaultValue="0" required /></label>
        </> : null}
      </fieldset>)}
      <fieldset><legend>{pick(language, "Valorisation DCF conditionnelle", "Conditional DCF valuation")}</legend>
        <label><input type="checkbox" checked={dcfEnabled} onChange={event => setDcfEnabled(event.target.checked)} />
          {pick(language, "Saisir mes taux et calculer la DCF", "Enter my rates and calculate DCF")}</label>
        {dcfEnabled ? <div className={styles.rates}>
          <label>{pick(language, "Taux d'actualisation (%)", "Discount rate (%)")}<input type="number" name="discount_rate_percent" min={2} max={30} step="0.1" required defaultValue="10" /></label>
          <label>{pick(language, "Croissance terminale (%)", "Terminal growth (%)")}<input type="number" name="terminal_growth_percent" min={-5} max={8} step="0.1" required defaultValue="2" /></label>
          <label>{pick(language, "Croissance des flux projetés (%)", "Projected cash-flow growth (%)")}<input type="number" name="forecast_fcf_growth_percent" min={-20} max={25} step="0.1" required defaultValue="3" /></label>
        </div> : null}
      </fieldset>
      <button type="submit" disabled={loading}>{pick(language, "Calculer les scénarios", "Calculate scenarios")}</button>
    </form>
    {loading ? <p role="status">{pick(language, "Calcul des sensibilités…", "Calculating sensitivities…")}</p> : null}
    {error ? <p role="alert">{pick(language, "Hypothèses invalides ou simulation indisponible.", "Invalid assumptions or simulation unavailable.")}</p> : null}
    {current ? <>
      <p className={styles.muted}>{pick(language, "Exercice de référence", "Baseline fiscal year")} : {current.baseline_period_end?.slice(0, 10) ?? "N/D"} · {current.currency ?? "N/D"}</p>
      {current.baseline_stale ? <p className={styles.muted}>{pick(language, "Source périmée : les résultats sont des sensibilités sur données anciennes.", "Stale source: results are sensitivities based on older data.")}</p> : null}
      {current.baseline_source_url?.startsWith("https://") ? <a href={current.baseline_source_url} target="_blank" rel="noopener noreferrer">
        {current.baseline_source} · {current.baseline_filed_at?.slice(0, 10) ?? "N/D"}</a> : <p>{current.baseline_source}</p>}
      <FocusViewMode mode={mode} choose={choose} modes={modes} language={language} label={pick(language, "Mode des scénarios", "Scenario display mode")} />
      <fieldset className={styles.metrics}><legend>{pick(language, "Indicateurs", "Metrics")}</legend>{metrics.map(metric => <label key={metric.key}>
        <input type="checkbox" checked={selectedMetrics.includes(metric.key)} onChange={() => setSelectedMetrics(previous => previous.includes(metric.key)
          ? previous.filter(key => key !== metric.key) : [...previous, metric.key])} />{pick(language, metric.fr, metric.en)}</label>)}</fieldset>
      {mode === "table" ? <div className={styles.tableWrap}><table><caption>{pick(language, "Sensibilités calculées", "Calculated sensitivities")}</caption>
        <thead><tr><th>{pick(language, "Indicateur", "Metric")}</th>{current.outcomes.map(item => <th key={item.key}>{pick(language, labels[item.key].fr, labels[item.key].en)}</th>)}</tr></thead>
        <tbody>{metrics.filter(metric => selectedMetrics.includes(metric.key)).map(metric => <tr key={metric.key}><th>{pick(language, metric.fr, metric.en)}</th>
          {current.outcomes.map(item => <td key={item.key}><Measure value={item[metric.key]} currency={current.currency} language={language} /></td>)}</tr>)}
          <tr><th>DCF / {pick(language, "action", "share")}</th>{current.outcomes.map(item => <td key={item.key}>{item.dcf.per_share === null ? "N/D" : `${item.dcf.per_share.toFixed(2)} ${current.currency ?? ""}`}</td>)}</tr>
        </tbody></table></div> : null}
      {mode === "cards" ? <div className={styles.cards}>{current.outcomes.map(item => <article className={styles.card} key={item.key}>
        <h3>{pick(language, labels[item.key].fr, labels[item.key].en)}</h3>
        {metrics.filter(metric => selectedMetrics.includes(metric.key)).map(metric => <div key={metric.key}>{pick(language, metric.fr, metric.en)} : <Measure value={item[metric.key]} currency={current.currency} language={language} /></div>)}
        <p>DCF / {pick(language, "action", "share")} : {item.dcf.per_share === null ? "N/D" : `${item.dcf.per_share.toFixed(2)} ${current.currency ?? ""}`}</p>
      </article>)}</div> : null}
      {mode === "charts" ? <div className={styles.cards}>{metrics.filter(metric => selectedMetrics.includes(metric.key)).map(metric => {
        const values = current.outcomes.map(item => item[metric.key].value);
        const bound = Math.max(1, ...values.map(value => Math.abs(value ?? 0)));
        return <article className={styles.card} key={metric.key}><h3>{pick(language, metric.fr, metric.en)}</h3>
          {current.outcomes.map(item => <div key={item.key} className={styles.barRow}><span>{pick(language, labels[item.key].fr, labels[item.key].en)} · {formatted(item[metric.key], current.currency, language)}</span>
            <div className={styles.track}><div className={styles.zero} /><div className={`${styles.bar} ${(item[metric.key].value ?? 0) < 0 ? styles.negative : ""}`} style={signedBar(item[metric.key].value, bound)} /></div></div>)}</article>;
      })}</div> : null}
      {current.outcomes.some(item => item.dcf.status === "calculated") ? <details><summary>{pick(language, "Sensibilité DCF et formules", "DCF sensitivity and formulas")}</summary>
        {current.outcomes.map(item => item.dcf.status === "calculated" ? <div key={item.key}>
          <h3>{pick(language, labels[item.key].fr, labels[item.key].en)}</h3><p>{item.dcf.formula}</p>
          <div className={styles.tableWrap}><table><thead><tr><th>r (%)</th><th>g (%)</th><th>{pick(language, "Valeur / action", "Value / share")}</th></tr></thead>
            <tbody>{item.dcf.sensitivity.map(point => <tr key={`${point.discount_rate_percent}-${point.terminal_growth_percent}`}>
              <td>{point.discount_rate_percent}</td><td>{point.terminal_growth_percent}</td><td>{point.per_share.toFixed(2)} {current.currency}</td></tr>)}</tbody></table></div>
        </div> : null)}</details> : null}
      <div className={styles.limits}><h3>{pick(language, "Hypothèses et limites", "Assumptions and limits")}</h3>
        <ul>{(language === "fr" ? current.limitations_fr : current.limitations_en).map(item => <li key={item}>{item}</li>)}</ul>
        {current.outcomes.map(item => item.dcf.reason ? <p key={item.key}>DCF {pick(language, labels[item.key].fr, labels[item.key].en)} : {scenarioDcfReason(item.dcf.reason, language)}</p> : null)}
      </div>
    </> : null}
  </section>;
}
