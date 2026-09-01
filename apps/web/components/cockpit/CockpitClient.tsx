"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { MarketHeatmap } from "./MarketHeatmap";
import { MoversList } from "./MoversList";
import {
  getCockpitSnapshot,
  type CockpitUniverse,
} from "@/lib/api";
import type { CockpitSnapshot } from "@/lib/types";
import { REFRESH_INTERVALS } from "@/lib/refresh";
import { WORKSPACE_SYNC_EVENT } from "@/lib/workspace-sync";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

const STORAGE_KEY = "anatole-cockpit-universe";

const UNIVERSES: Record<
  CockpitUniverse,
  {
    label: string;
    shortLabel: string;
    description: string;
    interval: number;
  }
> = {
  tsx60: {
    label: "S&P/TSX 60",
    shortLabel: "TSX 60",
    description: "Les 60 grandes sociétés canadiennes.",
    interval: REFRESH_INTERVALS.cockpitTsx60,
  },
  composite: {
    label: "S&P/TSX Composite",
    shortLabel: "Composite",
    description: "Le marché canadien élargi, selon les positions de XIC.",
    interval: REFRESH_INTERVALS.composite,
  },
};

function isCockpitUniverse(value: string | null): value is CockpitUniverse {
  return value === "tsx60" || value === "composite";
}

function refreshDescription(seconds: number, language: AnatoleLanguage): string {
  if (seconds < 120) {
    return pick(language, `actualisation environ toutes les ${seconds} secondes`, `refreshes about every ${seconds} seconds`);
  }
  const minutes = Math.max(2, Math.round(seconds / 60));
  return pick(language, `actualisation environ toutes les ${minutes} minutes`, `refreshes about every ${minutes} minutes`);
}

