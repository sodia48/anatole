"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import type { FocusChartRange, FocusChartShape } from "@anatole/shared/focus-chart";
import { pick } from "@/lib/i18n";
import styles from "./FocusSeriesChart.module.css";

const tr = pick;

export type FocusChartSeries = { id: string; label: string; values: (number | null)[];
  lows?: (number | null)[]; highs?: (number | null)[]; nature?: "published" | "estimate";
  sources?: (string | null)[] };
type Shape = FocusChartShape | "grouped";
type Saved = { ids?: string[]; shape?: Shape; range?: FocusChartRange; base100?: boolean };
const palette = ["var(--interactive)", "var(--positive-text)", "var(--warning)", "var(--negative-text)", "var(--text-secondary)"];
const ranges: FocusChartRange[] = ["1y", "3y", "5y", "10y", "all"];
const shapes: Shape[] = ["line", "bar", "area", "points", "grouped"];
type ChartLayout = { gaps: number[]; zeroBased: boolean; min: number; max: number; left: number; right: number;
  x: (position: number) => number; y: (value: number) => number; ticks: number[]; label: (period: string) => string };
type LayoutModule = { createLayout: (periods: string[], indexes: number[], plotted: number[], shape: Shape,
  width: number, language: "fr" | "en", periodLabels?: string[]) => ChartLayout;
  indexes: (periods: string[], range: FocusChartRange) => number[];
  defaultRange: (periods: string[]) => FocusChartRange;
  periodDate: (period: string) => number | null;
  base100Reference: (series: FocusChartSeries[], indexes: number[]) => number | null;
  chartValue: (value: number | null | undefined, reference: number | null | undefined) => number | null;
  chartChange: (values: (number | null)[], indexes: number[], at: number) => { delta: number; percent: number | null; previous: number } | null;
  sizeGroups: (series: FocusChartSeries[]) => { major: string[]; other: string[] } | null;
  chartCopy: (language: "fr" | "en", key: "gap" | "adjusted" | "unknown" | "mixed" | "positive" | "base100" | "single" | "major" | "other" | "disparity" | "type" | "range" | "scale" | "actual" | "all" | "core" | "reset" | "groups" | "legend" | "source" | "estimate" | "published" | "since" | "low" | "consensus" | "high" | "financial" | "details", period?: string) => string;
  shapeLabel: (language: "fr" | "en", shape: Shape) => string;
  rangeLabel: (language: "fr" | "en", range: FocusChartRange) => string;
  unitLabel: (language: "fr" | "en", unit: string, currency: string | undefined, mixed: boolean, normalized: boolean) => string;
  formatChartValue: (value: number, compact: boolean, currency: string | undefined,
    unit: string, language: "fr" | "en") => string };

