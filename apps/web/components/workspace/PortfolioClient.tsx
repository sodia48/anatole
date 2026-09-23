"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BarChart3,
  Download,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  analyzePortfolio,
  searchSymbols,
} from "@/lib/api";
import type {
  PortfolioAllocation,
  PortfolioMarket,
  PortfolioPositionInput,
  PortfolioSnapshot,
  SymbolSearchItem,
} from "@/lib/types";

import { WORKSPACE_SYNC_EVENT } from "@/lib/workspace-sync";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";
import {
  beginPortfolioObservation,
  elapsedPortfolioMs,
  formatPortfolioMs,
  markPortfolioObservation,
  portfolioSpeedGrade,
  type PortfolioObservation,
  type PortfolioObservationHandle,
} from "@/lib/portfolio-observatory";
import { PortfolioIntelligence } from "./PortfolioIntelligence";
import { PortfolioPerformancePanel } from "./PortfolioPerformancePanel";

import styles from "./Workspace.module.css";

const STORAGE_KEY = "anatole:portfolio:v1";
const SNAPSHOT_CACHE_KEY = "anatole:portfolio:snapshot:v2";
const HISTORY_SNAPSHOT_CACHE_KEY = "anatole:portfolio:history:v1";
// La valorisation reste fraîche 24 h; le dernier historique complet peut être
// montré jusqu'à 7 jours pendant que le recalcul frais arrive en arrière-plan.
const SNAPSHOT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const HISTORY_SNAPSHOT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PORTFOLIO_FAST_HEAD_START_MS = 900;
const MONEY_FORMATTERS = new Map<string, Intl.NumberFormat>();

const COLORS = [
  "#2d76ff",
  "#16c79a",
  "#8a63ff",
  "#f5a742",
  "#00b8d9",
  "#ff6b8a",
  "#7ecb55",
  "#c58cff",
];

function money(value: number, currency = "CAD", language: AnatoleLanguage = "fr"): string {
  const key = `${language}:${currency}`;
  let formatter = MONEY_FORMATTERS.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(localeFor(language), {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
    MONEY_FORMATTERS.set(key, formatter);
  }
  return formatter.format(value);
}

function percent(value: number | null, digits = 1): string {
  return value === null ? "N/D" : `${value >= 0 ? "+" : ""}${value.toFixed(digits)} %`;
}

function tone(value: number): string {
  return value > 0.001 ? styles.positive : value < -0.001 ? styles.negative : "";
}

function riskLabel(value: NonNullable<PortfolioSnapshot["risk"]>["risk_level"], language: AnatoleLanguage): string {
  if (!value) return pick(language, "N/D", "N/A");
  if (language === "fr") return value;
  return ({
    Faible: "Low",
    Modéré: "Moderate",
    Élevé: "High",
    "Très élevé": "Very high",
  } as Record<string, string>)[value] ?? value;
}

function optionalFixed(value: number | null, digits: number, language: AnatoleLanguage, suffix = ""): string {
  return value === null ? pick(language, "N/D", "N/A") : `${value.toFixed(digits)}${suffix}`;
}

function hasCompleteHistory(snapshot: PortfolioSnapshot | null): boolean {
  if (!snapshot) return false;
  return snapshot.performance.length > 0 && (snapshot.risk?.history_coverage_percent ?? 0) >= 70;
}

function positionsFingerprint(positions: PortfolioPositionInput[]): string {
  return JSON.stringify(positions.map((position) => ({
    symbol: position.symbol,
    market: position.market ?? "CA",
    quantity: position.quantity,
    average_cost: position.average_cost,
  })));
}

type CachedPortfolioSnapshot = {
  fingerprint: string;
  saved_at: number;
  snapshot: PortfolioSnapshot;
};

function readPortfolioCache(
  key: string,
  positions: PortfolioPositionInput[],
  maxAgeMs: number,
): PortfolioSnapshot | null {
  if (typeof window === "undefined" || !positions.length) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedPortfolioSnapshot;
    if (
      cached.fingerprint !== positionsFingerprint(positions)
      || !cached.snapshot
      || Date.now() - Number(cached.saved_at) > maxAgeMs
    ) {
      return null;
    }
    return cached.snapshot;
  } catch {
    return null;
  }
}

function loadCachedPortfolioSnapshot(positions: PortfolioPositionInput[]): PortfolioSnapshot | null {
  const historical = readPortfolioCache(
    HISTORY_SNAPSHOT_CACHE_KEY,
    positions,
    HISTORY_SNAPSHOT_CACHE_MAX_AGE_MS,
  );
  const valuation = readPortfolioCache(
    SNAPSHOT_CACHE_KEY,
    positions,
    SNAPSHOT_CACHE_MAX_AGE_MS,
  );

  if (valuation && historical && hasCompleteHistory(historical)) {
    return mergeFastSnapshotWithHistory(valuation, historical);
  }
  return valuation ?? historical;
}

function writePortfolioCache(
  key: string,
  fingerprint: string,
  snapshot: PortfolioSnapshot,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({
      fingerprint,
      saved_at: Date.now(),
      snapshot,
    } satisfies CachedPortfolioSnapshot));
  } catch {
    // Le portefeuille reste utilisable si le stockage local est indisponible.
  }
}

function saveCachedPortfolioSnapshot(fingerprint: string, snapshot: PortfolioSnapshot): void {
  writePortfolioCache(SNAPSHOT_CACHE_KEY, fingerprint, snapshot);
}

