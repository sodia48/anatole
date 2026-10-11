"use client";

import {
  ArrowUpRight,
  BarChart3,
  Eye,
  Lightbulb,
  LoaderCircle,
  Newspaper,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { getNewsBrief, getStockNewsSnapshot } from "@/lib/api";
import { localeFor, pick } from "@/lib/i18n";
import type { NewsBriefResponse, StockNewsSnapshot } from "@/lib/types";

import styles from "./FocusStockNews.module.css";

type NewsItem = StockNewsSnapshot["items"][number];

function ArticleReader({
  item,
  ticker,
  company,
  language,
  onClose,
}: {
  item: NewsItem;
  ticker: string;
  company: string;
  language: "fr" | "en";
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const previousFocus = useRef<HTMLElement | null>(null);
  const [brief, setBrief] = useState<NewsBriefResponse | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefError, setBriefError] = useState(false);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeFor(language), {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/Toronto",
      }),
    [language],
  );

  useEffect(() => {
    const controller = new AbortController();
    void getNewsBrief(
      {
        title: item.title,
        summary: item.summary,
        url: item.url,
        source: item.publisher,
        category: "Stock",
        region: "Canada",
        language,
        context: "stock",
        ticker,
        company,
      },
      controller.signal,
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        setBrief(value);
        setBriefError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setBriefError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBriefLoading(false);
      });
    return () => controller.abort();
  }, [company, item, language, ticker]);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = oldOverflow;
      previousFocus.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className={styles.readerBackdrop}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.reader}
        ref={panelRef}
        role="dialog"
      >
        <header className={styles.readerTopbar}>
          <span>{item.publisher || pick(language, "Source", "Source")}</span>
          <button
            aria-label={pick(language, "Fermer", "Close")}
            className={styles.closeButton}
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className={styles.readerScroll}>
          {item.image_url ? (
            <div className={styles.readerImage}>
              <Image
                alt=""
                fill
                sizes="(max-width: 720px) 100vw, 760px"
                src={item.image_url}
                unoptimized
              />
            </div>
          ) : null}
          <article className={styles.article}>
            <span className={styles.articleLabel}>
              {pick(language, "ARTICLE", "ARTICLE")}
            </span>
            <div className={styles.articleMeta}>
              <span>{item.publisher || pick(language, "Source", "Source")}</span>
              <time dateTime={item.published_at}>
                {formatter.format(new Date(item.published_at))}
              </time>
            </div>
            <h2 id={titleId}>{item.title}</h2>
            {item.related_tickers.length ? (
              <div className={styles.tickers}>
                {item.related_tickers.map((ticker) => (
                  <span key={ticker}>{ticker.replace(/\.TO$/, "")}</span>
                ))}
              </div>
            ) : null}
            <div className={styles.briefHeading}>
              <Sparkles aria-hidden="true" size={15} />
              <span>{pick(language, "BRIEF ANATOLE", "ANATOLE BRIEF")}</span>
            </div>

            {briefLoading ? (
              <div className={styles.briefLoading} role="status">
                <LoaderCircle aria-hidden="true" className={styles.briefSpinner} size={20} />
                <div>
                  <strong>{pick(language, "Analyse de la nouvelle…", "Analyzing the news…")}</strong>
                  <span>
                    {pick(
                      language,
                      "Anatole structure les faits, chiffres et éléments à surveiller pour ce titre.",
                      "Anatole is structuring the facts, figures and watch items for this stock.",
                    )}
                  </span>
                </div>
              </div>
            ) : brief ? (
              <>
                <div className={styles.provenance}>
                  <strong>
                    {brief.source_mode === "official_page"
                      ? pick(language, "Page source analysée", "Source page analyzed")
                      : pick(language, "Résumé du flux analysé", "Feed summary analyzed")}
                  </strong>
                  <span>{brief.source_note}</span>
                </div>

                <section className={styles.briefLead}>
                  <span>{pick(language, "EN BREF", "IN SHORT")}</span>
                  <p>{brief.summary}</p>
                </section>

                {brief.key_figures.length ? (
                  <section className={styles.briefSection}>
                    <header>
                      <BarChart3 aria-hidden="true" size={16} />
                      <strong>{pick(language, "Chiffres clés", "Key figures")}</strong>
                    </header>
                    <div className={styles.briefFigures}>
                      {brief.key_figures.map((figure, index) => (
                        <article key={`${figure.value}-${index}`}>
                          <strong>{figure.value}</strong>
                          <span>{figure.context}</span>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {brief.changes.length ? (
                  <section className={styles.briefSection}>
                    <header>
                      <Eye aria-hidden="true" size={16} />
                      <strong>{pick(language, "Ce qui change", "What changed")}</strong>
                    </header>
                    <ul>
                      {brief.changes.map((change, index) => (
                        <li key={`${index}-${change.slice(0, 24)}`}>{change}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section className={styles.briefInsight}>
                  <div>
                    <Lightbulb aria-hidden="true" size={16} />
                    <span>{pick(language, "LECTURE ANATOLE", "ANATOLE READ")}</span>
                  </div>
                  <p>{brief.why_it_matters}</p>
                  <small>
                    {pick(
                      language,
                      "Mise en contexte analytique d’Anatole — distincte des faits publiés par la source.",
                      "Anatole analytical context — separate from facts published by the source.",
                    )}
                  </small>
                </section>

                {brief.watch.length ? (
                  <section className={styles.briefSection}>
                    <header>
                      <Eye aria-hidden="true" size={16} />
                      <strong>{pick(language, "À surveiller", "What to watch")}</strong>
                    </header>
                    <ul>
                      {brief.watch.map((watch, index) => (
                        <li key={`${index}-${watch.slice(0, 24)}`}>{watch}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            ) : (
              <section className={styles.briefLead}>
                <span>
                  {pick(
                    language,
                    briefError ? "RÉSUMÉ — MODE SECOURS" : "EN BREF",
                    briefError ? "SUMMARY — FALLBACK" : "IN SHORT",
                  )}
                </span>
                <p>{item.summary || pick(language, "Aucun résumé disponible.", "No summary available.")}</p>
              </section>
            )}
            <a
              className={styles.originalLink}
              href={item.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {pick(language, "Voir la source originale", "View original source")}
              <ArrowUpRight aria-hidden="true" size={15} />
            </a>
          </article>
        </div>
      </div>
    </div>
  );
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
  const closeReader = useCallback(() => setSelected(null), []);

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
            <Newspaper size={14} aria-hidden="true" />
            {pick(language, "ACTUALITÉS DU TITRE", "STOCK NEWS")}
          </span>
          <h2>
            {pick(language, "Dernières nouvelles", "Latest news")} · {ticker}
          </h2>
        </div>
        {!loading && items.length ? (
          <span className={styles.count}>
            {items.length} {pick(language, "articles", "articles")}
          </span>
        ) : null}
      </header>

      {loading ? (
        <div className={styles.state}>
          {pick(language, "Recherche des nouvelles récentes…", "Loading recent news…")}
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
              <p className={styles.summary}>{item.summary}</p>
              <span className={styles.open}>
                {pick(language, "Lire le résumé", "Read summary")}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {selected ? (
        <ArticleReader
          company={company}
          item={selected}
          key={selected.id}
          language={language}
          onClose={closeReader}
          ticker={ticker}
        />
      ) : null}
    </section>
  );
}
