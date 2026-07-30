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

function refreshDescription(seconds: number): string {
  if (seconds < 120) {
    return `actualisation environ toutes les ${seconds} secondes`;
  }
  const minutes = Math.max(2, Math.round(seconds / 60));
  return `actualisation environ toutes les ${minutes} minutes`;
}

export function CockpitClient() {
  const [universe, setUniverse] = useState<CockpitUniverse>("tsx60");
  const [ready, setReady] = useState(false);
  const [snapshots, setSnapshots] = useState<
    Partial<Record<CockpitUniverse, CockpitSnapshot>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestIdRef = useRef(0);
  const universeRef = useRef<CockpitUniverse>(universe);
  universeRef.current = universe;

  const snapshot = snapshots[universe] ?? null;
  const selectedUniverse = UNIVERSES[universe];

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isCockpitUniverse(stored)) {
      setUniverse(stored);
    }
    setReady(true);
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
              ? "Le TSX Composite n’a pas pu être chargé. La dernière carte valide sera conservée et une nouvelle tentative sera faite automatiquement."
              : "Le cockpit n’a pas pu récupérer les données. Une nouvelle tentative sera faite automatiquement.",
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
    [],
  );

  useEffect(() => {
    if (!ready) {
      return;
    }

    const controller = new AbortController();
    void load(universe, controller.signal);

    const interval = window.setInterval(
      () => void load(universe),
      UNIVERSES[universe].interval,
    );

    return () => {
      controller.abort();
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
        Univers de marché
        <span
          className="cockpit-universe-help"
          title="Change uniquement les sociétés affichées dans le Cockpit."
          aria-label="Aide sur l’univers de marché"
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
                  {count ? `${count} titres chargés` : item.description}
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
            <p>Choisis l’univers que tu souhaites lire dans la carte du marché.</p>
          </div>
          {universeSelector}
        </header>
        <section className="panel cockpit-loading">
          <span className="live-dot" />
          <div>
            <h1>Préparation du Cockpit {selectedUniverse.shortLabel}</h1>
            <p>
              {error ??
                (universe === "composite"
                  ? "Chargement des sociétés du marché canadien élargi. Le premier affichage peut prendre quelques secondes."
                  : "Connexion aux données de marché…")}
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
            Lecture automatique du marché canadien · {refreshDescription(snapshot.refresh_after_seconds)}
          </p>
        </div>
        <div className="cockpit-market-score">
          <span>Variation pondérée</span>
          <strong className={marketPositive ? "positive" : "negative"}>
            {marketPositive ? "+" : ""}
            {snapshot.weighted_change_percent.toFixed(2)}%
          </strong>
          <small className={refreshing ? "is-refreshing" : ""}>
            {refreshing ? "Actualisation…" : "Flux actif"}
          </small>
        </div>
        {universeSelector}
      </header>

      {error ? <div className="cockpit-warning">{error}</div> : null}

      <section className="cockpit-kpis">
        <article className="panel cockpit-kpi">
          <span>Progressions</span>
          <strong className="positive">{snapshot.breadth.advancers}</strong>
        </article>
        <article className="panel cockpit-kpi">
          <span>Baisses</span>
          <strong className="negative">{snapshot.breadth.decliners}</strong>
        </article>
        <article className="panel cockpit-kpi">
          <span>Inchangées</span>
          <strong>{snapshot.breadth.unchanged}</strong>
        </article>
        <article className="panel cockpit-kpi">
          <span>Ratio de hausse</span>
          <strong>{snapshot.breadth.advance_ratio.toFixed(0)}%</strong>
        </article>
      </section>

      <MarketHeatmap
        tiles={snapshot.constituents}
        universeLabel={snapshot.universe}
      />

      <section className="cockpit-lower-grid">
        <div className="cockpit-movers-grid">
          <MoversList title="Meilleures variations" items={snapshot.top_gainers} />
          <MoversList title="Plus fortes baisses" items={snapshot.top_losers} />
        </div>
        <section className="panel sectors-panel">
          <div className="cockpit-section-heading">
            <h2>Contribution sectorielle</h2>
          </div>
          <div className="sector-list">
            {snapshot.sectors.map((sector) => (
              <div className="sector-row" key={sector.sector}>
                <div>
                  <strong>{sector.sector}</strong>
                  <span>{sector.weight.toFixed(1)}% du panier</span>
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
        Mis à jour {new Date(snapshot.generated_at).toLocaleTimeString("fr-CA")} · {snapshot.constituents.length} titres · Univers au {snapshot.universe_as_of} ({snapshot.universe_source}) · Cotations publiques potentiellement différées
      </footer>
    </div>
  );
}
