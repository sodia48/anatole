"use client";

import { useEffect, useState } from "react";
import type { CapitalMetricKey, CapitalPeriod, CapitalValue, FundamentalCapitalResearch } from "@anatole/shared/fundamental-capital";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { getFundamentalCapital } from "@/lib/api";
import { pick } from "@/lib/i18n";
import { FocusViewMode, useFocusMode } from "./FocusViewMode";
import styles from "./FocusCapital.module.css";

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
  if (value.value === null) return language === "fr" ? "N/D" : "N/A";
  return `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(value.value)}${percent ? " %" : currency ? ` ${currency}` : ""}`;
}

function Source({ period, language }: { period: CapitalPeriod; language: Language }) {
  const label = `${period.source_name} · ${period.filed_at?.slice(0, 10) ?? pick(language, "date N/D", "date N/A")}`;
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
  useEffect(() => {
    const controller = new AbortController();
    void getFundamentalCapital(ticker, controller.signal).then(setData)
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ticker]);
  const shown = metrics.filter(metric => selected.includes(metric.key));
  return <section className={styles.panel} aria-label={pick(language, "Allocation du capital", "Capital allocation")}>
    <header><span className="eyebrow">FUNDAMENTAL INTELLIGENCE 360</span>
      <h2>{pick(language, "Allocation du capital et analystes", "Capital allocation and analysts")}</h2>
      <p>{pick(language, "Exercices publiés et calculs explicités; consensus actuel séparé de l’historique.",
        "Published fiscal years and explicit calculations; current consensus is separate from history.")}</p></header>
    {loading ? <p role="status">{pick(language, "Lecture des exercices…", "Reading fiscal years…")}</p> : null}
    {error ? <p role="alert">{pick(language, "Analyse temporairement indisponible.", "Analysis temporarily unavailable.")}</p> : null}
    {data ? <>
      {data.stale ? <p role="status">{pick(language, "Instantané périmé : vérifiez les dates des sources.", "Stale snapshot: check source dates.")}</p> : null}
      {data.periods.length ? <>
        <FocusViewMode mode={mode} choose={choose} modes={modes} language={language} label={pick(language, "Mode allocation", "Allocation display mode")} />
        <fieldset className={styles.metrics}><legend>{pick(language, "Indicateurs", "Metrics")}</legend>{metrics.map(metric => <label key={metric.key}>
          <input type="checkbox" checked={selected.includes(metric.key)} onChange={() => setSelected(previous => previous.includes(metric.key)
            ? previous.filter(key => key !== metric.key) : [...previous, metric.key])} />{pick(language, metric.fr, metric.en)}</label>)}</fieldset>
        {mode === "table" ? <div className={styles.tableWrap}><table><thead><tr><th>{pick(language, "Indicateur", "Metric")}</th>
          {data.periods.map(period => <th key={period.period_end}>{period.period_end.slice(0, 10)}<Source period={period} language={language} /></th>)}</tr></thead>
          <tbody>{shown.map(metric => <tr key={metric.key}><th>{pick(language, metric.fr, metric.en)}</th>{data.periods.map(period => <td key={period.period_end}>
            {formatted(period[metric.key], period.currency, language, metric.percent)}<details><summary>{pick(language, "Formule", "Formula")}</summary>{period[metric.key].formula}</details>
          </td>)}</tr>)}</tbody></table></div> : null}
        {mode === "cards" ? <div className={styles.cards}>{data.periods.map(period => <article className={styles.card} key={period.period_end}>
          <h3>{period.period_end.slice(0, 10)} · {period.currency ?? "N/D"}</h3><Source period={period} language={language} />
          {shown.map(metric => <div key={metric.key} className={styles.row}>{pick(language, metric.fr, metric.en)} : <strong>{formatted(period[metric.key], period.currency, language, metric.percent)}</strong>
            <small>{period[metric.key].formula}</small></div>)}</article>)}</div> : null}
        {mode === "charts" ? <div className={styles.cards}>{shown.map(metric => {
          const bound = Math.max(1, ...data.periods.map(period => Math.abs(period[metric.key].value ?? 0)));
          return <article className={styles.card} key={metric.key}><h3>{pick(language, metric.fr, metric.en)}</h3>{data.periods.map(period => <div className={styles.row} key={period.period_end}>
            <span>{period.period_end.slice(0, 10)} · {formatted(period[metric.key], period.currency, language, metric.percent)}</span>
            <div className={styles.track}><div className={styles.bar} style={{ width: `${Math.abs(period[metric.key].value ?? 0) / bound * 100}%` }} /></div>
          </div>)}</article>;
        })}</div> : null}
      </> : <p>{pick(language, "Aucun exercice annuel vérifiable disponible.", "No verifiable annual fiscal year available.")}</p>}
      <section className={styles.analysts}><h3>{pick(language, "Consensus analystes actuel", "Current analyst consensus")}</h3>
        <p>{data.analysts.source_name} · {data.analysts.as_of.slice(0, 10)} · {pick(language, "source secondaire", "secondary source")}</p>
        {data.analysts.status === "unavailable" ? <p>{pick(language, "Consensus indisponible.", "Consensus unavailable.")}</p> : <>
          <p>{pick(language, "Recommandation", "Recommendation")} : {data.analysts.recommendation_key ?? "N/D"} · {pick(language, "Cible moyenne", "Mean target")} : {data.analysts.target_mean ?? "N/D"} ({pick(language, "devise non vérifiée", "currency unverified")})</p>
          <p>{Object.entries(data.analysts.distribution).map(([key, count]) => `${key}: ${count ?? "N/D"}`).join(" · ")}</p>
          {data.analysts.estimates.map(item => <p key={`${item.period}-${item.end_date}`}>{item.period} · EPS {item.eps_average ?? "N/D"} · {pick(language, "revenus", "revenue")} {item.revenue_average ?? "N/D"}</p>)}
          {data.analysts.actual_vs_consensus.map(item => <p key={item.period}>{item.period} · EPS {pick(language, "réel", "actual")} {item.actual_eps} / {pick(language, "estimé", "estimated")} {item.estimated_eps} · Δ {item.difference_eps}</p>)}
        </>}
        <p>{language === "fr" ? data.analysts.revision_history_reason_fr : data.analysts.revision_history_reason_en}</p>
      </section>
      <details><summary>{pick(language, "Méthode et limites", "Method and limits")}</summary><ul>
        {(language === "fr" ? data.limitations_fr : data.limitations_en).map(item => <li key={item}>{item}</li>)}</ul></details>
    </> : null}
  </section>;
}
