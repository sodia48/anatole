"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Star } from "lucide-react";
import { getWatchlistSnapshot } from "@/lib/api";
import type { WatchlistSnapshot } from "@/lib/types";
import { normalizeWatchlistSymbol, readWatchlist, writeWatchlist } from "@/lib/watchlist";
import { WatchlistTable } from "./WatchlistTable";

export function WatchlistClient() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<WatchlistSnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTickers(readWatchlist());
    setHydrated(true);
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
        setError("Les cotations n’ont pas pu être récupérées. Anatole réessaiera automatiquement.");
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || tickers.length === 0) return;
    const controller = new AbortController();
    void load(tickers, controller.signal);
    const interval = window.setInterval(() => void load(tickers), 20_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [hydrated, load, tickers]);

  const symbols = useMemo(() => new Set(tickers), [tickers]);

  const addTicker = (event: FormEvent) => {
    event.preventDefault();
    const symbol = normalizeWatchlistSymbol(draft);
    if (!/^[A-Z0-9.-]{1,15}$/.test(symbol)) {
      setError("Entre un symbole valide, par exemple MDA, RY ou BAM.A.");
      return;
    }
    if (symbols.has(symbol)) {
      setError(`${symbol} est déjà dans la watchlist.`);
      return;
    }
    if (tickers.length >= 30) {
      setError("La version bêta accepte un maximum de 30 titres par watchlist.");
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
    return <section className="panel cockpit-loading"><span className="live-dot" /><div><h1>Chargement de la watchlist</h1><p>Lecture de tes titres enregistrés…</p></div></section>;
  }

  return (
    <div className="watchlist-page">
      <header className="panel watchlist-header">
        <div>
          <span className="eyebrow">ANATOLE WATCHLIST</span>
          <h1>Titres suivis</h1>
          <p>Variations actualisées automatiquement environ toutes les 20 secondes.</p>
        </div>
        <form className="watchlist-add" onSubmit={addTicker}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ajouter MDA, RY, BAM.A…" aria-label="Symbole à ajouter" />
          <button type="submit"><Plus size={18} /><span>Ajouter</span></button>
        </form>
      </header>

      {error ? <div className="cockpit-warning">{error}</div> : null}

      {tickers.length === 0 ? (
        <section className="panel watchlist-empty">
          <Star size={28} />
          <h2>Ta watchlist est vide</h2>
          <p>Ajoute un symbole ci-dessus ou utilise le bouton « Suivre » dans la section Focus.</p>
        </section>
      ) : snapshot ? (
        <>
          <section className="watchlist-kpis">
            <article className="panel cockpit-kpi"><span>Titres suivis</span><strong>{snapshot.items.length}</strong></article>
            <article className="panel cockpit-kpi"><span>Progressions</span><strong className="positive">{snapshot.summary.advancers}</strong></article>
            <article className="panel cockpit-kpi"><span>Baisses</span><strong className="negative">{snapshot.summary.decliners}</strong></article>
            <article className="panel cockpit-kpi"><span>Variation moyenne</span><strong className={snapshot.summary.average_change_percent >= 0 ? "positive" : "negative"}>{snapshot.summary.average_change_percent >= 0 ? "+" : ""}{snapshot.summary.average_change_percent.toFixed(2)}%</strong></article>
          </section>
          <WatchlistTable items={snapshot.items} onRemove={removeTicker} />
          <footer className="status-footer">
            {refreshing ? "Actualisation en cours…" : `Mis à jour ${new Date(snapshot.generated_at).toLocaleTimeString("fr-CA")}`} · Sauvegarde locale dans ce navigateur · Cotations publiques potentiellement différées
          </footer>
        </>
      ) : (
        <section className="panel cockpit-loading"><span className="live-dot" /><div><h1>Connexion aux cotations</h1><p>{error ?? "Préparation de tes titres…"}</p></div></section>
      )}
    </div>
  );
}
