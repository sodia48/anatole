"use client";

import { useEffect, useId, useRef, useState } from "react";

import { getNewsBrief } from "@/lib/api";
import { localeFor, pick } from "@/lib/i18n";
import type { NewsBriefRequest, NewsBriefResponse } from "@/lib/types";

import styles from "./NewsIntelligenceReader.module.css";

export type ReaderArticle = {
  title: string;
  summary: string;
  url: string;
  source: string;
  category: string;
  region: string;
  publishedAt?: string | null;
  imageUrl?: string | null;
  context: "macro" | "stock";
  ticker?: string;
  company?: string;
  relatedTickers?: string[];
};

function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function NewsBriefProvenance({ brief, language }: {
  brief: NewsBriefResponse;
  language: "fr" | "en";
}) {
  const availability = brief.availability ??
    (brief.source_mode === "official_page" || brief.source_mode === "article_page"
      ? "article" : "publisher_excerpt");
  const label = availability === "article"
    ? pick(language, "Article consulté", "Article consulted")
    : availability === "publisher_excerpt"
      ? pick(language, "Résumé de l’éditeur", "Publisher excerpt")
      : pick(language, "Informations limitées", "Limited information");
  return (
    <aside className={styles.provenance} aria-label={pick(language, "Provenance et limites", "Provenance and limits")}>
      <strong>{label}</strong>
      <span>{brief.source_note}</span>
      {brief.translation_status === "unavailable" &&
        brief.source_language && brief.source_language !== "unknown" &&
        brief.source_language !== language ? (
          <span>{pick(language, "Texte original conservé : traduction fiable indisponible.", "Original text retained: reliable translation unavailable.")}</span>
        ) : null}
    </aside>
  );
}

