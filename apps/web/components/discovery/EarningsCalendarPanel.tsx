"use client";

import { Search, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getEarningsCalendarSnapshot } from "@/lib/api";
import { localeFor, pick } from "@/lib/i18n";
import type {
  EarningsCalendarEvent,
  EarningsCalendarSnapshot,
} from "@/lib/types";

import styles from "./EarningsCalendarPanel.module.css";

type Universe = "canada" | "composite" | "tsx60";
const snapshots = new Map<Universe, EarningsCalendarSnapshot>();

export function EarningsCalendarPanel({
  language,
}: {
  language: "fr" | "en";
}) {
  const [universe, setUniverse] = useState<Universe>("canada");
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [data, setData] = useState<EarningsCalendarSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("ALL");
  const [horizon, setHorizon] = useState("90");
  const [visibleLimit, setVisibleLimit] = useState(60);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    queueMicrotask(() => {
      if (!active) return;
      setData(snapshots.get(universe) ?? null);
      setError(null);
      setVisibleLimit(60);
    });

    const load = () => {
      if (!active) return;
      setRefreshing(true);
      return void getEarningsCalendarSnapshot(universe, controller.signal)
      .then((snapshot) => {
        if (!active) return;
        if (snapshot.status === "unavailable" && snapshot.refresh_in_progress) {
          snapshot = { ...snapshot, status: snapshot.events.length ? "partial" : "loading" };
        }
        const unavailable = snapshot.status === "unavailable" && !snapshot.refresh_in_progress;
        if (!unavailable && snapshot.status !== "loading") snapshots.set(universe, snapshot);
        setData(snapshots.get(universe) ?? snapshot);
        setError(unavailable ? pick(language, "Le calendrier est temporairement indisponible.", "The calendar is temporarily unavailable.") : null);
        if (snapshot.refresh_in_progress || unavailable) timer = setTimeout(load, unavailable ? 60_000 : 5_000);
      })
      .catch((reason: unknown) => {
        if (
          active &&
          !(reason instanceof DOMException && reason.name === "AbortError")
        ) {
          setError(
            pick(
              language,
              "Le calendrier des résultats est temporairement indisponible.",
              "The earnings calendar is temporarily unavailable.",
            ),
          );
          timer = setTimeout(load, 30_000);
        }
      }).finally(() => { if (active) setRefreshing(false); });
    };
    load();

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [language, universe, revision]);

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
    const today = new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    const limit = now + Number(horizon) * 86_400_000;
    return (data?.events ?? []).filter((item) => {
      const text = `${item.ticker} ${item.company}`.toLowerCase();
      return (
        (!normalized || text.includes(normalized)) &&
        (sector === "ALL" || item.sector === sector) &&
        Date.parse(item.starts_at) <= limit &&
        new Date(item.starts_at).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }) >= today
      );
    });
  }, [data, horizon, query, sector, now]);

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
  const epsFormatter = useMemo(
    () =>
      new Intl.NumberFormat(localeFor(language), {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }),
    [language],
  );
  const revenueFormatter = useMemo(
    () =>
      new Intl.NumberFormat(localeFor(language), {
        notation: "compact",
        maximumFractionDigits: 2,
      }),
    [language],
  );

  const grouped = useMemo(() => {
    const output = new Map<string, EarningsCalendarEvent[]>();
    for (const item of filtered.slice(0, visibleLimit)) {
      const key = dayFormatter.format(new Date(item.starts_at));
      output.set(key, [...(output.get(key) ?? []), item]);
    }
    return Array.from(output.entries());
  }, [dayFormatter, filtered, visibleLimit]);

  return (
    <section className={styles.root} aria-label={pick(language, "Résultats Canada à venir", "Upcoming Canadian earnings")}>
      <header className={`panel ${styles.hero}`}>
        <div>
          <span className="eyebrow">
            {pick(language, "CALENDRIER DES SOCIÉTÉS", "COMPANY CALENDAR")}
          </span>
          <h1>{pick(language, "Résultats Canada à venir", "Upcoming Canadian earnings")}</h1>
          <p>
            {pick(
              language,
              "Sociétés cotées au Canada : TSX, TSX Venture, CSE et Cboe Canada, au-delà des indices. Les dates disponibles restent indicatives jusqu’à confirmation par l’émetteur.",
              "Canadian-listed companies: TSX, TSX Venture, CSE and Cboe Canada, beyond the indices. Available dates remain indicative until confirmed by the issuer.",
            )}
          </p>
        </div>
        <div className={styles.score}>
          <TrendingUp size={20} />
          <strong>{data && data.status !== "loading" && data.status !== "unavailable" ? filtered.length : "—"}</strong>
          <span>{pick(language, "publications à venir", "upcoming reports")}</span>
          <small>
            {data && data.status !== "loading" && data.status !== "unavailable"
              ? `${data.companies_with_dates}/${data.constituent_count} ${pick(language, "sociétés datées", "companies dated")}`
              : error ? pick(language, "Indisponible", "Unavailable") : pick(language, "Chargement…", "Loading…")}
          </small>
          {data?.status === "partial" && !data.refresh_in_progress ? <small>{pick(language, "Couverture partielle", "Partial coverage")}</small> : null}
        </div>
      </header>

      <section className={`panel ${styles.controls}`} aria-label={pick(language, "Filtres des résultats", "Earnings filters")}>
        <div className={styles.universeButtons} role="group" aria-label={pick(language, "Univers canadien", "Canadian universe")}>
          <button type="button" aria-pressed={universe === "canada"} onClick={() => setUniverse("canada")}>Canada</button>
          <button type="button" aria-pressed={universe === "composite"} onClick={() => setUniverse("composite")}>TSX Composite</button>
          <button type="button" aria-pressed={universe === "tsx60"} onClick={() => setUniverse("tsx60")}>TSX 60</button>
        </div>

        <label className={`${styles.control} ${styles.search}`}>
          <span>{pick(language, "Rechercher", "Search")}</span>
          <span>
            <Search size={14} aria-hidden="true" />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleLimit(60); }} placeholder={pick(language, "Ticker ou entreprise", "Ticker or company")} />
          </span>
        </label>

        <label className={styles.control}>
          <span>{pick(language, "Secteur", "Sector")}</span>
          <select value={sector} onChange={(event) => { setSector(event.target.value); setVisibleLimit(60); }}>
            <option value="ALL">{pick(language, "Tous", "All")}</option>
            {sectors.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label className={styles.control}>
          <span>{pick(language, "Horizon", "Horizon")}</span>
          <select value={horizon} onChange={(event) => { setHorizon(event.target.value); setVisibleLimit(60); }}>
            <option value="30">30 {pick(language, "jours", "days")}</option>
            <option value="90">90 {pick(language, "jours", "days")}</option>
            <option value="180">180 {pick(language, "jours", "days")}</option>
          </select>
        </label>
      </section>

      <div className={styles.refreshRow}>
        <button type="button" className="button-secondary" disabled={refreshing} onClick={() => setRevision((value) => value + 1)}>
          {refreshing ? pick(language, "Actualisation…", "Refreshing…") : pick(language, "Actualiser", "Refresh")}
        </button>
      </div>
      {error ? <div className="cockpit-warning" role="status">{error} {data?.events.length ? pick(language, "Dernières données disponibles.", "Last available data.") : ""}</div> : null}
      {data?.stale ? <p role="status">{pick(language, "Dernières données disponibles.", "Last available data.")}</p> : null}
      {data?.refresh_in_progress ? <p role="status">{pick(language, "Synchronisation des dates et estimations…", "Synchronizing dates and estimates…")}</p> : null}

      {!data && !error ? <div className={`panel ${styles.loading}`}>{pick(language, "Synchronisation des résultats…", "Synchronizing earnings…")}</div> : null}

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
                      <span className={styles.meta}>{event.exchange ? `${event.exchange} · ` : ""}{event.sector ?? pick(language, "Secteur non publié", "Sector not published")} · {timeFormatter.format(new Date(event.starts_at))}</span>
                      <span className={styles.estimate}>{pick(language, "Date et heure indicatives", "Indicative date and time")}</span>
                      <div className={styles.consensus}>
                        <div>
                          <span>{pick(language, "EPS estimé", "Estimated EPS")}</span>
                          <strong>
                            {typeof event.eps_estimate !== "number"
                              ? "—"
                              : `${epsFormatter.format(event.eps_estimate)}${event.estimate_currency ? ` ${event.estimate_currency}` : ""}`}
                          </strong>
                          <small>
                            {event.eps_analyst_count
                              ? `${event.eps_analyst_count} ${pick(language, "analystes", "analysts")}`
                              : data.refresh_in_progress ? pick(language, "Consensus en synchronisation", "Consensus synchronizing") : pick(language, "Consensus indisponible", "Consensus unavailable")}
                          </small>
                        </div>
                        <div>
                          <span>{pick(language, "Revenus estimés", "Estimated revenue")}</span>
                          <strong>
                            {typeof event.revenue_estimate !== "number"
                              ? "—"
                              : `${revenueFormatter.format(event.revenue_estimate)}${event.estimate_currency ? ` ${event.estimate_currency}` : ""}`}
                          </strong>
                          <small>
                            {event.revenue_analyst_count
                              ? `${event.revenue_analyst_count} ${pick(language, "analystes", "analysts")}`
                              : data.refresh_in_progress ? pick(language, "Consensus en synchronisation", "Consensus synchronizing") : pick(language, "Consensus indisponible", "Consensus unavailable")}
                          </small>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}

          {!grouped.length && !error && !data.refresh_in_progress && data.status !== "unavailable" ? <div className={`panel ${styles.empty}`}>{pick(language, "Aucune date future publiée pour ces filtres.", "No published future date matches these filters.")}</div> : null}
          {filtered.length > visibleLimit ? <button type="button" className="button-secondary" onClick={() => setVisibleLimit((value) => value + 60)}>{pick(language, "Afficher plus", "Show more")} ({visibleLimit}/{filtered.length})</button> : null}
        </section>
      ) : null}
    </section>
  );
}
