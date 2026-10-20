"use client";

import { useEffect, useState } from "react";
import type { CapitalMetricKey, CapitalPeriod, CapitalValue, FundamentalCapitalResearch } from "@anatole/shared/fundamental-capital";
import { analystRecommendation, exactFinancialNumber, formatFinancialNumber, signedBar } from "@anatole/shared/financial-display";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { getFundamentalCapital } from "@/lib/api";
import { pick } from "@/lib/i18n";
import { FocusViewMode, useFocusMode } from "./FocusViewMode";
import styles from "./FocusCapital.module.css";

const tr = pick;

const modes = ["table", "cards", "charts"] as const;
type Language = "fr" | "en";
const metrics: { key: CapitalMetricKey; fr: string; en: string; percent?: boolean }[] = [
  { key: "operating_cash_flow", fr: "Flux opérationnel", en: "Operating cash flow" },
  { key: "capital_expenditure", fr: "Investissements", en: "Capital expenditure" },
  { key: "dividends", fr: "Dividendes", en: "Dividends" },
  { key: "repurchases", fr: "Rachats d’actions", en: "Share repurchases" },
  { key: "free_cash_flow", fr: "Flux disponible publié", en: "Published free cash flow" },
  { key: "cash_after_allocations", fr: "Solde après allocations", en: "Cash after allocations" },
  { key: "capex_share_of_known_uses", fr: "Part des investissements", en: "Capex share of known uses", percent: true },
  { key: "earnings_cash_conversion", fr: "Conversion bénéfice-trésorerie", en: "Earnings cash conversion", percent: true },
  { key: "debt_change", fr: "Variation de la dette", en: "Debt change" },
];

function formatted(value: CapitalValue, currency: string | null, language: Language, percent = false) {
  return formatFinancialNumber(value.value, { language, unit: percent ? "percent" : "money", currency: percent ? null : currency });
}

function Source({ period, language }: { period: CapitalPeriod; language: Language }) {
  const label = `${period.source_name} · ${period.filed_at?.slice(0, 10) ?? tr(language, "date N/D", "date N/A")}`;
  return <small>{period.source_url?.startsWith("https://") ? <a href={period.source_url} target="_blank" rel="noopener noreferrer">{label}</a> : label}
    {` · ${period.source_confidence}`}</small>;
}

