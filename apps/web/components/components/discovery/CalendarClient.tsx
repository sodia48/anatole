"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Search } from "lucide-react";
import { getCalendarSnapshot } from "@/lib/api";
import type { CalendarSnapshot } from "@/lib/types";

const dayFormatter = new Intl.DateTimeFormat("fr-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Toronto" });
const timeFormatter = new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });

export function CalendarClient() {
  const [data, setData] = useState<CalendarSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [importance, setImportance] = useState("Toutes");
  const [category, setCategory] = useState("Toutes");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const snapshot = await getCalendarSnapshot();
        if (active) { setData(snapshot); setError(null); }
      } catch {
        if (active) setError("Le calendrier officiel est temporairement indisponible. Une nouvelle tentative sera faite automatiquement.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30 * 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const categories = useMemo(() => Array.from(new Set(data?.events.map((item) => item.category) ?? [])).sort(), [data]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.events ?? []).filter((item) => {
      const text = `${item.title} ${item.description ?? ""}`.toLowerCase();
      return (!normalized || text.includes(normalized)) && (importance === "Toutes" || item.importance === importance) && (category === "Toutes" || item.category === category);
    });
  }, [category, data, importance, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const event of filtered) {
      const key = dayFormatter.format(new Date(event.starts_at));
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  if (!data && !error) return <section className="panel discovery-loading"><span className="live-dot" /><div><h1>Préparation du calendrier</h1><p>Synchronisation des dates de Statistique Canada et de la Banque du Canada.</p></div></section>;

  return (
    <div className="discovery-page">
      <header className="panel discovery-hero">
        <div><span className="eyebrow">CALENDRIER OFFICIEL</span><h1>Événements économiques</h1><p>Dates futures des principaux indicateurs canadiens et événements de politique monétaire.</p></div>
        <div className="discovery-score"><CalendarDays size={20} /><strong>{filtered.length}</strong><span>événements futurs</span><small>Heure de Toronto</small></div>
      </header>

      {error ? <div className="cockpit-warning">{error}</div> : null}

      <section className="source-status-grid">
        {data?.source_statuses.map((item) => <article className={`panel source-status source-${item.status}`} key={item.source}><span>{item.status === "ok" ? "Disponible" : "Indisponible"}</span><strong>{item.source}</strong><small>{item.detail ?? ""}</small></article>)}
      </section>

      <section className="panel filter-bar">
        <label className="filter-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="CPI, emploi, PIB, taux…" /></label>
        <label><span>Importance</span><select value={importance} onChange={(event) => setImportance(event.target.value)}><option>Toutes</option><option>Très élevée</option><option>Élevée</option><option>Moyenne</option></select></label>
        <label><span>Catégorie</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Toutes</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      </section>

      <section className="calendar-groups">
        {grouped.map(([day, events]) => (
          <div className="calendar-day" key={day}>
            <h2>{day}</h2>
            <div className="calendar-events">
              {events.map((event) => (
                <article className="panel calendar-event" key={event.id}>
                  <time>{timeFormatter.format(new Date(event.starts_at))}</time>
                  <span className={`importance importance-${event.importance.toLowerCase().replaceAll(" ", "-")}`}>{event.importance}</span>
                  <div><strong>{event.title}</strong><small>{event.category} · {event.source} · {event.currency}</small>{event.description ? <p>{event.description}</p> : null}</div>
                  {event.url ? <a href={event.url} target="_blank" rel="noreferrer" aria-label="Ouvrir la source officielle"><ExternalLink size={17} /></a> : null}
                </article>
              ))}
            </div>
          </div>
        ))}
        {!grouped.length ? <div className="panel empty-filter"><CalendarDays size={24} /><strong>Aucun événement ne correspond aux filtres.</strong></div> : null}
      </section>
    </div>
  );
}
