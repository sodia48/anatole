"use client";

import { useState, type CSSProperties } from "react";
import { pick } from "@/lib/i18n";
import styles from "./FocusSeriesChart.module.css";

export type FocusChartSeries = {
  id: string;
  label: string;
  values: (number | null)[];
  lows?: (number | null)[];
  highs?: (number | null)[];
};

export function FocusSeriesChart({ title, periods, periodSources, series, unit, currency, language, source, forecast = false, kind = "line" }: {
  title: string; periods: string[]; series: FocusChartSeries[];
  unit: "money" | "percent" | "number"; currency?: string; language: "fr" | "en";
  source?: string; periodSources?: (string | null)[]; forecast?: boolean; kind?: "line" | "bar";
}) {
  const [selected, setSelected] = useState<string[] | null>(null);
  const [recent, setRecent] = useState(periods.length > 8);
  const availableIds = series.map(item => item.id);
  const active = selected?.filter(id => availableIds.includes(id)) ?? availableIds;
  const visible = active.length ? series.filter(item => active.includes(item.id)) : series;
  const start = recent && periods.length > 6 ? periods.length - 6 : 0;
  const labels = periods.slice(start);
  const plotted = visible.flatMap(item => [item.values, item.lows ?? [], item.highs ?? []]
    .flatMap(values => values.slice(start).filter((value): value is number => value !== null && Number.isFinite(value))));
  const minimum = Math.min(0, ...plotted);
  const maximum = Math.max(0, ...plotted);
  const span = maximum - minimum || 1;
  const x = (index: number) => 48 + (labels.length === 1 ? 0 : index * 568 / (labels.length - 1));
  const y = (value: number) => 177 - (value - minimum) / span * 145;
  const locale = language === "fr" ? "fr-CA" : "en-CA";
  const format = (value: number, compact = false) => new Intl.NumberFormat(locale, {
    ...(unit === "money" && currency ? { style: "currency", currency } : {}),
    ...(compact ? { notation: "compact" } : {}),
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value) + (unit === "percent" ? " %" : "");
  const canPlot = labels.length >= 2 && visible.some(item => item.values.slice(start)
    .filter(value => value !== null && Number.isFinite(value)).length >= 2);
  const colors = ["var(--interactive)", "var(--positive-text)", "var(--warning)", "var(--negative-text)", "var(--text-secondary)"];

  return <section className={styles.chart} aria-label={title}>
    <header className={styles.header}><div><h3>{title}</h3>
      <small>{forecast ? pick(language, "Prévisions / consensus", "Forecasts / consensus") : pick(language, "Observations publiées", "Published observations")}</small></div>
      {periods.length > 6 ? <button type="button" aria-pressed={recent} onClick={() => setRecent(!recent)}>
        {recent ? pick(language, "Toutes les périodes", "All periods") : pick(language, "6 périodes récentes", "Recent 6 periods")}
      </button> : null}</header>
    {series.length > 1 ? <div className={styles.legend} role="group" aria-label={pick(language, "Séries affichées", "Visible series")}>
      {series.map((item, index) => <button type="button" key={item.id} aria-pressed={visible.some(value => value.id === item.id)}
        style={{ "--series-color": colors[index % colors.length] } as CSSProperties}
        onClick={() => {
          const next = active.includes(item.id) ? active.filter(id => id !== item.id) : [...active, item.id];
          if (next.length) setSelected(next);
        }}>{item.label}</button>)}
    </div> : null}
    {canPlot ? <div className={styles.plotWrap}><svg className={styles.plot} viewBox="0 0 640 215" role="img"
      aria-label={pick(language, `Graphique ${title}; valeurs exactes dans le tableau`, `${title} chart; exact values in the table`)}>
      {[minimum, (minimum + maximum) / 2, maximum].map((tick, index) => <g key={index}>
        <line x1="48" x2="616" y1={y(tick)} y2={y(tick)} className={styles.gridLine} />
        <text x="43" y={y(tick) + 3} textAnchor="end" className={styles.axisText}>{format(tick, true)}</text>
      </g>)}
      <line x1="48" x2="616" y1={y(0)} y2={y(0)} className={styles.zeroLine} />
      {labels.map((label, index) => <text key={`${label}-${index}`} x={x(index)} y="207" textAnchor="middle" className={styles.axisText}>{label}</text>)}
      {visible.map((item, seriesIndex) => {
        const color = colors[series.findIndex(value => value.id === item.id) % colors.length];
        const values = item.values.slice(start);
        const segments: string[] = [];
        let path = "";
        values.forEach((value, index) => {
          if (value === null || !Number.isFinite(value)) {
            if (path) segments.push(path);
            path = "";
          } else path += `${path ? " L" : "M"}${x(index)} ${y(value)}`;
        });
        if (path) segments.push(path);
        return <g key={item.id} style={{ color }}>
          {kind === "line" ? segments.map((segment, index) => <path key={index} d={segment} className={styles.line} />) : null}
          {values.map((value, index) => {
            if (value === null || !Number.isFinite(value)) return null;
            const low = item.lows?.[start + index];
            const high = item.highs?.[start + index];
            const range = low !== null && high !== null && low !== undefined && high !== undefined
              && Number.isFinite(low) && Number.isFinite(high) && low <= value && value <= high;
            const detail = `${item.label}, ${labels[index]}: ${format(value)}${range ? ` (${format(low)} – ${format(high)})` : ""}${periodSources?.[start + index] ? ` · ${periodSources[start + index]}` : ""}`;
            const barWidth = Math.min(22, 568 / labels.length / (visible.length + 1));
            const barX = x(index) + (seriesIndex - (visible.length - 1) / 2) * barWidth - barWidth / 2;
            return <g key={`${item.id}-${index}`}>
              {kind === "bar" ? <rect x={barX} y={Math.min(y(value), y(0))} width={barWidth - 2}
                height={Math.max(1, Math.abs(y(value) - y(0)))} fill="currentColor" tabIndex={0} aria-label={detail}><title>{detail}</title></rect>
                : <>{range ? <line x1={x(index)} x2={x(index)} y1={y(low)} y2={y(high)} className={styles.range} /> : null}
                  <circle cx={x(index)} cy={y(value)} r="5" className={styles.point} tabIndex={0} aria-label={detail}><title>{detail}</title></circle></>}
            </g>;
          })}
        </g>;
      })}
    </svg></div> : <p className={styles.empty}>{pick(language, "Série insuffisante pour tracer une tendance.", "Not enough observations to plot a trend.")}</p>}
    <details className={styles.data}><summary>{pick(language, "Données exactes du graphique", "Exact chart data")}</summary>
      <div className={styles.dataScroll}><table><thead><tr><th scope="col">{pick(language, "Période", "Period")}</th>
        {visible.map(item => <th scope="col" key={item.id}>{item.label}</th>)}
        {periodSources ? <th scope="col">{pick(language, "Source", "Source")}</th> : null}</tr></thead><tbody>
        {labels.map((label, index) => <tr key={`${label}-${index}`}><th scope="row">{label}</th>
          {visible.map(item => <td key={item.id}>{item.values[start + index] === null || item.values[start + index] === undefined
            ? "N/D" : format(item.values[start + index] as number)}</td>)}
          {periodSources ? <td>{periodSources[start + index] ?? "N/D"}</td> : null}</tr>)}
      </tbody></table></div></details>
    {source ? <small className={styles.source}>{pick(language, "Source", "Source")}: {source}</small> : null}
  </section>;
}
