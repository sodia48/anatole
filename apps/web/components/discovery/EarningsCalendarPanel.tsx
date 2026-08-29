"use client";

import { ExternalLink, Search, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getEarningsCalendarSnapshot } from "@/lib/api";
import { localeFor, pick } from "@/lib/i18n";
import type {
  EarningsCalendarEvent,
  EarningsCalendarSnapshot,
} from "@/lib/types";

import styles from "./EarningsCalendarPanel.module.css";

type Universe = "composite" | "tsx60";

export function EarningsCalendarPanel({
  language,
}: {
  language: "fr" | "en";
}) {
  const [universe, setUniverse] = useState<Universe>("composite");
  const [data, setData] = useState<EarningsCalendarSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("ALL");
  const [horizon, setHorizon] = useState("90");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setData(null);
      setError(null);
    });

    void getEarningsCalendarSnapshot(universe, controller.signal)
      .then((snapshot) => {
        if (active) setData(snapshot);
      })
      .catch((reason: unknown) => {
        if (
          active &&
          !(reason instanceof DOMException && reason.name === "AbortError")
        ) {
          setError(
            pick(
              language,
              "Le calendrier des résultats TSX est temporairement indisponible.",
              "The TSX earnings calendar is temporarily unavailable.",
            ),
          );
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [language, universe]);

  const sectors = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.events ?? [])
            .map((item) => item.sector)
            .filter((item): item is string => Boolean(item)),
        ),
      ).sort(),
    [data],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const generatedAt = data ? Date.parse(data.generated_at) : 0;
    const limit = generatedAt + Number(horizon) * 86_400_000;
    return (data?.events ?? []).filter((item) => {
      const text = `${item.ticker} ${item.company}`.toLowerCase();
      return (
        (!normalized || text.includes(normalized)) &&
        (sector === "ALL" || item.sector === sector) &&
        Date.parse(item.starts_at) <= limit
      );
    });
  }, [data, horizon, query, sector]);

  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeFor(language), {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Toronto",
      }),
    [language],
  );
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeFor(language), {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Toronto",
      }),
    [language],
  );

  const grouped = useMemo(() => {
    const output = new Map<string, EarningsCalendarEvent[]>();
    for (const item of filtered) {
      const key = dayFormatter.format(new Date(item.starts_at));
      output.set(key, [...(output.get(key) ?? []), item]);
    }
    return Array.from(output.entries());
  }, [dayFormatter, filtered]);

  return (
    <section className={styles.root} aria-label={pick(language, "Résultats TSX à venir", "Upcoming TSX earnings")}>
      <header className={`panel ${styles.hero}`}>
        <div>
          <span className="eyebrow">
            {pick(language, "CALENDRIER DES SOCIÉTÉS", "COMPANY CALENDAR")}
          </span>
          <h1>{pick(language, "Résultats TSX à venir", "Upcoming TSX earnings")}</h1>
          <p>
            {pick(
              language,
              "Fenêtres de publication disponibles pour les composantes du S&P/TSX Composite ou du TSX 60. Les dates restent indicatives jusqu’à confirmation par l’émetteur.",
              "Available reporting windows for S&P/TSX Composite or TSX 60 constituents. Dates remain indicative until confirmed by the issuer.",
            )}
          </p>
        </div>
        <div className={styles.score}>
          <TrendingUp size={20} />
          <strong>{filtered.length}</strong>
          <span>{pick(language, "publications à venir", "upcoming reports")}</span>
          <small>
            {data
              ? `${data.companies_with_dates}/${data.constituent_count} ${pick(language, "sociétés datées", "companies dated")}`
              : pick(language, "Chargement…", "Loading…")}
          </small>
        </div>
      </header>

      <div className={styles.notice}>
        {pick(
          language,
          "Aucune date n’est inventée. Cette vue relaie un calendrier de marché public; vérifiez toujours la page Relations investisseurs de la société avant d’agir.",
          "No dates are fabricated. This view relays a public market calendar; always verify the company’s Investor Relations page before acting.",
        )}
      </div>

      <section className={`panel ${styles.controls}`} aria-label={pick(language, "Filtres des résultats", "Earnings filters")}>
        <div className={styles.universeButtons} role="group" aria-label={pick(language, "Univers TSX", "TSX universe")}>
          <button type="button" aria-pressed={universe === "composite"} onClick={() => setUniverse("composite")}>TSX Composite</button>
          <button type="button" aria-pressed={universe === "tsx60"} onClick={() => setUniverse("tsx60")}>TSX 60</button>
        </div>

        <label className={`${styles.control} ${styles.search}`}>
          <span>{pick(language, "Rechercher", "Search")}</span>
          <span>
            <Search size={14} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick(language, "Ticker ou entreprise", "Ticker or company")} />
          </span>
        </label>

        <label className={styles.control}>
          <span>{pick(language, "Secteur", "Sector")}</span>
          <select value={sector} onChange={(event) => setSector(event.target.value)}>
            <option value="ALL">{pick(language, "Tous", "All")}</option>
            {sectors.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label className={styles.control}>
          <span>{pick(language, "Horizon", "Horizon")}</span>
          <select value={horizon} onChange={(event) => setHorizon(event.target.value)}>
            <option value="30">30 {pick(language, "jours", "days")}</option>
            <option value="90">90 {pick(language, "jours", "days")}</option>
            <option value="180">180 {pick(language, "jours", "days")}</option>
          </select>
        </label>
      </section>

      {error ? <div className="cockpit-warning">{error}</div> : null}

      {data ? (
        <section className={styles.statuses}>
          {data.source_statuses.map((item) => (
            <article className={`panel ${styles.status}`} key={item.source}>
              <span>{item.status === "ok" ? pick(language, "Disponible", "Available") : item.status === "partial" ? pick(language, "Partielle", "Partial") : pick(language, "Indisponible", "Unavailable")}</span>
              <strong>{item.source}</strong>
              <small>{item.detail ?? "—"}</small>
            </article>
          ))}
        </section>
      ) : null}

      {!data && !error ? <div className={`panel ${styles.loading}`}>{pick(language, "Synchronisation des résultats TSX…", "Synchronizing TSX earnings…")}</div> : null}

      {data ? (
        <section className={styles.groups}>
          {grouped.map(([day, events]) => (
            <div className={styles.day} key={day}>
              <h2>{day}</h2>
              <div className={styles.events}>
                {events.map((event) => (
                  <article className={`panel ${styles.event}`} key={`${event.ticker}-${event.starts_at}`}>
                    <a className={styles.ticker} href={`/focus/${encodeURIComponent(event.ticker)}`}>{event.ticker}</a>
                    <div className={styles.eventBody}>
                      <strong>{event.company}</strong>
                      <span className={styles.meta}>{event.sector ?? pick(language, "Secteur non publié", "Sector not published")} · {timeFormatter.format(new Date(event.starts_at))}</span>
                      <span className={styles.estimate}>{pick(language, "Date et heure indicatives", "Indicative date and time")}</span>
                    </div>
                    <div className={styles.eventActions}>
                      <a href={event.url} target="_blank" rel="noreferrer" aria-label={pick(language, `Ouvrir la source pour ${event.ticker}`, `Open source for ${event.ticker}`)}><ExternalLink size={15} /></a>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}

          {!grouped.length ? <div className={`panel ${styles.empty}`}>{pick(language, "Aucune date future publiée pour ces filtres.", "No published future date matches these filters.")}</div> : null}
        </section>
      ) : null}
    </section>
  );
}