function saveHistoricalPortfolioSnapshot(fingerprint: string, snapshot: PortfolioSnapshot): void {
  if (hasCompleteHistory(snapshot)) {
    writePortfolioCache(HISTORY_SNAPSHOT_CACHE_KEY, fingerprint, snapshot);
  }
}

function mergeFastSnapshotWithHistory(
  fastSnapshot: PortfolioSnapshot,
  historicalSnapshot: PortfolioSnapshot,
): PortfolioSnapshot {
  if (!hasCompleteHistory(historicalSnapshot)) return fastSnapshot;

  const previousPositions = new Map(
    historicalSnapshot.positions.map((item) => [item.symbol, item]),
  );
  const positions = fastSnapshot.positions.map((item) => {
    const previous = previousPositions.get(item.symbol);
    return previous ? {
      ...item,
      momentum_20d: previous.momentum_20d,
      rsi_14: previous.rsi_14,
      relative_volume: previous.relative_volume,
      trend: previous.trend,
      score: previous.score,
    } : item;
  });

  const risk = fastSnapshot.risk && historicalSnapshot.risk ? {
    ...historicalSnapshot.risk,
    concentration_hhi: fastSnapshot.risk.concentration_hhi,
    top_position_percent: fastSnapshot.risk.top_position_percent,
    top_three_percent: fastSnapshot.risk.top_three_percent,
    diversification_score: fastSnapshot.risk.diversification_score,
  } : historicalSnapshot.risk;

  return {
    ...fastSnapshot,
    positions,
    portfolio_score: historicalSnapshot.portfolio_score,
    performance: historicalSnapshot.performance,
    risk,
    performance_horizons: historicalSnapshot.performance_horizons,
    contribution_horizons: historicalSnapshot.contribution_horizons,
    correlation: historicalSnapshot.correlation,
    stress_tests: historicalSnapshot.stress_tests,
    risk_reading: historicalSnapshot.risk_reading,
    methodology: historicalSnapshot.methodology,
  };
}

function logPortfolioSnapshot(kind: "fast" | "full", snapshot: PortfolioSnapshot): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug(`portfolio-${kind}`, {
      performance: snapshot.performance.length,
      risk: snapshot.risk,
    });
  }
}

function visiblePortfolioNotes(snapshot: PortfolioSnapshot): string[] {
  const historyIsUsable = (snapshot.risk?.history_coverage_percent ?? 0) >= 70 && snapshot.performance.length > 0;
  return snapshot.notes.filter((note) => !historyIsUsable || !/couverture historique/i.test(note));
}

function normalizePortfolioSymbol(value: string, market: PortfolioMarket): string {
  const clean = value.trim().toUpperCase();
  return market === "CA" ? clean.replace(/\.TO$/, "") : clean;
}

function portfolioMarketLabel(market: PortfolioMarket, language: AnatoleLanguage): string {
  if (market === "US") return pick(language, "États-Unis", "United States");
  if (market === "INTL") return pick(language, "International", "International");
  return pick(language, "Canada", "Canada");
}

function loadPositions(): PortfolioPositionInput[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as PortfolioPositionInput[]) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (item) =>
            item &&
            typeof item.symbol === "string" &&
            Number(item.quantity) > 0 &&
            Number(item.average_cost) >= 0,
        )
      : [];
  } catch {
    return [];
  }
}

