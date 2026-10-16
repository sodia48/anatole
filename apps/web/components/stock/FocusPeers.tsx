"use client";

import { useEffect, useState } from "react";
import { peerExclusionReason, type PeerComparison, type PeerMeasureComparison, type PeerMeasureValue } from "@anatole/shared/fundamental-intelligence";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { getFundamentalPeers } from "@/lib/api";
import { pick } from "@/lib/i18n";
import { FocusViewMode, useFocusMode } from "./FocusViewMode";
import styles from "./FocusPeers.module.css";

const modes = ["table", "cards", "charts"] as const;
const code = (ticker: string) => ticker.replace(/\.TO$/i, "").toUpperCase();

function number(value: number | null, unit: "percent" | "ratio", language: "fr" | "en") {
  if (value === null) return language === "fr" ? "N/D" : "N/A";
  return `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 }).format(value)}${unit === "percent" ? " %" : "×"}`;
}

function Evidence({ value, language }: { value: PeerMeasureValue; language: "fr" | "en" }) {
  const content = `${value.source_name} · ${value.period_end.slice(0, 10)} · ${pick(language,
    value.source_confidence === "official" ? "officiel" : "secondaire",
    value.source_confidence === "official" ? "official" : "secondary")}`;
  return value.source_url?.startsWith("https://")
    ? <a href={value.source_url} target="_blank" rel="noopener noreferrer">{content}</a>
    : <span>{content}</span>;
}

function MeasureCard({ measure, target, language }: { measure: PeerMeasureComparison; target: string; language: "fr" | "en" }) {
  const current = measure.values.find(item => item.ticker === target);
  return <article className={styles.card}>
    <h4>{language === "fr" ? measure.label_fr : measure.label_en}</h4>
    <p>{pick(language, "Cible", "Target")} : <strong>{number(current?.value ?? null, measure.unit, language)}</strong></p>
    <p>{pick(language, "Médiane", "Median")} : {number(measure.median, measure.unit, language)} · {pick(language, "Rang", "Rank")} : {measure.rank ?? "N/D"}</p>
    <p>{measure.sample_size} / {measure.minimum_sample_size} {pick(language, "sociétés requises", "companies required")}</p>
    <p className={styles.muted}>{language === "fr" ? measure.explanation_fr : measure.explanation_en}</p>
    {current ? <Evidence value={current} language={language} /> : null}
  </article>;
}