function NewsBriefFigures({ brief, language }: {
  brief: NewsBriefResponse;
  language: "fr" | "en";
}) {
  if (!brief.key_figures.length) return null;
  return (
    <section className={styles.section}>
      <h3>{pick(language, "Chiffres clés", "Key figures")}</h3>
      <div className={styles.figures}>
        {brief.key_figures.map((figure, index) => (
          <div className={styles.figure} key={figure.value + index}>
            <strong>{figure.value}</strong>
            <span>{figure.kind === "forecast"
              ? pick(language, "Prévision", "Forecast")
              : figure.kind === "opinion"
                ? pick(language, "Opinion d’analyste", "Analyst opinion")
                : figure.kind === "date"
                  ? pick(language, "Date annoncée", "Announced date")
                : pick(language, "Donnée publiée", "Published figure")}</span>
            <p>{figure.context}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function NewsBriefAnalysis({ brief, language, context }: {
  brief: NewsBriefResponse;
  language: "fr" | "en";
  context: ReaderArticle["context"];
}) {
  return (
    <>
      {brief.changes.length ? (
        <section className={styles.section}>
          <h3>{pick(language, "Ce qui change", "What changed")}</h3>
          <ul>{brief.changes.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </section>
      ) : null}
      {brief.why_it_matters ? (
        <section className={styles.analysis}>
          <h3>{pick(language, "Lecture Anatole", "Anatole read")}</h3>
          <p>{brief.why_it_matters}</p>
          <small>{pick(language, "Interprétation fondée sur le contenu disponible.", "Interpretation based on available content.")}</small>
        </section>
      ) : context === "stock" && brief.relevance !== "direct" ? (
        <p className={styles.limit}>{pick(
          language,
          "Le lien direct entre cette publication et l’entreprise n’est pas établi.",
          "A direct link between this publication and the company has not been established.",
        )}</p>
      ) : null}
      {brief.watch.length ? (
        <section className={styles.section}>
          <h3>{pick(language, "À surveiller", "What to watch")}</h3>
          <ul>{brief.watch.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </section>
      ) : null}
    </>
  );
}

function NewsBrief({ brief, language, context, view }: {
  brief: NewsBriefResponse;
  language: "fr" | "en";
  context: ReaderArticle["context"];
  view: "quick" | "detail";
}) {
  const untranslated = brief.translation_status === "unavailable" &&
    brief.source_language && brief.source_language !== "unknown" &&
    brief.source_language !== language;
  return (
    <>
      {brief.availability !== "limited" ? (
        <section className={styles.lead}>
          <span>{pick(language, "L’ESSENTIEL", "THE ESSENTIALS")}</span>
          <h3>{untranslated
            ? pick(language, "Texte original · traduction indisponible", "Original text · translation unavailable")
            : pick(language, "Résumé", "Summary")}</h3>
          <p lang={untranslated ? brief.source_language : undefined}>{brief.summary}</p>
        </section>
      ) : null}
      {view === "detail" ? (
        <>
          <NewsBriefFigures brief={brief} language={language} />
          <NewsBriefAnalysis brief={brief} language={language} context={context} />
        </>
      ) : null}
      <NewsBriefProvenance brief={brief} language={language} />
    </>
  );
}

export function NewsIntelligenceReader({ article, language, onClose }: {
  article: ReaderArticle;
  language: "fr" | "en";
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeCallback = useRef(onClose);
  const [brief, setBrief] = useState<NewsBriefResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<"quick" | "detail">(() => {
    try {
      return typeof window !== "undefined" &&
        sessionStorage.getItem("anatole.news.reader.view") === "detail"
        ? "detail" : "quick";
    } catch { return "quick"; }
  });
  const original = safeLink(article.url);
  const image = article.imageUrl ? safeLink(article.imageUrl) : null;
  const published = article.publishedAt ? new Date(article.publishedAt) : null;
  const publishedLabel = published && !Number.isNaN(published.getTime())
    ? new Intl.DateTimeFormat(localeFor(language), {
      dateStyle: "long", timeStyle: "short", timeZone: "America/Toronto",
    }).format(published)
    : null;

  useEffect(() => { closeCallback.current = onClose; }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCallback.current();
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ));
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
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const request: NewsBriefRequest = {
      title: article.title,
      summary: article.summary,
      url: article.url,
      source: article.source,
      category: article.category,
      region: article.region,
      language,
      context: article.context,
      ticker: article.ticker,
      company: article.company,
      published_at: article.publishedAt,
      related_tickers: article.relatedTickers,
    };
    queueMicrotask(() => {
      if (!active) return;
      setBrief(null);
      setFailed(false);
      setLoading(true);
    });
    void getNewsBrief(request, controller.signal)
      .then((value) => { if (active) setBrief(value); })
      .catch((reason: unknown) => {
        if (active && !(reason instanceof DOMException && reason.name === "AbortError")) {
          setFailed(true);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [article, language, attempt]);

  const changeView = (next: "quick" | "detail") => {
    setView(next);
    try { sessionStorage.setItem("anatole.news.reader.view", next); } catch { /* Optional preference. */ }
  };

  return (
    <div className={styles.backdrop} onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.reader}>
        <header className={styles.topbar}>
          <span>{pick(language, "ANATOLE NEWS INTELLIGENCE", "ANATOLE NEWS INTELLIGENCE")}</span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={pick(language, "Fermer", "Close")} className={styles.close}>×</button>
        </header>
        <div className={styles.scroll}>
          {image?.startsWith("https:") && !imageFailed ? (
            <div className={styles.hero}>
              {/* Publisher-hosted images are deliberately left unoptimized and are not fetched by our server. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
            </div>
          ) : null}
          <div className={styles.content}>
            <div className={styles.meta}>
              <span>{article.source}</span>
              {publishedLabel ? <time dateTime={article.publishedAt ?? undefined}>{publishedLabel}</time> : null}
            </div>
            <h2 id={titleId}>{article.title}</h2>
            {article.context === "stock" && article.company ? (
              <p className={styles.subject}>{article.company}{article.ticker ? " · " + article.ticker : ""}</p>
            ) : article.region ? <p className={styles.subject}>{article.region}</p> : null}
            {loading ? (
              <div className={styles.loading} role="status">
                <span className={styles.spinner} aria-hidden="true" />
                {pick(language, "Préparation du résumé…", "Preparing the brief…")}
              </div>
            ) : brief ? (
              <>
                {brief.detail_available ? (
                  <div className={styles.views} role="group" aria-label={pick(language, "Mode de lecture", "Reading mode")}>
                    <button type="button" aria-pressed={view === "quick"} onClick={() => changeView("quick")}>{pick(language, "Résumé rapide", "Quick summary")}</button>
                    <button type="button" aria-pressed={view === "detail"} onClick={() => changeView("detail")}>{pick(language, "Analyse détaillée", "Detailed analysis")}</button>
                  </div>
                ) : null}
                <NewsBrief brief={brief} language={language} context={article.context} view={view} />
                {brief.availability !== "article" ? (
                  <div className={styles.limit}>
                    {pick(language,
                      "Cette source ne fournit pas le texte intégral à Anatole. L’analyse se limite aux informations disponibles.",
                      "This source does not provide the full article to Anatole. Analysis is limited to available information.")}
                  </div>
                ) : null}
              </>
            ) : (
              <div className={styles.fallback} role={failed ? "alert" : undefined}>
                <h3>{pick(language, "Résumé indisponible", "Brief unavailable")}</h3>
                <p>{article.summary || pick(language, "Seuls le titre et la source sont disponibles.", "Only the title and source are available.")}</p>
                {failed ? <button type="button" onClick={() => setAttempt((value) => value + 1)}>{pick(language, "Réessayer", "Retry")}</button> : null}
              </div>
            )}
            {original ? (
              <a href={original} target="_blank" rel="noopener noreferrer" className={styles.original}>
                {pick(language, "Voir la source originale", "View original source")} ↗
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