function AllocationCard({ title, items, totalLabel, language }: { title: string; items: PortfolioAllocation[]; totalLabel: string; language: AnatoleLanguage }) {
  let cursor = 0;
  const stops = items.map((item, index) => {
    const start = cursor;
    cursor += item.weight_percent;
    return `${COLORS[index % COLORS.length]} ${start}% ${cursor}%`;
  });
  return (
    <section className={`panel ${styles.panel}`}>
      <div className={styles.cardHeader}>
        <div><span className="eyebrow">{pick(language, "RÉPARTITION", "ALLOCATION")}</span><h3>{title}</h3></div>
      </div>
      <div className={styles.allocationLayout}>
        <div className={styles.donut} style={{ background: items.length ? `conic-gradient(${stops.join(",")})` : "var(--surface-raised)" }}>
          <strong>{items.length}</strong><small>{totalLabel}</small>
        </div>
        <div className={styles.allocationList}>
          {items.slice(0, 8).map((item, index) => (
            <div className={styles.allocationRow} key={item.key}>
              <span><i style={{ display: "inline-block", width: 7, height: 7, marginRight: 7, borderRadius: 99, background: COLORS[index % COLORS.length] }} />{item.label}</span>
              <span className={styles.progress}><i style={{ width: `${Math.min(item.weight_percent, 100)}%` }} /></span>
              <strong>{item.weight_percent.toFixed(1)} %</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PortfolioClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const searchParams = useSearchParams();
  const importedRef = useRef<HTMLInputElement>(null);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const [positions, setPositions] = useState<PortfolioPositionInput[]>([]);
  const [symbol, setSymbol] = useState("");
  const [market, setMarket] = useState<PortfolioMarket>("CA");
  const [quantity, setQuantity] = useState("10");
  const [averageCost, setAverageCost] = useState("");
  const [suggestions, setSuggestions] = useState<SymbolSearchItem[]>([]);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(true);
  const [snapshotFromCache, setSnapshotFromCache] = useState(false);
  const [observation, setObservation] = useState<PortfolioObservation | null>(null);
  const observationRef = useRef<PortfolioObservationHandle | null>(null);
  const refreshSequenceRef = useRef(0);
  const snapshotRef = useRef<PortfolioSnapshot | null>(null);
  const snapshotPositionsRef = useRef("");
  const refreshPositionsRef = useRef("");

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useLayoutEffect(() => {
    if (!observationRef.current) observationRef.current = beginPortfolioObservation();
    const saved = loadPositions();
    const add = searchParams.get("add")?.toUpperCase().replace(/\.TO$/, "");
    const nextPositions = add && !saved.some((item) => item.symbol === add)
      ? [...saved, { symbol: add, quantity: 1, average_cost: 0 }]
      : saved;
    const cached = loadCachedPortfolioSnapshot(nextPositions);
    let cancelled = false;

    // React lint interdit les setState synchrones dans le corps d'un effect.
    // Une microtask conserve le démarrage avant la prochaine opportunité de
    // peinture tout en évitant une cascade synchrone de renders.
    queueMicrotask(() => {
      if (cancelled) return;

      setPositions(nextPositions);
      setBuilderOpen(nextPositions.length === 0 || Boolean(add));
      if (cached) {
        const fingerprint = positionsFingerprint(nextPositions);
        snapshotRef.current = cached;
        snapshotPositionsRef.current = fingerprint;
        setSnapshot(cached);
        setSnapshotFromCache(true);
      }
      if (observationRef.current) {
        setObservation(markPortfolioObservation(observationRef.current, {
          cache_hit: Boolean(cached),
          display_ms: cached ? elapsedPortfolioMs(observationRef.current) : null,
        }));
      }
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    const applySyncedPositions = () => {
      const synced = loadPositions();
      setPositions((current) => positionsFingerprint(current) === positionsFingerprint(synced) ? current : synced);
    };
    window.addEventListener(WORKSPACE_SYNC_EVENT, applySyncedPositions);
    return () => window.removeEventListener(WORKSPACE_SYNC_EVENT, applySyncedPositions);
  }, []);

  useEffect(() => {
    const applyPrewarmedSnapshot = () => {
      const currentPositions = loadPositions();
      const cached = loadCachedPortfolioSnapshot(currentPositions);
      if (!cached) return;
      const fingerprint = positionsFingerprint(currentPositions);
      if (fingerprint !== positionsFingerprint(positions)) return;

      snapshotRef.current = cached;
      snapshotPositionsRef.current = fingerprint;
      setSnapshot(cached);
      setSnapshotFromCache(true);
    };

    window.addEventListener(
      "anatole:portfolio-cache-updated",
      applyPrewarmedSnapshot,
    );
    return () => window.removeEventListener(
      "anatole:portfolio-cache-updated",
      applyPrewarmedSnapshot,
    );
  }, [positions]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  }, [hydrated, positions]);

  useEffect(() => {
    if (market !== "CA" || !symbol.trim()) {
      const timer = window.setTimeout(() => setSuggestions([]), 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await searchSymbols(symbol, controller.signal);
        setSuggestions(response.items.slice(0, 6));
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [market, symbol]);

  const refresh = async (
    current = positions,
    options: { fullOnly?: boolean } = {},
  ) => {
    if (!current.length) {
      refreshControllerRef.current?.abort();
      refreshPositionsRef.current = "";
      snapshotRef.current = null;
      snapshotPositionsRef.current = "";
      setSnapshot(null);
      setSnapshotFromCache(false);
      setLoading(false);
      setError(null);
      setHistoryError(null);
      try {
        window.localStorage.removeItem(SNAPSHOT_CACHE_KEY);
        window.localStorage.removeItem(HISTORY_SNAPSHOT_CACHE_KEY);
      } catch {
        // Ignore storage failures.
      }
      return;
    }
    const targetPositions = positionsFingerprint(current);
    if (
      refreshControllerRef.current
      && !refreshControllerRef.current.signal.aborted
      && refreshPositionsRef.current === targetPositions
    ) {
      return;
    }
    refreshControllerRef.current?.abort();
    const controller = new AbortController();
    const sequence = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = sequence;
    refreshControllerRef.current = controller;
    refreshPositionsRef.current = targetPositions;
    const isCurrentRequest = () => refreshControllerRef.current === controller && refreshSequenceRef.current === sequence && !controller.signal.aborted;
    const applySnapshot = (nextSnapshot: PortfolioSnapshot) => {
      snapshotRef.current = nextSnapshot;
      snapshotPositionsRef.current = targetPositions;
      setSnapshot(nextSnapshot);
      setSnapshotFromCache(false);
      saveCachedPortfolioSnapshot(targetPositions, nextSnapshot);
    };
    const applyFullSnapshot = (fullSnapshot: PortfolioSnapshot) => {
      logPortfolioSnapshot("full", fullSnapshot);
      applySnapshot(fullSnapshot);
      saveHistoricalPortfolioSnapshot(targetPositions, fullSnapshot);
      const historyIsUsable = hasCompleteHistory(fullSnapshot);
      if (observationRef.current) {
        setObservation(markPortfolioObservation(observationRef.current, {
          analysis_ms: elapsedPortfolioMs(observationRef.current),
        }));
      }
      if (!historyIsUsable) {
        const message = pick(
          language,
          "Certaines données historiques du portefeuille sont temporairement indisponibles.",
          "Some historical portfolio data is temporarily unavailable.",
        );
        setError(message);
        setHistoryError(message);
      } else {
        setError(null);
        setHistoryError(null);
      }
    };
    setLoading(true);
    setError(null);
    setHistoryError(null);
    try {
      if (options.fullOnly) {
        const fullSnapshot = await analyzePortfolio(current, controller.signal);
        if (!isCurrentRequest()) return;
        applyFullSnapshot(fullSnapshot);
        return;
      }
      // Donne une courte priorité réseau aux cotations de séance. Auparavant
      // le full snapshot lançait immédiatement 10+ historiques et pouvait
      // occuper le pool HTTP avant même la première valorisation.
      const fastPromise = analyzePortfolio(
        current,
        controller.signal,
        true,
      );
      const cachedForCurrentPositions =
        snapshotPositionsRef.current === targetPositions;
      const fullHeadStartMs = cachedForCurrentPositions
        ? 150
        : PORTFOLIO_FAST_HEAD_START_MS;
      const fullPromise = (async () => {
        await Promise.race([
          fastPromise.then(
            () => undefined,
            () => undefined,
          ),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, fullHeadStartMs);
          }),
        ]);
        if (!isCurrentRequest()) {
          throw new DOMException("Portfolio refresh aborted", "AbortError");
        }
        return analyzePortfolio(current, controller.signal);
      })();

      try {
        const currentSnapshot = await fastPromise;
        if (!isCurrentRequest()) return;
        logPortfolioSnapshot("fast", currentSnapshot);
        if (observationRef.current) {
          setObservation(markPortfolioObservation(observationRef.current, {
            price_ms: elapsedPortfolioMs(observationRef.current),
          }));
        }
        if (
          snapshotPositionsRef.current === targetPositions
          && hasCompleteHistory(snapshotRef.current)
        ) {
          applySnapshot(
            mergeFastSnapshotWithHistory(
              currentSnapshot,
              snapshotRef.current as PortfolioSnapshot,
            ),
          );
        } else {
          applySnapshot(currentSnapshot);
        }
      } catch (reason) {
        if (!isCurrentRequest()) return;
        console.error("portfolio_fast_valuation_failed", reason);
      }

      try {
        const fullSnapshot = await fullPromise;
        if (!isCurrentRequest()) return;
        applyFullSnapshot(fullSnapshot);
      } catch (reason) {
        if (!isCurrentRequest()) return;
        console.error("portfolio_full_analysis_failed", reason);
        if (
          snapshotPositionsRef.current === targetPositions
          && hasCompleteHistory(snapshotRef.current)
        ) return;
        const message = pick(
          language,
          "Certaines données historiques du portefeuille sont temporairement indisponibles.",
          "Some historical portfolio data is temporarily unavailable.",
        );
        setError(message);
        setHistoryError(message);
      }
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (options.fullOnly) {
        console.error("portfolio_full_analysis_failed", reason);
        if (
          snapshotPositionsRef.current === targetPositions
          && hasCompleteHistory(snapshotRef.current)
        ) return;
        const message = pick(
          language,
          "Certaines données historiques du portefeuille sont temporairement indisponibles.",
          "Some historical portfolio data is temporarily unavailable.",
        );
        setError(message);
        setHistoryError(message);
        return;
      }
      console.error("portfolio_valuation_failed", reason);
      setError(pick(
        language,
        "Certaines données du portefeuille sont temporairement indisponibles.",
        "Some portfolio data is temporarily unavailable.",
      ));
    } finally {
      if (refreshControllerRef.current === controller) {
        refreshPositionsRef.current = "";
        setLoading(false);
      }
    }
  };

  useEffect(() => () => refreshControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!hydrated || !positions.length) return;
    // Premier affichage sans cache : presque immédiat. Une vue déjà visible
    // peut attendre un peu afin d'absorber les éditions rapides de quantité.
    const refreshDelayMs = snapshotRef.current ? 250 : 60;
    const timer = window.setTimeout(
      () => void refresh(positions),
      refreshDelayMs,
    );
    return () => window.clearTimeout(timer);
    // refresh intentionally follows the position state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, positions]);

  const addPosition = () => {
    const clean = normalizePortfolioSymbol(symbol, market);
    const qty = Number(quantity);
    const cost = Number(averageCost || 0);
    if (!clean || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost < 0) {
      setError(pick(language, "Entre un symbole, une quantité positive et un coût moyen valide.", "Enter a symbol, a positive quantity, and a valid average cost."));
      return;
    }
    if (positions.some(
      (item) =>
        item.symbol === clean
        && (item.market ?? "CA") === market,
    )) {
      setError(pick(
        language,
        `${clean} est déjà dans ce marché.`,
        `${clean} is already in this market.`,
      ));
      return;
    }
    const nextPositions = [
      ...positions,
      { symbol: clean, quantity: qty, average_cost: cost, market },
    ];
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(nextPositions),
      );
    } catch {
      // La position reste en mémoire même si le stockage navigateur échoue.
    }
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(nextPositions),
      );
    } catch {
      // La position reste en mémoire même si le stockage navigateur échoue.
    }
    setPositions(nextPositions);
    void refresh(nextPositions);
    setSymbol("");
    setQuantity("10");
    setAverageCost("");
    setSuggestions([]);
    setError(null);
    setBuilderOpen(false);
  };

  const updatePosition = (index: number, patch: Partial<PortfolioPositionInput>) => {
    setPositions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const loadExample = () => {
    setPositions([
      { symbol: "RY", quantity: 12, average_cost: 122 },
      { symbol: "TD", quantity: 18, average_cost: 78 },
      { symbol: "XIC", quantity: 25, average_cost: 33 },
      { symbol: "SHOP", quantity: 6, average_cost: 92 },
    ]);
    setBuilderOpen(false);
  };

  const exportCsv = () => {
    const rows = [
      "symbol,market,quantity,average_cost",
      ...positions.map((item) => `${item.symbol},${item.market ?? "CA"},${item.quantity},${item.average_cost}`),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "anatole-portefeuille.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result ?? "").split(/\r?\n/).slice(1);
      const parsed = lines.flatMap((line) => {
        const parts = line.split(",");
        const rawSymbol = parts[0];
        const hasMarket = ["CA", "US", "INTL"].includes(String(parts[1] ?? "").trim().toUpperCase());
        const parsedMarket = (hasMarket ? String(parts[1]).trim().toUpperCase() : "CA") as PortfolioMarket;
        const rawQuantity = parts[hasMarket ? 2 : 1];
        const rawCost = parts[hasMarket ? 3 : 2];
        const clean = normalizePortfolioSymbol(rawSymbol ?? "", parsedMarket);
        const qty = Number(rawQuantity);
        const cost = Number(rawCost);
        return clean && qty > 0 && cost >= 0
          ? [{ symbol: clean, market: parsedMarket, quantity: qty, average_cost: cost }]
          : [];
      });
      if (parsed.length) setPositions(parsed.slice(0, 30));
      else setError(pick(language, "Le CSV doit contenir symbol, quantity, average_cost et peut inclure market (CA, US, INTL).", "The CSV must contain symbol, quantity, average_cost and may include market (CA, US, INTL)."));
    };
    reader.readAsText(file);
  };

  const performanceReturn = snapshot?.performance.length
    ? ((snapshot.performance[snapshot.performance.length - 1].portfolio / snapshot.performance[0].portfolio) - 1) * 100
    : null;

  const liveCount = useMemo(
    () => snapshot?.positions.filter((item) => !item.source.startsWith("demo")).length ?? 0,
    [snapshot],
  );
  const snapshotBySymbol = useMemo(
    () => new Map(snapshot?.positions.map((item) => [item.symbol, item]) ?? []),
    [snapshot],
  );
  const analyticsPending = Boolean(loading && snapshot && !hasCompleteHistory(snapshot));
  const pendingValue = loading && !snapshot
    ? pick(language, "Chargement…", "Loading…")
    : pick(language, "N/D", "N/A");
  const analyticsValue = analyticsPending
    ? pick(language, "Analyse…", "Analyzing…")
    : pick(language, "N/D", "N/A");
  const observationGrade = observation ? portfolioSpeedGrade(observation) : "pending";

  return (
    <main className={styles.page}>
      <section className={`panel ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <span className="eyebrow">{pick(language, "MON ESPACE", "MY WORKSPACE")} · V0.7</span>
          <h1>{pick(language, "Portefeuille", "Portfolio")}</h1>
          <p>{pick(language, "Positions locales, performance, P&L, allocation sectorielle, concentration et risque. Aucun ordre n’est exécuté et les positions restent dans ce navigateur.", "Local positions, performance, P&L, sector allocation, concentration, and risk. No order is executed and positions remain in this browser.")}</p>
        </div>
        <div className={styles.heroMetric}>
          <strong>{snapshot?.portfolio_score?.toFixed(1) ?? (analyticsPending ? "…" : pick(language, "N/D", "N/A"))}</strong>
          <span>{pick(language, "score portefeuille", "portfolio score")}</span>
          <small>{positions.length} {pick(language, `position${positions.length > 1 ? "s" : ""}`, `position${positions.length === 1 ? "" : "s"}`)} · {liveCount} {pick(language, `cotation${liveCount > 1 ? "s" : ""} publique${liveCount > 1 ? "s" : ""}`, `public quote${liveCount === 1 ? "" : "s"}`)}</small>
        </div>
      </section>

      {positions.length ? (
        <>
          <div className={styles.portfolioStatus} role="status">
            <span className={loading ? styles.statusDotBusy : styles.statusDot} />
            <strong>
              {snapshotFromCache
                ? pick(language, "Affichage instantané du dernier calcul", "Showing the latest cached calculation")
                : loading
                  ? pick(language, "Mise à jour des données en arrière-plan", "Refreshing data in the background")
                  : pick(language, "Portefeuille à jour", "Portfolio up to date")}
            </strong>
            {analyticsPending ? <small>{pick(language, "Valorisation disponible · intelligence historique en cours", "Valuation available · historical intelligence loading")}</small> : null}
          </div>
          {observation ? (
            <div className={`${styles.portfolioObservatory} ${styles[`portfolioObservatory_${observationGrade}`]}`} data-testid="portfolio-observatory">
              <strong>{pick(language, "Vitesse", "Speed")}</strong>
              <span>{observation.cache_hit ? `${pick(language, "Affichage", "Display")} ${formatPortfolioMs(observation.display_ms)}` : pick(language, "Sans cache", "No cache")}</span>
              <span>{pick(language, "Prix", "Prices")} {formatPortfolioMs(observation.price_ms)}</span>
              <span>{pick(language, "Analyse", "Analysis")} {formatPortfolioMs(observation.analysis_ms)}</span>
              <i>{observationGrade === "instant" ? pick(language, "Instantané", "Instant") : observationGrade === "fast" ? pick(language, "Rapide", "Fast") : observationGrade === "slow" ? pick(language, "À optimiser", "Needs optimization") : pick(language, "Mesure…", "Measuring…")}</i>
            </div>
          ) : null}
        </>
      ) : null}

      <section className={`panel ${styles.toolbar}`}>
        <div className={styles.toolbarTop}>
          <div><span className="eyebrow">{pick(language, "CONSTRUCTION", "BUILD")}</span><h2>{pick(language, "Ajouter ou importer des positions", "Add or import positions")}</h2><p>{pick(language, "Le coût moyen est saisi dans la devise de cotation du titre.", "Average cost is entered in the security’s quote currency.")}</p></div>
          <div className={styles.actionRow}>
            <button className={styles.primaryButton} type="button" onClick={() => setBuilderOpen((current) => !current)}><Plus size={15} /> {builderOpen ? pick(language, "Fermer", "Close") : pick(language, "Ajouter", "Add")}</button>
            {!positions.length ? <button className={styles.secondaryButton} type="button" onClick={loadExample}>{pick(language, "Charger un exemple", "Load example")}</button> : null}
            <button className={styles.secondaryButton} type="button" onClick={() => importedRef.current?.click()}><Upload size={15} /> {pick(language, "Importer CSV", "Import CSV")}</button>
            <button className={styles.secondaryButton} type="button" disabled={!positions.length} onClick={exportCsv}><Download size={15} /> {pick(language, "Exporter", "Export")}</button>
            <input ref={importedRef} aria-label={pick(language, "Importer un portefeuille CSV", "Import a CSV portfolio")} hidden type="file" accept=".csv,text/csv" onChange={(event) => importCsv(event.target.files?.[0])} />
          </div>
        </div>
        {builderOpen ? <div className={`${styles.formGrid} ${styles.portfolioGlobalForm}`}>
          <div className={styles.field}>
            <label htmlFor="portfolio-market">{pick(language, "Marché", "Market")}</label>
            <select id="portfolio-market" value={market} onChange={(event) => { setMarket(event.target.value as PortfolioMarket); setSymbol(""); setSuggestions([]); }}>
              <option value="CA">{pick(language, "Canada (TSX/TSXV)", "Canada (TSX/TSXV)")}</option>
              <option value="US">{pick(language, "États-Unis (NYSE/Nasdaq)", "United States (NYSE/Nasdaq)")}</option>
              <option value="INTL">{pick(language, "International", "International")}</option>
            </select>
          </div>
          <div className={styles.searchField}>
            <label htmlFor="portfolio-symbol">{pick(language, "Symbole ou entreprise", "Symbol or company")}</label>
            <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 12, top: 14, color: "var(--text-secondary)" }} /><input id="portfolio-symbol" className={styles.searchInput} style={{ paddingLeft: 36 }} value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="RY, SHOP, XIC…" /></div>
            {suggestions.length ? <div className={styles.suggestions}>{suggestions.map((item) => <button className={styles.suggestion} key={item.symbol} type="button" onClick={() => { setSymbol(item.symbol); setSuggestions([]); }}><strong>{item.symbol}</strong><span><b>{item.name}</b><small>{item.sector} · {item.exchange}</small></span></button>)}</div> : null}
            {market !== "CA" ? <small className={styles.marketHint}>{market === "US" ? pick(language, "Entre le ticker américain exact, par ex. AAPL ou BRK-B.", "Enter the exact U.S. ticker, e.g. AAPL or BRK-B.") : pick(language, "Entre le ticker Yahoo avec suffixe de place, par ex. BMW.DE, 7203.T, AIR.PA ou NESN.SW.", "Enter the Yahoo ticker with exchange suffix, e.g. BMW.DE, 7203.T, AIR.PA or NESN.SW.")}</small> : null}
          </div>
          <div className={styles.field}><label htmlFor="portfolio-quantity">{pick(language, "Quantité", "Quantity")}</label><input id="portfolio-quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
          <div className={styles.field}><label htmlFor="portfolio-average-cost">{pick(language, "Coût moyen", "Average cost")}</label><input id="portfolio-average-cost" inputMode="decimal" value={averageCost} onChange={(event) => setAverageCost(event.target.value)} placeholder="0.00" /></div>
          <button className={styles.primaryButton} type="button" onClick={addPosition}><Plus size={16} /> {pick(language, "Ajouter", "Add")}</button>
        </div> : null}
      </section>

      {error ? <div className={styles.errorNotice} role="alert"><span>{error}</span><button className={styles.secondaryButton} disabled={loading} onClick={() => void refresh(positions, { fullOnly: true })} type="button"><RefreshCw aria-hidden="true" size={15} /> {pick(language, "Réessayer", "Retry")}</button></div> : null}

      {!positions.length ? (
        <section className={`panel ${styles.emptyState}`}>
          <BarChart3 size={30} />
          <strong>{pick(language, "Ton portefeuille est vide", "Your portfolio is empty")}</strong>
          <span>{pick(language, "Ajoute une position ou charge l’exemple pour voir le diagnostic complet.", "Add a position or load the example to view the full analysis.")}</span>
          <button className={styles.primaryButton} type="button" onClick={loadExample}>{pick(language, "Charger l’exemple", "Load example")}</button>
        </section>
      ) : (
        <>
          <section className={styles.kpiGrid}>
            <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Valeur actuelle", "Current value")}</span><strong>{snapshot ? money(snapshot.total_market_value, snapshot.base_currency, language) : pendingValue}</strong><small>CAD</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "P&L latent", "Unrealized P&L")}</span><strong className={snapshot ? tone(snapshot.total_unrealized_pnl) : ""}>{snapshot ? money(snapshot.total_unrealized_pnl, snapshot.base_currency, language) : pendingValue}</strong><small>{snapshot ? percent(snapshot.total_unrealized_pnl_percent) : pendingValue}</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Séance", "Session")}</span><strong className={snapshot ? tone(snapshot.total_day_pnl) : ""}>{snapshot ? money(snapshot.total_day_pnl, snapshot.base_currency, language) : pendingValue}</strong><small>{snapshot ? percent(snapshot.total_day_change_percent) : pendingValue}</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Performance 1 an", "1-year performance")}</span><strong className={performanceReturn === null ? "" : tone(performanceReturn)}>{snapshot ? (performanceReturn === null ? analyticsValue : percent(performanceReturn)) : pendingValue}</strong><small>{analyticsPending ? pick(language, "Historique en cours de calcul", "Historical analysis in progress") : pick(language, "Portefeuille reconstitué aux poids actuels", "Portfolio reconstructed using current weights")}</small></article>
            <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Risque", "Risk")}</span><strong>{snapshot ? (snapshot.risk?.risk_level ? riskLabel(snapshot.risk.risk_level, language) : analyticsValue) : pendingValue}</strong><small>{snapshot ? `${pick(language, "Diversification", "Diversification")} ${snapshot.risk?.diversification_score == null ? pick(language, "N/D", "N/A") : `${snapshot.risk.diversification_score.toFixed(1)}/100`}` : pendingValue}</small></article>
          </section>

          <section className={`panel ${styles.panel}`}>
            <div className={styles.sectionHeading}><div><span className="eyebrow">POSITIONS</span><h2>{pick(language, "Détail du portefeuille", "Portfolio details")}</h2><p>{pick(language, "Modifie les quantités ou coûts moyens directement dans le tableau.", "Edit quantities or average costs directly in the table.")}</p></div><button className={styles.secondaryButton} type="button" disabled={loading} onClick={() => void refresh(positions, { fullOnly: true })}><RefreshCw size={15} /> {loading ? pick(language, "Actualisation…", "Refreshing…") : pick(language, "Actualiser", "Refresh")}</button></div>
            <div className={styles.tableWrap}>
              <table className={styles.table} data-mobile-cards="portfolio">
                <thead><tr><th>{pick(language, "Titre", "Security")}</th><th>{pick(language, "Quantité", "Quantity")}</th><th>{pick(language, "Coût moyen", "Average cost")}</th><th>{pick(language, "Prix", "Price")}</th><th>{pick(language, "Valeur", "Value")}</th><th>{pick(language, "Poids", "Weight")}</th><th>P&amp;L</th><th>{pick(language, "Jour", "Day")}</th><th>Score</th><th /></tr></thead>
                <tbody>
                  {positions.map((position, index) => {
                    const result = snapshotBySymbol.get(position.symbol);
                    return <tr key={position.symbol}>
                      <td data-label={pick(language, "Titre", "Security")}><div className={styles.instrument}><span className={styles.symbolBadge}>{position.symbol}</span><span><b>{result?.name ?? position.symbol}</b><small>{portfolioMarketLabel(position.market ?? "CA", language)} · {result?.native_currency ?? result?.currency ?? "—"} · {result?.sector ?? (loading && !snapshot ? pick(language, "Chargement", "Loading") : pick(language, "Données temporairement indisponibles", "Data temporarily unavailable"))}</small></span></div></td>
                      <td data-label={pick(language, "Quantité", "Quantity")}><input aria-label={pick(language, `Quantité de ${position.symbol}`, `${position.symbol} quantity`)} style={{ width: 82, background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "inherit", padding: "7px 8px", textAlign: "right" }} value={position.quantity} onChange={(event) => updatePosition(index, { quantity: Math.max(0.0001, Number(event.target.value) || 0.0001) })} /></td>
                      <td data-label={pick(language, "Coût moyen", "Average cost")}><input aria-label={pick(language, `Coût moyen de ${position.symbol}`, `${position.symbol} average cost`)} style={{ width: 96, background: "transparent", border: "1px solid var(--border)", borderRadius: 8, color: "inherit", padding: "7px 8px", textAlign: "right" }} value={position.average_cost} onChange={(event) => updatePosition(index, { average_cost: Math.max(0, Number(event.target.value) || 0) })} /></td>
                      <td data-label={pick(language, "Prix", "Price")}>{result ? money(result.native_price ?? result.price, result.native_currency ?? result.currency, language) : pendingValue}</td>
                      <td data-label={pick(language, "Valeur", "Value")}>{result ? money(result.market_value, snapshot?.base_currency, language) : pendingValue}</td>
                      <td data-label={pick(language, "Poids", "Weight")}>{result ? `${result.weight_percent.toFixed(1)} %` : pendingValue}</td>
                      <td data-label={pick(language, "P&L latent", "Unrealized P&L")} className={result ? tone(result.unrealized_pnl) : ""}>{result ? `${money(result.unrealized_pnl, snapshot?.base_currency, language)} · ${percent(result.unrealized_pnl_percent)}` : pendingValue}</td>
                      <td data-label={pick(language, "Séance", "Session")} className={result ? tone(result.day_pnl) : ""}>{result ? `${money(result.day_pnl, snapshot?.base_currency, language)} · ${percent(result.day_change_percent)}` : pendingValue}</td>
                      <td data-label="Score">{result?.score !== null && result?.score !== undefined ? <span className={styles.scorePill}>{result.score.toFixed(0)}</span> : analyticsPending ? analyticsValue : pendingValue}</td>
                      <td data-label="Action"><button className={styles.iconButton} type="button" aria-label={pick(language, `Supprimer ${position.symbol}`, `Delete ${position.symbol}`)} onClick={() => setPositions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {snapshot ? (
            <>
              <div className={styles.gridTwo}>
                <PortfolioPerformancePanel language={language} snapshot={snapshot} />
                <section className={`panel ${styles.panel}`}>
                  <div className={styles.cardHeader}><div><span className="eyebrow">{pick(language, "RISQUE", "RISK")}</span><h3>{pick(language, "Diagnostic", "Assessment")}</h3><p>{pick(language, "Concentration, volatilité et sensibilité au marché.", "Concentration, volatility, and market sensitivity.")}</p></div><span className={`${styles.statusPill} ${snapshot.risk?.risk_level === "Faible" ? styles.statusHealthy : snapshot.risk?.risk_level === "Modéré" ? styles.statusMonitoring : snapshot.risk?.risk_level ? styles.statusDegraded : ""}`}>{riskLabel(snapshot.risk?.risk_level ?? null, language)}</span></div>
                  {snapshot.risk ? <div className={styles.riskGrid}>
                    <div className={styles.riskMetric}><span>{pick(language, "Volatilité", "Volatility")}</span><strong>{optionalFixed(snapshot.risk.volatility_percent, 1, language, " %")}</strong></div>
                    <div className={styles.riskMetric}><span>{pick(language, "Bêta TSX", "TSX beta")}</span><strong>{optionalFixed(snapshot.risk.beta, 2, language)}</strong></div>
                    <div className={styles.riskMetric}><span>{pick(language, "Drawdown max", "Max drawdown")}</span><strong className={snapshot.risk.max_drawdown_percent === null ? "" : styles.negative}>{optionalFixed(snapshot.risk.max_drawdown_percent, 1, language, " %")}</strong></div>
                    <div className={styles.riskMetric}><span>Sharpe</span><strong>{optionalFixed(snapshot.risk.sharpe_ratio, 2, language)}</strong></div>
                    <div className={styles.riskMetric}><span>{pick(language, "Plus grande position", "Largest position")}</span><strong>{optionalFixed(snapshot.risk.top_position_percent, 1, language, " %")}</strong></div>
                    <div className={styles.riskMetric}><span>Top 3</span><strong>{optionalFixed(snapshot.risk.top_three_percent, 1, language, " %")}</strong></div>
                  </div> : <div className={styles.notice}>{pick(language, "Diagnostic de risque indisponible pour les données actuelles.", "Risk assessment is unavailable for the current data.")}</div>}
                  {visiblePortfolioNotes(snapshot).map((note, index) => <div className={styles.notice} style={{ marginTop: 10 }} key={note}>{language === "fr" ? note : pick(language, "", [
                    "This portfolio risk note is based on the current positions and available market history.",
                    "Concentration and volatility should be reviewed alongside the underlying data coverage.",
                    "Risk indicators are informational and do not constitute financial advice.",
                  ][index] ?? "Additional portfolio risk information is available.")}</div>)}
                </section>
              </div>

              <PortfolioIntelligence language={language} snapshot={snapshot} />

              <div className={styles.gridEqual}>
                <AllocationCard language={language} title={pick(language, "Répartition sectorielle", "Sector allocation")} items={snapshot.sector_allocation} totalLabel={pick(language, "secteurs", "sectors")} />
                <AllocationCard language={language} title={pick(language, "Exposition par devise", "Currency exposure")} items={snapshot.currency_allocation} totalLabel={pick(language, "devises", "currencies")} />
              </div>

              <div className={styles.gridEqual}>
                <section className={`panel ${styles.panel}`}><div className={styles.cardHeader}><div><span className="eyebrow">{pick(language, "CONTRIBUTEURS", "CONTRIBUTORS")}</span><h3>{pick(language, "Moteurs de la séance", "Session drivers")}</h3></div></div><div className={styles.compactList} style={{ marginTop: 14 }}>{snapshot.contributors.length ? snapshot.contributors.map((item) => <div className={styles.contributorRow} key={item.symbol}><span><strong>{item.symbol}</strong><small>{item.name}</small></span><strong className={styles.positive}>{money(item.value, snapshot.base_currency, language)} · {percent(item.value_percent)}</strong></div>) : <div className={styles.notice}>{pick(language, "Aucun contributeur positif aujourd’hui.", "No positive contributor today.")}</div>}</div></section>
                <section className={`panel ${styles.panel}`}><div className={styles.cardHeader}><div><span className="eyebrow">{pick(language, "DÉTRACTEURS", "DETRACTORS")}</span><h3>{pick(language, "Pressions de la séance", "Session pressures")}</h3></div></div><div className={styles.compactList} style={{ marginTop: 14 }}>{snapshot.detractors.length ? snapshot.detractors.map((item) => <div className={styles.contributorRow} key={item.symbol}><span><strong>{item.symbol}</strong><small>{item.name}</small></span><strong className={styles.negative}>{money(item.value, snapshot.base_currency, language)} · {percent(item.value_percent)}</strong></div>) : <div className={styles.notice}>{pick(language, "Aucun détracteur négatif aujourd’hui.", "No negative detractor today.")}</div>}</div></section>
              </div>
            </>
          ) : loading ? <div className={styles.skeleton} /> : null}
        </>
      )}

      <div className={styles.notice}>{pick(language, "Portefeuille de suivi uniquement. Les quantités et coûts moyens restent sur cet appareil en mode anonyme et sont synchronisés uniquement lorsqu’un compte Anatole est connecté.", "Tracking portfolio only. Quantities and average costs remain on this device while anonymous and synchronize only when an Anatole account is connected.")}</div>
      <div style={{ textAlign: "right", color: "var(--text-secondary)", fontSize: 10 }}>{snapshot ? <>{pick(language, "Dernière analyse", "Last analysis")} {new Date(snapshot.generated_at).toLocaleString(localeFor(language))} · <Link href="/parametres?section=quality">{pick(language, "Vérifier les sources", "Check sources")}</Link></> : null}</div>
    </main>
  );
}
