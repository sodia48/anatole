"use client";

import { ArrowUpRight, Newspaper, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { getStockNewsSnapshot } from "@/lib/api";
import { localeFor, pick } from "@/lib/i18n";
import type { StockNewsSnapshot } from "@/lib/types";

import styles from "./FocusStockNews.module.css";

type NewsItem = StockNewsSnapshot["items"][number];

function ArticleReader({
  item,
  language,
  onClose,
}: {
  item: NewsItem;
  language: "fr" | "en";
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const previousFocus = useRef<HTMLElement | null>(null);
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
            <section aria-labelledby={`${titleId}-summary`} className={styles.readerSummary}>
              <h3 id={`${titleId}-summary`}>
                {pick(language, "Résumé", "Summary")}
              </h3>
              <p>{item.summary}</p>
            </section>
            <div className={styles.unavailable}>
              <strong>
                {pick(language, "Contenu complet non disponible", "Full article unavailable")}
              </strong>
              <span>
                {pick(
                  language,
                  "Anatole affiche tout le contenu légalement fourni par la source.",
                  "Anatole displays all content legally provided by the source.",
                )}
              </span>
            </div>
            <a
              className={styles.originalLink}
              href={item.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {pick(language, "Voir la source originale", "View original source")}
              <ArrowUpRight aria-hidden="true" size={15} />
            </a>
            <p className={styles.continueText}>
              {pick(
                language,
                "Lire la suite sur le site de la source",
                "Continue reading on the publisher’s website",
              )}
            </p>
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
                {pick(language, "Lire dans Anatole", "Read in Anatole")}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {selected ? (
        <ArticleReader item={selected} language={language} onClose={closeReader} />
      ) : null}
    </section>
  );
}
