"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";

import { getNewsBrief } from "@/lib/api";
import { useAssistantContext } from "@/components/assistant/AssistantContextProvider";
import { NewsImpactPanel } from "./NewsImpactPanel";
import { localeFor, pick } from "@/lib/i18n";
import type { NewsArticleEvent, NewsBriefRequest, NewsBriefResponse } from "@/lib/types";

import styles from "./NewsIntelligenceReader.module.css";

export type ReaderArticle = {
  title: string;
  summary: string;
  url: string;
  source: string;
  category: string;
  region: string;
  publishedAt?: string | null;
  dateOnly?: boolean;
  imageUrl?: string | null;
  context: "macro" | "stock";
  ticker?: string;
  company?: string;
  relatedTickers?: string[];
  eventType?: "results" | "dividend" | "acquisition" | "financing" | "leadership" | "operations" | "other";
  candidateSources?: NewsBriefRequest["candidate_sources"];
};

type ReaderView = "read" | "summary" | "financial";

function eventDate(value: string | null | undefined, language: "fr" | "en", time: boolean): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: "long", ...(time ? { timeStyle: "short" as const } : {}), timeZone: "America/Toronto",
  }).format(parsed);
}

function calendarHref(event: NewsArticleEvent, title: string, source: string): string | null {
  if (!event.starts_at || event.kind !== "conference" || event.timing !== "confirmed") return null;
  return `/api/news-calendar?${new URLSearchParams({ start: event.starts_at, title, source })}`;
}

function NewsArticleRead({ brief, language, context }: { brief: NewsBriefResponse; language: "fr" | "en"; context: ReaderArticle["context"] }) {
  const article = brief.article;
  if (!article) return <NewsBrief brief={brief} language={language} context={context} view="detail" />;
  const call = article.events.find((event) => event.kind === "conference");
  const calendar = call ? calendarHref(call, brief.title, article.source_url) : null;
  const webcastLink = safeLink(call?.webcast_url ?? "") ?? safeLink(article.source_url);
  const alternate = article.alternate_sources.find((source) => source.url !== article.source_url);
  return <div className={styles.articleBody}>
    <p className={styles.coverage}>{article.coverage_note}</p>
    {article.facts.length ? <section className={styles.readSection}>
      <h3>{pick(language, "L’essentiel", "The essentials")}</h3>
      {article.facts.map((fact, index) => <p key={`${index}-${fact.slice(0, 16)}`} lang={article.kind === "results_schedule" ? language : article.language}>{fact}</p>)}
    </section> : null}
    {article.events.length ? <section className={styles.readSection}>
      <h3>{pick(language, "Événements importants", "Key events")}</h3>
      <dl className={styles.eventList}>{article.events.map((event, index) => <div key={`${event.kind}-${index}`}>
        <dt>{event.label}</dt>
        <dd>{eventDate(event.starts_at, language, event.kind === "conference" && event.timing === "confirmed") ?? pick(language, "Date non précisée", "Date not specified")}
          {event.timing === "after_close" ? ` · ${pick(language, "après la clôture", "after market close")}` : null}
          {event.timezone && event.kind === "conference" ? ` · ${pick(language, "heure de l’Est", "Eastern time")}` : null}</dd>
      </div>)}</dl>
    </section> : null}
    {call && (call.phone_numbers.length > 0 || call.access_code || call.replay_until || call.webcast_url) ? <section className={styles.readSection}>
      <h3>{pick(language, "Participer à la conférence", "Join the conference")}</h3>
      {webcastLink ? <p>{pick(language, "Webdiffusion et modalités :", "Webcast and details:")} <a href={webcastLink} target="_blank" rel="noopener noreferrer">{pick(language, "communiqué officiel", "official release")}</a></p> : null}
      <details><summary>{pick(language, "Numéros et code d’accès", "Dial-in numbers and access code")}</summary>
        {call.phone_numbers.length ? <p>{call.phone_numbers.join(" · ")}</p> : null}
        {call.access_code ? <p>{pick(language, "Code d’accès", "Access code")} : {call.access_code}</p> : null}
        {call.replay_until ? <p>{pick(language, "Enregistrement disponible jusqu’au", "Replay available until")} {eventDate(call.replay_until, language, false)}</p> : null}
      </details>
      {calendar ? <a className={styles.calendar} href={calendar}>{pick(language, "Ajouter au calendrier", "Add to calendar")}</a> : null}
    </section> : null}
    {article.limitations.length ? <div className={styles.limitBox}><strong>{pick(language, "À retenir", "Keep in mind")}</strong>
      {article.limitations.map((limit) => <p key={limit}>{limit}</p>)}</div> : null}
    {alternate && safeLink(alternate.url) ? <a href={alternate.url} target="_blank" rel="noopener noreferrer" className={styles.alternate}>{alternate.publisher} ↗</a> : null}
    <NewsBriefProvenance brief={brief} language={language} />
  </div>;
}

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
    <div className={styles.provenance}>
      <strong>{label}</strong>
      <span>{brief.source_note}</span>
    </div>
  );
}

