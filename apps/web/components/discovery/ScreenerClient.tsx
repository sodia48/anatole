"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Filter, Search, Sparkles } from "lucide-react";
import {
  getScreenerSnapshot,
  type ScreenerUniverse,
} from "@/lib/api";
import { REFRESH_INTERVALS } from "@/lib/refresh";
import type { ScreenerRow, ScreenerSnapshot } from "@/lib/types";
import { ANATOLE_VERSION_LABEL } from "@/lib/version";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

function signalLabel(value: string, language: AnatoleLanguage): string {
  const labels: Record<string, string> = {
    Constructif: "Constructive",
    Fragile: "Fragile",
    "Momentum fort": "Strong momentum",
    Neutre: "Neutral",
  };
  return language === "en" ? labels[value] ?? value : value;
}

export function ScreenerClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const money = useMemo(() => new Intl.NumberFormat(localeFor(language), { style: "currency", currency: "CAD", minimumFractionDigits: 2 }), [language]);
  const compact = useMemo(() => new Intl.NumberFormat(localeFor(language), { notation: "compact", maximumFractionDigits: 1 }), [language]);
  const [universe, setUniverse] =
    useState<ScreenerUniverse>(
      "composite",
    );
  const [data, setData] =
    useState<ScreenerSnapshot | null>(
      null,
    );
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("Tous");
  const [signal, setSignal] = useState("Tous");
  const [minimumScore, setMinimumScore] = useState(0);
  const [sort, setSort] = useState<"score" | "change" | "momentum" | "volume">("score");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedUniverse = params.get("universe");
    const requestedSector = params.get("sector");
    const timer = window.setTimeout(() => {
      if (requestedUniverse === "tsx60") setUniverse("tsx60");
      if (requestedSector) setSector(requestedSector);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let controller =
      new AbortController();

    const load = async () => {
      controller.abort();
      controller =
        new AbortController();

      setLoading(true);

      try {
        const snapshot =
          await getScreenerSnapshot(
            universe,
            controller.signal,
          );

        if (active) {
          setData(snapshot);
          setError(null);
        }
      } catch (caught) {
        if (
          active &&
          !controller.signal.aborted
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : pick(language, "Le screener n’a pas pu récupérer les données.", "The screener could not retrieve data."),
          );
        }
      } finally {
        if (
          active &&
          !controller.signal.aborted
        ) {
          setLoading(false);
        }
      }
    };

    void load();

    const timer =
      window.setInterval(
        () => {
          if (!document.hidden) void load();
        },
        universe === "composite"
          ? 180_000
          : REFRESH_INTERVALS.screener,
      );

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [language, universe]);

  const signals = useMemo(() => Array.from(new Set(data?.items.map((item) => item.signal).filter((item): item is string => item !== null) ?? [])).sort(), [data]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows = (data?.items ?? []).filter((item) => {
      const matchesQuery = !normalized || `${item.symbol} ${item.name}`.toLowerCase().includes(normalized);
      return matchesQuery && (sector === "Tous" || item.sector === sector) && (signal === "Tous" || item.signal === signal) && (minimumScore <= 0 || (item.score !== null && item.score >= minimumScore));
    });
    return [...rows].sort((a, b) => {
      if (sort === "change") return b.change_percent - a.change_percent;
      if (sort === "momentum") return (b.momentum_20d ?? -Infinity) - (a.momentum_20d ?? -Infinity);
      if (sort === "volume") return (b.relative_volume ?? -Infinity) - (a.relative_volume ?? -Infinity);
      return (b.score ?? -Infinity) - (a.score ?? -Infinity);
    });
  }, [data, minimumScore, query, sector, signal, sort]);

  if (!data && !error) {
    return (
      <section className="panel discovery-loading">
        <span className="live-dot" />
        <div>
          <h1>
            {pick(language, "Préparation du Screener", "Preparing the Screener")}{" "}
            {universe === "composite"
              ? "TSX Composite"
              : "TSX 60"}
          </h1>
          <p>
            {pick(language, "Calcul du momentum, du RSI et des volumes relatifs.", "Calculating momentum, RSI, and relative volume.")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="discovery-page">
      <header className="panel discovery-hero">
        <div>
          <span className="eyebrow">
            {pick(language, "MARCHÉS", "MARKETS")} · {ANATOLE_VERSION_LABEL.toUpperCase()}
          </span>
          <h1>
            Screener{" "}
            {universe === "composite"
              ? "TSX Composite"
              : "TSX 60"}
          </h1>
          <p>
            {universe === "composite"
              ? pick(language, "Classement élargi des sociétés canadiennes selon le momentum, la tendance, le RSI et l’activité du volume.", "Broader ranking of Canadian companies by momentum, trend, RSI, and volume activity.")
              : pick(language, "Vue concentrée des 60 grandes capitalisations canadiennes selon les mêmes critères Anatole.", "Focused view of 60 Canadian large caps using the same Anatole criteria.")}
          </p>
        </div>
        <div className="discovery-score">
          <Sparkles size={20} />
          <strong>{filtered.length}</strong>
          <span>{pick(language, "titres visibles", "securities shown")}</span>
          <small>
            {data?.live_items ?? 0} {pick(language, "données publiques", "public data points")} ·{" "}
            {data?.fallback_items ?? 0} {pick(language, "secours", "fallback")}
            {loading
              ? pick(language, " · actualisation…", " · refreshing…")
              : ""}
          </small>
        </div>
      </header>

      {error ? <div className="cockpit-warning">{error}</div> : null}

      <section className="panel filter-bar">
        <label>
          <span>{pick(language, "Univers", "Universe")}</span>
          <select
            value={universe}
            onChange={(event) => {
              setUniverse(
                event.target
                  .value as ScreenerUniverse,
              );
              setSector("Tous");
              setSignal("Tous");
            }}
          >
            <option value="composite">
              TSX Composite
            </option>
            <option value="tsx60">
              TSX 60
            </option>
          </select>
        </label>
        <label className="filter-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick(language, "Ticker ou entreprise", "Ticker or company")} /></label>
        <label><span>{pick(language, "Secteur", "Sector")}</span><select value={sector} onChange={(event) => setSector(event.target.value)}><option value="Tous">{pick(language, "Tous", "All")}</option>{data?.sectors.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>{pick(language, "Signal", "Signal")}</span><select value={signal} onChange={(event) => setSignal(event.target.value)}><option value="Tous">{pick(language, "Tous", "All")}</option>{signals.map((item) => <option key={item} value={item}>{signalLabel(item, language)}</option>)}</select></label>
        <label><span>{pick(language, "Score minimum", "Minimum score")}</span><input aria-label={pick(language, `Score minimum ${minimumScore}`, `Minimum score ${minimumScore}`)} type="range" min="0" max="90" step="5" value={minimumScore} onChange={(event) => setMinimumScore(Number(event.target.value))} /><em>{minimumScore}</em></label>
        <label><span>{pick(language, "Trier", "Sort")}</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="score">Score Anatole</option><option value="change">{pick(language, "Variation du jour", "Daily change")}</option><option value="momentum">{pick(language, "Momentum 20 jours", "20-day momentum")}</option><option value="volume">{pick(language, "Volume relatif", "Relative volume")}</option></select></label>
      </section>

      <section className="panel screener-table-wrap">
        <div className="screener-table-head"><span>{pick(language, "Titre", "Security")}</span><span>{pick(language, "Prix", "Price")}</span><span>{pick(language, "Jour", "Day")}</span><span>{pick(language, "Momentum 20j", "20d momentum")}</span><span>RSI</span><span>{pick(language, "Volume relatif", "Relative volume")}</span><span>Score</span><span>{pick(language, "Signal", "Signal")}</span></div>
        <div className="screener-rows">
          {filtered.map((item: ScreenerRow) => (
            <Link href={`/focus/${encodeURIComponent(item.symbol)}`} className="screener-row" key={item.ticker}>
              <div className="screener-name"><strong>{item.symbol}</strong><span>{item.name}</span><small>{item.sector}</small></div>
              <strong>{money.format(item.price)}</strong>
              <span className={item.change_percent >= 0 ? "positive" : "negative"}>{item.change_percent >= 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}{item.change_percent.toFixed(2)} %</span>
              <span className={item.momentum_20d === null ? "" : item.momentum_20d >= 0 ? "positive" : "negative"}>{item.momentum_20d === null ? "N/D" : `${item.momentum_20d.toFixed(2)} %`}</span>
              <span>{item.rsi_14?.toFixed(1) ?? "—"}</span>
              <span>{item.relative_volume === null ? "N/D" : `${item.relative_volume.toFixed(2)}×`} <small>{compact.format(item.volume)}</small></span>
              <span className="score-pill">{item.score === null ? "N/D" : item.score.toFixed(0)}</span>
              <span className={`signal-badge ${item.signal ? `signal-${item.signal.toLowerCase().replaceAll(" ", "-")}` : ""}`}>{item.signal ? signalLabel(item.signal, language) : "N/D"}</span>
            </Link>
          ))}
          {!filtered.length ? <div className="empty-filter"><Filter size={24} /><strong>{pick(language, "Aucun titre ne correspond aux filtres.", "No securities match these filters.")}</strong><span>{pick(language, "Réduis le score minimum ou élargis les critères.", "Lower the minimum score or broaden the criteria.")}</span></div> : null}
        </div>
      </section>
    </div>
  );
}
