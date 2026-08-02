"use client";

import { useEffect, useState } from "react";
import { Activity, Gauge } from "lucide-react";
import { getPsychologySnapshot } from "@/lib/api";
import { REFRESH_INTERVALS } from "@/lib/refresh";
import type { PsychologySnapshot } from "@/lib/types";

export function PsychologyClient() {
  const [data, setData] = useState<PsychologySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const snapshot = await getPsychologySnapshot();
        if (active) { setData(snapshot); setError(null); }
      } catch {
        if (active) setError("L’indicateur psychologique est temporairement indisponible.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_INTERVALS.screener);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (!data && !error) return <section className="panel discovery-loading"><span className="live-dot" /><div><h1>Calcul de la psychologie du marché</h1><p>Largeur, momentum, volatilité, tendance et leadership sectoriel.</p></div></section>;

  return (
    <div className="discovery-page">
      <header className="panel discovery-hero">
        <div><span className="eyebrow">PSYCHOLOGIE DU MARCHÉ</span><h1>Indice Anatole Canada</h1><p>Un indicateur explicable construit à partir de données du S&P/TSX Composite et de la largeur du TSX 60.</p></div>
        <div className="discovery-score"><Activity size={20} /><strong>{data?.score.toFixed(0) ?? "—"}</strong><span>{data?.label ?? "Indisponible"}</span><small>Actualisation automatique toutes les 45 secondes</small></div>
      </header>

      {error ? <div className="cockpit-warning">{error}</div> : null}

      {data ? (
        <>
          <section className="psychology-overview">
            <article className="panel psychology-gauge-card">
              <div className="psychology-gauge" style={{ "--psych-score": `${data.score}%` } as React.CSSProperties}><div><strong>{data.score.toFixed(0)}</strong><span>{data.label}</span></div></div>
              <small>{data.source}</small>
            </article>
            <div className="psychology-kpis">
              <article className="panel metric-card"><span>20 séances</span><strong className={data.change_20d >= 0 ? "positive" : "negative"}>{data.change_20d.toFixed(2)} %</strong><small>Momentum court terme</small></article>
              <article className="panel metric-card"><span>50 séances</span><strong className={data.change_50d >= 0 ? "positive" : "negative"}>{data.change_50d.toFixed(2)} %</strong><small>Momentum intermédiaire</small></article>
              <article className="panel metric-card"><span>Volatilité 20j</span><strong>{data.volatility_20d.toFixed(1)} %</strong><small>Annualisée</small></article>
              <article className="panel metric-card"><span>Largeur</span><strong>{data.advance_ratio.toFixed(0)} %</strong><small>Ratio des hausses</small></article>
            </div>
          </section>

          <section className="psychology-components">
            {data.components.map((item) => (
              <article className="panel psychology-component" key={item.key}>
                <div><Gauge size={18} /><strong>{item.label}</strong><span>{item.score.toFixed(0)}/100</span></div>
                <div className="component-track"><i style={{ width: `${item.score}%` }} /></div>
                <p>{item.description}</p>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
