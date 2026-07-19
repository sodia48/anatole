"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CircleDollarSign, Search } from "lucide-react";
import { getEtfDirectory } from "@/lib/api";
import { REFRESH_INTERVALS } from "@/lib/refresh";
import type { EtfDirectorySnapshot } from "@/lib/types";

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 });
const compact = new Intl.NumberFormat("fr-CA", { notation: "compact", maximumFractionDigits: 1 });

export function EtfClient() {
  const [data, setData] = useState<EtfDirectorySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [provider, setProvider] = useState("Tous");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const snapshot = await getEtfDirectory();
        if (active) { setData(snapshot); setError(null); }
      } catch {
        if (active) setError("Le répertoire ETF est temporairement indisponible. Anatole réessaiera automatiquement.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_INTERVALS.etf);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const providers = useMemo(() => Array.from(new Set(data?.items.map((item) => item.provider) ?? [])).sort(), [data]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => {
      const text = `${item.symbol} ${item.name} ${item.exposure}`.toLowerCase();
      return (!normalized || text.includes(normalized)) && (category === "Toutes" || item.category === category) && (provider === "Tous" || item.provider === provider);
    });
  }, [category, data, provider, query]);

  if (!data && !error) return <section className="panel discovery-loading"><span className="live-dot" /><div><h1>Chargement des ETF</h1><p>Actualisation des prix et du répertoire canadien.</p></div></section>;

  return (
    <div className="discovery-page">
      <header className="panel discovery-hero">
        <div><span className="eyebrow">RÉPERTOIRE ETF</span><h1>ETF canadiens suivis</h1><p>Marché canadien, secteurs, obligations, liquidités, portefeuilles tout-en-un et expositions américaines.</p></div>
        <div className="discovery-score"><CircleDollarSign size={20} /><strong>{filtered.length}</strong><span>ETF visibles</span><small>Prix actualisés automatiquement</small></div>
      </header>

      {error ? <div className="cockpit-warning">{error}</div> : null}

      <section className="panel filter-bar">
        <label className="filter-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ticker, fournisseur ou exposition" /></label>
        <label><span>Catégorie</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Toutes</option>{data?.categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Fournisseur</span><select value={provider} onChange={(event) => setProvider(event.target.value)}><option>Tous</option>{providers.map((item) => <option key={item}>{item}</option>)}</select></label>
      </section>

      <section className="etf-grid">
        {filtered.map((item) => (
          <Link href={`/focus/${encodeURIComponent(item.symbol)}`} className="panel etf-card" key={item.ticker}>
            <div className="etf-card-top"><span className="etf-symbol">{item.symbol}</span><em>{item.provider}</em></div>
            <h2>{item.name}</h2>
            <p>{item.exposure}</p>
            <div className="etf-card-meta"><span>{item.category}</span><span>Volume {compact.format(item.volume)}</span></div>
            <div className="etf-card-price"><strong>{money.format(item.price)}</strong><span className={item.change_percent >= 0 ? "positive" : "negative"}>{item.change_percent >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{item.change_percent.toFixed(2)} %</span></div>
          </Link>
        ))}
        {!filtered.length ? <div className="panel empty-filter"><CircleDollarSign size={24} /><strong>Aucun ETF ne correspond aux filtres.</strong></div> : null}
      </section>
    </div>
  );
}
