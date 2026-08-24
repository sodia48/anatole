"use client";

import { ArrowRight, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { findCompanyRelationshipPath, searchSymbols } from "@/lib/api";
import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type { CompanyRelationshipPath, SymbolSearchItem } from "@/lib/types";

import { confidenceLabel, relationshipLabel } from "./labels";
import styles from "./CompanyNetwork.module.css";

export function RelationshipPathFinder({ fromTicker, initialTarget, language }: { fromTicker: string; initialTarget?: string | null; language: AnatoleLanguage }) {
  const [query, setQuery] = useState(initialTarget ?? "");
  const [target, setTarget] = useState(initialTarget ?? "");
  const [suggestions, setSuggestions] = useState<SymbolSearchItem[]>([]);
  const [includeSecondary, setIncludeSecondary] = useState(true);
  const [result, setResult] = useState<CompanyRelationshipPath | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialTarget) return;
    const timer = window.setTimeout(() => {
      setQuery(initialTarget);
      setTarget(initialTarget);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialTarget]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (query.trim().length < 1) { setSuggestions([]); return; }
      void searchSymbols(query.trim(), controller.signal).then((value) => setSuggestions(value.items)).catch(() => setSuggestions([]));
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const find = async () => {
    const symbol = target.trim().toUpperCase();
    if (!symbol || symbol === fromTicker) return;
    setLoading(true); setError(null);
    try { setResult(await findCompanyRelationshipPath(fromTicker, symbol, includeSecondary)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Path unavailable"); }
    finally { setLoading(false); }
  };

  return (
    <section className={styles.pathFinder} aria-label={pick(language, "Trouver le lien avec une entreprise", "Find a relationship with a company")}>
      <div><span className={styles.eyebrow}>MAX DEPTH · 3</span><h3>{pick(language, "Trouver le lien avec…", "Find the relationship with…")}</h3></div>
      <div className={styles.pathForm}>
        <strong>{fromTicker}</strong><ArrowRight size={16} />
        <label><span className="sr-only">{pick(language, "Entreprise cible", "Target company")}</span><input value={query} onChange={(event) => { setQuery(event.target.value); setTarget(event.target.value); }} placeholder={pick(language, "Ticker ou entreprise", "Ticker or company")} /></label>
        <button type="button" onClick={() => void find()} disabled={loading || !target.trim()}><Search size={15} />{loading ? pick(language, "Recherche…", "Searching…") : pick(language, "Trouver le lien", "Find relationship")}</button>
      </div>
      {suggestions.length ? <div className={styles.suggestions}>{suggestions.map((item) => <button type="button" key={item.symbol} onClick={() => { setQuery(item.symbol); setTarget(item.symbol); setSuggestions([]); }}>{item.symbol}<span>{item.name}</span></button>)}</div> : null}
      <label className={styles.secondaryToggle}><input type="checkbox" checked={includeSecondary} onChange={(event) => setIncludeSecondary(event.target.checked)} />{pick(language, "Inclure les relations secondaires clairement identifiées", "Include clearly identified secondary relationships")}</label>
      {error ? <p className={styles.error}>{error}</p> : null}
      {result ? result.found ? <div className={styles.pathResult}>{result.nodes.map((node, index) => <div key={node.id} className={styles.pathStep}><strong>{node.ticker ?? "—"}</strong><span>{node.name}</span>{result.relationships[index] ? <><ArrowRight size={15} /><small>{relationshipLabel(result.relationships[index].relationship_type, language)} · {confidenceLabel(result.relationships[index].confidence, language)}</small><a href={result.relationships[index].evidence[0]?.url} target="_blank" rel="noreferrer">{pick(language, "Source", "Source")}</a></> : null}</div>)}</div> : <p className={styles.emptyPath}>{pick(language, result.message_fr ?? "Aucun lien vérifié n'a été trouvé dans les données disponibles.", result.message_en ?? "No verified relationship was found in the available data.")}</p> : null}
    </section>
  );
}
