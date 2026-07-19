"use client";

import { useCallback, useEffect, useState } from "react";
import { MarketHeatmap } from "./MarketHeatmap";
import { MoversList } from "./MoversList";
import { getCockpitSnapshot } from "@/lib/api";
import type { CockpitSnapshot } from "@/lib/types";
import { REFRESH_INTERVALS } from "@/lib/refresh";

export function CockpitClient() {
  const [snapshot, setSnapshot] = useState<CockpitSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setRefreshing(true);
    try {
      const data = await getCockpitSnapshot(signal);
      setSnapshot(data);
      setError(null);
    } catch (reason) {
      if ((reason as Error).name !== "AbortError") {
        setError("Le cockpit n’a pas pu récupérer les données. Une nouvelle tentative sera faite automatiquement.");
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const interval = window.setInterval(() => void load(), REFRESH_INTERVALS.cockpitTsx60);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [load]);

  if (!snapshot) {
    return (
      <div className="cockpit-page">
        <section className="panel cockpit-loading">
          <span className="live-dot" />
          <div><h1>Préparation du Cockpit TSX 60</h1><p>{error ?? "Connexion aux données de marché…"}</p></div>
        </section>
      </div>
    );
  }

  const marketPositive = snapshot.weighted_change_percent >= 0;
  return (
    <div className="cockpit-page">
      <header className="panel cockpit-header">
        <div>
          <span className="eyebrow">ANATOLE COCKPIT</span>
          <h1>{snapshot.universe}</h1>
          <p>Lecture automatique du marché canadien · actualisation environ toutes les 15 secondes</p>
        </div>
        <div className="cockpit-market-score">
          <span>Variation pondérée</span>
          <strong className={marketPositive ? "positive" : "negative"}>
            {marketPositive ? "+" : ""}{snapshot.weighted_change_percent.toFixed(2)}%
          </strong>
          <small className={refreshing ? "is-refreshing" : ""}>{refreshing ? "Actualisation…" : "Flux actif"}</small>
        </div>
      </header>

      {error ? <div className="cockpit-warning">{error}</div> : null}

      <section className="cockpit-kpis">
        <article className="panel cockpit-kpi"><span>Progressions</span><strong className="positive">{snapshot.breadth.advancers}</strong></article>
        <article className="panel cockpit-kpi"><span>Baisses</span><strong className="negative">{snapshot.breadth.decliners}</strong></article>
        <article className="panel cockpit-kpi"><span>Inchangées</span><strong>{snapshot.breadth.unchanged}</strong></article>
        <article className="panel cockpit-kpi"><span>Ratio de hausse</span><strong>{snapshot.breadth.advance_ratio.toFixed(0)}%</strong></article>
      </section>

      <MarketHeatmap tiles={snapshot.constituents} />

      <section className="cockpit-lower-grid">
        <div className="cockpit-movers-grid">
          <MoversList title="Meilleures variations" items={snapshot.top_gainers} />
          <MoversList title="Plus fortes baisses" items={snapshot.top_losers} />
        </div>
        <section className="panel sectors-panel">
          <div className="cockpit-section-heading"><h2>Contribution sectorielle</h2></div>
          <div className="sector-list">
            {snapshot.sectors.map((sector) => (
              <div className="sector-row" key={sector.sector}>
                <div><strong>{sector.sector}</strong><span>{sector.weight.toFixed(1)}% du panier</span></div>
                <div className={sector.change_percent >= 0 ? "positive" : "negative"}>
                  <strong>{sector.change_percent >= 0 ? "+" : ""}{sector.change_percent.toFixed(2)}%</strong>
                  <span>{sector.advancers}↑ · {sector.decliners}↓</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>

      <footer className="status-footer">
        Mis à jour {new Date(snapshot.generated_at).toLocaleTimeString("fr-CA")} · Univers au {snapshot.universe_as_of} ({snapshot.universe_source}) · Cotations publiques potentiellement différées
      </footer>
    </div>
  );
}
