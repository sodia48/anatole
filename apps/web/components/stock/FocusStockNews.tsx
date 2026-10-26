"use client";

import dynamic from "next/dynamic";
import { FocusGlyph } from "@/components/focus-pro/FocusGlyph";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const [filter, setFilter] = useState<"all" | "direct" | "sector">("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const closeReader = useCallback(() => setSelected(null), []);
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
  } : null, [selected, ticker, company, snapshot?.company]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSnapshot(null);
      setSelected(null);
      setFilter("all");
      setVisibleCount(PAGE_SIZE);
      setLoading(true);
      setError(false);
    });

    void getStockNewsSnapshot(
      ticker,
      company,
      language,
      controller.signal,
    )
      .then((value) => {
        if (!active) return;
        setSnapshot(value);
        setError(value.status === "unavailable");
      })
      .catch((reason: unknown) => {
        if (
          active &&
          !(reason instanceof DOMException && reason.name === "AbortError")
        ) {
          setError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [company, language, ticker]);

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
  const visibleItems = items.filter((item) => filter === "all" || (item.relevance ?? "direct") === filter);
  const shownItems = visibleItems.slice(0, visibleCount);

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
            {items.length} {tr(language, "articles", "articles")}
          </span>
        ) : null}
      </header>

      {!loading && items.length ? (
        <div className={styles.filters} role="group" aria-label={tr(language, "Filtrer les actualités", "Filter news")}>
          {(["all", "direct", "sector"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={filter === option} onClick={() => { setFilter(option); setVisibleCount(PAGE_SIZE); }}>
              {option === "all" ? tr(language, "Toutes", "All") : option === "direct" ? tr(language, "Entreprise", "Company") : tr(language, "Secteur", "Sector")}
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

      {!loading && (error || !visibleItems.length) ? (
        <div className={styles.state}>
          {filter === "sector" ? tr(language, "Aucune actualité sectorielle pertinente dans la période récente.", "No relevant recent sector news.") : pick(language,
            `Aucune nouvelle récente directement associée à ${ticker}.`,
            `No recent news directly associated with ${ticker}.`)}
        </div>
      ) : null}

      {visibleItems.length ? (
        <div className={styles.grid}>
          {shownItems.map((item) => {
            const readable = canReadBrief(item);
            const contents = <>
              {item.image_url?.startsWith("https:") ? (
                // The image is supplied by the publisher and is not fetched by our server.
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.thumbnail} src={item.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              ) : null}
              <div className={styles.meta}>
                <span>{item.publisher}</span>
                <time dateTime={item.published_at}>
                  {item.origin === "company_release" ? new Intl.DateTimeFormat(localeFor(language), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(item.published_at)) : formatter.format(new Date(item.published_at))}
                </time>
              </div>
              <span className={styles.relevance}>{item.relevance === "sector" ? tr(language, "Secteur", "Sector") : item.origin === "company_release" ? tr(language, "Communiqué officiel", "Official release") : tr(language, "Entreprise", "Company")}</span>
              <h3>{item.title}</h3>
              {item.summary ? <p className={styles.summary}>{item.summary}</p> : null}
              <span className={styles.open}>
                {readable ? tr(language, "Lire le résumé", "Read summary") : tr(language, "Voir l'article", "View article")}
              </span>
            </>;
            return readable ? <button className={styles.card} key={item.id} onClick={(event) => { readerTrigger.current = event.currentTarget; setSelected(item); }} type="button">{contents}</button>
              : <a className={styles.card} key={item.id} href={item.url} target="_blank" rel="noopener noreferrer">{contents}</a>;
          })}
        </div>
      ) : null}
      {visibleCount < visibleItems.length ? <button className={styles.more} type="button" onClick={() => setVisibleCount(count => count + PAGE_SIZE)}>
        {tr(language, "Charger plus", "Load more")}
      </button> : null}
      {selected && selectedArticle ? (
        <NewsIntelligenceReader
          key={selected.id}
          article={selectedArticle}
          language={language}
          onClose={closeReader}
          returnFocusRef={readerTrigger}
        />
      ) : null}
    </section>
  );
}