export function FocusSeriesChart({ title, periods, periodLabels, periodSources, periodCurrencies, series, unit, currency, language, source,
  forecast = false, kind = "line", storageKey }: {
  title: string; periods: string[]; periodLabels?: string[]; series: FocusChartSeries[];
  unit: "money" | "per_share" | "percent" | "number"; currency?: string; language: "fr" | "en";
  source?: string; periodSources?: (string | null)[]; periodCurrencies?: (string | null)[];
  forecast?: boolean; kind?: "line" | "bar";
  storageKey?: string;
}) {
  const [localSaved, setLocalSaved] = useState<Saved>({});
  const [point, setPoint] = useState<{ index: number; locked: boolean } | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(640);
  const [layoutModule, setLayoutModule] = useState<LayoutModule | null>(null);
  const [layoutFailed, setLayoutFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const moduleUrl = "/focus-chart-layout.mjs";
    void import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl)
      .then(value => { if (active) setLayoutModule(value as LayoutModule); })
      .catch(() => { if (active) setLayoutFailed(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setPlotWidth(Math.max(320, node.clientWidth)));
    observer.observe(node);
    setPlotWidth(Math.max(320, node.clientWidth));
    return () => observer.disconnect();
  }, [periods.length, series.length, layoutModule]);
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
  const groups = unit === "money" ? layoutModule?.sizeGroups(series) : null;
  const ids = saved.ids?.filter(id => series.some(item => item.id === id)) ?? groups?.major ?? series.map(item => item.id);
  const visible = series.filter(item => ids.includes(item.id));
  const hasSeriesSources = visible.some(item => item.sources);
  const shape = shapes.includes(saved.shape as Shape) ? saved.shape as Shape : kind;
  const range = ranges.includes(saved.range as FocusChartRange) ? saved.range as FocusChartRange : layoutModule?.defaultRange(periods) ?? "all";
  const indexes = layoutModule?.indexes(periods, range) ?? [];
  const currencies = new Set(indexes.map(index => periodCurrencies ? periodCurrencies[index] : currency).filter(Boolean));
  const unknownCurrency = (unit === "money" || unit === "per_share") && Boolean(periodCurrencies?.length)
    && indexes.some(index => !periodCurrencies?.[index]);
  const mixedCurrencies = (unit === "money" || unit === "per_share") && (currencies.size > 1 || unknownCurrency);
  const base = layoutModule?.base100Reference(visible, indexes) ?? null;
  const normalized = Boolean(saved.base100 && base !== null && indexes.length > 1 && !mixedCurrencies);
  const chartValue = (item: FocusChartSeries, index: number) => normalized
    ? indexes.indexOf(index) < indexes.indexOf(base as number) ? null
      : layoutModule?.chartValue(item.values[index], item.values[base as number]) : item.values[index];
  const plotted = mixedCurrencies ? [] : visible.flatMap(item => indexes.flatMap(index => {
    const v = chartValue(item, index);
    return (normalized ? [v] : [v, item.lows?.[index], item.highs?.[index]])
      .filter((number): number is number => number !== null && number !== undefined && Number.isFinite(number));
  }));
  const columns = shape === "bar" || shape === "grouped";
  const layout = layoutModule?.createLayout(periods, indexes, plotted, shape, plotWidth, language, periodLabels);
  const { gaps = [], zeroBased = false, min = 0, max = 0, left = 82, right = 22,
    x = () => 0, y = () => 0, ticks: tickPositions = [],
    label: periodLabel = (period: string) => period } = layout ?? {};
  const format = (number: number, compact = false, actualCurrency = currency) =>
    layoutModule?.formatChartValue(number, compact, actualCurrency, unit, language) ?? String(number);
  const labelFor = (index: number) => periodLabels?.[index] ?? periodLabel(periods[index]);
  const copy = (key: "gap" | "adjusted" | "unknown" | "mixed" | "positive" | "base100" | "single" | "major" | "other" | "disparity" | "type" | "range" | "scale" | "actual" | "all" | "core" | "reset" | "groups" | "legend" | "source" | "estimate" | "published" | "since" | "low" | "consensus" | "high" | "financial" | "details", period?: string) => layoutModule?.chartCopy(language, key, period);
  const unitLabel = layoutModule?.unitLabel(language, unit, currency, mixedCurrencies, normalized) ?? (currency ?? unit);
  const activePosition = point ? indexes.indexOf(point.index) : -1;
  const choosePoint = (index: number) => setPoint(current => current?.index === index && current.locked
    ? null : { index, locked: true });
  const pointKey = (event: KeyboardEvent<SVGElement>, index: number) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choosePoint(index); }
    if (event.key === "Escape") setPoint(null);
  };
  const toggle = (id: string) => save({ ids: ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id] });
  return <section className={styles.chart} aria-label={title}>
    <header className={styles.header}><div><h3>{title}</h3><small>{forecast ? tr(language, "Prévisions / consensus", "Forecasts / consensus")
      : tr(language, "Observations publiées", "Published observations")} · {unitLabel}</small></div></header>
    <div className={styles.controls}>
      <label>{copy("type")}<select value={shape} onChange={event => save({ shape: event.target.value as Shape })}>
        {shapes.map(option => <option value={option} key={option}
          disabled={option === "grouped" && visible.length < 2 || (option === "line" || option === "area") && periods.length < 2}>{layoutModule?.shapeLabel(language, option) ?? option}</option>)}
      </select></label>
      <label>{copy("range")}<select value={range} onChange={event => { save({ range: event.target.value as FocusChartRange }); setPoint(null); }}>
        {ranges.map(option => <option value={option} key={option} disabled={option !== "all" && !periods.some(period => layoutModule?.periodDate(period) !== null)}>
          {layoutModule?.rangeLabel(language, option) ?? option}</option>)}
      </select></label>
      <div className={styles.scale} role="group" aria-label={copy("scale")}>
        <button type="button" aria-pressed={!normalized} onClick={() => save({ base100: false })}>{copy("actual")}</button>
        <button type="button" aria-pressed={normalized} disabled={mixedCurrencies || base === null || indexes.length < 2}
          title={base === null ? copy("positive") : undefined}
          onClick={() => save({ base100: true })}>Base 100</button>
      </div>
    </div>
    {periods.length < 2 || normalized && base !== null || gaps.length || groups || !zeroBased && min > 0
      ? <details className={styles.help}><summary>{tr(language, "Comprendre le graphique", "About this chart")}</summary>
        {periods.length < 2 ? <p>{copy("single")}</p> : null}
        {normalized && base !== null ? <p>{copy("base100", periods[base])}</p> : null}
        {gaps.length ? <p>{copy("gap")}</p> : null}
        {groups && ids.some(id => groups.major.includes(id)) && ids.some(id => groups.other.includes(id))
          ? <p>{copy("disparity")}</p> : null}
        {!zeroBased && min > 0 ? <p>{copy("adjusted")}</p> : null}
      </details> : null}
    {mixedCurrencies ? <p className={styles.explanation} role="status">{copy(unknownCurrency ? "unknown" : "mixed")}</p> : null}
    {series.length > 1 ? <><div className={styles.presets} role="group" aria-label={copy("groups")}>
      <button type="button" onClick={() => save({ ids: series.map(item => item.id) })}>{copy("all")}</button>
      <button type="button" onClick={() => save({ ids: series.filter(item => item.values.some(v => v !== null)).slice(0, 3).map(item => item.id) })}>{copy("core")}</button>
      {groups ? <><button type="button" onClick={() => save({ ids: groups.major })}>{copy("major")}</button>
        <button type="button" onClick={() => save({ ids: groups.other })}>{copy("other")}</button></> : null}
      <button type="button" onClick={() => save({ ids: groups?.major ?? series.map(item => item.id), shape: kind,
        range: layoutModule?.defaultRange(periods) ?? "all", base100: false })}>{copy("reset")}</button>
    </div><div className={styles.legend} role="group" aria-label={copy("legend")}>
      {series.map((item, index) => <button type="button" key={item.id} aria-pressed={ids.includes(item.id)}
        style={{ "--series-color": palette[index % palette.length] } as CSSProperties} onClick={() => toggle(item.id)}>{item.label}</button>)}
    </div></> : null}
    {layoutFailed ? <p role="status">{tr(language, "Graphique temporairement indisponible; données exactes ci-dessous.",
      "Chart temporarily unavailable; exact data below.")}</p> : null}
    {plotted.length && layout ? <div ref={plotRef} className={styles.plotWrap} onMouseLeave={() => setPoint(current => current?.locked ? current : null)}>
      <svg className={styles.plot} viewBox={`0 0 ${plotWidth} 215`} role="img"
        aria-label={tr(language, `Graphique ${title}; valeurs exactes dans le tableau`, `${title} chart; exact values in the table`)}>
        {[min, (min + max) / 2, max].map((tick, i) => <g key={i}><line x1={left} x2={plotWidth - right} y1={y(tick)} y2={y(tick)} className={styles.gridLine} />
          <text x={left - 8} y={y(tick) + 3} textAnchor="end" className={styles.axisText}>{normalized ? Math.round(tick) : format(tick, true)}</text></g>)}
        {min <= 0 && max >= 0 ? <line x1={left} x2={plotWidth - right} y1={y(0)} y2={y(0)} className={styles.zeroLine} /> : null}
        {gaps.map(position => <g key={`gap-${position}`} aria-label={tr(language, "Intervalle sans données", "Missing data interval")}>
          <line x1={(x(position - 1) + x(position)) / 2} x2={(x(position - 1) + x(position)) / 2} y1="37" y2="178" className={styles.gapLine} />
          <text x={(x(position - 1) + x(position)) / 2} y="28" textAnchor="middle" className={styles.axisText}>⋯</text></g>)}
        {activePosition >= 0 ? <line x1={x(activePosition)} x2={x(activePosition)} y1="30" y2="180" className={styles.guide} /> : null}
        {tickPositions.map(position => <text key={`${periods[indexes[position]]}-${position}`} x={x(position)} y="207" textAnchor="middle" className={styles.axisText}>
          {labelFor(indexes[position])}</text>)}
        {visible.map((item, seriesPosition) => {
          const segments: string[][] = []; let part: string[] = [];
          indexes.forEach((index, position) => { const v = chartValue(item, index);
            if (v === null || v === undefined || !Number.isFinite(v)) { if (part.length) segments.push(part); part = []; }
            else { if (gaps.includes(position) && part.length) { segments.push(part); part = []; }
              part.push(`${x(position)} ${y(v)}`); }
          }); if (part.length) segments.push(part);
          const width = Math.min(24, (plotWidth - left - right) / Math.max(1, indexes.length) / Math.max(1, visible.length));
          return <g key={item.id} style={{ color: palette[series.findIndex(value => value.id === item.id) % palette.length] }}>
            {shape === "area" ? segments.map((segment, i) => <path key={i} d={`M${segment[0]} ${y(0)} L${segment.join(" L")} L${segment.at(-1)?.split(" ")[0]} ${y(0)} Z`} className={styles.area} />) : null}
            {shape === "line" || shape === "area" ? segments.map((segment, i) => <path key={i} d={`M${segment.join(" L")}`} className={styles.line} />) : null}
            {indexes.map((index, position) => { const v = chartValue(item, index);
              if (v === null || v === undefined || !Number.isFinite(v)) return null;
              const low = item.lows?.[index], high = item.highs?.[index], actual = item.values[index];
              const validRange = !normalized && low !== null && low !== undefined && high !== null && high !== undefined
                && actual !== null && Number.isFinite(low) && Number.isFinite(high) && low <= actual && actual <= high;
              const detailedLabel = periodLabels?.[index] && periodLabels[index] !== periods[index].slice(0, 4)
                ? `${labelFor(index)}, ` : "";
              const detail = `${item.label}, ${detailedLabel}${periods[index]}: ${format(actual as number, false, periodCurrencies ? periodCurrencies[index] ?? "" : currency)}`;
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
        style={{ left: `${Math.min(82, Math.max(18, x(activePosition) / plotWidth * 100))}%` }}>
        <div className={styles.tooltipHead}><strong>{labelFor(point.index)} · {periods[point.index]}</strong><button type="button" aria-label={tr(language, "Fermer les détails", "Close details")} onClick={() => setPoint(null)}>×</button></div>
        {visible.map(item => { const actual = item.values[point.index], adjusted = chartValue(item, point.index), change = layoutModule?.chartChange(item.values, indexes, point.index);
          return <div className={styles.tooltipSeries} key={item.id}><strong>{item.label}</strong>
            <small>{copy(item.nature === "estimate" || forecast ? "estimate" : "published")}</small>
            <span>{actual === null || actual === undefined || !Number.isFinite(actual) ? "N/D" : format(actual, false, periodCurrencies ? periodCurrencies[point.index] ?? "" : currency)}
              {normalized && adjusted !== null && adjusted !== undefined ? ` · ${adjusted.toFixed(2)} Base 100` : ""}</span>
            <small>{unitLabel}{change ? ` · ${change.percent === null ? format(change.delta) : `${change.percent > 0 ? "+" : ""}${change.percent.toFixed(2)} %`} ${copy("since")} ${periods[change.previous]}` : ""}</small>
            {item.sources ? <small>{copy("source")}: {item.sources[point.index] ?? "N/D"}</small> : null}
            {forecast && item.lows?.[point.index] !== null && item.lows?.[point.index] !== undefined && item.highs?.[point.index] !== null && item.highs?.[point.index] !== undefined
              ? <small>{copy("low")}: {format(item.lows[point.index] as number)} · {copy("consensus")}: {actual === null ? "N/D" : format(actual as number)} · {copy("high")}: {format(item.highs[point.index] as number)}</small> : null}</div>;
        })}
        {!hasSeriesSources ? <small>{copy("source")}: {periodSources?.[point.index] ?? source ?? "N/D"}</small> : null}
      </div> : null}
    </div> : !plotted.length && !mixedCurrencies ? <p className={styles.empty}>{tr(language, "Série insuffisante pour tracer une tendance.", "Not enough observations to plot a trend.")}</p> : null}
    <details className={styles.data}><summary>{copy("financial")} · {indexes.length ? `${labelFor(indexes[0])}–${labelFor(indexes.at(-1) as number)}` : "N/D"} · {copy("details")}</summary>
      <div className={styles.dataScroll}><table><thead><tr><th scope="col">{tr(language, "Période", "Period")}</th>
        {visible.map(item => <th scope="col" key={item.id}>{item.label} ({unitLabel})</th>)}
        {periodSources && !hasSeriesSources ? <th scope="col">{tr(language, "Source", "Source")}</th> : null}</tr></thead><tbody>
        {indexes.map(index => <tr key={`${periods[index]}-${index}`}><th scope="row">{labelFor(index)} · {periods[index]}</th>
          {visible.map(item => <td key={item.id}>{item.values[index] === null || item.values[index] === undefined ? "N/D" : format(item.values[index] as number, false, periodCurrencies ? periodCurrencies[index] ?? "" : currency)}
            {item.sources?.[index] ? <small className={styles.cellSource}>{item.sources[index]}</small> : null}</td>)}
          {periodSources && !hasSeriesSources ? <td>{periodSources[index] ?? "N/D"}</td> : null}</tr>)}
      </tbody></table></div></details>
  </section>;
}
