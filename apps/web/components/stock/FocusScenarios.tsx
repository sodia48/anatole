"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { defaultScenarioRequest, scenarioKeys, type ScenarioKey,
  type ScenarioRequest, type ScenarioSimulation, type ScenarioValue } from "@anatole/shared/fundamental-scenarios";
import { formatFinancialNumber } from "@anatole/shared/financial-display";
import { useAssistantContext } from "@/components/assistant/AssistantContextProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { runFundamentalScenarios } from "@/lib/api";
import { pick } from "@/lib/i18n";
import styles from "./FocusScenarios.module.css";

type Language = "fr" | "en";
type MetricKey = "revenue" | "operating_income" | "net_income" | "operating_cash_flow" | "free_cash_flow" | "operating_margin" | "free_cash_flow_margin";
type FieldKey = "revenue_change_percent" | "operating_margin_change_points" | "financing_cost_change_percent" |
  "incremental_cost_inflation_percent" | "capex_change_percent" | "working_capital_use_percent_revenue";
type SimulatorConfig = { metrics: { key: MetricKey; fr: string; en: string }[];
  fields: { key: FieldKey; fr: string; en: string; min: number; max: number; advanced?: boolean }[];
  rateFields: [key: keyof typeof initialRates, fr: string, en: string, min: number, max: number][];
  validResult: (value: ScenarioSimulation, ticker: string) => boolean;
  errorMessage: (cause: unknown, language: Language) => string;
  dcfEligible: (value: ScenarioSimulation) => boolean;
  dcfReason: (reason: string, language: Language) => string;
  createRequest: (draft: Record<ScenarioKey, Record<string, string>>, defaults: ScenarioRequest, financial: boolean,
    family: string, dcfEnabled: boolean, dcfEligible: boolean, rates: Record<string, string>) => ScenarioRequest };
const labels: Record<ScenarioKey, [string, string]> = { prudent: ["Prudent", "Prudent"], central: ["Central", "Central"], optimistic: ["Optimiste", "Optimistic"] };
const initialRates = { discount_rate_percent: "10", terminal_growth_percent: "2", forecast_fcf_growth_percent: "3" };
const initialDraft = Object.fromEntries(defaultScenarioRequest.scenarios.map(item => [item.key,
  Object.fromEntries(Object.entries(item).filter(([key]) => key !== "key").map(([key, value]) => [key, String(value ?? 0)]))])) as Record<ScenarioKey, Record<string, string>>;
function valueText(value: ScenarioValue, currency: string | null, language: Language): string {
  return formatFinancialNumber(value.value, { language, unit: value.unit, currency });
}

