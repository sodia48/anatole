"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import { focusBase100Reference, focusChartChange, focusChartIndexes, focusChartValue, focusPeriodDate,
  type FocusChartRange, type FocusChartShape } from "@anatole/shared/focus-chart";
import { pick } from "@/lib/i18n";
import styles from "./FocusSeriesChart.module.css";

export type FocusChartSeries = { id: string; label: string; values: (number | null)[];
  lows?: (number | null)[]; highs?: (number | null)[]; nature?: "published" | "estimate" };
type Shape = FocusChartShape | "grouped";
type Saved = { ids?: string[]; shape?: Shape; range?: FocusChartRange; base100?: boolean };
const palette = ["var(--interactive)", "var(--positive-text)", "var(--warning)", "var(--negative-text)", "var(--text-secondary)"];
const ranges: FocusChartRange[] = ["1y", "3y", "5y", "10y", "all"];
const shapes: Shape[] = ["line", "bar", "area", "points", "grouped"];

export function FocusSeriesChart({ title, periods, periodSources, periodCurrencies, series, unit, currency, language, source,
  forecast = false, kind = "line", storageKey }: {
  title: string; periods: string[]; series: FocusChartSeries[];
  unit: "money" | "per_share" | "percent" | "number"; currency?: string; language: "fr" | "en";
  source?: string; periodSources?: (string | null)[]; periodCurrencies?: (string | null)[];
  forecast?: boolean; kind?: "line" | "bar";
  storageKey?: string;
}) {
  const [localSaved, setLocalSaved] = useState<Saved>({});
  const [point, setPoint] = useState<{ index: number; locked: boolean } | null>(null);
  const readSaved = useCallback(() => {
    if (!storageKey) return null;
    try { return localStorage.getItem(`anatole.focus.chart.v3.${storageKey}`); } catch { return null; }
  }, [storageKey]);
  const subscribe = useCallback((notify: () => void) => {
    if (!storageKey) return () => {};
    const event = `anatole-focus-chart:${storageKey}`;
    window.addEventListener(event, notify); window.addEventListener("storage", notify);
    return () => { window.removeEventListener(event, notify); window.removeEventListener("storage", notify); };
  }, [storageKey]);
  const persisted = useSyncExternalStore(subscribe, readSaved, () => null);
  let saved = localSaved;
  if (persisted) try { const value = JSON.parse(persisted) as Saved;
    if (value && typeof value === "object") saved = value; } catch { /* Invalid saved preferences are ignored. */ }
  useEffect(() => {
    if (!point?.locked) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest("[data-focus-point], [data-focus-tooltip]")) setPoint(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setPoint(null); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [point?.locked]);
  const save = (change: Saved) => { const next = { ...saved, ...change };
    if (storageKey) try { localStorage.setItem(`anatole.focus.chart.v3.${storageKey}`, JSON.stringify(next));
      window.dispatchEvent(new Event(`anatole-focus-chart:${storageKey}`));
    } catch { setLocalSaved(next); }
    else setLocalSaved(next);
  };
  const ids = saved.ids?.filter(id => series.some(item => item.id === id)) ?? series.map(item => item.id);
  const visible = series.filter(item => ids.includes(item.id));
  const shape = shapes.includes(saved.shape as Shape) ? saved.shape as Shape : kind;
  const range = ranges.includes(saved.range as FocusChartRange) ? saved.range as FocusChartRange : "all";
  const indexes = focusChartIndexes(periods, range);
  const currencies = new Set(indexes.map(index => periodCurrencies?.[index] ?? currency).filter(Boolean));
  const mixedCurrencies = (unit === "money" || unit === "per_share") && currencies.size > 1;
  const dates = indexes.map(index => focusPeriodDate(periods[index]));
  const dated = dates.length > 0 && dates.every(date => date !== null);
  const firstDate = dated ? Math.min(...dates as number[]) : 0;
  const dateSpan = dated ? Math.max(...dates as number[]) - firstDate : 0;
  const base = focusBase100Reference(visible, indexes);
  const normalized = Boolean(saved.base100 && base !== null && indexes.length > 1 && !mixedCurrencies);
  const chartValue = (item: FocusChartSeries, index: number) => normalized
    ? indexes.indexOf(index) < indexes.indexOf(base as number) ? null
      : focusChartValue(item.values[index], item.values[base as number]) : item.values[index];
  const plotted = mixedCurrencies ? [] : visible.flatMap(item => indexes.flatMap(index => {
    const v = chartValue(item, index);
    return (normalized ? [v] : [v, item.lows?.[index], item.highs?.[index]])
      .filter((number): number is number => number !== null && number !== undefined && Number.isFinite(number));
  }));
  const min = Math.min(0, ...plotted), max = Math.max(0, ...plotted), span = max - min || 1;
  const x = (position: number) => 52 + (indexes.length === 1 ? 282 : dateSpan > 0
    ? ((dates[position] as number) - firstDate) / dateSpan * 564 : position / (indexes.length - 1) * 564);
  const y = (number: number) => 177 - (number - min) / span * 145;
  const locale = language === "fr" ? "fr-CA" : "en-CA";
  const format = (number: number, compact = false, actualCurrency = currency) => new Intl.NumberFormat(locale, {
    ...(unit === "money" || unit === "per_share" ? actualCurrency ? { style: "currency", currency: actualCurrency } : {} : {}),
    ...(compact ? { notation: "compact" } : {}), maximumFractionDigits: compact ? 1 : 2,
  }).format(number) + (unit === "percent" ? " %" : unit === "per_share" ? pick(language, " / action", " / share") : "");
  const unitLabel = mixedCurrencies ? pick(language, "devises multiples", "multiple currencies") : normalized ? "Base 100" : unit === "percent" ? "%" : unit === "per_share"
    ? pick(language, `${currency ?? ""} par action`, `${currency ?? ""} per share`) : unit === "money" ? currency ?? "" : pick(language, "nombre", "number");
  const activePosition = point ? indexes.indexOf(point.index) : -1;
  const choosePoint = (index: number) => setPoint(current => current?.index === index && current.locked
    ? null : { index, locked: true });
  const pointKey = (event: KeyboardEvent<SVGElement>, index: number) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choosePoint(index); }
    if (event.key === "Escape") setPoint(null);
  };
  const toggle = (id: string) => save({ ids: ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id] });
  const shapeLabels: Record<Shape, string> = { line: pick(language, "Courbe", "Line"),
    bar: pick(language, "Barres", "Bars"), area: pick(language, "Aire", "Area"),
    points: pick(language, "Points", "Points"), grouped: pick(language, "Colonnes groupées", "Grouped columns") };
  return <section className={styles.chart} aria-label={title}>
    <header className={styles.header}><div><h3>{title}</h3><small>{forecast ? pick(language, "Prévisions / consensus", "Forecasts / consensus")
      : pick(language, "Observations publiées", "Published observations")} · {unitLabel}</small></div></header>
    <div className={styles.controls}>
      <label>{pick(language, "Type de graphique", "Chart type")}<select value={shape} onChange={event => save({ shape: event.target.value as Shape })}>
        {shapes.map(option => <option value={option} key={option}
          disabled={option === "grouped" && visible.length < 2 || (option === "line" || option === "area") && periods.length < 2}>{shapeLabels[option]}</option>)}
        <option disabled>{pick(language, "Secteurs — réservé aux répartitions", "Pie — distributions only")}</option>
        <option disabled>{pick(language, "Anneau — réservé aux répartitions", "Donut — distributions only")}</option>
      </select></label>
      <label>{pick(language, "Période", "Period")}<select value={range} onChange={event => { save({ range: event.target.value as FocusChartRange }); setPoint(null); }}>
        {ranges.map(option => <option value={option} key={option} disabled={option !== "all" && !periods.some(period => focusPeriodDate(period) !== null)}>
          {option === "all" ? pick(language, "Tout", "All") : pick(language, `${option.slice(0, -1)} an(s)`, `${option.slice(0, -1)} year(s)`)}</option>)}
      </select></label>
      <div className={styles.scale} role="group" aria-label={pick(language, "Échelle", "Scale")}>
        <button type="button" aria-pressed={!normalized} onClick={() => save({ base100: false })}>{pick(language, "Valeurs réelles", "Actual values")}</button>
        <button type="button" aria-pressed={normalized} disabled={mixedCurrencies || base === null || indexes.length < 2} onClick={() => save({ base100: true })}>Base 100</button>
      </div>
    </div>
    <small className={styles.explanation}>{pick(language,
      "Secteurs et anneau sont réservés aux répartitions additives; une évolution temporelle utilise les autres formats.",
      "Pie and donut are reserved for additive distributions; time series use the other formats.")}</small>
    {periods.length < 2 ? <small className={styles.explanation}>{pick(language,
      "Un seul instantané est disponible : aucune évolution historique ne peut être tracée.",
      "Only one snapshot is available: no historical trend can be plotted.")}</small> : null}
    {base === null ? <small className={styles.explanation}>{pick(language,
      "Base 100 indisponible : une observation initiale commune et positive, sans changement de signe, est nécessaire.",
      "Base 100 unavailable: a shared positive starting observation without sign changes is required.")}</small>
      : normalized ? <small className={styles.explanation}>{pick(language,
        `Base 100 au ${periods[base]}. Valeur observée / valeur à cette date × 100.`,
        `Base 100 at ${periods[base]}. Observed value / value on this date × 100.`)}</small> : null}
    {mixedCurrencies ? <p className={styles.explanation} role="status">{pick(language,
      "Graphique indisponible : les périodes utilisent plusieurs devises. Les valeurs exactes restent dans le tableau.",
      "Chart unavailable: periods use multiple currencies. Exact values remain in the table.")}</p> : null}
    {series.length > 1 ? <><div className={styles.presets} role="group" aria-label={pick(language, "Groupes d’indicateurs", "Metric groups")}>
      <button type="button" onClick={() => save({ ids: series.map(item => item.id) })}>{pick(language, "Tous", "All")}</button>
      <button type="button" onClick={() => save({ ids: series.filter(item => item.values.some(v => v !== null)).slice(0, 3).map(item => item.id) })}>{pick(language, "Principaux", "Core metrics")}</button>
      <button type="button" onClick={() => save({ ids: series.map(item => item.id), shape: kind, range: "all", base100: false })}>{pick(language, "Réinitialiser", "Reset")}</button>
    </div><div className={styles.legend} role="group" aria-label={pick(language, "Indicateurs et séries affichées", "Metrics and visible series")}>
      {series.map((item, index) => <button type="button" key={item.id} aria-pressed={ids.includes(item.id)}
        style={{ "--series-color": palette[index % palette.length] } as CSSProperties} onClick={() => toggle(item.id)}>{item.label}</button>)}
    </div></> : null}
    {plotted.length ? <div className={styles.plotWrap} onMouseLeave={() => setPoint(current => current?.locked ? current : null)}>
      <svg className={styles.plot} style={{ minWidth: Math.max(460, indexes.length * 42) }} viewBox="0 0 640 215" role="img"
        aria-label={pick(language, `Graphique ${title}; valeurs exactes dans le tableau`, `${title} chart; exact values in the table`)}>
        {[min, (min + max) / 2, max].map((tick, i) => <g key={i}><line x1="52" x2="616" y1={y(tick)} y2={y(tick)} className={styles.gridLine} />
          <text x="47" y={y(tick) + 3} textAnchor="end" className={styles.axisText}>{normalized ? Math.round(tick) : format(tick, true)}</text></g>)}
        <line x1="52" x2="616" y1={y(0)} y2={y(0)} className={styles.zeroLine} />
        {activePosition >= 0 ? <line x1={x(activePosition)} x2={x(activePosition)} y1="30" y2="180" className={styles.guide} /> : null}
        {indexes.map((index, position) => <text key={`${periods[index]}-${index}`} x={x(position)} y="207" textAnchor="middle" className={styles.axisText}>
          {indexes.length > 12 && position % Math.ceil(indexes.length / 12) !== 0 && position !== indexes.length - 1 ? "" : periods[index]}</text>)}
        {visible.map((item, seriesPosition) => {
          const segments: string[][] = []; let part: string[] = [];
          indexes.forEach((index, position) => { const v = chartValue(item, index);
            if (v === null || v === undefined || !Number.isFinite(v)) { if (part.length) segments.push(part); part = []; }
            else part.push(`${x(position)} ${y(v)}`);
          }); if (part.length) segments.push(part);
          const columns = shape === "bar" || shape === "grouped";
          const width = Math.min(24, 540 / Math.max(1, indexes.length) / Math.max(1, visible.length));
          return <g key={item.id} style={{ color: palette[series.findIndex(value => value.id === item.id) % palette.length] }}>
            {shape === "area" ? segments.map((segment, i) => <path key={i} d={`M${segment[0]} ${y(0)} L${segment.join(" L")} L${segment.at(-1)?.split(" ")[0]} ${y(0)} Z`} className={styles.area} />) : null}
            {shape === "line" || shape === "area" ? segments.map((segment, i) => <path key={i} d={`M${segment.join(" L")}`} className={styles.line} />) : null}
            {indexes.map((index, position) => { const v = chartValue(item, index);
              if (v === null || v === undefined || !Number.isFinite(v)) return null;
              const low = item.lows?.[index], high = item.highs?.[index], actual = item.values[index];
              const validRange = !normalized && low !== null && low !== undefined && high !== null && high !== undefined
                && actual !== null && Number.isFinite(low) && Number.isFinite(high) && low <= actual && actual <= high;
              const detail = `${item.label}, ${periods[index]}: ${format(actual as number, false, periodCurrencies?.[index] ?? currency)}`;
              const columnX = x(position) + (seriesPosition - (visible.length - 1) / 2) * width - width / 2;
              return <g key={`${item.id}-${index}`}>
                {validRange ? <line x1={x(position)} x2={x(position)} y1={y(low)} y2={y(high)} className={styles.range} /> : null}
                {columns ? <rect x={columnX} y={Math.min(y(v), y(0))} width={Math.max(2, width - 2)} height={Math.max(1, Math.abs(y(v) - y(0)))} fill="currentColor" />
                  : <circle cx={x(position)} cy={y(v)} r={point?.index === index ? 7 : 5} className={styles.point} />}
                <circle cx={x(position)} cy={y(v)} r="16" className={styles.hit} data-focus-point tabIndex={0} role="button" aria-label={detail}
                  aria-pressed={point?.index === index && point.locked} onMouseEnter={() => setPoint(current => current?.locked ? current : { index, locked: false })}
                  onFocus={() => setPoint(current => current?.locked ? current : { index, locked: false })}
                  onClick={() => choosePoint(index)} onKeyDown={event => pointKey(event, index)} />
              </g>;
            })}</g>;
        })}
      </svg>
      {point && activePosition >= 0 ? <div className={styles.tooltip} role="status" data-focus-tooltip
        style={{ left: `${Math.min(82, Math.max(18, x(activePosition) / 640 * 100))}%` }}>
        <div className={styles.tooltipHead}><strong>{periods[point.index]}</strong><button type="button" aria-label={pick(language, "Fermer les détails", "Close details")} onClick={() => setPoint(null)}>×</button></div>
        {visible.map(item => { const actual = item.values[point.index], adjusted = chartValue(item, point.index), change = focusChartChange(item.values, indexes, point.index);
          return <div className={styles.tooltipSeries} key={item.id}><strong>{item.label}</strong>
            <small>{item.nature === "estimate" || forecast ? pick(language, "Estimation", "Estimate") : pick(language, "Donnée publiée", "Published data")}</small>
            <span>{actual === null || actual === undefined || !Number.isFinite(actual) ? "N/D" : format(actual, false, periodCurrencies?.[point.index] ?? currency)}
              {normalized && adjusted !== null && adjusted !== undefined ? ` · ${adjusted.toFixed(2)} Base 100` : ""}</span>
            <small>{unitLabel}{change ? ` · ${change.percent === null ? format(change.delta) : `${change.percent > 0 ? "+" : ""}${change.percent.toFixed(2)} %`} ${pick(language, "depuis", "since")} ${periods[change.previous]}` : ""}</small>
            {forecast && item.lows?.[point.index] !== null && item.lows?.[point.index] !== undefined && item.highs?.[point.index] !== null && item.highs?.[point.index] !== undefined
              ? <small>{pick(language, "Bas", "Low")}: {format(item.lows[point.index] as number)} · {pick(language, "Consensus", "Consensus")}: {actual === null ? "N/D" : format(actual as number)} · {pick(language, "Haut", "High")}: {format(item.highs[point.index] as number)}</small> : null}</div>;
        })}
        <small>{pick(language, "Source", "Source")}: {periodSources?.[point.index] ?? source ?? "N/D"}</small>
      </div> : null}
    </div> : !mixedCurrencies ? <p className={styles.empty}>{pick(language, "Série insuffisante pour tracer une tendance.", "Not enough observations to plot a trend.")}</p> : null}
    <details className={styles.data}><summary>{pick(language, "Données exactes du graphique", "Exact chart data")}</summary>
      <div className={styles.dataScroll}><table><thead><tr><th scope="col">{pick(language, "Période", "Period")}</th>
        {visible.map(item => <th scope="col" key={item.id}>{item.label} ({unitLabel})</th>)}
        {periodSources ? <th scope="col">{pick(language, "Source", "Source")}</th> : null}</tr></thead><tbody>
        {indexes.map(index => <tr key={`${periods[index]}-${index}`}><th scope="row">{periods[index]}</th>
          {visible.map(item => <td key={item.id}>{item.values[index] === null || item.values[index] === undefined ? "N/D" : format(item.values[index] as number, false, periodCurrencies?.[index] ?? currency)}</td>)}
          {periodSources ? <td>{periodSources[index] ?? "N/D"}</td> : null}</tr>)}
      </tbody></table></div></details>
    {source ? <small className={styles.source}>{pick(language, "Source", "Source")}: {source}</small> : null}
  </section>;
}
