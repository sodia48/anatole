"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Star } from "lucide-react";
import { getWatchlistSnapshot } from "@/lib/api";
import type { WatchlistSnapshot } from "@/lib/types";
import { normalizeWatchlistSymbol, readWatchlist, writeWatchlist, WATCHLIST_EVENT } from "@/lib/watchlist";
import { WatchlistTable } from "./WatchlistTable";
import { REFRESH_INTERVALS } from "@/lib/refresh";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick } from "@/lib/i18n";

export function WatchlistClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [tickers, setTickers] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<WatchlistSnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTickers(readWatchlist());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const applySyncedWatchlist = () => setTickers(readWatchlist());
    window.addEventListener(WATCHLIST_EVENT, applySyncedWatchlist);
    return () => window.removeEventListener(WATCHLIST_EVENT, applySyncedWatchlist);
  }, []);

  const load = useCallback(async (current: string[], signal?: AbortSignal) => {
    if (current.length === 0) {
      setSnapshot(null);
      return;
    }
    setRefreshing(true);
    try {
      const data = await getWatchlistSnapshot(current, signal);
      setSnapshot(data);
      setError(null);
    } catch (reason) {
      if ((reason as Error).name !== "AbortError") {
        setError(pick(language, "Les cotations n’ont pas pu être récupérées. Anatole réessaiera automatiquement.", "Quotes could not be retrieved. Anatole will retry automatically."));
      }
    } finally {
      setRefreshing(false);
    }
  }, [language]);

  useEffect(() => {
    if (!hydrated || tickers.length === 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(tickers, controller.signal), 0);
    const interval = window.setInterval(() => {
      if (!document.hidden) void load(tickers);
    }, REFRESH_INTERVALS.watchlist);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      window.clearInterval(interval);
    };
  }, [hydrated, load, tickers]);

  const symbols = useMemo(() => new Set(tickers), [tickers]);

  const addTicker = (event: FormEvent) => {
    event.preventDefault();
    const symbol = normalizeWatchlistSymbol(draft);
    if (!/^[A-Z0-9.-]{1,15}$/.test(symbol)) {
      setError(pick(language, "Entre un symbole valide, par exemple MDA, RY ou BAM.A.", "Enter a valid symbol, such as MDA, RY, or BAM.A."));
      return;
    }
    if (symbols.has(symbol)) {
      setError(pick(language, `${symbol} est déjà dans la watchlist.`, `${symbol} is already on the watchlist.`));
      return;
    }
    if (tickers.length >= 30) {
      setError(pick(language, "La version bêta accepte un maximum de 30 titres par watchlist.", "The beta supports up to 30 securities per watchlist."));
      return;
    }
    const next = writeWatchlist([...tickers, symbol]);
    setTickers(next);
    setDraft("");
    setError(null);
  };

  const removeTicker = (ticker: string) => {
    const symbol = normalizeWatchlistSymbol(ticker.replace(/-/g, "."));
    const next = writeWatchlist(tickers.filter((item) => item !== symbol));
    setTickers(next);
    setSnapshot((current) => current ? { ...current, items: current.items.filter((item) => item.ticker !== ticker) } : current);
  };

  if (!hydrated) {
    return <section className="panel cockpit-loading"><span className="live-dot" /><div><h1>{pick(language, "Chargement de la watchlist", "Loading the watchlist")}</h1><p>{pick(language, "Lecture de tes titres enregistrés…", "Reading your saved securities…")}</p></div></section>;
  }

  return (
    <div className="watchlist-page">
      <header className="panel watchlist-header">
        <div>
          <span className="eyebrow">ANATOLE WATCHLIST</span>
          <h1>{pick(language, "Titres suivis", "Tracked securities")}</h1>
          <p>{pick(language, "Variations actualisées automatiquement environ toutes les 20 secondes.", "Changes refresh automatically about every 20 seconds.")}</p>
        </div>
        <form className="watchlist-add" onSubmit={addTicker}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={pick(language, "Ajouter MDA, RY, BAM.A…", "Add MDA, RY, BAM.A…")} aria-label={pick(language, "Symbole à ajouter", "Symbol to add")} />
          <button type="submit"><Plus size={18} /><span>{pick(language, "Ajouter", "Add")}</span></button>
        </form>
      </header>

      {error ? <div className="cockpit-warning">{error}</div> : null}

      {tickers.length === 0 ? (
        <section className="panel watchlist-empty">
          <Star size={28} />
          <h2>{pick(language, "Ta watchlist est vide", "Your watchlist is empty")}</h2>
          <p>{pick(language, "Ajoute un symbole ci-dessus ou utilise le bouton « Suivre » dans la section Focus.", "Add a symbol above or use the Follow button in Focus.")}</p>
        </section>
      ) : snapshot ? (
        <>
          <section className="watchlist-kpis">
            <article className="panel cockpit-kpi"><span>{pick(language, "Titres suivis", "Tracked")}</span><strong>{snapshot.items.length}</strong></article>
            <article className="panel cockpit-kpi"><span>{pick(language, "Progressions", "Advancers")}</span><strong className="positive">{snapshot.summary.advancers}</strong></article>
            <article className="panel cockpit-kpi"><span>{pick(language, "Baisses", "Decliners")}</span><strong className="negative">{snapshot.summary.decliners}</strong></article>
            <article className="panel cockpit-kpi"><span>{pick(language, "Variation moyenne", "Average change")}</span><strong className={snapshot.summary.average_change_percent >= 0 ? "positive" : "negative"}>{snapshot.summary.average_change_percent >= 0 ? "+" : ""}{snapshot.summary.average_change_percent.toFixed(2)}%</strong></article>
          </section>
          <WatchlistTable items={snapshot.items} onRemove={removeTicker} />
          <footer className="status-footer">
            {refreshing ? pick(language, "Actualisation en cours…", "Refreshing…") : `${pick(language, "Mis à jour", "Updated")} ${new Date(snapshot.generated_at).toLocaleTimeString(localeFor(language))}`} · {pick(language, "Sauvegarde locale, avec synchronisation optionnelle du compte", "Saved locally with optional account synchronization")} · {pick(language, "Cotations publiques potentiellement différées", "Public quotes may be delayed")}
          </footer>
        </>
      ) : (
        <section className="panel cockpit-loading"><span className="live-dot" /><div><h1>{pick(language, "Connexion aux cotations", "Connecting to quotes")}</h1><p>{error ?? pick(language, "Préparation de tes titres…", "Preparing your securities…")}</p></div></section>
      )}
    </div>
  );
}
