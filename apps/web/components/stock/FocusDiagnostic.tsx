"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { FocusGlyph } from "@/components/focus-pro/FocusGlyph";
import type { FundamentalDiagnostic, FundamentalMeasure, FundamentalObservation } from "@anatole/shared/fundamental-intelligence";
import { getFundamentalDiagnostic } from "@/lib/api";
import { pick } from "@/lib/i18n";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { FocusSeriesChart } from "./FocusSeriesChart";
import { FocusViewMode, useFocusMode } from "./FocusViewMode";
import styles from "./FocusDiagnostic.module.css";

type Language = "fr" | "en";
const modes = ["table", "cards", "charts"] as const;

function valueText(observation: FundamentalObservation | undefined, language: Language): string {
  if (!observation) return language === "fr" ? "N/D" : "N/A";
  const value = new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(observation.value);
  if (observation.unit === "percent") return `${value} %`;
  if (observation.unit === "ratio") return `${value}×`;
  return `${value} ${observation.currency ?? ""}`.trim();
}

function sourceLink(observation: FundamentalObservation, language: Language) {
  const label = `${observation.source_name} · ${observation.period_end.slice(0, 10)}${observation.filed_at ? ` · ${observation.filed_at.slice(0, 10)}` : ""}`;
  return observation.source_url?.startsWith("https://")
    ? <a href={observation.source_url} target="_blank" rel="noopener noreferrer">{label}</a>
    : <span>{label} · {pick(language, "URL indisponible", "URL unavailable")}</span>;
}

function MeasureDetails({ measure, language }: { measure: FundamentalMeasure; language: Language }) {
  const latest = measure.observations[0];
  return <div id={`fundamental-metric-${measure.key}`} className={styles.measure}>
    <strong>{language === "fr" ? measure.label_fr : measure.label_en}</strong>
    <span className={styles.value}>{valueText(latest, language)}</span>
    <span className={styles.muted}>{latest ? sourceLink(latest, language)
      : language === "fr" ? measure.reason_fr : measure.reason_en}</span>
    <details><summary>{pick(language, "Méthode et historique", "Method and history")}</summary>
      <p>{language === "fr" ? measure.method_fr : measure.method_en}</p>
      {measure.observations.map(item => <p key={item.period_end}>
        {item.period_end.slice(0, 10)} · {valueText(item, language)} · {pick(language,
          item.nature === "published" ? "publié" : "calculé", item.nature === "published" ? "published" : "calculated")} · {sourceLink(item, language)}
      </p>)}
    </details>
  </div>;
}

function DimensionCharts({ measures, dimension, language }: {
  measures: FundamentalMeasure[]; dimension: string; language: Language;
}) {
  return <div className={styles.charts}>{(["money", "percent", "ratio"] as const).map(unit => {
    const members = measures.filter(item => item.dimension === dimension && item.unit === unit && item.observations.length);
    if (!members.length) return null;
    const periods = [...new Set(members.flatMap(item => item.observations.map(point => point.period_end.slice(0, 10))))].sort();
    const sourceForPeriod = (period: string) => members.flatMap(item => item.observations)
      .find(point => point.period_end.startsWith(period));
    return <FocusSeriesChart key={unit} storageKey={`diagnostic.${dimension}.${unit}`}
      title={pick(language, `Historique · ${unit === "money" ? "montants" : unit === "percent" ? "pourcentages" : "ratios"}`,
        `History · ${unit === "money" ? "amounts" : unit === "percent" ? "percentages" : "ratios"}`)}
      periods={periods} periodSources={periods.map(period => sourceForPeriod(period)?.source_name ?? null)}
      periodCurrencies={unit === "money" ? periods.map(period => sourceForPeriod(period)?.currency ?? null) : undefined}
      series={members.map(item => ({ id: item.key, label: language === "fr" ? item.label_fr : item.label_en,
        values: periods.map(period => item.observations.find(point => point.period_end.startsWith(period))?.value ?? null) }))}
      unit={unit === "ratio" ? "number" : unit} currency={members[0]?.observations[0]?.currency ?? ""}
      language={language} source={pick(language, "Sources détaillées sous le graphique", "Detailed sources below the chart")} />;
  })}</div>;
}

