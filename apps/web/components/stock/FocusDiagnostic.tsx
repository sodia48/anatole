"use client";

import { useEffect, useState } from "react";
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

export function FocusDiagnostic({ ticker }: { ticker: string }) {
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
  if (!current) return <section className={styles.panel} role="status">{pick(language,
    error ? "Diagnostic indisponible. Réessayez plus tard." : "Calcul du diagnostic…",
    error ? "Diagnostic unavailable. Please retry later." : "Calculating diagnostic…")}
    {error ? <button type="button" onClick={() => { setError(false); setRetry(value => value + 1); }}>{pick(language, "Réessayer", "Retry")}</button> : null}
  </section>;
  const measures = new Map(current.measures.map(item => [item.key, item]));
  return <section className={styles.panel} aria-label={pick(language, "Diagnostic financier 360°", "Financial diagnostic 360°")}>
    <header><span className="eyebrow">FUNDAMENTAL INTELLIGENCE 360</span>
      <h2>{pick(language, "Diagnostic financier 360°", "Financial diagnostic 360°")}</h2>
      <p>{current.name} · {current.financial_currency ?? pick(language, "devise N/D", "currency N/A")}</p>
      {current.stale ? <p role="status">{pick(language, "Dernier instantané disponible; actualisation en cours ou différée.",
        "Latest available snapshot; refresh in progress or delayed.")}</p> : null}
      <p className={styles.muted}>{language === "fr" ? current.methodology_fr : current.methodology_en}</p>
    </header>
    <FocusViewMode mode={mode} choose={choose} modes={modes} language={language}
      label={pick(language, "Mode du diagnostic", "Diagnostic display mode")} />
    {current.findings.length ? <div className={styles.findings}>
      <h3>{pick(language, "Constats fondés sur les données", "Data-backed findings")}</h3>
      {current.findings.map((finding, index) => <p key={`${finding.kind}-${index}`} data-kind={finding.kind}>
        {language === "fr" ? finding.text_fr : finding.text_en}
        {finding.measure_keys.map(key => <a key={key} href={`#fundamental-metric-${key}`}>
          {language === "fr" ? measures.get(key)?.label_fr : measures.get(key)?.label_en}</a>)}
      </p>)}
    </div> : null}
    {(current.sector_metrics ?? []).length ? <section className={styles.dimension}>
      <h3>{pick(language, "Indicateurs propres au secteur", "Sector-specific metrics")}</h3>
      <p className={styles.muted}>{pick(language, "Uniquement les valeurs explicitement présentes dans une publication officielle sont affichées.",
        "Only values explicitly present in an official publication are shown.")}</p>
      <div className={styles.cards}>{current.sector_metrics.map(item => <div className={styles.measure} key={item.key}>
        <strong>{language === "fr" ? item.label_fr : item.label_en}</strong>
        <span>{item.value === null ? pick(language, "N/D", "N/A") : `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(item.value)} ${item.unit}`}</span>
        {item.source_url?.startsWith("https://") ? <a href={item.source_url} target="_blank" rel="noopener noreferrer">
          {item.source_name} · {item.filed_at?.slice(0, 10) ?? pick(language, "date N/D", "date N/A")}</a>
          : <span className={styles.muted}>{pick(language, "Publication officielle non disponible", "Official publication unavailable")}</span>}
      </div>)}</div>
    </section> : null}
    {current.dimensions.map(dimension => <section className={styles.dimension} key={dimension.key}>
      <h3>{language === "fr" ? dimension.label_fr : dimension.label_en}</h3>
      <details><summary>{dimension.score === null ? pick(language, "Indice non calculable", "Index unavailable")
        : `${pick(language, "Indice directionnel", "Directional index")} ${dimension.score}/100`}</summary>
        <p>{language === "fr" ? dimension.explanation_fr : dimension.explanation_en}</p>
        {dimension.contributions.map(item => <p key={item.measure_key}>
          {language === "fr" ? measures.get(item.measure_key)?.label_fr : measures.get(item.measure_key)?.label_en}: {item.previous} → {item.current} · {item.points}/100
        </p>)}
      </details>
      {mode === "charts" ? <DimensionCharts measures={current.measures} dimension={dimension.key} language={language} /> : null}
      {mode === "table" ? <div className={styles.tableWrap}><table><caption>{language === "fr" ? dimension.label_fr : dimension.label_en}</caption>
        <thead><tr><th>{pick(language, "Indicateur", "Measure")}</th><th>{pick(language, "Dernière valeur", "Latest value")}</th><th>{pick(language, "Période", "Period")}</th></tr></thead>
        <tbody>{dimension.measure_keys.map(key => { const item = measures.get(key); const latest = item?.observations[0];
          return item ? <tr key={key}><th><a href={`#fundamental-metric-${key}`}>{language === "fr" ? item.label_fr : item.label_en}</a></th>
            <td>{valueText(latest, language)}</td><td>{latest?.period_end.slice(0, 10) ?? "N/D"}</td></tr> : null; })}</tbody>
      </table></div> : null}
      <div className={mode === "cards" ? styles.cards : styles.details}>
        {dimension.measure_keys.map(key => { const item = measures.get(key);
          return item ? <MeasureDetails key={key} measure={item} language={language} /> : null; })}
      </div>
    </section>)}
  </section>;
}
