"use client";

import { useEffect, useRef, useState } from "react";
import { peerExclusionReason, type PeerComparison, type PeerMeasureValue } from "@anatole/shared/fundamental-intelligence";
import { comparableDelta, exactFinancialNumber, formatFinancialNumber, signedBar } from "@anatole/shared/financial-display";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { getFundamentalPeers } from "@/lib/api";
import { pick } from "@/lib/i18n";
import { FocusViewMode, useFocusMode } from "./FocusViewMode";
import styles from "./FocusPeers.module.css";

const tr = pick;

const modes = ["table", "cards", "charts"] as const;
const code = (ticker: string) => ticker.replace(/\.TO$/i, "").toUpperCase();

function number(value: number | null, unit: "percent" | "ratio", language: "fr" | "en") {
  return formatFinancialNumber(value, { language, unit });
}

function Evidence({ value, language }: { value: PeerMeasureValue; language: "fr" | "en" }) {
  const content = `${value.source_name} · ${value.period_end.slice(0, 10)} · ${tr(language,
    value.source_confidence === "official" ? "officiel" : "secondaire",
    value.source_confidence === "official" ? "official" : "secondary")}`;
  return value.source_url?.startsWith("https://")
    ? <a href={value.source_url} target="_blank" rel="noopener noreferrer">{content}</a>
    : <span>{content}</span>;
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
  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;
    void getFundamentalPeers(ticker, selection, controller.signal).then(value => {
      if (!controller.signal.aborted && id === requestId.current) { setData(value); setLoading(false); setError(false); }
    }).catch(() => { if (!controller.signal.aborted && id === requestId.current) { setLoading(false); setError(true); } });
    return () => controller.abort();
  }, [ticker, selection, retry]);

  const current = data?.target.replace(/\.TO$/i, "").toUpperCase() === code(ticker) ? data : null;
  const selected = current?.selected.map(code) ?? [];
  const pending = loading && selection ? selection.filter(item => !selected.includes(item)) : [];
  const shown = current?.measures.filter(item => keys.includes(item.key) && item.values.length >= 2)
    .sort((a, b) => b.values.length - a.values.length) ?? [];
  const showSectorStats = shown.some(item => item.sample_size >= item.minimum_sample_size && item.median !== null);
  const candidates = current?.candidates.filter(item => `${item.ticker} ${item.name} ${item.industry ?? ""}`.toLowerCase().includes(search.toLowerCase())).slice(0, 20) ?? [];
  const toggle = (item: string) => {
    const next = selected.includes(item) ? selected.filter(value => value !== item) : [...selected, item];
    if (next.length > 8) return;
    setLoading(true); setSelection(next);
  };
  return <section className={styles.panel} aria-label={tr(language, "Comparateur sectoriel", "Sector peer comparison")}>
    <header><span className="eyebrow">FUNDAMENTAL INTELLIGENCE 360</span>
      <h2>{tr(language, "Comparateur sectoriel", "Sector peer comparison")}</h2>
      {current ? <p>{tr(language, "Entreprises comparées", "Compared companies")} : {code(current.target)}{selected.length ? ` · ${selected.join(" · ")}` : ` · ${tr(language, "aucun pair admissible", "no eligible peer")}`}</p> : null}
    </header>
    {current ? <>
      <details><summary>{tr(language, "Recherche et filtres avancés", "Search and advanced filters")} ({selected.length}/8)</summary>
        <p className={styles.muted}>{language === "fr" ? current.method_fr : current.method_en} · {current.universe_source} · {current.universe_as_of ?? "N/D"}</p>
        <p>{tr(language, "Pairs admissibles", "Eligible peers")} : {selected.join(", ") || tr(language, "aucun", "none")}{pending.length ? ` · ${tr(language, "Validation en cours", "Validating")}: ${pending.join(", ")}` : ""}</p>
        <label>{tr(language, "Rechercher un pair", "Search peers")}<input value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className={styles.candidates}>{candidates.map((item, index) => <div key={item.ticker} className={styles.candidate}>
          {index === 0 || candidates[index - 1]?.comparability !== item.comparability ? <h3>{tr(language,
            item.comparability === "direct" ? "Comparables directs" : item.comparability === "related" ? "Activités connexes" : "Autres entreprises du secteur",
            item.comparability === "direct" ? "Direct peers" : item.comparability === "related" ? "Related businesses" : "Other sector companies")}</h3> : null}
          <button type="button" aria-pressed={selected.includes(code(item.ticker))} disabled={loading || (item.comparability !== "direct" && !selected.includes(code(item.ticker))) || (!selected.includes(code(item.ticker)) && selected.length >= 8)}
            onClick={() => toggle(code(item.ticker))}>{item.ticker} · {item.name}</button>
          <small>{item.industry ?? tr(language, "activité non vérifiée", "industry unverified")}{item.reason ? ` · ${peerExclusionReason(item.reason, language)}` : ""}</small>
        </div>)}</div>
        <p className={styles.muted}>{tr(language, "Sélection vérifiée après chargement : activité, capitalisation, devise et période.",
          "Selection is verified after loading: business, market cap, currency and period.")}</p>
      </details>
      {Object.entries(current.excluded).length ? <details className={styles.excluded}><summary>{tr(language, "Demandes exclues", "Excluded requests")} ({Object.keys(current.excluded).length})</summary>
        {Object.entries(current.excluded).map(([item, reason]) => <p key={item}>{item} : {peerExclusionReason(reason, language)}</p>)}
      </details> : null}
      <FocusViewMode mode={mode} choose={choose} modes={modes} language={language}
        label={tr(language, "Mode des comparaisons", "Peer comparison mode")} />
      <fieldset className={styles.metrics}><legend>{tr(language, "Indicateurs", "Metrics")}</legend>
        {current.measures.map(item => <label key={item.key}><input type="checkbox" checked={keys.includes(item.key)}
          onChange={() => setKeys(previous => previous.includes(item.key) ? previous.filter(key => key !== item.key) : [...previous, item.key])} />
          {language === "fr" ? item.label_fr : item.label_en}</label>)}
      </fieldset>
      {mode !== "charts" ? <div className={`${styles.tableWrap} ${mode === "cards" ? styles.cardTable : ""}`}><table><caption>{tr(language, "Comparaison des indicateurs sélectionnés", "Selected metric comparison")}</caption>
        <thead><tr><th>{tr(language, "Indicateur", "Metric")}</th><th>{code(current.target)}</th>{current.selected.map(item => <th key={item}>{code(item)}</th>)}{current.selected.length === 1 ? <th>{tr(language, "Écart cible – pair", "Target – peer difference")}</th> : null}{showSectorStats ? <><th>{tr(language, "Médiane", "Median")}</th><th>{tr(language, "Rang", "Rank")}</th></> : null}</tr></thead>
        <tbody>{shown.map(item => <tr key={item.key}><th>{language === "fr" ? item.label_fr : item.label_en}<small>{item.sample_size} {tr(language, "sociétés avec cette donnée", "companies with this value")}</small><small>{language === "fr" ? item.explanation_fr : item.explanation_en}</small></th>
          {[current.target, ...current.selected].map(tickerValue => { const value = item.values.find(point => point.ticker === tickerValue);
            return <td key={tickerValue} title={value ? exactFinancialNumber(value.value, language) : undefined}><b className={styles.cardTicker}>{code(tickerValue)}</b>{number(value?.value ?? null, item.unit, language)}{value ? <small>{value.period_end.slice(0, 10)}</small> : null}</td>; })}
          {current.selected.length === 1 ? <td><b className={styles.cardTicker}>{tr(language, "Écart cible – pair", "Target – peer difference")}</b>{comparableDelta(item.values.find(value => value.ticker === current.target)?.value,
            item.values.find(value => value.ticker === current.selected[0])?.value, language, item.unit) ?? "N/D"}</td> : null}
          {showSectorStats ? <><td><b className={styles.cardTicker}>{tr(language, "Médiane", "Median")}</b>{number(item.median, item.unit, language)}</td><td><b className={styles.cardTicker}>{tr(language, "Rang", "Rank")}</b>{item.rank ?? "N/D"}</td></> : null}</tr>)}</tbody></table></div> : null}
      {mode === "charts" ? <div className={styles.cards}>{shown.map(item => {
        const bound = Math.max(...item.values.map(point => Math.abs(point.value)), 1);
        const a = item.values.find(value => value.ticker === current.target)?.value;
        const b = item.values.length === 2 ? item.values.find(value => value.ticker !== current.target)?.value : null;
        return <article key={item.key} className={styles.card}><h4>{language === "fr" ? item.label_fr : item.label_en}</h4>
          {item.values.map(value => <div key={value.ticker} className={styles.barRow}>
            <span>{code(value.ticker)} · <strong title={exactFinancialNumber(value.value, language)}>{number(value.value, item.unit, language)}</strong> · {value.period_end.slice(0, 10)}</span>
            {mode === "charts" ? <div className={styles.track} role="img" aria-label={`${code(value.ticker)} ${number(value.value, item.unit, language)}`}><div className={styles.zero} /><div className={`${styles.bar} ${value.value < 0 ? styles.negative : ""}`} style={signedBar(value.value, bound)} /></div> : null}
          </div>)}
          {a != null && b != null ? <p>{tr(language, "Écart cible – pair", "Target – peer difference")} : {comparableDelta(a, b, language, item.unit)}</p> : null}
          {item.median !== null ? <p>{tr(language, "Médiane", "Median")} : {number(item.median, item.unit, language)} · {tr(language, "Rang", "Rank")} : {item.rank}</p> : null}
          <p className={styles.muted}>{item.sample_size} {tr(language, "sociétés avec cette donnée", "companies with this value")} · {language === "fr" ? item.explanation_fr : item.explanation_en}</p>
        </article>;
      })}</div> : null}
      <details><summary>{tr(language, "Voir les sources et valeurs exactes", "View sources and exact values")}</summary>
        {shown.flatMap(item => item.values.map(value => <p key={`${item.key}-${value.ticker}`}>
          {language === "fr" ? item.label_fr : item.label_en} · {code(value.ticker)} · {exactFinancialNumber(value.value, language)} {item.unit === "percent" ? "%" : "×"} · <Evidence value={value} language={language} />
        </p>))}</details>
    </> : null}
    {loading ? <p role="status">{tr(language, "Chargement des pairs…", "Loading peers…")}</p> : null}
    {error ? <p role="alert">{tr(language, "Comparaison indisponible.", "Comparison unavailable.")} <button type="button" onClick={() => { setLoading(true); setError(false); setRetry(value => value + 1); }}>{tr(language, "Réessayer", "Retry")}</button></p> : null}
  </section>;
}
