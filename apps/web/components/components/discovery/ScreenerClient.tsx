"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Filter, Search, Sparkles } from "lucide-react";
import { getScreenerSnapshot } from "@/lib/api";
import { REFRESH_INTERVALS } from "@/lib/refresh";
import type { ScreenerRow, ScreenerSnapshot } from "@/lib/types";

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 });
const compact = new Intl.NumberFormat("fr-CA", { notation: "compact", maximumFractionDigits: 1 });

export function ScreenerClient() {
  const [data, setData] = useState<ScreenerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("Tous");
  const [signal, setSignal] = useState("Tous");
  const [minimumScore, setMinimumScore] = useState(0);
  const [sort, setSort] = useState<"score" | "change" | "momentum" | "volume">("score");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const controller = new AbortController();
      try {
        const snapshot = await getScreenerSnapshot(controller.signal);
        if (active) { setData(snapshot); setError(null); }
      } catch {
        if (active) setError("Le screener n’a pas pu récupérer les données. Une nouvelle tentative sera faite automatiquement.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_INTERVALS.screener);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const signals = useMemo(() => Array.from(new Set(data?.items.map((item) => item.signal) ?? [])).sort(), [data]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows = (data?.items ?? []).filter((item) => {
      const matchesQuery = !normalized || `${item.symbol} ${item.name}`.toLowerCase().includes(normalized);
      return matchesQuery && (sector === "Tous" || item.sector === sector) && (signal === "Tous" || item.signal === signal) && item.score >= minimumScore;
    });
    return [...rows].sort((a, b) => {
      if (sort === "change") return b.change_percent - a.change_percent;
      if (sort === "momentum") return b.momentum_20d - a.momentum_20d;
      if (sort === "volume") return b.relative_volume - a.relative_volume;
      return b.score - a.score;
    });
  }, [data, minimumScore, query, sector, signal, sort]);

  if (!data && !error) return <section className="panel discovery-loading"><span className="live-dot" /><div><h1>Préparation du Screener TSX 60</h1><p>Calcul du momentum, du RSI et des volumes relatifs.</p></div></section>;

  return (
    <div className="discovery-page">
      <header className="panel discovery-hero">
        <div><span className="eyebrow">MARCHÉS · V0.5</span><h1>Screener TSX 60</h1><p>Classement automatique des titres selon le momentum, la tendance, le RSI et l’activité du volume.</p></div>
        <div className="discovery-score"><Sparkles size={20} /><strong>{filtered.length}</strong><span>titres visibles</span><small>{data?.live_items ?? 0} données publiques · {data?.fallback_items ?? 0} secours</small></div>
      </header>

      {error ? <div className="cockpit-warning">{error}</div> : null}

      <section className="panel filter-bar">
        <label className="filter-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ticker ou entreprise" /></label>
        <label><span>Secteur</span><select value={sector} onChange={(event) => setSector(event.target.value)}><option>Tous</option>{data?.sectors.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Signal</span><select value={signal} onChange={(event) => setSignal(event.target.value)}><option>Tous</option>{signals.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Score minimum</span><input type="range" min="0" max="90" step="5" value={minimumScore} onChange={(event) => setMinimumScore(Number(event.target.value))} /><em>{minimumScore}</em></label>
        <label><span>Trier</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="score">Score Anatole</option><option value="change">Variation du jour</option><option value="momentum">Momentum 20 jours</option><option value="volume">Volume relatif</option></select></label>
      </section>

      <section className="panel screener-table-wrap">
        <div className="screener-table-head"><span>Titre</span><span>Prix</span><span>Jour</span><span>Momentum 20j</span><span>RSI</span><span>Volume relatif</span><span>Score</span><span>Signal</span></div>
        <div className="screener-rows">
          {filtered.map((item: ScreenerRow) => (
            <Link href={`/focus/${encodeURIComponent(item.symbol)}`} className="screener-row" key={item.ticker}>
              <div className="screener-name"><strong>{item.symbol}</strong><span>{item.name}</span><small>{item.sector}</small></div>
              <strong>{money.format(item.price)}</strong>
              <span className={item.change_percent >= 0 ? "positive" : "negative"}>{item.change_percent >= 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}{item.change_percent.toFixed(2)} %</span>
              <span className={item.momentum_20d >= 0 ? "positive" : "negative"}>{item.momentum_20d.toFixed(2)} %</span>
              <span>{item.rsi_14?.toFixed(1) ?? "—"}</span>
              <span>{item.relative_volume.toFixed(2)}× <small>{compact.format(item.volume)}</small></span>
              <span className="score-pill">{item.score.toFixed(0)}</span>
              <span className={`signal-badge signal-${item.signal.toLowerCase().replaceAll(" ", "-")}`}>{item.signal}</span>
            </Link>
          ))}
          {!filtered.length ? <div className="empty-filter"><Filter size={24} /><strong>Aucun titre ne correspond aux filtres.</strong><span>Réduis le score minimum ou élargis les critères.</span></div> : null}
        </div>
      </section>
    </div>
  );
}
