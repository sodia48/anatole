"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Newspaper, Search } from "lucide-react";
import { getNewsSnapshot } from "@/lib/api";
import { REFRESH_INTERVALS } from "@/lib/refresh";
import type { NewsSnapshot } from "@/lib/types";

const formatter = new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" });

export function NewsClient() {
  const [data, setData] = useState<NewsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("Toutes");
  const [category, setCategory] = useState("Toutes");
  const [sentiment, setSentiment] = useState("Tous");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const snapshot = await getNewsSnapshot();
        if (active) { setData(snapshot); setError(null); }
      } catch {
        if (active) setError("Les flux officiels ne répondent pas pour le moment. Anatole réessaiera automatiquement.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_INTERVALS.news);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const sources = useMemo(() => Array.from(new Set(data?.items.map((item) => item.source) ?? [])).sort(), [data]);
  const categories = useMemo(() => Array.from(new Set(data?.items.map((item) => item.category) ?? [])).sort(), [data]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => {
      const text = `${item.title} ${item.summary}`.toLowerCase();
      return (!normalized || text.includes(normalized)) && (source === "Toutes" || item.source === source) && (category === "Toutes" || item.category === category) && (sentiment === "Tous" || item.sentiment === sentiment);
    });
  }, [category, data, query, sentiment, source]);

  if (!data && !error) return <section className="panel discovery-loading"><span className="live-dot" /><div><h1>Synchronisation des actualités</h1><p>Connexion aux publications de la Banque du Canada et de Statistique Canada.</p></div></section>;

  return (
    <div className="discovery-page">
      <header className="panel discovery-hero">
        <div><span className="eyebrow">ACTUALITÉS OFFICIELLES</span><h1>Fil macro canadien</h1><p>Publications officielles, catégorisées et accompagnées d’une lecture de sentiment simple et explicable.</p></div>
        <div className="discovery-score"><Newspaper size={20} /><strong>{filtered.length}</strong><span>publications</span><small>Mise à jour automatique toutes les 15 minutes</small></div>
      </header>

      {error ? <div className="cockpit-warning">{error}</div> : null}

      <section className="source-status-grid">
        {data?.source_statuses.map((item) => <article className={`panel source-status source-${item.status}`} key={item.source}><span>{item.status === "ok" ? "Disponible" : "Indisponible"}</span><strong>{item.source}</strong><small>{item.detail ?? ""}</small></article>)}
      </section>

      <section className="panel filter-bar">
        <label className="filter-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher inflation, emploi, taux…" /></label>
        <label><span>Source</span><select value={source} onChange={(event) => setSource(event.target.value)}><option>Toutes</option>{sources.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Catégorie</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Toutes</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Sentiment</span><select value={sentiment} onChange={(event) => setSentiment(event.target.value)}><option>Tous</option><option>Positif</option><option>Neutre</option><option>Négatif</option></select></label>
      </section>

      <section className="news-grid">
        {filtered.map((item) => (
          <article className="panel news-card" key={item.id}>
            <div className="news-card-meta"><span>{item.source}</span><em>{item.category}</em><time>{formatter.format(new Date(item.published_at))} ET</time></div>
            <h2>{item.title}</h2>
            {item.summary ? <p>{item.summary}</p> : null}
            <div className="news-card-footer"><span className={`sentiment sentiment-${item.sentiment.toLowerCase()}`}>{item.sentiment} {item.sentiment_score > 0 ? "+" : ""}{item.sentiment_score.toFixed(0)}</span><a href={item.url} target="_blank" rel="noreferrer">Source officielle <ExternalLink size={14} /></a></div>
          </article>
        ))}
        {!filtered.length ? <div className="panel empty-filter"><Newspaper size={24} /><strong>Aucune publication ne correspond aux filtres.</strong></div> : null}
      </section>
    </div>
  );
}
