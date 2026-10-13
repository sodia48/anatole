"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { pick } from "@/lib/i18n";
import styles from "./FocusEstimates.module.css";

export type EarningsEstimate = {
  period: string;
  end_date: string | null;
  eps_average: number | null;
  eps_low: number | null;
  eps_high: number | null;
  eps_year_ago: number | null;
  eps_growth: number | null;
  eps_analyst_count: number | null;
  revenue_average: number | null;
  revenue_low: number | null;
  revenue_high: number | null;
  revenue_year_ago: number | null;
  revenue_growth: number | null;
  revenue_analyst_count: number | null;
};

type Language = "fr" | "en";
type Mode = "table" | "cards";
const preferenceKey = "anatole.focus.estimates.view.v1";
const changeEvent = "anatole-estimates-view";
let volatileMode: Mode | null = null;

function readMode(): Mode {
  if (volatileMode) return volatileMode;
  try {
    const saved = window.localStorage.getItem(preferenceKey);
    if (saved === "table" || saved === "cards") return saved;
  } catch { /* Browser storage is optional. */ }
  return window.matchMedia("(max-width: 700px)").matches ? "cards" : "table";
}

function subscribeMode(notify: () => void) {
  const media = window.matchMedia("(max-width: 700px)");
  window.addEventListener(changeEvent, notify);
  media.addEventListener("change", notify);
  return () => {
    window.removeEventListener(changeEvent, notify);
    media.removeEventListener("change", notify);
  };
}

function available(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function format(value: number | null, language: Language, currency?: string, compact = false): string {
  if (!available(value)) return "N/D";
  return new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", {
    ...(currency ? { style: "currency", currency } : {}),
    ...(compact ? { notation: "compact" } : {}),
    maximumFractionDigits: currency && !compact ? 2 : compact ? 2 : 0,
    minimumFractionDigits: currency && !compact ? 2 : 0,
  }).format(value);
}

function percent(value: number | null, language: Language): string {
  if (!available(value)) return "N/D";
  return `${value > 0 ? "+" : ""}${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(value)} %`;
}

function signed(value: number | null): "positive" | "negative" | "neutral" {
  return !available(value) || value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
}

function dispersion(row: EarningsEstimate | undefined): number | null {
  if (!row || !available(row.eps_low) || !available(row.eps_average) || !available(row.eps_high)
    || row.eps_low > row.eps_average || row.eps_average > row.eps_high || row.eps_average === 0) return null;
  return ((row.eps_high - row.eps_low) / Math.abs(row.eps_average)) * 100;
}

function Range({ low, average, high, currency, language }: {
  low: number | null; average: number | null; high: number | null;
  currency: string; language: Language;
}) {
  const coherent = available(low) && available(average) && available(high)
    && low <= average && average <= high && low < high;
  const lowText = format(low, language, currency);
  const averageText = format(average, language, currency);
  const highText = format(high, language, currency);
  return <div className={styles.range}>
    <span>{lowText} — {highText}</span>
    {coherent ? <div className={styles.rangeTrack} role="img"
      aria-label={pick(language, `Bas ${lowText}, moyen ${averageText}, haut ${highText}`, `Low ${lowText}, average ${averageText}, high ${highText}`)}>
      <span className={styles.rangePoint} style={{ left: `${((average - low) / (high - low)) * 100}%` }} />
    </div> : null}
  </div>;
}

function Change({ value, language }: { value: number | null; language: Language }) {
  return <span className={styles.change} data-tone={signed(value)}>{percent(value, language)}</span>;
}