export function FocusScenarios({ ticker, company }: { ticker: string; company?: string }) {
  const { preferences } = usePreferences();
  const { context, openAssistant } = useAssistantContext();
  const language = preferences.language;
  const [config, setConfig] = useState<SimulatorConfig | null>(null);
  const [data, setData] = useState<ScenarioSimulation | null>(null);
  const [active, setActive] = useState<ScenarioKey>("central");
  const [chartMetric, setChartMetric] = useState<MetricKey>("revenue");
  const [draft, setDraft] = useState(initialDraft);
  const [dcfEnabled, setDcfEnabled] = useState(false);
  const [rates, setRates] = useState(initialRates);
  const [applied, setApplied] = useState<ScenarioRequest>(defaultScenarioRequest);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    const moduleUrl = "/focus-simulator-config.mjs";
    void import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl)
      .then(value => { if (active) setConfig(value as SimulatorConfig); })
      .catch(() => { if (active) setError(pick(language, "Interface du simulateur indisponible.", "Simulator interface unavailable.")); });
    return () => { active = false; };
  }, [language, reload]);

  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setData(null); setUpdated(false); setError(null);
    void runFundamentalScenarios(ticker, defaultScenarioRequest, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(() => { if (!controller.signal.aborted) setError(pick(language, "Simulation indisponible.", "Simulation unavailable.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ticker, language, reload]);
  const current = config && data && config.validResult(data, ticker) ? data : null;
  const financial = current?.sector_family === "bank" || current?.sector_family === "insurance";
  const available = (config?.metrics ?? []).filter(metric => (!financial || metric.key === "revenue") &&
    current?.outcomes.some(item => Number.isFinite(item[metric.key].value)));
  const selectedMetric = available.find(item => item.key === chartMetric) ?? available[0];
  const selected = current?.outcomes.find(item => item.key === active);
  const dcfEligible = Boolean(current && config?.dcfEligible(current));
  const dcfReason = current?.outcomes.map(item => item.dcf.reason).find(reason => reason && !reason.startsWith("Explicit "));
  const input = (key: string, fr: string, en: string, min: number, max: number) => <label key={key}>{pick(language, fr, en)}
    <input type="number" step="0.1" min={min} max={max} required value={draft[active][key]}
      onChange={event => setDraft(previous => ({ ...previous, [active]: { ...previous[active], [key]: event.target.value } }))} />
  </label>;

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running || loading || !current || !config) return;
    let request: ScenarioRequest;
    try { request = config.createRequest(draft, defaultScenarioRequest, Boolean(financial), current.sector_family,
      dcfEnabled, dcfEligible, rates); }
    catch (cause) {
      setError(cause instanceof Error && cause.message === "rates"
        ? pick(language, "Vérifiez les taux DCF et leur écart minimal de deux points.", "Check DCF rates and their minimum two-point spread.")
        : pick(language, "Vérifiez les hypothèses de chaque scénario.", "Check each scenario's assumptions.")); return;
    }
    const controller = new AbortController();
    pending.current?.abort(); pending.current = controller;
    const id = ++sequence.current;
    setRunning(true); setError(null);
    try {
      const result = await runFundamentalScenarios(ticker, request, controller.signal);
      if (id !== sequence.current || controller.signal.aborted) return;
      if (!config.validResult(result, ticker)) throw new Error("Incomplete simulation response");
      setData(result); setApplied(request); setUpdated(true);
      requestAnimationFrame(() => {
        const target = heading.current;
        target?.focus({ preventScroll: true });
        if (target) window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top - 100,
          left: window.scrollX, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      });
    } catch (cause) {
      if (id === sequence.current && !controller.signal.aborted) setError(config.errorMessage(cause, language));
    } finally { if (id === sequence.current) setRunning(false); }
  }

  function analyze() {
    openAssistant({ surface: "stock", symbol: ticker, symbols: [ticker], instrument_type: "stock",
      metadata: { ...context.metadata, company: company ?? ticker, focus_section: "fundamentals", focus_module: "scenarios",
        scenario_request: JSON.stringify(applied) } });
  }

  return <section className={styles.panel} aria-label={pick(language, "Simulateur fondamental", "Fundamental simulator")}>
    <header><span className="eyebrow">FUNDAMENTAL INTELLIGENCE 360</span>
      <h2>{pick(language, "Simulateur financier — " + ticker, "Financial simulator — " + ticker)}</h2>
      <p className={styles.muted}>{current?.baseline_period_end?.slice(0, 10) ?? pick(language, "Période indisponible", "Period unavailable")}
        {current?.currency ? " · " + current.currency : ""}{current?.baseline_stale ? " · " + pick(language, "données périmées", "stale data") : ""}</p>
    </header>
    {(loading || !config && !error) && <p role="status">{pick(language, "Chargement des scénarios…", "Loading scenarios…")}</p>}
    {(error || data && config && !current) && !current && <div><p role="alert">{error ?? pick(language, "Réponse de simulation incomplète.", "Incomplete simulation response.")}</p><button type="button" onClick={() => setReload(value => value + 1)}>
      {pick(language, "Réessayer", "Retry")}</button></div>}
    {current && config && <>
      <nav className={styles.scenarioNav} aria-label={pick(language, "Scénarios", "Scenarios")}>{scenarioKeys.map(key => <button key={key} type="button"
        aria-pressed={active === key} onClick={() => setActive(key)}>{pick(language, ...labels[key])}</button>)}</nav>
      <section className={styles.results} aria-label={pick(language, "Résultats de simulation", "Simulation results")}>
        <div className={styles.resultHeader}><div><h3 ref={heading} tabIndex={-1}>{pick(language, "Résultats", "Results")}</h3>
          <p role="status">{running ? pick(language, "Ancien calcul — nouvelles hypothèses en cours", "Previous calculation — new assumptions pending")
            : error ? pick(language, "Ancien calcul — mise à jour échouée", "Previous calculation — update failed")
              : updated ? pick(language, "Simulation mise à jour", "Simulation updated") : pick(language, "Sensibilités initiales", "Initial sensitivities")}</p></div>
          <button type="button" onClick={analyze}>{pick(language, "Analyser avec Anatole", "Analyze with Anatole")}</button></div>
        {current.status === "unavailable" && <p>{pick(language, "Données annuelles insuffisantes.", "Insufficient annual data.")}</p>}
        {selected && <div className={styles.cards}>{available.filter(metric => selected[metric.key].value !== null).slice(0, financial ? 1 : 4).map(metric =>
          <article className={styles.card} key={metric.key}><small>{pick(language, metric.fr, metric.en)}</small>
            <strong>{valueText(selected[metric.key], current.currency, language)}</strong></article>)}</div>}
        {financial && <p className={styles.muted}>{pick(language, "Revenus bancaires : sensibilité, pas prévision des bénéfices.",
          "Bank revenue sensitivity, not an earnings forecast.")}</p>}
        {selectedMetric && <div className={styles.chart}><div className={styles.chartHead}><h4>{pick(language, "Comparer les scénarios", "Compare scenarios")}</h4>
          <select aria-label={pick(language, "Indicateur du graphique", "Chart metric")} value={selectedMetric.key}
            onChange={event => setChartMetric(event.target.value as MetricKey)}>{available.map(metric =>
              <option key={metric.key} value={metric.key}>{pick(language, metric.fr, metric.en)}</option>)}</select></div>
          {current.outcomes.map(item => { const value = item[selectedMetric.key]; const bound = Math.max(1, ...current.outcomes.map(row => Math.abs(row[selectedMetric.key].value ?? 0)));
            return value.value !== null ? <div className={styles.barRow} key={item.key}>
              <span>{pick(language, ...labels[item.key])} · {valueText(value, current.currency, language)}</span>
              <div className={styles.track} title={valueText(value, current.currency, language)}>
                <div className={styles.bar} style={{ width: String(Math.abs(value.value) / bound * 100) + "%" }} /></div></div> : null; })}</div>}
        {selected?.dcf.status === "calculated" && <p className={styles.dcfValue}>DCF / {pick(language, "action", "share")} :
          {" " + selected.dcf.per_share?.toFixed(2) + " " + (current.currency ?? "")}</p>}
        {!dcfEligible && dcfReason && <p className={styles.muted}>{config.dcfReason(dcfReason, language)}</p>}
      </section>
      <details className={styles.assumptions}><summary>{pick(language, "Personnaliser les hypothèses", "Customize assumptions")}</summary>
        <form onSubmit={calculate} className={styles.form}>
          <fieldset disabled={running || loading}><legend>{pick(language, ...labels[active])}</legend>
            <div className={styles.fieldGrid}>{config.fields.filter(item => !item.advanced && (!financial || item.key === "revenue_change_percent"))
              .map(item => input(item.key, item.fr, item.en, item.min, item.max))}</div>
            {!financial && <details><summary>{pick(language, "Paramètres avancés", "Advanced assumptions")}</summary>
              <div className={styles.fieldGrid}>{config.fields.filter(item => item.advanced).map(item => input(item.key, item.fr, item.en, item.min, item.max))}
                {current.sector_family === "mining" && <>
                  {input("commodity_price_change_percent", "Variation du prix de la matière première (%)", "Commodity price change (%)", -80, 200)}
                  {input("commodity_revenue_exposure_percent", "Part des revenus exposée (%)", "Exposed revenue share (%)", 0, 100)}</>}</div></details>}
            {dcfEligible && <div className={styles.dcfControls}><label><input type="checkbox" checked={dcfEnabled} onChange={event => setDcfEnabled(event.target.checked)} />
              {pick(language, "Saisir mes taux et calculer la DCF", "Enter rates and calculate DCF")}</label>
              {dcfEnabled && <div className={styles.fieldGrid}>{config.rateFields.map(([key, fr, en, min, max]) => <label key={key}>{pick(language, fr, en)}<input type="number" step="0.1" min={min} max={max}
                value={rates[key]} onChange={event => setRates(previous => ({ ...previous, [key]: event.target.value }))} required /></label>)}</div>}</div>}
          </fieldset>
          <div className={styles.submitRow}><button type="submit" disabled={running || loading}>{pick(language, "Calculer les scénarios", "Calculate scenarios")}</button>
            {running && <span role="status">{pick(language, "Calcul en cours…", "Calculating…")}</span>}</div>
          {error && <p role="alert">{error}</p>}
        </form>
      </details>
      <details className={styles.method}><summary>{pick(language, "Méthodologie et limites", "Methodology and limits")}</summary>
        {current.baseline_source_url?.startsWith("https://") ? <a href={current.baseline_source_url} target="_blank" rel="noopener noreferrer">
          {current.baseline_source} · {current.baseline_filed_at?.slice(0, 10)}</a> : <p>{current.baseline_source}</p>}
        <p>{pick(language, "Hypothèses illustratives, distinctes des données publiées.", "Illustrative assumptions, separate from reported data.")}</p>
        {selectedMetric && <p>{pick(language, selectedMetric.fr, selectedMetric.en)} : {selected?.[selectedMetric.key]?.formula}</p>}
        {[...new Set((language === "fr" ? current.limitations_fr : current.limitations_en)
          .filter(item => !item.includes("DCF") && !item.includes("banques") && !item.includes("banks")))].map(item => <p key={item}>{item}</p>)}
        {selectedMetric && selected?.[selectedMetric.key].missing_inputs.length ? <p>{pick(language, "Données manquantes", "Missing inputs")} :
          {selected[selectedMetric.key].missing_inputs.join(", ")}</p> : null}
      </details>
    </>}
  </section>;
}
