"use client";

import dynamic from "next/dynamic";
import { FocusGlyph } from "@/components/focus-pro/FocusGlyph";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  const closeReader = useCallback(() => setSelected(null), []);
  const selectedArticle = useMemo<ReaderArticle | null>(() => selected ? {
    title: selected.title,
    summary: selected.summary,
    url: selected.url,
    source: selected.publisher,
    category: "stock",
    region: "Canada",
    publishedAt: selected.published_at,
    imageUrl: selected.image_url,
    context: "stock",
    ticker,
    company: snapshot?.company || company,
    relatedTickers: selected.related_tickers,
  } : null, [selected, ticker, company, snapshot?.company]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSnapshot(null);
      setSelected(null);
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

      {loading ? (
        <div className={styles.state}>
          {tr(language, "Recherche des nouvelles récentes…", "Loading recent news…")}
        </div>
      ) : null}

      {!loading && (error || !items.length) ? (
        <div className={styles.state}>
          {pick(
            language,
            `Aucune nouvelle récente directement associée à ${ticker}.`,
            `No recent news directly associated with ${ticker}.`,
          )}
        </div>
      ) : null}

      {items.length ? (
        <div className={styles.grid}>
          {items.map((item) => (
            <button
              className={styles.card}
              key={item.id}
              onClick={() => setSelected(item)}
              type="button"
            >
              <div className={styles.meta}>
                <span>{item.publisher}</span>
                <time dateTime={item.published_at}>
                  {formatter.format(new Date(item.published_at))}
                </time>
              </div>
              <h3>{item.title}</h3>
              {item.summary ? <p className={styles.summary}>{item.summary}</p> : null}
              <span className={styles.open}>
                {tr(language, "Lire le résumé", "Read summary")}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {selected && selectedArticle ? (
        <NewsIntelligenceReader
          key={selected.id}
          article={selectedArticle}
          language={language}
          onClose={closeReader}
        />
      ) : null}
    </section>
  );
}