function estimateCells(row: EarningsEstimate, currency: string, language: Language, labels: string[]): Array<[
  string, ReactNode, ("positive" | "negative" | "neutral")?,
]> {
  return [
    [labels[2], format(row.eps_average, language, currency)],
    [labels[3], <Range key="eps" low={row.eps_low} average={row.eps_average} high={row.eps_high} currency={currency} language={language} />],
    [labels[4], format(row.eps_year_ago, language, currency)],
    [labels[5], percent(row.eps_growth, language), signed(row.eps_growth)],
    [labels[6], format(row.eps_analyst_count, language)],
    [labels[7], format(row.revenue_average, language, currency)],
    [labels[8], <Range key="revenue" low={row.revenue_low} average={row.revenue_average} high={row.revenue_high} currency={currency} language={language} />],
    [labels[9], percent(row.revenue_growth, language), signed(row.revenue_growth)],
    [labels[10], format(row.revenue_analyst_count, language)],
  ];
}
export function FocusEstimates({ rows, currency, language, partial }: {
  rows: EarningsEstimate[]; currency: string; language: Language; partial: boolean;
}) {
  const mode = useSyncExternalStore(subscribeMode, readMode, () => "table");
  function choose(next: Mode) {
    volatileMode = next;
    try { window.localStorage.setItem(preferenceKey, next); } catch { /* Storage can be unavailable. */ }
    window.dispatchEvent(new Event(changeEvent));
  }
  const quarter = rows.find(row => row.period === "+1q");
  const year = rows.find(row => row.period === "0y");
  const spread = dispersion(quarter);
  const count = quarter?.eps_analyst_count ?? quarter?.revenue_analyst_count ?? null;
  const labels = language === "fr"
    ? ["Période", "Fin", "BPA moyen", "Fourchette BPA", "BPA année précédente", "Croissance BPA", "Analystes BPA", "Revenus moyens", "Fourchette revenus", "Croissance revenus", "Analystes revenus"]
    : ["Period", "End", "Average EPS", "EPS range", "Prior-year EPS", "EPS growth", "EPS analysts", "Average revenue", "Revenue range", "Revenue growth", "Revenue analysts"];
  const summaries = [
    ["Σ", pick(language, "BPA prochain trimestre", "Next-quarter EPS"), format(quarter?.eps_average ?? null, language, currency), quarter?.eps_growth ?? null,
      pick(language, "BPA +1q; variation annuelle si disponible.", "+1q EPS; annual change if available.")],
    ["▥", pick(language, "Revenus année courante", "Current-year revenue"), format(year?.revenue_average ?? null, language, currency, true), year?.revenue_growth ?? null,
      pick(language, "Revenus 0y; variation annuelle si disponible.", "0y revenue; annual change if available.")],
    ["↗", pick(language, "Croissance revenus 0y", "Revenue growth 0y"), percent(year?.revenue_growth ?? null, language), year?.revenue_growth ?? null,
      pick(language, "Croissance annuelle estimée des revenus 0y.", "Estimated annual revenue growth for 0y.")],
    ["◉", pick(language, "Couverture +1q", "Coverage +1q"), format(count, language), null,
      pick(language, "Analystes BPA ou revenus +1q selon disponibilité.", "+1q EPS or revenue analysts, as available.")],
    ["↔", pick(language, "Dispersion BPA +1q", "EPS spread +1q"), available(spread) ? percent(spread, language) : "N/D", null,
      pick(language, "BPA +1q : (haut − bas) / |moyenne|.", "+1q EPS: (high − low) / |average|.")],
  ] as const;
  const reading: string[] = [];
  if (available(year?.revenue_growth)) reading.push(pick(language,
    `Revenus 0y : ${percent(year.revenue_growth, language)} sur un an (estimé).`,
    `0y revenue: ${percent(year.revenue_growth, language)} year over year (estimated).`));
  if (available(quarter?.eps_growth)) reading.push(pick(language,
    `BPA +1q : ${percent(quarter.eps_growth, language)} sur un an (estimé).`,
    `+1q EPS: ${percent(quarter.eps_growth, language)} year over year (estimated).`));

  return <section className={styles.root} aria-label={pick(language, "Estimations du marché", "Market estimates")}>
    <header className={styles.header}><div>
      <h2>{pick(language, "Estimations du marché", "Market estimates")}</h2></div>
      <div className={styles.switch} role="group" aria-label={pick(language, "Mode d’affichage des estimations", "Estimates display mode")}>
        <button type="button" aria-pressed={mode === "table"} onClick={() => choose("table")}>{pick(language, "Vue tableau", "Table view")}</button>
        <button type="button" aria-pressed={mode === "cards"} onClick={() => choose("cards")}>{pick(language, "Vue cartes", "Card view")}</button>
      </div>
    </header>
    <div className={styles.summary}>{summaries.map(([icon, title, value, change, tooltip]) =>
      <article className={styles.summaryCard} data-tone={signed(change)} key={title}>
        <div className={styles.summaryTop}><span aria-hidden="true" className={styles.icon}>{icon}</span>
          <span className={styles.summaryTitle}>{title}</span>
          <button type="button" className={styles.help} title={tooltip} aria-label={tooltip}>ⓘ</button>
        </div>
        <strong className={styles.summaryValue}>{value}</strong>
        {change !== null ? <Change value={change} language={language} /> : null}
      </article>)}</div>
    {partial ? <p className={styles.partial} role="status">{pick(language, "Données partielles ou anciennes : N/D si absent.", "Partial or stale data: N/D when absent.")}</p> : null}
    <div className={styles.tableWrap} data-mode={mode} data-testid={mode === "table" ? "estimates-table-view" : "estimates-card-view"}>
      <table className={styles.table}><caption className={styles.srOnly}>{pick(language, "Estimations financières par période", "Financial estimates by period")}</caption>
        <thead><tr>{labels.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.length ? rows.map(row => <tr key={`${row.period}-${row.end_date}`} data-period={row.period}>
          <th scope="row">{row.period}</th><td data-label={pick(language, "Fin", "End")}>{row.end_date ?? "N/D"}</td>
          {estimateCells(row, currency, language, labels).map(([label, value, tone]) =>
            <td key={label} data-label={label} title={typeof value === "string" ? value : undefined}>
              {tone ? <span className={styles.change} data-tone={tone}>{value}</span> : value}
            </td>)}
        </tr>) : <tr><td colSpan={11}>{pick(language, "Aucun consensus détaillé publié pour ce titre.", "No detailed consensus is published for this security.")}</td></tr>}</tbody>
      </table></div>
    <aside className={styles.reading}><h3>{pick(language, "Lecture rapide", "Quick read")}</h3>
      {reading.length ? <ul>{reading.map(line => <li key={line}>{line}</li>)}</ul>
        : <p>{pick(language, "Consensus insuffisant pour une lecture.", "Insufficient consensus data.")}</p>}
      <small>{pick(language, "Lecture indicative, sans conseil d’investissement.", "Indicative reading, not investment advice.")}</small>
    </aside>
  </section>;
}
