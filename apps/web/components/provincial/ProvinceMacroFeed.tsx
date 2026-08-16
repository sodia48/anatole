"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getProvincialMacroSnapshot,
  type AnatoleLanguage,
  type ProvincialMacroSnapshot,
} from "@/lib/provincial-macro";

import styles from "./ProvinceMacroFeed.module.css";

type Props = {
  mode: "news" | "calendar";
  region: string;
  language?: AnatoleLanguage;
  search?: string;
  source?: string;
  category?: string;
  importance?: string;
};

function allValue(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return !normalized || normalized === "toutes" || normalized === "tous" || normalized === "all";
}

function matches(haystack: string, needle?: string): boolean {
  if (allValue(needle)) return true;
  return haystack.toLocaleLowerCase().includes((needle ?? "").trim().toLocaleLowerCase());
}

function dateLabel(value: string | null, language: AnatoleLanguage): string {
  if (!value) return language === "fr" ? "Date non publiée" : "Date not published";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(
    language === "fr" ? "fr-CA" : "en-CA",
    { dateStyle: "medium", timeZone: "America/Toronto" },
  ).format(parsed);
}

function dateTimeLabel(value: string, language: AnatoleLanguage): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(
    language === "fr" ? "fr-CA" : "en-CA",
    {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "America/Toronto",
    },
  ).format(parsed);
}

export default function ProvinceMacroFeed({
  mode,
  region,
  language = "fr",
  search = "",
  source,
  category,
  importance,
}: Props) {
  const [snapshot, setSnapshot] = useState<ProvincialMacroSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void getProvincialMacroSnapshot(region, language, controller.signal)
      .then((data) => {
        setSnapshot(data);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setLoading(false);
      });

    return () => controller.abort();
  }, [region, language]);

  const newsItems = useMemo(() => {
    const items = snapshot?.latest_releases ?? [];
    const query = search.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (query && !`${item.title} ${item.summary} ${item.category} ${item.source}`
        .toLocaleLowerCase().includes(query)) return false;
      if (!matches(item.source, source)) return false;
      if (!matches(item.category, category)) return false;
      if (!matches(item.importance, importance)) return false;
      return true;
    });
  }, [snapshot, search, source, category, importance]);

  const calendarItems = useMemo(() => {
    const items = snapshot?.upcoming_events ?? [];
    const query = search.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (query && !`${item.title} ${item.description} ${item.category} ${item.source}`
        .toLocaleLowerCase().includes(query)) return false;
      if (!matches(item.source, source)) return false;
      if (!matches(item.category, category)) return false;
      if (!matches(item.importance, importance)) return false;
      return true;
    });
  }, [snapshot, search, source, category, importance]);

  if (loading) {
    return (
      <section className={styles.state}>
        {language === "fr"
          ? "Chargement des sources économiques provinciales officielles…"
          : "Loading official provincial economic sources…"}
      </section>
    );
  }

  if (error || !snapshot) {
    return (
      <section className={styles.error}>
        <strong>{language === "fr" ? "Données provinciales indisponibles" : "Provincial data unavailable"}</strong>
        <span>{error ?? "Unknown error"}</span>
      </section>
    );
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.provinceBar}>
        <div>
          <span className={styles.dot} />
          <strong>
            {language === "fr"
              ? `Mode provincial — ${snapshot.province}`
              : `Province mode — ${snapshot.province}`}
          </strong>
        </div>
        <small>
          {language === "fr"
            ? "Les résultats nationaux génériques sont retirés de cette vue."
            : "Generic national results are removed from this view."}
        </small>
      </div>

      {mode === "news" ? (
        newsItems.length ? (
          <div className={styles.newsGrid}>
            {newsItems.map((item) => (
              <article className={styles.newsCard} key={item.id}>
                <div className={styles.badges}>
                  <span>{item.source}</span>
                  <span>{item.province}</span>
                  <span>{item.category}</span>
                </div>
                <div className={styles.meta}>
                  <span>{item.importance}</span>
                  <time>{dateLabel(item.published_at, language)}</time>
                </div>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                <footer>
                  <span>
                    {item.specificity === "province-direct"
                      ? language === "fr" ? "Source provinciale directe" : "Direct provincial source"
                      : item.specificity === "fiscal-direct"
                        ? language === "fr" ? "Source financière provinciale" : "Provincial fiscal source"
                        : language === "fr" ? "Donnée provinciale normalisée" : "Normalized provincial data"}
                  </span>
                  <a href={item.source_url} target="_blank" rel="noreferrer">
                    {language === "fr" ? "Source officielle ↗" : "Official source ↗"}
                  </a>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            {language === "fr"
              ? "Aucune publication économique provinciale ne correspond aux filtres."
              : "No provincial economic release matches the current filters."}
          </div>
        )
      ) : calendarItems.length ? (
        <div className={styles.eventList}>
          {calendarItems.map((item) => (
            <article className={styles.eventCard} key={item.id}>
              <div className={styles.eventWhen}>
                <strong>{dateTimeLabel(item.starts_at, language)}</strong>
                <span>{item.importance}</span>
              </div>
              <div className={styles.eventBody}>
                <div className={styles.badges}>
                  <span>{item.province}</span>
                  <span>{item.category}</span>
                  <span>
                    {item.specificity === "province-direct"
                      ? language === "fr" ? "Provincial direct" : "Direct province"
                      : language === "fr" ? "Volet provincial" : "Provincial component"}
                  </span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <small>{item.source}</small>
              </div>
              <a
                className={styles.open}
                href={item.source_url}
                target="_blank"
                rel="noreferrer"
                aria-label={language === "fr" ? "Ouvrir la source officielle" : "Open official source"}
              >
                ↗
              </a>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          {language === "fr"
            ? "Aucune diffusion provinciale essentielle ne correspond aux filtres."
            : "No essential provincial release matches the current filters."}
        </div>
      )}

      {snapshot.message ? <p className={styles.message}>{snapshot.message}</p> : null}
    </section>
  );
}
