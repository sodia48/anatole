"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getProvincialCalendarSnapshot,
  isProvinceRegion,
  type AnatoleLanguage,
  type ProvincialMacroEvent,
  type ProvincialMacroSnapshot,
} from "@/lib/provincial-macro";

import styles from "./ProvinceCalendarPriorityPanel.module.css";

type Props = {
  region: string;
};

function detectLanguage(): AnatoleLanguage {
  if (typeof window === "undefined") return "fr";

  const keys = [
    "anatole-language",
    "anatole_language",
    "language",
    "lang",
  ];

  for (const key of keys) {
    const value = window.localStorage.getItem(key)?.toLowerCase();
    if (value?.startsWith("en")) return "en";
    if (value?.startsWith("fr")) return "fr";
  }

  return document.documentElement.lang.toLowerCase().startsWith("en")
    ? "en"
    : "fr";
}

function dateLabel(value: string, language: AnatoleLanguage): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat(language === "fr" ? "fr-CA" : "en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(parsed);
}

function eventTypeLabel(
  event: ProvincialMacroEvent,
  language: AnatoleLanguage,
): string {
  if (event.specificity === "province-direct") {
    return language === "fr" ? "Source provinciale" : "Provincial source";
  }

  if (event.specificity === "fiscal-direct") {
    return language === "fr" ? "Finances provinciales" : "Provincial finances";
  }

  return language === "fr" ? "Volet provincial StatCan" : "Provincial StatCan data";
}

export default function ProvinceCalendarPriorityPanel({ region }: Props) {
  const [language, setLanguage] = useState<AnatoleLanguage>("fr");
  const [snapshot, setSnapshot] = useState<ProvincialMacroSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const provinceMode = isProvinceRegion(region);

  useEffect(() => {
    setLanguage(detectLanguage());
  }, []);

  useEffect(() => {
    if (!provinceMode) {
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void getProvincialCalendarSnapshot(region, language, controller.signal)
      .then((data) => {
        setSnapshot(data);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if ((caught as Error)?.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setLoading(false);
      });

    return () => controller.abort();
  }, [region, language, provinceMode]);

  const events = useMemo(() => {
    if (!snapshot) return [];

    const now = Date.now() - 2 * 60 * 60 * 1000;
    return [...snapshot.upcoming_events]
      .filter((event) => {
        const timestamp = new Date(event.starts_at).getTime();
        return Number.isFinite(timestamp) && timestamp >= now;
      })
      .sort((a, b) => {
        const dateDelta =
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
        if (dateDelta !== 0) return dateDelta;

        const directA = a.specificity === "province-direct" ? 1 : 0;
        const directB = b.specificity === "province-direct" ? 1 : 0;
        if (directA !== directB) return directB - directA;

        return b.importance_score - a.importance_score;
      })
      .slice(0, 10);
  }, [snapshot]);

  if (!provinceMode) return null;

  return (
    <section className={styles.wrap} data-anatole-province-calendar-priority="true">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>
            {language === "fr" ? "CALENDRIER PROVINCIAL PRIORITAIRE" : "PRIORITY PROVINCIAL CALENDAR"}
          </p>
          <h2>
            {snapshot
              ? language === "fr"
                ? `À venir — ${snapshot.province}`
                : `Upcoming — ${snapshot.province}`
              : language === "fr"
                ? "Annonces économiques provinciales à venir"
                : "Upcoming provincial economic releases"}
          </h2>
        </div>
        <p className={styles.explainer}>
          {language === "fr"
            ? "Sources statistiques provinciales officielles d’abord; Statistique Canada seulement lorsqu’une diffusion contient un vrai volet provincial essentiel."
            : "Official provincial statistical sources first; Statistics Canada only when a release contains a genuinely important provincial component."}
        </p>
      </header>

      {loading ? (
        <div className={styles.state}>
          {language === "fr"
            ? "Chargement des prochaines diffusions provinciales…"
            : "Loading upcoming provincial releases…"}
        </div>
      ) : error ? (
        <div className={styles.warning}>
          <strong>
            {language === "fr"
              ? "Le calendrier provincial direct n’a pas répondu."
              : "The direct provincial calendar did not respond."}
          </strong>
          <span>{error}</span>
        </div>
      ) : events.length === 0 ? (
        <div className={styles.state}>
          {language === "fr"
            ? "Aucune diffusion provinciale essentielle n’a encore été publiée pour l’horizon courant."
            : "No essential provincial release has been published yet for the current horizon."}
        </div>
      ) : (
        <div className={styles.grid}>
          {events.map((event) => (
            <article className={styles.card} key={event.id}>
              <div className={styles.topline}>
                <time>{dateLabel(event.starts_at, language)}</time>
                <span
                  className={
                    event.importance === "Élevée"
                      ? styles.high
                      : event.importance === "Moyenne"
                        ? styles.medium
                        : styles.low
                  }
                >
                  {event.importance}
                </span>
              </div>

              <h3>{event.title}</h3>

              <div className={styles.badges}>
                <span>{event.category}</span>
                <span>{eventTypeLabel(event, language)}</span>
              </div>

              <p>{event.description}</p>

              <footer>
                <strong>{event.source}</strong>
                <a href={event.source_url} target="_blank" rel="noreferrer">
                  {language === "fr" ? "Source officielle ↗" : "Official source ↗"}
                </a>
              </footer>
            </article>
          ))}
        </div>
      )}

      {snapshot?.message ? <p className={styles.message}>{snapshot.message}</p> : null}
    </section>
  );
}