export function CockpitClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [universe, setUniverse] = useState<CockpitUniverse>("tsx60");
  const [ready, setReady] = useState(false);
  const [initialSector, setInitialSector] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<
    Partial<Record<CockpitUniverse, CockpitSnapshot>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestIdRef = useRef(0);
  const universeRef = useRef<CockpitUniverse>(universe);

  useEffect(() => {
    universeRef.current = universe;
  }, [universe]);

  const snapshot = snapshots[universe] ?? null;
  const selectedUniverse = UNIVERSES[universe];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requestedUniverse = params.get("universe");
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isCockpitUniverse(requestedUniverse)) setUniverse(requestedUniverse);
      else if (isCockpitUniverse(stored)) setUniverse(stored);
      setInitialSector(params.get("sector"));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const applySyncedUniverse = () => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isCockpitUniverse(stored)) setUniverse(stored);
    };
    window.addEventListener(WORKSPACE_SYNC_EVENT, applySyncedUniverse);
    return () => window.removeEventListener(WORKSPACE_SYNC_EVENT, applySyncedUniverse);
  }, []);

  const load = useCallback(
    async (target: CockpitUniverse, signal?: AbortSignal) => {
      const requestId = ++requestIdRef.current;
      if (target === universeRef.current) {
        setRefreshing(true);
      }

      try {
        const data = await getCockpitSnapshot(target, signal);
        setSnapshots((current) => ({ ...current, [target]: data }));

        if (target === universeRef.current) {
          setError(null);
        }
      } catch (reason) {
        if (
          (reason as Error).name !== "AbortError" &&
          target === universeRef.current
        ) {
          setError(
            target === "composite"
              ? pick(language, "Le TSX Composite n’a pas pu être chargé. La dernière carte valide sera conservée et une nouvelle tentative sera faite automatiquement.", "The TSX Composite could not be loaded. The last valid map will be kept and Anatole will retry automatically.")
              : pick(language, "Le cockpit n’a pas pu récupérer les données. Une nouvelle tentative sera faite automatiquement.", "The Cockpit could not retrieve data. Anatole will retry automatically."),
          );
        }
      } finally {
        if (
          requestId === requestIdRef.current &&
          target === universeRef.current
        ) {
          setRefreshing(false);
        }
      }
    },
    [language],
  );

  useEffect(() => {
    if (!ready) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(universe, controller.signal), 0);

    const interval = window.setInterval(
      () => {
        if (!document.hidden) void load(universe);
      },
      UNIVERSES[universe].interval,
    );

    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [load, ready, universe]);

  const selectUniverse = (next: CockpitUniverse) => {
    if (next === universe) {
      return;
    }
    setError(null);
    setUniverse(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  const universeSelector = (
    <fieldset className="cockpit-universe-switcher">
      <legend>
        {pick(language, "Univers de marché", "Market universe")}
        <span
          className="cockpit-universe-help"
          title={pick(language, "Change uniquement les sociétés affichées dans le Cockpit.", "Only changes the companies displayed in the Cockpit.")}
          aria-label={pick(language, "Aide sur l’univers de marché", "Market universe help")}
        >
          ?
        </span>
      </legend>
      <div className="cockpit-universe-options">
        {(Object.keys(UNIVERSES) as CockpitUniverse[]).map((value) => {
          const item = UNIVERSES[value];
          const active = value === universe;
          const count = snapshots[value]?.constituents.length;

          return (
            <label
              className={`cockpit-universe-option${active ? " is-selected" : ""}`}
              key={value}
            >
              <input
                type="radio"
                name="cockpit-universe"
                value={value}
                checked={active}
                onChange={() => selectUniverse(value)}
              />
              <span>
                <strong>{item.shortLabel}</strong>
                <small>
                  {count
                    ? pick(language, `${count} titres chargés`, `${count} securities loaded`)
                    : value === "tsx60"
                      ? pick(language, item.description, "Canada’s 60 large-cap companies.")
                      : pick(language, item.description, "The broader Canadian market based on XIC holdings.")}
                </small>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );

  if (!snapshot) {
    return (
      <div className="cockpit-page">
        <header className="panel cockpit-header">
          <div className="cockpit-header-copy">
            <span className="eyebrow">ANATOLE COCKPIT</span>
            <h1>{selectedUniverse.label}</h1>
            <p>{pick(language, "Choisis l’univers que tu souhaites lire dans la carte du marché.", "Choose the universe you want to explore in the market map.")}</p>
          </div>
          {universeSelector}
        </header>
        <section className="panel cockpit-loading">
          <span className="live-dot" />
          <div>
            <h1>{pick(language, "Préparation du Cockpit", "Preparing the Cockpit")} {selectedUniverse.shortLabel}</h1>
            <p>
              {error ??
                (universe === "composite"
                  ? pick(language, "Chargement des sociétés du marché canadien élargi. Le premier affichage peut prendre quelques secondes.", "Loading the broader Canadian market. The initial view may take a few seconds.")
                  : pick(language, "Connexion aux données de marché…", "Connecting to market data…"))}
            </p>
          </div>
        </section>
      </div>
    );
  }

  const marketPositive = snapshot.weighted_change_percent >= 0;

  return (
    <div className="cockpit-page">
      <header className="panel cockpit-header">
        <div className="cockpit-header-copy">
          <span className="eyebrow">ANATOLE COCKPIT</span>
          <h1>{snapshot.universe}</h1>
          <p>
            {pick(language, "Lecture automatique du marché canadien", "Automated Canadian market overview")} · {refreshDescription(snapshot.refresh_after_seconds, language)}
          </p>
        </div>
        <div className="cockpit-market-score">
          <span>{pick(language, "Variation pondérée", "Weighted change")}</span>
          <strong className={marketPositive ? "positive" : "negative"}>
            {marketPositive ? "+" : ""}
            {snapshot.weighted_change_percent.toFixed(2)}%
          </strong>
          <small className={refreshing ? "is-refreshing" : ""}>
            {refreshing ? pick(language, "Actualisation…", "Refreshing…") : pick(language, "Flux actif", "Live feed")}
          </small>
        </div>
        {universeSelector}
      </header>

      {error ? <div className="cockpit-warning">{error}</div> : null}

      <section className="cockpit-kpis">
        <article className="panel cockpit-kpi">
          <span>{pick(language, "Progressions", "Advancers")}</span>
          <strong className="positive">{snapshot.breadth.advancers}</strong>
        </article>
        <article className="panel cockpit-kpi">
          <span>{pick(language, "Baisses", "Decliners")}</span>
          <strong className="negative">{snapshot.breadth.decliners}</strong>
        </article>
        <article className="panel cockpit-kpi">
          <span>{pick(language, "Inchangées", "Unchanged")}</span>
          <strong>{snapshot.breadth.unchanged}</strong>
        </article>
        <article className="panel cockpit-kpi">
          <span>{pick(language, "Ratio de hausse", "Advance ratio")}</span>
          <strong>{snapshot.breadth.advance_ratio.toFixed(0)}%</strong>
        </article>
      </section>

      <MarketHeatmap
        initialSector={initialSector}
        tiles={snapshot.constituents}
        universeLabel={snapshot.universe}
      />

      <section className="cockpit-lower-grid">
        <div className="cockpit-movers-grid">
          <MoversList title={pick(language, "Meilleures variations", "Top gainers")} items={snapshot.top_gainers} />
          <MoversList title={pick(language, "Plus fortes baisses", "Top losers")} items={snapshot.top_losers} />
        </div>
        <section className="panel sectors-panel">
          <div className="cockpit-section-heading">
            <h2>{pick(language, "Contribution sectorielle", "Sector contribution")}</h2>
          </div>
          <div className="sector-list">
            {snapshot.sectors.map((sector) => (
              <div className="sector-row" key={sector.sector}>
                <div>
                  <strong>{sector.sector}</strong>
                  <span>{sector.weight.toFixed(1)}% {pick(language, "du panier", "of basket")}</span>
                </div>
                <div className={sector.change_percent >= 0 ? "positive" : "negative"}>
                  <strong>
                    {sector.change_percent >= 0 ? "+" : ""}
                    {sector.change_percent.toFixed(2)}%
                  </strong>
                  <span>
                    {sector.advancers}↑ · {sector.decliners}↓
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>

      <footer className="status-footer">
        {pick(language, "Mis à jour", "Updated")} {new Date(snapshot.generated_at).toLocaleTimeString(localeFor(language))} · {snapshot.constituents.length} {pick(language, "titres", "securities")} · {pick(language, "Univers au", "Universe as of")} {snapshot.universe_as_of} ({snapshot.universe_source}) · {pick(language, "Cotations publiques potentiellement différées", "Public quotes may be delayed")}
      </footer>
    </div>
  );
}
