"use client";

import dynamic from "next/dynamic";
import { FocusGlyph } from "@/components/focus-pro/FocusGlyph";
import { useEffect, useMemo, useRef, useState } from "react";

import { getStockNewsSnapshot } from "@/lib/api";
import type { ReaderArticle } from "@/components/news/NewsIntelligenceReader";
import { localeFor, pick } from "@/lib/i18n";
import type { StockNewsSnapshot } from "@/lib/types";

import styles from "./FocusStockNews.module.css";

const tr = pick;
const NewsIntelligenceReader = dynamic(
  () => import("@/components/news/NewsIntelligenceReader").then((module) => module.NewsIntelligenceReader),
  { ssr: false },
);

type NewsItem = StockNewsSnapshot["items"][number];
const PAGE_SIZE = 6;
const FILTERS = [
  ["all", "Toutes", "All"],
  ["direct", "Entreprise", "Company"],
  ["sector", "Secteur", "Sector"],
  ["market", "Marché", "Market"],
  ["official", "Communiqués", "Official releases"],
] as const;

function canReadBrief(item: NewsItem): boolean {
  const excerpt = item.summary?.trim() ?? "";
  return excerpt.length >= 25 && excerpt.toLocaleLowerCase() !== item.title.trim().toLocaleLowerCase();
}