export function FocusDiagnostic({ ticker, focusSection }: { ticker: string; focusSection?: "sector" }) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [mode, choose] = useFocusMode("anatole.focus.diagnostic.view.v1", modes);
  const [data, setData] = useState<FundamentalDiagnostic | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void getFundamentalDiagnostic(ticker, controller.signal).then(value => {
      if (!controller.signal.aborted) { setData(value); setError(false); }
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [ticker, retry]);
  const current = data?.ticker.replace(/\.TO$/i, "").toUpperCase() === ticker.replace(/\.TO$/i, "").toUpperCase() ? data : null;
  useEffect(() => {
    if (current && focusSection === "sector") document.getElementById("diagnostic-sector")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [current, focusSection]);
  if (!current) return <section className={styles.panel} role="status">{pick(language,
    error ? "Diagnostic indisponible. Réessayez plus tard." : "Calcul du diagnostic…",
    error ? "Diagnostic unavailable. Please retry later." : "Calculating diagnostic…")}
    {error ? <button type="button" onClick={() => { setError(false); setRetry(value => value + 1); }}>{pick(language, "Réessayer", "Retry")}</button> : null}
  </section>;
  const measures = new Map(current.measures.map(item => [item.key, item]));
  const overviewGroups = [
    { key: "profitability", fr: "Rentabilité", en: "Profitability", keys: ["profitability"], icon: "Activity" },
    { key: "financial_strength", fr: "Solidité financière", en: "Financial strength", keys: ["liquidity", "leverage"], icon: "ShieldCheck" },
    { key: "earnings_quality", fr: "Qualité des bénéfices", en: "Earnings quality", keys: ["earnings_quality", "cash_flow"], icon: "BarChart3" },
    { key: "growth", fr: "Croissance", en: "Growth", keys: ["growth"], icon: "TrendingUp" },
  ] as const;
  const availableSector = (current.sector_metrics ?? []).filter(item => item.value !== null && item.status === "available");
  const missingSector = (current.sector_metrics ?? []).filter(item => item.value === null || item.status !== "available");
  return <section className={styles.panel} aria-label={pick(language, "Diagnostic financier 360°", "Financial diagnostic 360°")}>
    <header><span className="eyebrow">FUNDAMENTAL INTELLIGENCE 360</span>
      <h2>{pick(language, "Diagnostic financier 360°", "Financial diagnostic 360°")}</h2>
      <p>{current.name} · {current.financial_currency ?? pick(language, "devise N/D", "currency N/A")}</p>
      {current.stale ? <p role="status">{pick(language, "Dernier instantané disponible; actualisation en cours ou différée.",
        "Latest available snapshot; refresh in progress or delayed.")}</p> : null}
      <p className={styles.muted}>{language === "fr" ? current.methodology_fr : current.methodology_en}</p>
    </header>
    <div className={styles.overviewGrid} aria-label={pick(language, "Dimensions du diagnostic", "Diagnostic dimensions")}>
      {overviewGroups.map(group => {
        const dimensions = current.dimensions.filter(item => (group.keys as readonly string[]).includes(item.key));
        const coverage = dimensions.reduce((total, item) => total + item.available_count, 0);
        const possible = dimensions.reduce((total, item) => total + item.measure_keys.length, 0);
        const first = dimensions[0];
        return <article key={group.key} className={styles.overviewCard}>
          <div className={styles.cardTop}><span className={styles.cardIcon}><FocusGlyph name={group.icon} size={21} /></span><span className={styles.coverage}>{coverage}/{possible} {pick(language, "indicateurs", "measures")}</span></div>
          <strong>{pick(language, group.fr, group.en)}</strong>
          {dimensions.length ? dimensions.map(dimension => {
            const scored = dimension.score_status === "directional" && dimension.score !== null && Number.isFinite(dimension.score);
            return <div key={dimension.key} className={styles.subdimension}>
              {dimensions.length > 1 ? <span className={styles.subdimensionName}>{language === "fr" ? dimension.label_fr : dimension.label_en}</span> : null}
              {scored ? <div className={styles.scoreRow}><span className={styles.scoreRing} style={{ "--score": `${Math.min(100, Math.max(0, dimension.score!))}%` } as CSSProperties}><b>{Math.round(dimension.score!)}</b></span>
                <span>{pick(language, "Indice de direction historique", "Historical direction index")}</span></div>
                : <div className={styles.unavailable}><FocusGlyph name="CircleHelp" size={18} /><span>{pick(language, dimension.score_status === "not_applicable" ? "Non applicable" : "Données insuffisantes", dimension.score_status === "not_applicable" ? "Not applicable" : "Insufficient data")}</span></div>}
              <span className={styles.cardExplanation}>{language === "fr" ? dimension.explanation_fr : dimension.explanation_en}</span>
            </div>;
          }) : <div className={styles.unavailable}><FocusGlyph name="CircleHelp" size={18} /><span>{pick(language, "Données insuffisantes dans cet instantané", "Insufficient data in this snapshot")}</span></div>}
          {first ? <a className={styles.cardAction} href={`#diagnostic-dimension-${first.key}`}>{pick(language, "Voir les calculs détaillés →", "View detailed calculations →")}</a> : null}
        </article>;
      })}
    </div>
    {current.findings.length ? <div className={styles.findings}>
      <h3>{pick(language, "Constats fondés sur les données", "Data-backed findings")}</h3>
      <div className={styles.findingGrid}>{current.findings.map((finding, index) => {
        const icon = finding.kind === "strength" ? "ArrowUpRight" : finding.kind === "vulnerability" ? "ArrowDownRight" : "AlertTriangle";
        return <article key={`${finding.kind}-${index}`} className={styles.findingCard} data-kind={finding.kind}>
          <div className={styles.findingHead}><FocusGlyph name={icon} size={19} /><strong>{pick(language,
            finding.kind === "strength" ? "Point fort" : finding.kind === "vulnerability" ? "Point de vigilance" : "Observation",
            finding.kind === "strength" ? "Strength" : finding.kind === "vulnerability" ? "Watch point" : "Observation")}</strong></div>
          <p>{language === "fr" ? finding.text_fr : finding.text_en}</p>
          {finding.measure_keys.length ? <details><summary>{pick(language, "Indicateurs et sources", "Measures and sources")}</summary>
            {finding.measure_keys.map(key => <a key={key} href={`#fundamental-metric-${key}`}>
              {language === "fr" ? measures.get(key)?.label_fr ?? key : measures.get(key)?.label_en ?? key}</a>)}
          </details> : null}
        </article>;
      })}</div>
    </div> : null}
    {(current.sector_metrics ?? []).length ? <section id="diagnostic-sector" className={styles.dimension}>
      <h3><FocusGlyph name="Landmark" size={20} />{pick(language, "Indicateurs propres au secteur", "Sector-specific metrics")}</h3>
      <p className={styles.muted}>{pick(language, "Uniquement les valeurs explicitement présentes dans une publication officielle sont affichées.",
        "Only values explicitly present in an official publication are shown.")}</p>
      {availableSector.length ? <div className={styles.cards}>{availableSector.map(item => <div className={styles.measure} key={item.key}>
        <strong>{language === "fr" ? item.label_fr : item.label_en}</strong>
        <span className={styles.value}>{`${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(item.value!)} ${item.unit}`}</span>
        {item.source_url?.startsWith("https://") ? <a href={item.source_url} target="_blank" rel="noopener noreferrer">
          {item.source_name} · {item.filed_at?.slice(0, 10) ?? pick(language, "date N/D", "date N/A")}</a>
          : <span className={styles.muted}>{pick(language, "Publication officielle non disponible", "Official publication unavailable")}</span>}
      </div>)}</div> : null}
      {missingSector.length ? <details className={styles.missingSector}><summary>{pick(language, `${missingSector.length} indicateur${missingSector.length > 1 ? "s" : ""} sans publication vérifiable`, `${missingSector.length} metric${missingSector.length > 1 ? "s" : ""} without a verifiable publication`)}</summary>
        <p>{pick(language, "Aucune valeur vérifiable avec unité compatible dans l’instantané courant. Aucune valeur n’est estimée.", "No verifiable value with a compatible unit in the current snapshot. No value is estimated.")}</p>
        <ul>{missingSector.map(item => <li key={item.key}>{language === "fr" ? item.label_fr : item.label_en}</li>)}</ul>
      </details> : null}
    </section> : null}
    <FocusViewMode mode={mode} choose={choose} modes={modes} language={language}
      label={pick(language, "Mode du diagnostic", "Diagnostic display mode")} />
    {current.dimensions.map(dimension => <section id={`diagnostic-dimension-${dimension.key}`} className={styles.dimension} key={dimension.key}>
      <h3>{language === "fr" ? dimension.label_fr : dimension.label_en}</h3>
      <details><summary>{dimension.score === null ? pick(language, "Indice non calculable", "Index unavailable")
        : `${pick(language, "Indice directionnel", "Directional index")} ${dimension.score}/100`}</summary>
        <p>{language === "fr" ? dimension.explanation_fr : dimension.explanation_en}</p>
        {dimension.contributions.map(item => <p key={item.measure_key}>
          {language === "fr" ? measures.get(item.measure_key)?.label_fr : measures.get(item.measure_key)?.label_en}: {item.previous} → {item.current} · {item.points}/100
        </p>)}
      </details>
      {mode === "charts" ? <DimensionCharts measures={current.measures} dimension={dimension.key} language={language} /> : null}
      {mode === "table" && dimension.measure_keys.length > 0 ? <div className={styles.tableWrap}><table><caption>{language === "fr" ? dimension.label_fr : dimension.label_en}</caption>
        <thead><tr><th>{pick(language, "Indicateur", "Measure")}</th><th>{pick(language, "Dernière valeur", "Latest value")}</th><th>{pick(language, "Période", "Period")}</th></tr></thead>
        <tbody>{dimension.measure_keys.map(key => { const item = measures.get(key); const latest = item?.observations[0];
          return item ? <tr key={key}><th><a href={`#fundamental-metric-${key}`}>{language === "fr" ? item.label_fr : item.label_en}</a></th>
            <td>{valueText(latest, language)}</td><td>{latest?.period_end.slice(0, 10) ?? "N/D"}</td></tr> : null; })}</tbody>
      </table></div> : null}
      {dimension.measure_keys.length > 0 ? <div className={mode === "cards" ? styles.cards : styles.details}>
        {dimension.measure_keys.map(key => { const item = measures.get(key);
          return item ? <MeasureDetails key={key} measure={item} language={language} /> : null; })}
      </div> : null}
    </section>)}
    {current.missing_data.length ? <section className={styles.dimension}><h3>{pick(language, "Données manquantes", "Missing data")}</h3>
      <ul>{current.missing_data.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section> : null}
    <p className={styles.muted}>{pick(language, "Aucun score global ni recommandation d’achat ou de vente.", "No global score or buy/sell recommendation.")}</p>
  </section>;
}