export function FocusCapital({ ticker }: { ticker: string }) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [data, setData] = useState<FundamentalCapitalResearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mode, choose] = useFocusMode(`anatole.focus.capital.${ticker}.view.v1`, modes);
  const [selected, setSelected] = useState<CapitalMetricKey[]>(["operating_cash_flow", "capital_expenditure", "dividends", "repurchases", "cash_after_allocations"]);
  const [showMissing, setShowMissing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void getFundamentalCapital(ticker, controller.signal).then(setData)
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ticker]);
  const unavailable = data ? metrics.filter(metric => data.periods.every(period => period[metric.key].value === null)) : [];
  const shown = metrics.filter(metric => selected.includes(metric.key) && (showMissing || !unavailable.includes(metric)));
  const latest = data?.periods[0];
  const previous = data?.periods[1];
  const comparable = latest && previous && latest.currency === previous.currency &&
    Math.abs((new Date(latest.period_end).getTime() - new Date(previous.period_end).getTime()) / 86400000 - 365) <= 65;
  const kpis = metrics.filter(metric => ["operating_cash_flow", "capital_expenditure", "free_cash_flow", "dividends", "repurchases", "earnings_cash_conversion"].includes(metric.key));
  return <section className={styles.panel} aria-label={tr(language, "Allocation du capital", "Capital allocation")}>
    <header><span className="eyebrow">FUNDAMENTAL INTELLIGENCE 360</span>
      <h2>{tr(language, "Allocation du capital et analystes", "Capital allocation and analysts")}</h2>
      <p>{tr(language, "Exercices publiés et calculs explicités; consensus actuel séparé de l’historique.",
        "Published fiscal years and explicit calculations; current consensus is separate from history.")}</p></header>
    {loading ? <p role="status">{tr(language, "Lecture des exercices…", "Reading fiscal years…")}</p> : null}
    {error ? <p role="alert">{tr(language, "Analyse temporairement indisponible.", "Analysis temporarily unavailable.")}</p> : null}
    {data ? <>
      {data.stale ? <p role="status">{tr(language, "Instantané périmé : vérifiez les dates des sources.", "Stale snapshot: check source dates.")}</p> : null}
      {data.periods.length ? <>
        <div className={styles.kpis}>{kpis.filter(metric => latest?.[metric.key].value !== null).map(metric => {
          const current = latest![metric.key].value!;
          const prior = comparable ? previous![metric.key].value : null;
          return <article className={styles.kpi} key={metric.key}><span>{tr(language, metric.fr, metric.en)}</span>
            <strong title={exactFinancialNumber(current, language)}>{formatted(latest![metric.key], latest!.currency, language, metric.percent)}</strong>
            {prior !== null && prior !== undefined ? <small>{tr(language, "Variation annuelle", "Yearly change")} : {formatFinancialNumber(current - prior, { language, unit: metric.percent ? "percent" : "money", currency: metric.percent ? null : latest!.currency })}</small> : null}
          </article>;
        })}</div>
        <p className={styles.muted}>{tr(language, "Données financières", "Financial data")} · {latest?.period_end.slice(0, 4)} · {tr(language, "sources par exercice", "sources by fiscal year")}</p>
        <details><summary>{tr(language, "Historique financier et autres indicateurs", "Financial history and other metrics")}</summary>
        {unavailable.length ? <label className={styles.muted}><input type="checkbox" checked={showMissing} onChange={event => setShowMissing(event.target.checked)} />
          {tr(language, "Afficher les indicateurs indisponibles", "Show unavailable metrics")} ({unavailable.length})</label> : null}
        <FocusViewMode mode={mode} choose={choose} modes={modes} language={language} label={tr(language, "Mode allocation", "Allocation display mode")} />
        <fieldset className={styles.metrics}><legend>{tr(language, "Indicateurs", "Metrics")}</legend>{metrics.map(metric => <label key={metric.key}>
          <input type="checkbox" checked={selected.includes(metric.key)} onChange={() => setSelected(previous => previous.includes(metric.key)
            ? previous.filter(key => key !== metric.key) : [...previous, metric.key])} />{tr(language, metric.fr, metric.en)}</label>)}</fieldset>
        {mode !== "charts" ? <div className={`${styles.tableWrap} ${mode === "cards" ? styles.cardTable : ""}`}><table><thead><tr><th>{tr(language, "Indicateur", "Metric")}</th>
          {data.periods.map(period => <th key={period.period_end}>{period.period_end.slice(0, 10)}<small>{period.currency ?? tr(language, "devise N/D", "currency N/A")}</small></th>)}</tr></thead>
          <tbody>{shown.map(metric => <tr key={metric.key}><th>{tr(language, metric.fr, metric.en)}</th>{data.periods.map(period => <td key={period.period_end}>
            <small className={styles.cardPeriod}>{period.period_end.slice(0, 10)}</small>
            <span title={exactFinancialNumber(period[metric.key].value, language)}>{formatted(period[metric.key], period.currency, language, metric.percent)}</span>
            {period[metric.key].value === null ? <small>{period[metric.key].missing_inputs.join(", ")}</small> : null}
          </td>)}</tr>)}</tbody></table></div> : null}
        {mode === "charts" ? <div className={styles.cards}>{shown.map(metric => {
          const bound = Math.max(1, ...data.periods.map(period => Math.abs(period[metric.key].value ?? 0)));
          return <article className={styles.card} key={metric.key}><h3>{tr(language, metric.fr, metric.en)}</h3>{data.periods.map(period => <div className={styles.row} key={period.period_end}>
            <span>{period.period_end.slice(0, 10)} · {formatted(period[metric.key], period.currency, language, metric.percent)}</span>
            <div className={styles.track} role="img" aria-label={`${period.period_end.slice(0, 10)} ${formatted(period[metric.key], period.currency, language, metric.percent)}`}><div className={styles.zero} /><div className={`${styles.bar} ${(period[metric.key].value ?? 0) < 0 ? styles.negative : ""}`} style={signedBar(period[metric.key].value, bound)} /></div>
          </div>)}</article>;
        })}</div> : null}
        </details>
      </> : <p>{tr(language, "Aucun exercice annuel vérifiable disponible.", "No verifiable annual fiscal year available.")}</p>}
      <details><summary>{tr(language, "Voir les sources, formules et valeurs exactes", "View sources, formulas and exact values")}</summary>
        {data.periods.map(period => <div key={period.period_end}><h4>{period.period_end.slice(0, 10)} · {period.currency ?? "N/D"}</h4><Source period={period} language={language} />
          {metrics.map(metric => <p key={metric.key}>{tr(language, metric.fr, metric.en)} : {exactFinancialNumber(period[metric.key].value, language)} · {period[metric.key].status} · {period[metric.key].formula}{period[metric.key].missing_inputs.length ? ` · ${period[metric.key].missing_inputs.join(", ")}` : ""}</p>)}</div>)}
      </details>
      <section className={styles.analysts}><h3>{tr(language, "Consensus analystes actuel", "Current analyst consensus")}</h3>
        <p className={styles.muted}>{data.analysts.source_name} · {data.analysts.as_of.slice(0, 10)} · {tr(language, "source secondaire", "secondary source")}</p>
        {data.analysts.status === "unavailable" ? <p>{tr(language, "Consensus indisponible.", "Consensus unavailable.")}</p> : <>
          <div className={styles.kpis}><div className={styles.kpi}><span>{tr(language, "Recommandation", "Recommendation")}</span><strong>{analystRecommendation(data.analysts.recommendation_key, language)}</strong></div>
            <div className={styles.kpi}><span>{tr(language, "Analystes", "Analysts")}</span><strong>{Object.values(data.analysts.distribution).every(value => value !== null) ? Object.values(data.analysts.distribution).reduce<number>((sum, value) => sum + (value ?? 0), 0) : "N/D"}</strong></div>
            <div className={styles.kpi}><span>{tr(language, "Cible moyenne", "Mean target")}</span><strong title={exactFinancialNumber(data.analysts.target_mean, language)}>{formatFinancialNumber(data.analysts.target_mean, { language, unit: "plain", currency: data.analysts.target_currency })}</strong><small>{data.analysts.target_currency ?? tr(language, "devise non vérifiée", "currency unverified")}</small></div></div>
          {(data.analysts.target_low !== null || data.analysts.target_high !== null) ? <p>{tr(language, "Fourchette des objectifs", "Target range")} : {formatFinancialNumber(data.analysts.target_low, { language })} – {formatFinancialNumber(data.analysts.target_high, { language })} {data.analysts.target_currency ?? ""}</p> : null}
          {Object.values(data.analysts.distribution).every(value => value !== null) ? <div className={styles.distribution}>{Object.entries(data.analysts.distribution).map(([key, count]) => {
            const total = Object.values(data.analysts.distribution).reduce<number>((sum, value) => sum + (value ?? 0), 0);
            return <div key={key}><span>{analystRecommendation(key, language)} · {count} ({total ? Math.round((count ?? 0) / total * 100) : 0} %)</span><div className={styles.distributionTrack}><div style={{ width: `${total ? (count ?? 0) / total * 100 : 0}%` }} /></div></div>;
          })}</div> : null}
          {data.analysts.estimates.length ? <details><summary>{tr(language, "Estimations prévisionnelles", "Forward estimates")} ({data.analysts.estimates.length})</summary>
            <div className={styles.tableWrap}><table><thead><tr><th>{tr(language, "Période", "Period")}</th><th>BPA / EPS</th><th>{tr(language, "Revenus", "Revenue")}</th><th>{tr(language, "Analystes", "Analysts")}</th></tr></thead><tbody>{data.analysts.estimates.map(item => <tr key={`${item.period}-${item.end_date}`}><td>{item.period} {item.end_date?.slice(0, 10)}</td><td title={exactFinancialNumber(item.eps_average, language)}>{formatFinancialNumber(item.eps_average, { language, unit: "eps" })}</td><td title={exactFinancialNumber(item.revenue_average, language)}>{formatFinancialNumber(item.revenue_average, { language, unit: "money" })}</td><td>{item.eps_analyst_count ?? "N/D"} / {item.revenue_analyst_count ?? "N/D"}</td></tr>)}</tbody></table></div></details> : null}
          {data.analysts.actual_vs_consensus.length ? <details><summary>{tr(language, "Surprises historiques", "Historical surprises")}</summary>{data.analysts.actual_vs_consensus.map(item => <p key={item.period}>{item.period} · EPS {tr(language, "réel", "actual")} {formatFinancialNumber(item.actual_eps, { language, unit: "eps" })} / {tr(language, "estimé", "estimated")} {formatFinancialNumber(item.estimated_eps, { language, unit: "eps" })} · Δ {formatFinancialNumber(item.difference_eps, { language, unit: "eps" })}</p>)}</details> : null}
        </>}
        <p>{language === "fr" ? data.analysts.revision_history_reason_fr : data.analysts.revision_history_reason_en}</p>
      </section>
      <details><summary>{tr(language, "Méthode et limites", "Method and limits")}</summary><ul>
        {(language === "fr" ? data.limitations_fr : data.limitations_en).map(item => <li key={item}>{item}</li>)}</ul></details>
    </> : null}
  </section>;
}