function NewsBriefFigures({ brief, language }: {
  brief: NewsBriefResponse;
  language: "fr" | "en";
}) {
  const [expanded, setExpanded] = useState(false);
  const series = brief.figure_series ?? [];
  if (!brief.key_figures.length && !series.length) return null;
  const visible = expanded ? brief.key_figures : brief.key_figures.slice(0, 3);
  return (
    <section className={styles.section}>
      <h3>{pick(language, "Chiffres importants", "Important figures")}</h3>
      {series.map((group, index) => (
        <div className={styles.series} key={group.label + index}>
          <strong>{group.label}</strong>
          <table>
            <thead><tr><th scope="col">{pick(language, "Période", "Period")}</th><th scope="col">{pick(language, "Valeur", "Value")}</th></tr></thead>
            <tbody>{group.figures.map((figure, figureIndex) => (
              <tr key={figure.period + figure.value + figureIndex}><th scope="row">{figure.period}</th><td>{figure.value}</td></tr>
            ))}</tbody>
          </table>
          <details><summary>{pick(language, "Justifications", "Evidence")}</summary>
            <ul>{group.figures.map((figure) => <li key={figure.period + figure.value}>
              <strong>{figure.period}</strong> — {figure.context}
            </li>)}</ul>
          </details>
        </div>
      ))}
      <div className={styles.figures}>
        {visible.map((figure, index) => (
          <div className={styles.figure} key={figure.value + index}>
            {figure.label ? <span className={styles.figureLabel}>{figure.label}</span> : null}
            <strong>{figure.value}</strong>
            <span>{figure.period ? figure.period + " · " : ""}{figure.kind === "forecast"
              ? pick(language, "Prévision", "Forecast")
              : figure.kind === "opinion"
                ? pick(language, "Opinion d’analyste", "Analyst opinion")
                : figure.kind === "date"
                  ? pick(language, "Date annoncée", "Announced date")
                : pick(language, "Donnée publiée", "Published figure")}</span>
            <details><summary>{pick(language, "Justification", "Source evidence")}</summary><p>{figure.context}</p></details>
          </div>
        ))}
      </div>
      {brief.key_figures.length > 3 ? <button type="button" className={styles.more} onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        {expanded ? pick(language, "Masquer les détails", "Hide details") : pick(language, "Voir les détails", "See details")}
      </button> : null}
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
          <h3>{pick(language, "Autres faits", "Other facts")}</h3>
          <ul>{brief.changes.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </section>
      ) : null}
      {brief.why_it_matters ? (
        <section className={styles.analysis}>
          <h3>{pick(language, "Pourquoi c’est important", "Why it matters")}</h3>
          <p>{brief.why_it_matters}</p>
          <small>{pick(language, "Selon le contenu disponible.", "Based on available content.")}</small>
        </section>
      ) : context === "stock" && brief.relevance !== "direct" ? (
        <p className={styles.limit}>{pick(
          language,
          "Lien direct non établi.",
          "Direct link not established.",
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
  if (brief.availability === "limited") {
    return <p className={styles.limit}>{pick(language,
      "Seuls le titre et la source sont disponibles. Ouvrez l’article original pour en savoir plus.",
      "Only the title and source are available. Open the original article for details.")}</p>;
  }
  const untranslated = brief.translation_status === "unavailable" &&
    brief.source_language && brief.source_language !== "unknown" &&
    brief.source_language !== language;
  return (
    <>
      <section className={styles.lead}>
          <span>{pick(language, "L’ESSENTIEL", "THE ESSENTIALS")}</span>
          <h3>{pick(language, "Résumé", "Summary")}</h3>
          <p lang={untranslated ? brief.source_language : undefined}>{brief.summary}</p>
      </section>
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

export function NewsIntelligenceReader({ article, language, onClose, returnFocusRef }: {
  article: ReaderArticle;
  language: "fr" | "en";
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeCallback = useRef(onClose);
  const handoffFocus = useRef(false);
  const { openAssistant } = useAssistantContext();
  const [brief, setBrief] = useState<NewsBriefResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<ReaderView>("read");
  const original = safeLink(article.url);
  const primarySource = brief?.article ? safeLink(brief.article.source_url) : original;
  const displayPublishedAt = brief?.article?.published_at ?? article.publishedAt;
  const dateOnly = article.dateOnly || (Boolean(brief?.article) && brief?.article?.source_url !== article.url);
  const published = displayPublishedAt ? new Date(displayPublishedAt) : null;
  const publishedLabel = published && !Number.isNaN(published.getTime())
    ? new Intl.DateTimeFormat(localeFor(language), {
      dateStyle: "long", ...(!dateOnly ? { timeStyle: "short" as const } : {}),
      timeZone: dateOnly ? "UTC" : "America/Toronto",
    }).format(published)
    : null;

  useEffect(() => { closeCallback.current = onClose; }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const trigger = returnFocusRef?.current;
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
      requestAnimationFrame(() => {
        if (!handoffFocus.current && !panel?.isConnected) {
          const target = trigger?.isConnected ? trigger : previous;
          target?.focus();
        }
      });
    };
  }, [returnFocusRef]);

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
      candidate_sources: article.candidateSources,
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

  const askAboutArticle = () => {
    if (!article.ticker) return;
    handoffFocus.current = true;
    onClose();
    openAssistant({ surface: "stock", symbol: article.ticker, symbols: [article.ticker],
      instrument_type: "stock", metadata: { news_url: article.url, news_title: article.title } });
  };
  const financialAvailable = article.context === "stock" && Boolean(article.ticker) &&
    brief?.relevance === "direct" && brief?.availability !== "limited" &&
    (article.eventType === "results" || article.eventType === "dividend");
  const activeView: ReaderView = view === "financial" && !financialAvailable ? "read" : view;

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
          <div className={styles.content}>
            <div className={styles.meta}>
              <span>{brief?.source_name ?? article.source}</span>
              {publishedLabel ? <time dateTime={displayPublishedAt ?? undefined}>{publishedLabel}</time> : null}
            </div>
            <h2 id={titleId}>{brief?.title ?? article.title}</h2>
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
                <div className={styles.views} role="group" aria-label={pick(language, "Mode de lecture", "Reading mode")}>
                  <button type="button" aria-pressed={activeView === "read"} onClick={() => setView("read")}>{pick(language, "Lire l’article", "Read the article")}</button>
                  <button type="button" aria-pressed={activeView === "summary"} onClick={() => setView("summary")}>{pick(language, "Résumé Anatole", "Anatole summary")}</button>
                  {financialAvailable ? <button type="button" aria-pressed={activeView === "financial"} onClick={() => setView("financial")}>{pick(language, "Analyse financière", "Financial analysis")}</button> : null}
                </div>
                <div>
                  {activeView === "read" ? <NewsArticleRead brief={brief} language={language} context={article.context} />
                    : activeView === "summary" ? <NewsBrief brief={brief} language={language} context={article.context} view="quick" />
                      : <><NewsBrief brief={brief} language={language} context={article.context} view="detail" />
                        {financialAvailable ? <NewsImpactPanel article={article} language={language} onAsk={askAboutArticle}
                          resultsScheduled={brief.article?.kind === "results_schedule"} /> : null}</>}
                </div>
              </>
            ) : (
              <div className={styles.fallback} role={failed ? "alert" : undefined}>
                <h3>{failed ? pick(language, "Résumé indisponible", "Brief unavailable") : pick(language, "Informations limitées", "Limited information")}</h3>
                {article.summary ? <p>{article.summary}</p> : null}
                {failed ? <button type="button" onClick={() => setAttempt((value) => value + 1)}>{pick(language, "Réessayer", "Retry")}</button> : null}
              </div>
            )}
            {primarySource ? (
              <a href={primarySource} target="_blank" rel="noopener noreferrer" className={styles.original}>
                {primarySource === original ? pick(language, "Voir la source originale", "View original source")
                  : pick(language, "Voir le communiqué officiel", "View official release")} ↗
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
