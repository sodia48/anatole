"use client";

import { useEffect, useState } from "react";
import { Activity, Gauge } from "lucide-react";
import Link from "next/link";
import { getPsychologySnapshot } from "@/lib/api";
import { REFRESH_INTERVALS } from "@/lib/refresh";
import type { PsychologySnapshot } from "@/lib/types";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { pick, type AnatoleLanguage } from "@/lib/i18n";

function psychologyLabel(value: string, language: AnatoleLanguage): string {
  if (language === "fr") return value;
  return ({ "Peur extrême": "Extreme fear", Peur: "Fear", Neutre: "Neutral", Confiance: "Confidence", "Confiance extrême": "Extreme confidence" } as Record<string, string>)[value] ?? value;
}

function componentCopy(item: PsychologySnapshot["components"][number], data: PsychologySnapshot, language: AnatoleLanguage): { label: string; description: string } {
  if (language === "fr") return item;
  const labels: Record<string, string> = { breadth: "Market breadth", momentum: "Index momentum", volatility: "Volatility", trend: "Trend", leadership: "Sector leadership" };
  const descriptions: Record<string, string> = {
    breadth: `${Math.round(data.advance_ratio)}% of TSX 60 securities are advancing.`,
    momentum: `20-session change: ${data.change_20d >= 0 ? "+" : ""}${data.change_20d.toFixed(2)}%; 50-session change: ${data.change_50d >= 0 ? "+" : ""}${data.change_50d.toFixed(2)}%.`,
    volatility: `Annualized volatility over 20 sessions: ${data.volatility_20d.toFixed(1)}%.`,
    trend: "Technical reading of the S&P/TSX Composite trend.",
    leadership: "Share of sectors currently advancing.",
  };
  return { label: labels[item.key] ?? item.label, description: descriptions[item.key] ?? item.description };
}

export function PsychologyClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [data, setData] = useState<PsychologySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const snapshot = await getPsychologySnapshot();
        if (active) { setData(snapshot); setError(null); }
      } catch {
        if (active) setError(pick(language, "L’indicateur psychologique est temporairement indisponible.", "The market psychology indicator is temporarily unavailable."));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_INTERVALS.screener);
    return () => { active = false; window.clearInterval(timer); };
  }, [language]);

  if (!data && !error) return <section className="panel discovery-loading"><span className="live-dot" /><div><h1>{pick(language, "Calcul de la psychologie du marché", "Calculating market psychology")}</h1><p>{pick(language, "Largeur, momentum, volatilité, tendance et leadership sectoriel.", "Breadth, momentum, volatility, trend, and sector leadership.")}</p></div></section>;

  return (
    <div className="discovery-page">
      <header className="panel discovery-hero">
        <div><span className="eyebrow">{pick(language, "PSYCHOLOGIE DU MARCHÉ", "MARKET PSYCHOLOGY")}</span><h1>{pick(language, "Indice Anatole Canada", "Anatole Canada Index")}</h1><p>{pick(language, "Un indicateur explicable construit à partir de données du S&P/TSX Composite et de la largeur du TSX 60.", "An explainable indicator built from S&P/TSX Composite data and TSX 60 market breadth.")}</p><Link href="/terminal">{pick(language, "Ouvrir Terminal Pro", "Open Pro Terminal")} →</Link></div>
        <div className="discovery-score"><Activity size={20} /><strong>{data?.score.toFixed(0) ?? "—"}</strong><span>{data ? psychologyLabel(data.label, language) : pick(language, "Indisponible", "Unavailable")}</span><small>{pick(language, "Actualisation automatique toutes les 45 secondes", "Refreshes automatically every 45 seconds")}</small></div>
      </header>

      {error ? <div className="cockpit-warning">{error}</div> : null}

      {data ? (
        <>
          <section className="psychology-overview">
            <article className="panel psychology-gauge-card">
              <div className="psychology-gauge" style={{ "--psych-score": `${data.score}%` } as React.CSSProperties}><div><strong>{data.score.toFixed(0)}</strong><span>{psychologyLabel(data.label, language)}</span></div></div>
              <small>{data.source}</small>
            </article>
            <div className="psychology-kpis">
              <article className="panel metric-card"><span>{pick(language, "20 séances", "20 sessions")}</span><strong className={data.change_20d >= 0 ? "positive" : "negative"}>{data.change_20d.toFixed(2)} %</strong><small>{pick(language, "Momentum court terme", "Short-term momentum")}</small></article>
              <article className="panel metric-card"><span>{pick(language, "50 séances", "50 sessions")}</span><strong className={data.change_50d >= 0 ? "positive" : "negative"}>{data.change_50d.toFixed(2)} %</strong><small>{pick(language, "Momentum intermédiaire", "Intermediate momentum")}</small></article>
              <article className="panel metric-card"><span>{pick(language, "Volatilité 20j", "20d volatility")}</span><strong>{data.volatility_20d.toFixed(1)} %</strong><small>{pick(language, "Annualisée", "Annualized")}</small></article>
              <article className="panel metric-card"><span>{pick(language, "Largeur", "Breadth")}</span><strong>{data.advance_ratio.toFixed(0)} %</strong><small>{pick(language, "Ratio des hausses", "Advance ratio")}</small></article>
            </div>
          </section>

          <section className="psychology-components">
            {data.components.map((item) => {
              const copy = componentCopy(item, data, language);
              return <article className="panel psychology-component" key={item.key}>
                <div><Gauge size={18} /><strong>{copy.label}</strong><span>{item.score.toFixed(0)}/100</span></div>
                <div className="component-track"><i style={{ width: `${item.score}%` }} /></div>
                <p>{copy.description}</p>
              </article>;
            })}
          </section>
        </>
      ) : null}
    </div>
  );
}
