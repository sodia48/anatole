"use client";

import { Eye, EyeOff } from "lucide-react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type { FocusFundamentalOverlaySnapshot } from "@/lib/types";

import type { FundamentalMarker } from "./types";
import styles from "./FocusPro.module.css";

function seconds(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1_000) : null;
}

function compact(value: number | null): string {
  if (value === null) return "N/D";
  return new Intl.NumberFormat("fr-CA", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function buildFundamentalMarkers(
  snapshot: FocusFundamentalOverlaySnapshot | null,
): FundamentalMarker[] {
  if (!snapshot) return [];
  const markers: FundamentalMarker[] = [];
  for (const [index, value] of snapshot.events.earnings_dates.entries()) {
    const time = seconds(value);
    if (time === null) continue;
    markers.push({
      id: `earnings-${index}-${time}`,
      time,
      kind: "earnings",
      title: "E",
      detail: "Date de résultats publiée par la source fondamentale.",
      source: snapshot.source,
    });
  }
  for (const period of snapshot.quarterly_financials) {
    const time = seconds(period.period_end);
    if (time === null) continue;
    const sourceName = period.source?.source_name ?? snapshot.source;
    if (period.total_revenue !== null) {
      markers.push({
        id: `revenue-${time}`,
        time,
        kind: "revenue",
        title: "R",
        detail: `Fin de période · revenus ${compact(period.total_revenue)}`,
        source: sourceName,
      });
    }
    if (period.diluted_eps !== null) {
      markers.push({
        id: `eps-${time}`,
        time,
        kind: "eps",
        title: "EPS",
        detail: `Fin de période · BPA dilué ${period.diluted_eps.toFixed(3)}`,
        source: sourceName,
      });
    }
  }
  const dividendDates = [
    ["ex", snapshot.events.ex_dividend_date],
    ["pay", snapshot.events.dividend_date],
  ] as const;
  for (const [kind, value] of dividendDates) {
    if (!value) continue;
    const time = seconds(value);
    if (time === null) continue;
    markers.push({
      id: `dividend-${kind}-${time}`,
      time,
      kind: "dividend",
      title: kind === "ex" ? "D·EX" : "D",
      detail: kind === "ex"
        ? `Date ex-dividende${snapshot.metrics.dividend_rate === null ? "" : ` · ${snapshot.metrics.dividend_rate.toFixed(2)}`}`
        : "Date de paiement du dividende",
      source: snapshot.source,
    });
  }
  return markers.sort((left, right) => left.time - right.time);
}

export function FocusFundamentalOverlay({
  enabled,
  loading,
  markers,
  selected,
  language,
  onToggle,
  onSelect,
}: {
  enabled: boolean;
  loading: boolean;
  markers: FundamentalMarker[];
  selected: FundamentalMarker | null;
  language: AnatoleLanguage;
  onToggle: () => void;
  onSelect: (marker: FundamentalMarker) => void;
}) {
  return (
    <section className={styles.panel}>
      <header className={styles.sectionHeader}>
        <div><span className={styles.eyebrow}>FUNDAMENTALS</span><h2>{pick(language, "Événements fondamentaux", "Fundamental events")}</h2></div>
        <button className={`${styles.iconButton} ${enabled ? styles.buttonActive : ""}`} type="button" onClick={onToggle} aria-pressed={enabled} aria-label={pick(language, "Afficher les événements fondamentaux", "Show fundamental events")}>{enabled ? <Eye size={14} /> : <EyeOff size={14} />}</button>
      </header>
      <div className={styles.sectionBody}>
        <span className={styles.muted}>{loading ? pick(language, "Chargement…", "Loading…") : `${markers.length} ${pick(language, "marqueurs officiels ou sourcés", "official or sourced markers")}`}</span>
        {enabled ? (
          <ul className={styles.list}>
            {markers.slice(-8).reverse().map((marker) => (
              <li className={styles.listItem} key={marker.id}>
                <button className={styles.button} type="button" onClick={() => onSelect(marker)}>
                  <strong>{marker.title}</strong> {new Date(marker.time * 1_000).toLocaleDateString()}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {selected ? (
          <div className={styles.notice} role="status">
            <strong>{selected.title} · {new Date(selected.time * 1_000).toLocaleDateString()}</strong><br />
            {selected.detail}<br />
            Source : {selected.source}
          </div>
        ) : null}
      </div>
    </section>
  );
}
