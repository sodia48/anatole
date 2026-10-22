"use client";

import { useEffect, useState } from "react";
import { FocusGlyph } from "@/components/focus-pro/FocusGlyph";
import { selectOverviewMeasures, type FundamentalDiagnostic, type FundamentalMeasure, type FundamentalObservation } from "@anatole/shared/fundamental-intelligence";
import { formatFinancialNumber } from "@anatole/shared/financial-display";
import { getFundamentalDiagnostic } from "@/lib/api";
import { pick } from "@/lib/i18n";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { FocusSeriesChart } from "./FocusSeriesChart";
import { FocusViewMode, useFocusMode } from "./FocusViewMode";
import "./FocusDiagnostic.css";

const tr = pick;

type Language = "fr" | "en";
const modes = ["table", "cards", "charts"] as const;

function valueText(observation: FundamentalObservation | undefined, language: Language): string {
  if (!observation) return language === "fr" ? "N/D" : "N/A";
  return formatFinancialNumber(observation.value, { language, unit: observation.unit, currency: observation.currency });
}

function sourceLink(observation: FundamentalObservation, language: Language) {
  const confidence = observation.source_confidence === "official"
    ? tr(language, "officielle", "official")
    : tr(language, "secondaire", "secondary");
  const label = `${observation.source_name} · ${confidence} · ${observation.source_type ?? "N/D"} · ${observation.period_end.slice(0, 10)}${observation.filed_at ? ` · ${observation.filed_at.slice(0, 10)}` : ""}`;
  return observation.source_url?.startsWith("https://")
    ? <a href={observation.source_url} target="_blank" rel="noopener noreferrer">{label}</a>
    : <span>{label} · {tr(language, "URL indisponible", "URL unavailable")}</span>;
}

function MeasureDetails({ measure, language }: { measure: FundamentalMeasure; language: Language }) {
  const latest = measure.observations[0];
  return <div id={`fundamental-metric-${measure.key}`} className="fd-measure">
    <strong>{language === "fr" ? measure.label_fr : measure.label_en}</strong>
    <span className="fd-value">{valueText(latest, language)}</span>
    <span className="fd-muted">{latest ? sourceLink(latest, language)
      : language === "fr" ? measure.reason_fr : measure.reason_en}</span>
    <details><summary>{tr(language, "Méthode et historique", "Method and history")}</summary>
      <p>{language === "fr" ? measure.method_fr : measure.method_en}</p>
      {measure.observations.map(item => <p key={item.period_end}>
        {item.period_end.slice(0, 10)} · {valueText(item, language)} · {item.currency ?? ""} · {tr(language,
          item.nature === "published" ? "publié" : "calculé", item.nature === "published" ? "published" : "calculated")} · {sourceLink(item, language)}
      </p>)}
    </details>
  </div>;
}

function DimensionCharts({ measures, dimension, language }: {
  measures: FundamentalMeasure[]; dimension: string; language: Language;
}) {
  return <div className="fd-charts">{(["money", "percent", "ratio"] as const).map(unit => {
    const members = measures.filter(item => item.dimension === dimension && item.unit === unit && item.observations.length);
    if (!members.length) return null;
    const periods = [...new Set(members.flatMap(item => item.observations.map(point => point.period_end.slice(0, 10))))].sort();
    const sourceForPeriod = (period: string) => members.flatMap(item => item.observations)
      .find(point => point.period_end.startsWith(period));
    return <FocusSeriesChart key={unit} storageKey={`diagnostic.${dimension}.${unit}`}
      title={tr(language, `Historique · ${unit === "money" ? "montants" : unit === "percent" ? "pourcentages" : "ratios"}`,
        `History · ${unit === "money" ? "amounts" : unit === "percent" ? "percentages" : "ratios"}`)}
      periods={periods} periodSources={periods.map(period => sourceForPeriod(period)?.source_name ?? null)}
      periodCurrencies={unit === "money" ? periods.map(period => sourceForPeriod(period)?.currency ?? null) : undefined}
      series={members.map(item => ({ id: item.key, label: language === "fr" ? item.label_fr : item.label_en,
        values: periods.map(period => item.observations.find(point => point.period_end.startsWith(period))?.value ?? null) }))}
      unit={unit === "ratio" ? "number" : unit} currency={members[0]?.observations[0]?.currency ?? ""}
      language={language} source={tr(language, "Sources détaillées sous le graphique", "Detailed sources below the chart")} />;
  })}</div>;
}

