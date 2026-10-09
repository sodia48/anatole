"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type CanadaCurve, fixedIncomeGet, formatBps, formatYield } from "@/lib/fixed-income";
import { pick, type AnatoleLanguage } from "@/lib/i18n";

const TENORS = ["2Y", "5Y", "10Y", "Long"];

function miniCurve(curve: CanadaCurve): string | null {
  const points = curve.points.filter((point) => point.latest !== null);
  if (points.length < 2) return null;
  const values = points.map((point) => point.latest as number);
  const low = Math.min(...values) - 0.1;
  const high = Math.max(...values) + 0.1;
  return values.map((value, index) =>
    `${16 + index * (228 / (values.length - 1))},${64 - ((value - low) / (high - low)) * 48}`,
  ).join(" ");
}

export function CanadaRatesCard({ language }: { language: AnatoleLanguage }) {
  const [curve, setCurve] = useState<CanadaCurve | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fixedIncomeGet<CanadaCurve>("/canada/curve", controller.signal)
      .then((data) => setCurve(data))
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);

  const polyline = curve ? miniCurve(curve) : null;
  const shape = curve?.curve_shape === "normal" ? pick(language, "normale", "normal")
    : curve?.curve_shape === "flat" ? pick(language, "plate", "flat")
    : curve?.curve_shape === "inverted" ? pick(language, "inversée", "inverted")
    : pick(language, "inconnue", "unknown");

  return <section className="panel canada-rates-card" aria-label={pick(language, "Taux Canada", "Canada rates")}>
    <div className="canada-rates-heading">
      <div><span className="eyebrow">{pick(language, "TAUX CANADA", "CANADA RATES")}</span>
        <h2>{pick(language, "Courbe fédérale", "Federal yield curve")}</h2></div>
      <Link href="/taux-obligations">{pick(language, "Voir Taux & Obligations →", "Explore Rates & Bonds →")}</Link>
    </div>
    <div className="canada-rates-content">
      <div className="canada-rates-tenors">
        {TENORS.map((tenor) => {
          const point = curve?.points.find((row) => row.tenor === tenor);
          return <div className="canada-rates-tenor" key={tenor}>
            <span>{tenor}</span><strong>{formatYield(point?.latest ?? null, language)}</strong>
            <small>{formatBps(point?.bp_change ?? null, language)}</small>
          </div>;
        })}
      </div>
      <div className="canada-rates-curve">
        {polyline ? <svg viewBox="0 0 260 80" role="img" aria-label={pick(language, "Mini courbe des taux fédéraux", "Federal yield mini curve")}>
          <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg> : <span>{pick(language, "Courbe indisponible", "Curve unavailable")}</span>}
      </div>
    </div>
    <div className="canada-rates-meta">
      <span>2s10s <strong>{formatBps(curve?.spread_2s10s_bps ?? null, language)}</strong></span>
      <span>{pick(language, "Forme", "Shape")} <strong>{shape}</strong></span>
      <span>{pick(language, "Taux directeur", "Policy rate")} <strong>{formatYield(curve?.policy_rate?.latest ?? null, language)}</strong></span>
      <span>{failed ? pick(language, "Source momentanément indisponible", "Source temporarily unavailable")
        : curve?.quality.freshness === "stale" ? pick(language, "Dernière donnée connue", "Last known data")
        : pick(language, "Banque du Canada · données de clôture", "Bank of Canada · closing data")}</span>
    </div>
    {curve?.signals?.length ? <div className="canada-rates-signals" aria-label={pick(language, "Signaux de taux descriptifs", "Descriptive rate signals")}>
      {curve.signals.map((signal) => <span key={`${signal.kind}-${signal.observed_at}`} title={`${signal.observed_at} · ${signal.source_url}`}>
        {signal.kind === "ten_year_move" ? pick(language, "Mouvement du 10 ans", "10Y move") :
          signal.kind === "curve_zero_cross" ? pick(language, "2s10s franchit zéro", "2s10s crossed zero") :
          signal.kind === "curve_shape_change" ? pick(language, "Forme de courbe modifiée", "Curve shape changed") :
          pick(language, "Taux directeur modifié", "Policy rate changed")}
      </span>)}</div> : null}
  </section>;
}