export function FocusPeers({ ticker }: { ticker: string }) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [mode, choose] = useFocusMode("anatole.focus.peers.view.v1", modes);
  const [selection, setSelection] = useState<string[] | undefined>(undefined);
  const [data, setData] = useState<PeerComparison | null>(null);
  const [search, setSearch] = useState("");
  const [keys, setKeys] = useState<string[]>(["revenue_growth", "net_margin", "cash_conversion"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void getFundamentalPeers(ticker, selection, controller.signal).then(value => {
      if (!controller.signal.aborted) { setData(value); setLoading(false); setError(false); }
    }).catch(() => { if (!controller.signal.aborted) { setLoading(false); setError(true); } });
    return () => controller.abort();
  }, [ticker, selection, retry]);

  const current = data?.target.replace(/\.TO$/i, "").toUpperCase() === code(ticker) ? data : null;
  const selected = selection ?? current?.selected.map(code) ?? [];
  const shown = current?.measures.filter(item => keys.includes(item.key)) ?? [];
  const candidates = current?.candidates.filter(item => `${item.ticker} ${item.name}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const toggle = (item: string) => {
    const next = selected.includes(item) ? selected.filter(value => value !== item) : [...selected, item];
    if (next.length > 8) return;
    setLoading(true); setSelection(next);
  };
  return <section className={styles.panel} aria-label={pick(language, "Comparateur sectoriel", "Sector peer comparison")}>
    <header><span className="eyebrow">FUNDAMENTAL INTELLIGENCE 360</span>
      <h2>{pick(language, "Comparateur sectoriel", "Sector peer comparison")}</h2>
      {current ? <p className={styles.muted}>{language === "fr" ? current.method_fr : current.method_en}</p> : null}
      {current ? <p className={styles.muted}>{current.universe_source} · {current.universe_as_of ?? "N/D"}</p> : null}
    </header>
    {current ? <>
      <details><summary>{pick(language, "Choisir ou remplacer les sociétés", "Choose or replace peers")} ({selected.length}/8)</summary>
        <label>{pick(language, "Rechercher un pair", "Search peers")}<input value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className={styles.candidates}>{candidates.map(item => <button type="button" key={item.ticker}
          aria-pressed={selected.includes(item.ticker)} disabled={!selected.includes(item.ticker) && selected.length >= 8}
          onClick={() => toggle(item.ticker)}>{item.ticker} · {item.name}</button>)}</div>
        <p className={styles.muted}>{pick(language, "Sélection vérifiée après chargement : activité, capitalisation, devise et période.",
          "Selection is verified after loading: business, market cap, currency and period.")}</p>
      </details>
      {Object.entries(current.excluded).length ? <div role="status" className={styles.excluded}>
        {Object.entries(current.excluded).map(([item, reason]) => <p key={item}>{item} : {peerExclusionReason(reason, language)}</p>)}
      </div> : null}
      <FocusViewMode mode={mode} choose={choose} modes={modes} language={language}
        label={pick(language, "Mode des comparaisons", "Peer comparison mode")} />
      <fieldset className={styles.metrics}><legend>{pick(language, "Indicateurs", "Metrics")}</legend>
        {current.measures.map(item => <label key={item.key}><input type="checkbox" checked={keys.includes(item.key)}
          onChange={() => setKeys(previous => previous.includes(item.key) ? previous.filter(key => key !== item.key) : [...previous, item.key])} />
          {language === "fr" ? item.label_fr : item.label_en}</label>)}
      </fieldset>
      {mode === "cards" ? <div className={styles.cards}>{shown.map(item => <MeasureCard key={item.key} measure={item} target={current.target} language={language} />)}</div> : null}
      {mode === "table" ? <div className={styles.tableWrap}><table><caption>{pick(language, "Comparaison des indicateurs sélectionnés", "Selected metric comparison")}</caption>
        <thead><tr><th>{pick(language, "Indicateur", "Metric")}</th><th>{code(current.target)}</th>{current.selected.map(item => <th key={item}>{code(item)}</th>)}<th>{pick(language, "Médiane", "Median")}</th><th>{pick(language, "Rang", "Rank")}</th></tr></thead>
        <tbody>{shown.map(item => <tr key={item.key}><th>{language === "fr" ? item.label_fr : item.label_en}</th>
          {[current.target, ...current.selected].map(tickerValue => { const value = item.values.find(point => point.ticker === tickerValue);
            return <td key={tickerValue}>{number(value?.value ?? null, item.unit, language)}{value ? <small><Evidence value={value} language={language} /></small> : null}</td>; })}
          <td>{number(item.median, item.unit, language)}</td><td>{item.rank ?? "N/D"}</td></tr>)}</tbody></table></div> : null}
      {mode === "charts" ? <div className={styles.cards}>{shown.map(item => {
        const bound = Math.max(...item.values.map(point => Math.abs(point.value)), 1);
        return <article key={item.key} className={styles.card}><h4>{language === "fr" ? item.label_fr : item.label_en}</h4>
          {item.values.map(value => <div key={value.ticker} className={styles.barRow}>
            <span>{code(value.ticker)} · {number(value.value, item.unit, language)}</span>
            <div className={styles.track}><div className={styles.bar} style={{ width: `${Math.abs(value.value) / bound * 100}%` }} /></div>
            <Evidence value={value} language={language} />
          </div>)}<p className={styles.muted}>{language === "fr" ? item.explanation_fr : item.explanation_en}</p>
        </article>;
      })}</div> : null}
    </> : null}
    {loading ? <p role="status">{pick(language, "Chargement des pairs…", "Loading peers…")}</p> : null}
    {error ? <p role="alert">{pick(language, "Comparaison indisponible.", "Comparison unavailable.")} <button type="button" onClick={() => { setLoading(true); setError(false); setRetry(value => value + 1); }}>{pick(language, "Réessayer", "Retry")}</button></p> : null}
  </section>;
}