export function FocusDiagnostic({ ticker, focusSection }: { ticker: string; focusSection?: "sector" }) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [mode, choose] = useFocusMode("anatole.focus.diagnostic.view.v1", modes);
  const [data, setData] = useState<FundamentalDiagnostic | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(focusSection === "sector");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    const load = () => { void getFundamentalDiagnostic(ticker, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setData(value); setError(false);
      if (value.refresh_in_progress && polls++ < 10) timer = setTimeout(load, 3_000);
    }).catch(() => { if (!controller.signal.aborted) setError(true); }); };
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [ticker, retry]);
  const current = data?.ticker.replace(/\.TO$/i, "").toUpperCase() === ticker.replace(/\.TO$/i, "").toUpperCase() ? data : null;
  useEffect(() => {
    if (current && focusSection === "sector") document.getElementById("diagnostic-sector")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [current, focusSection]);
  if (!current) return <section className="fd-panel" role="status">{tr(language,
    error ? "Diagnostic indisponible. Réessayez plus tard." : "Calcul du diagnostic…",
    error ? "Diagnostic unavailable. Please retry later." : "Calculating diagnostic…")}
    {error ? <button type="button" onClick={() => { setError(false); setRetry(value => value + 1); }}>{tr(language, "Réessayer", "Retry")}</button> : null}
  </section>;
  const measures = new Map(current.measures.map(item => [item.key, item]));
  const essentials = selectOverviewMeasures(current);
  const chartMeasure = essentials.find(item => item.observations.length >= 2);
  const chartPoints = chartMeasure ? [...chartMeasure.observations].sort((a, b) => a.period_end.localeCompare(b.period_end)) : [];
  const availableSector = (current.sector_metrics ?? []).filter(item => item.value !== null && item.status === "available");
  const missingSector = (current.sector_metrics ?? []).filter(item => item.value === null || item.status !== "available");
  const visibleDimensions = current.dimensions.filter(item => item.available_count > 0);
  const unavailableDimensions = current.dimensions.filter(item => item.available_count === 0 && item.score_status !== "not_applicable");
  return <section className="fd-panel" aria-label={tr(language, "Diagnostic financier 360°", "Financial diagnostic 360°")}>
    <header><span className="eyebrow">FUNDAMENTAL INTELLIGENCE 360</span>
      <h2>{tr(language, "Diagnostic financier 360°", "Financial diagnostic 360°")}</h2>
      <p>{current.name} · {current.ticker} · {essentials[0]?.observations[0]?.period_end.slice(0, 10) ?? tr(language, "période indisponible", "period unavailable")}</p>
      {current.stale ? <p role="status">{tr(language, "Dernier instantané disponible; actualisation en cours ou différée.",
        "Latest available snapshot; refresh in progress or delayed.")}</p> : null}
      {current.refresh_in_progress ? <p role="status">{tr(language, "Recherche des états financiers en cours…", "Financial statements are being retrieved…")}</p> : null}
      {error ? <p role="status">{tr(language, "Actualisation échouée. Réessayez.", "Refresh failed. Retry.")}</p> : null}
    </header>
    {essentials.length ? <div className="fd-overviewGrid" aria-label={tr(language, "Indicateurs essentiels", "Key measures")}>
      {essentials.map(measure => <article key={measure.key} className="fd-overviewCard">
        <strong>{language === "fr" ? measure.label_fr : measure.label_en}</strong>
        <span className="fd-value">{valueText(measure.observations[0], language)}</span>
        <span className="fd-muted">{measure.observations[0]?.period_end.slice(0, 10)}</span>
        <a href={`#fundamental-metric-${measure.key}`} onClick={() => setDetailsOpen(true)}>{tr(language, "Voir la source et la méthode", "View source and method")}</a>
      </article>)}
    </div> : <div className="fd-empty" role="status"><p>{current.refresh_in_progress
      ? tr(language, "Les sources sont encore en cours de récupération. Le diagnostic se mettra à jour automatiquement.",
        "Sources are still loading. The diagnostic will update automatically.")
      : current.stale ? tr(language, "Instantané périmé; aucun exercice exploitable.",
        "Stale snapshot; no usable annual periods.")
      : current.status === "unavailable" ? tr(language, "Les sources financières sont temporairement inaccessibles.",
        "Financial sources are temporarily unavailable.")
      : tr(language, "Aucun exercice annuel vérifiable reçu.",
        "No verifiable annual period received.")}</p>
      {current.source_message && language === "fr" ? <p className="fd-muted">{current.source_message}</p> : null}
      <button type="button" onClick={() => { setError(false); setRetry(value => value + 1); }}>{tr(language, "Vérifier les données", "Check data")}</button>
    </div>}
    {chartMeasure ? <FocusSeriesChart storageKey="diagnostic.overview" title={language === "fr" ? chartMeasure.label_fr : chartMeasure.label_en}
      periods={chartPoints.map(point => point.period_end.slice(0, 10))} periodSources={chartPoints.map(point => point.source_name)}
      periodCurrencies={chartMeasure.unit === "money" ? chartPoints.map(point => point.currency) : undefined}
      series={[{ id: chartMeasure.key, label: language === "fr" ? chartMeasure.label_fr : chartMeasure.label_en, values: chartPoints.map(point => point.value) }]}
      unit={chartMeasure.unit === "ratio" ? "number" : chartMeasure.unit} currency={chartPoints[0]?.currency ?? ""} language={language}
      source={chartPoints[chartPoints.length - 1]?.source_name ?? ""} /> : null}
    {current.findings.length ? <div className="fd-findings">
      <h3>{tr(language, "Constats fondés sur les données", "Data-backed findings")}</h3>
      <div className="fd-findingGrid">{current.findings.slice(0, 4).map((finding, index) => {
        const icon = finding.kind === "strength" ? "ArrowUpRight" : finding.kind === "vulnerability" ? "ArrowDownRight" : "AlertTriangle";
        return <article key={`${finding.kind}-${index}`} className="fd-findingCard" data-kind={finding.kind}>
          <div className="fd-findingHead"><FocusGlyph name={icon} size={19} /><strong>{tr(language,
            finding.kind === "strength" ? "Point fort" : finding.kind === "vulnerability" ? "Point de vigilance" : "Observation",
            finding.kind === "strength" ? "Strength" : finding.kind === "vulnerability" ? "Watch point" : "Observation")}</strong></div>
          <p>{language === "fr" ? finding.text_fr : finding.text_en}</p>
          {finding.measure_keys.length ? <details><summary>{tr(language, "Indicateurs et sources", "Measures and sources")}</summary>
            {finding.measure_keys.map(key => <a key={key} href={`#fundamental-metric-${key}`} onClick={() => setDetailsOpen(true)}>
              {language === "fr" ? measures.get(key)?.label_fr ?? key : measures.get(key)?.label_en ?? key}</a>)}
          </details> : null}
        </article>;
      })}</div>
    </div> : null}
    <details className="fd-dimension" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary>{tr(language, "Détails, sources et méthodes", "Details, sources and methods")}</summary>
    <p className="fd-muted">{language === "fr" ? current.methodology_fr : current.methodology_en}</p>
    {(current.sector_metrics ?? []).length ? <section id="diagnostic-sector" className="fd-dimension">
      <h3><FocusGlyph name="Landmark" size={20} />{tr(language, "Indicateurs propres au secteur", "Sector-specific metrics")}</h3>
      <p className="fd-muted">{tr(language, "Valeurs publiées dans des sources officielles.",
        "Values published by official sources.")}</p>
      {availableSector.length ? <div className="fd-cards">{availableSector.map(item => <div className="fd-measure" key={item.key}>
        <strong>{language === "fr" ? item.label_fr : item.label_en}</strong>
        <span className="fd-value">{formatFinancialNumber(item.value, { language, unit: item.unit === "percent" || item.unit === "ratio" ? item.unit : "plain" })} {item.unit === "percent" || item.unit === "ratio" ? "" : item.unit}</span>
        {item.source_url?.startsWith("https://") ? <a href={item.source_url} target="_blank" rel="noopener noreferrer">
          {item.source_name} · {item.filed_at?.slice(0, 10) ?? tr(language, "date N/D", "date N/A")}</a>
          : <span className="fd-muted">{tr(language, "Publication officielle non disponible", "Official publication unavailable")}</span>}
      </div>)}</div> : null}
      {missingSector.length ? <details className="fd-missingSector"><summary>{tr(language, `${missingSector.length} indicateur${missingSector.length > 1 ? "s" : ""} sans publication vérifiable`, `${missingSector.length} metric${missingSector.length > 1 ? "s" : ""} without a verifiable publication`)}</summary>
        <p>{tr(language, "Aucune valeur vérifiable; aucune estimation ajoutée.", "No verified value; no estimated replacement.")}</p>
        <ul>{missingSector.map(item => <li key={item.key}>{language === "fr" ? item.label_fr : item.label_en}</li>)}</ul>
      </details> : null}
    </section> : null}
    <FocusViewMode mode={mode} choose={choose} modes={modes} language={language}
      label={tr(language, "Mode du diagnostic", "Diagnostic display mode")} />
    {visibleDimensions.map(dimension => <section id={`diagnostic-dimension-${dimension.key}`} className="fd-dimension" key={dimension.key}>
      <h3>{language === "fr" ? dimension.label_fr : dimension.label_en}</h3>
      <details><summary>{dimension.score === null ? tr(language, "Indice non calculable", "Index unavailable")
        : `${tr(language, "Indice directionnel", "Directional index")} ${dimension.score}/100`}</summary>
        <p>{language === "fr" ? dimension.explanation_fr : dimension.explanation_en}</p>
        {dimension.contributions.map(item => <p key={item.measure_key}>
          {language === "fr" ? measures.get(item.measure_key)?.label_fr : measures.get(item.measure_key)?.label_en}: {item.previous} → {item.current} · {item.points}/100
        </p>)}
      </details>
      {mode === "charts" ? <DimensionCharts measures={current.measures} dimension={dimension.key} language={language} /> : null}
      {mode === "table" && dimension.measure_keys.length > 0 ? <div className="fd-tableWrap"><table><caption>{language === "fr" ? dimension.label_fr : dimension.label_en}</caption>
        <thead><tr><th>{tr(language, "Indicateur", "Measure")}</th><th>{tr(language, "Dernière valeur", "Latest value")}</th><th>{tr(language, "Période", "Period")}</th></tr></thead>
        <tbody>{dimension.measure_keys.map(key => { const item = measures.get(key); const latest = item?.observations[0];
          return item ? <tr key={key}><th><a href={`#fundamental-metric-${key}`}>{language === "fr" ? item.label_fr : item.label_en}</a></th>
            <td>{valueText(latest, language)}</td><td>{latest?.period_end.slice(0, 10) ?? "N/D"}</td></tr> : null; })}</tbody>
      </table></div> : null}
      {dimension.measure_keys.length > 0 ? <div className={mode === "cards" ? "fd-cards" : "fd-details"}>
        {dimension.measure_keys.map(key => { const item = measures.get(key);
          return item ? <MeasureDetails key={key} measure={item} language={language} /> : null; })}
      </div> : null}
    </section>)}
    {unavailableDimensions.length || current.missing_data.length || current.coverage_message ? <details className="fd-dimension"><summary>{tr(language, "Voir les détails techniques", "View technical details")}</summary>
      {current.coverage_message ? <p>{language === "fr" ? current.coverage_message
        : "Coverage and source availability are reported by the financial data service."}</p> : null}
      {unavailableDimensions.length ? <p>{tr(language, "Groupes sans observation compatible", "Groups without compatible observations")}: {unavailableDimensions.map(item => language === "fr" ? item.label_fr : item.label_en).join(", ")}</p> : null}
      {current.missing_data.length ? <p>{tr(language, "Calculs sans entrées comparables", "Calculations without comparable inputs")}: {current.missing_data.join(", ")}</p> : null}
    </details> : null}
    </details>
    <p className="fd-muted">{tr(language, "Aucun score global ni recommandation d’achat ou de vente.", "No global score or buy/sell recommendation.")}</p>
  </section>;
}