export function FocusStockNews({
  ticker,
  company,
  language,
}: {
  ticker: string;
  company: string;
  language: "fr" | "en";
}) {
  const [snapshot, setSnapshot] = useState<StockNewsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const readerTrigger = useRef<HTMLButtonElement | null>(null);
  const [filter, setFilter] = useState<"all" | "direct" | "sector" | "market" | "official">("all");
  const [loadingMore, setLoadingMore] = useState(false);
  const activeQuery = useRef("");
  const queryKey = `${ticker}|${company}|${language}|${filter}`;
  const selectedArticle = useMemo<ReaderArticle | null>(() => selected ? {
    title: selected.title,
    summary: selected.summary,
    url: selected.url,
    source: selected.publisher,
    category: "stock",
    region: "Canada",
    publishedAt: selected.published_at,
    dateOnly: selected.origin === "company_release",
    imageUrl: selected.image_url,
    context: "stock",
    ticker,
    company: snapshot?.company || company,
    relatedTickers: selected.related_tickers,
    eventType: selected.event_type,
    candidateSources: selected.related_sources,
  } : null, [selected, ticker, company, snapshot?.company]);

  useEffect(() => {
    const controller = new AbortController();
    activeQuery.current = queryKey;
    let active = true;
    queueMicrotask(() => {
      if (!active || activeQuery.current !== queryKey) return;
      setSnapshot(null);
      setSelected(null);
      setLoadingMore(false);
      setLoading(true);
      setError(false);
    });

    void getStockNewsSnapshot(
      ticker,
      company,
      language,
      controller.signal,
      1,
      PAGE_SIZE,
      filter,
    )
      .then((value) => {
        if (!active || activeQuery.current !== queryKey) return;
        setSnapshot(value);
        setError(value.status === "unavailable");
      })
      .catch((reason: unknown) => {
        if (
          active && activeQuery.current === queryKey &&
          !(reason instanceof DOMException && reason.name === "AbortError")
        ) {
          setError(true);
        }
      })
      .finally(() => {
        if (active && activeQuery.current === queryKey) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [company, filter, language, ticker, queryKey]);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeFor(language), {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Toronto",
      }),
    [language],
  );

  const items = snapshot?.items ?? [];
  const loadMore = async () => {
    if (!snapshot?.has_more || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await getStockNewsSnapshot(ticker, company, language, undefined, (snapshot.page ?? 1) + 1, PAGE_SIZE, filter);
      if (activeQuery.current !== queryKey) return;
      setSnapshot((current) => current ? { ...next, items: [...current.items, ...next.items.filter((item) => !current.items.some((old) => old.id === item.id))] } : next);
    } catch {
      if (activeQuery.current === queryKey) setError(true);
    } finally {
      if (activeQuery.current === queryKey) setLoadingMore(false);
    }
  };

  return (
    <section
      className={styles.root}
      aria-label={pick(
        language,
        `Dernières nouvelles pour ${ticker}`,
        `Latest news for ${ticker}`,
      )}
      data-testid="focus-stock-news"
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            <FocusGlyph name="Newspaper" size={14} />
            {tr(language, "ACTUALITÉS DU TITRE", "STOCK NEWS")}
          </span>
          <h2>
            {tr(language, "Dernières nouvelles", "Latest news")} · {ticker}
          </h2>
        </div>
        {!loading && items.length ? (
          <span className={styles.count}>
            {snapshot?.total_items ?? items.length} {tr(language, "événements", "events")}
          </span>
        ) : null}
      </header>

      {!loading && items.length ? (
        <div className={styles.filters} role="group" aria-label={tr(language, "Filtrer les actualités", "Filter news")}>
          {FILTERS.map(([option, fr, en]) => (
            <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}>
              {tr(language, fr, en)}
            </button>
          ))}
        </div>
      ) : null}
      {snapshot?.coverage_note ? <p className={styles.coverage}>{snapshot.coverage_note}</p> : null}
      {snapshot?.stale ? <p className={styles.coverage} role="status">{tr(language, "Instantané périmé : actualisation en cours.", "Stale snapshot: refresh in progress.")}</p> : null}

      {loading ? (
        <div className={styles.state}>
          {tr(language, "Recherche des nouvelles récentes…", "Loading recent news…")}
        </div>
      ) : null}

      {!loading && (error || !items.length) ? (
        <div className={styles.state}>
          {error ? tr(language, "Les sources d’actualités sont momentanément indisponibles.", "News sources are temporarily unavailable.")
            : tr(language, "Aucune nouvelle vérifiée dans cette catégorie.", "No verified news in this category.")}
        </div>
      ) : null}

      {items.length ? (
        <div className={styles.grid}>
          {items.map((item, index) => {
            const readable = canReadBrief(item);
            const contents = <>
              <div className={styles.meta}>
                <span>{item.publisher}</span>
                <time dateTime={item.event_published_at ?? item.published_at}>
                  {item.origin === "company_release" && !item.event_published_at ? new Intl.DateTimeFormat(localeFor(language), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(item.published_at)) : formatter.format(new Date(item.event_published_at ?? item.published_at))}
                </time>
              </div>
              <span className={styles.relevance}>{item.origin === "company_release" ? tr(language, "Communiqué officiel", "Official release") : item.relevance === "sector" ? tr(language, "Secteur", "Sector") : item.relevance === "market" ? tr(language, "Marché", "Market") : tr(language, "Entreprise", "Company")}</span>
              <h3>{item.title}</h3>
              {item.summary ? <p className={styles.summary}>{item.summary}</p> : null}
            </>;
            return <article className={`${styles.card} ${index === 0 ? styles.featured : ""}`} key={item.id}>
              {item.image_url?.startsWith("https://") ? (
                // The image is supplied by the publisher and is not fetched by our server.
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.thumbnail} src={item.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              ) : null}
              <div className={styles.storyBody}>{contents}
                <div className={styles.storyActions}>
                {readable ? <button className={styles.open} aria-label={`${item.title} · ${tr(language, "Lire l’analyse", "Read analysis")}`} onClick={(event) => { readerTrigger.current = event.currentTarget; setSelected(item); }} type="button">{tr(language, "Lire l’analyse", "Read analysis")}</button>
                  : <a className={styles.open} aria-label={`${item.title} · ${tr(language, "Voir l’article original", "View original article")}`} href={item.url} target="_blank" rel="noopener noreferrer">{tr(language, "Voir l’article original", "View original article")}</a>}
                {item.related_sources?.length ? <details className={styles.sources}>
                  <summary>{tr(language, "Autres sources", "Other sources")} · {item.related_sources.length}</summary>
                  <ul>{item.related_sources.map((source) => <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.publisher} · {source.title}</a>
                    {source.origin === "company_release" ? <span> · {tr(language, "Officiel", "Official")}</span> : null}
                  </li>)}</ul>
                </details> : null}
                </div>
              </div>
            </article>;
          })}
        </div>
      ) : null}
      {snapshot?.has_more ? <button className={styles.more} type="button" disabled={loadingMore} onClick={() => void loadMore()}>
        {loadingMore ? tr(language, "Chargement…", "Loading…") : tr(language, "Charger plus", "Load more")}
      </button> : null}
      {selected && selectedArticle ? (
        <NewsIntelligenceReader
          key={selected.id}
          article={selectedArticle}
          language={language}
          onClose={() => setSelected(null)}
          returnFocusRef={readerTrigger}
        />
      ) : null}
    </section>
  );
}
