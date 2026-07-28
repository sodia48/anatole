"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Bell,
  BellRing,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  evaluateAlerts,
  searchSymbols,
} from "@/lib/api";
import type {
  AlertEvaluation,
  AlertMetric,
  AlertRule,
  AlertSnapshot,
  SymbolSearchItem,
} from "@/lib/types";

import styles from "./Workspace.module.css";

const STORAGE_KEY = "anatole:alerts:v1";
const NOTIFIED_KEY = "anatole:alerts:notified:v1";

const METRICS: Array<{
  key: AlertMetric;
  label: string;
  defaultThreshold: number;
}> = [
  { key: "price", label: "Prix", defaultThreshold: 100 },
  { key: "change_percent", label: "Variation du jour (%)", defaultThreshold: 3 },
  { key: "rsi_14", label: "RSI 14", defaultThreshold: 70 },
  { key: "momentum_20d", label: "Momentum 20 séances (%)", defaultThreshold: 5 },
  { key: "relative_volume", label: "Volume relatif (x)", defaultThreshold: 1.8 },
  { key: "score", label: "Score Anatole", defaultThreshold: 70 },
];

function loadRules(): AlertRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AlertRule[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatValue(item: AlertEvaluation): string {
  if (item.current_value === null) return "N/D";
  if (item.unit === "$" ) return `${item.current_value.toFixed(2)} $`;
  if (item.unit === "%") return `${item.current_value >= 0 ? "+" : ""}${item.current_value.toFixed(2)} %`;
  if (item.unit === "x") return `${item.current_value.toFixed(2)}x`;
  if (item.unit === "/100") return `${item.current_value.toFixed(1)}/100`;
  return item.current_value.toFixed(1);
}

function statusClass(status: AlertEvaluation["status"]): string {
  if (status === "triggered") return styles.statusTriggered;
  if (status === "monitoring") return styles.statusMonitoring;
  if (status === "unavailable") return styles.statusUnavailable;
  return styles.statusIdle;
}

export function AlertsClient() {
  const searchParams = useSearchParams();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [symbol, setSymbol] = useState("");
  const [metric, setMetric] = useState<AlertMetric>("price");
  const [operator, setOperator] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("100");
  const [suggestions, setSuggestions] = useState<SymbolSearchItem[]>([]);
  const [snapshot, setSnapshot] = useState<AlertSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const hydrated = useRef(false);

  useEffect(() => {
    const saved = loadRules();
    const requestedSymbol = searchParams.get("symbol")?.toUpperCase().replace(/\.TO$/, "");
    setRules(saved);
    setSymbol(requestedSymbol ?? "");
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    } else {
      setPermission("unsupported");
    }
    hydrated.current = true;
  }, [searchParams]);

  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  }, [rules]);

  useEffect(() => {
    const selected = METRICS.find((item) => item.key === metric);
    if (selected) setThreshold(String(selected.defaultThreshold));
  }, [metric]);

  useEffect(() => {
    if (!symbol.trim()) {
      setSuggestions([]);
      return;
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
  }, [symbol]);

  const runEvaluation = async (current = rules) => {
    if (!current.length) {
      setSnapshot(null);
      return;
    }
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    try {
      const result = await evaluateAlerts(current, controller.signal);
      setSnapshot(result);
      if (permission === "granted") {
        const notified = new Set<string>(
          JSON.parse(window.localStorage.getItem(NOTIFIED_KEY) ?? "[]") as string[],
        );
        let changed = false;
        for (const item of result.items) {
          const key = `${item.id}:${item.triggered}:${Math.round((item.current_value ?? 0) * 100)}`;
          if (item.triggered && !notified.has(key)) {
            new Notification(`Alerte Anatole · ${item.symbol}`, {
              body: item.message,
              tag: item.id,
            });
            notified.add(key);
            changed = true;
          }
        }
        if (changed) {
          window.localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notified].slice(-100)));
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Évaluation des alertes indisponible.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!rules.length) return;
    const timer = window.setTimeout(() => void runEvaluation(rules), 350);
    const interval = window.setInterval(() => void runEvaluation(rules), 30_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rules), permission]);

  const addRule = () => {
    const clean = symbol.trim().toUpperCase().replace(/\.TO$/, "");
    const parsedThreshold = Number(threshold);
    if (!clean || !Number.isFinite(parsedThreshold)) {
      setError("Entre un symbole et un seuil numérique valide.");
      return;
    }
    const id = `${clean}-${metric}-${operator}-${Date.now()}`;
    setRules((current) => [
      ...current,
      {
        id,
        symbol: clean,
        metric,
        operator,
        threshold: parsedThreshold,
        enabled: true,
      },
    ]);
    setSymbol("");
    setSuggestions([]);
    setError(null);
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    const next = await Notification.requestPermission();
    setPermission(next);
  };

  const triggered = snapshot?.items.filter((item) => item.triggered) ?? [];
  const activeCount = rules.filter((rule) => rule.enabled).length;
  const resultsById = useMemo(
    () => new Map(snapshot?.items.map((item) => [item.id, item]) ?? []),
    [snapshot],
  );

  return (
    <main className={styles.page}>
      <section className={`panel ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <span className="eyebrow">MON ESPACE · V0.7</span>
          <h1>Alertes</h1>
          <p>Surveille prix, variation, RSI, momentum, volume relatif et score Anatole. Les règles sont enregistrées sur cet appareil et évaluées toutes les 30 secondes lorsque la section est ouverte.</p>
        </div>
        <div className={styles.heroMetric}>
          <strong>{triggered.length}</strong>
          <span>alertes déclenchées</span>
          <small>{activeCount} règle{activeCount > 1 ? "s" : ""} active{activeCount > 1 ? "s" : ""} · contrôle local</small>
        </div>
      </section>

      <section className={`panel ${styles.toolbar}`}>
        <div className={styles.toolbarTop}>
          <div><span className="eyebrow">CRÉATION</span><h2>Nouvelle règle</h2><p>Les notifications du navigateur sont facultatives; la page affiche toujours l’état de chaque seuil.</p></div>
          <div className={styles.actionRow}>
            <button className={styles.secondaryButton} type="button" onClick={requestNotifications} disabled={permission === "granted" || permission === "unsupported"}>
              <BellRing size={15} /> {permission === "granted" ? "Notifications actives" : permission === "denied" ? "Notifications refusées" : permission === "unsupported" ? "Non supportées" : "Activer les notifications"}
            </button>
            <button className={styles.secondaryButton} type="button" disabled={loading || !rules.length} onClick={() => void runEvaluation()}><RefreshCw size={15} /> {loading ? "Vérification…" : "Vérifier maintenant"}</button>
          </div>
        </div>

        <div className={styles.alertFormGrid}>
          <div className={styles.searchField}>
            <label>Symbole</label>
            <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 12, top: 14, color: "#7393aa" }} /><input className={styles.searchInput} style={{ paddingLeft: 36 }} value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="MDA, RY, XIC…" /></div>
            {suggestions.length ? <div className={styles.suggestions}>{suggestions.map((item) => <button className={styles.suggestion} key={item.symbol} type="button" onClick={() => { setSymbol(item.symbol); setSuggestions([]); }}><strong>{item.symbol}</strong><span><b>{item.name}</b><small>{item.sector} · {item.exchange}</small></span></button>)}</div> : null}
          </div>
          <div className={styles.field}><label>Indicateur</label><select value={metric} onChange={(event) => setMetric(event.target.value as AlertMetric)}>{METRICS.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select></div>
          <div className={styles.field}><label>Condition</label><select value={operator} onChange={(event) => setOperator(event.target.value as "above" | "below")}><option value="above">Au-dessus de</option><option value="below">Sous</option></select></div>
          <div className={styles.field}><label>Seuil</label><input inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} /></div>
          <button className={styles.primaryButton} type="button" onClick={addRule}><Plus size={16} /> Créer</button>
        </div>
      </section>

      {error ? <div className={styles.errorNotice}>{error}</div> : null}

      <section className={styles.kpiGrid}>
        <article className={`panel ${styles.kpiCard}`}><span>Règles totales</span><strong>{rules.length}</strong><small>Stockées localement</small></article>
        <article className={`panel ${styles.kpiCard}`}><span>Actives</span><strong>{activeCount}</strong><small>Évaluées toutes les 30 s</small></article>
        <article className={`panel ${styles.kpiCard}`}><span>Déclenchées</span><strong className={triggered.length ? styles.positive : ""}>{triggered.length}</strong><small>Dernière évaluation</small></article>
        <article className={`panel ${styles.kpiCard}`}><span>Indisponibles</span><strong className={snapshot?.unavailable_count ? styles.negative : ""}>{snapshot?.unavailable_count ?? 0}</strong><small>Sources temporaires</small></article>
        <article className={`panel ${styles.kpiCard}`}><span>Notifications</span><strong>{permission === "granted" ? "Actives" : "Locales"}</strong><small>{permission === "granted" ? "Navigateur autorisé" : "Affichage dans la page"}</small></article>
      </section>

      <section className={`panel ${styles.panel}`}>
        <div className={styles.sectionHeading}><div><span className="eyebrow">SURVEILLANCE</span><h2>Règles configurées</h2><p>Une alerte déclenchée ne répète pas sans cesse la même notification.</p></div></div>
        {!rules.length ? (
          <div className={styles.emptyState}><Bell size={30} /><strong>Aucune alerte</strong><span>Crée un premier seuil de prix, RSI ou score Anatole.</span></div>
        ) : (
          <div className={styles.alertList}>
            {rules.map((rule) => {
              const result = resultsById.get(rule.id);
              return (
                <article className={`${styles.alertCard} ${result?.triggered ? styles.alertCardTriggered : ""}`} key={rule.id}>
                  <div className={styles.alertMain}>
                    <div className={styles.alertIdentity}>
                      <span className={styles.symbolBadge}>{rule.symbol}</span>
                      <span><b>{result?.name ?? rule.symbol}</b><small>{result?.metric_label ?? METRICS.find((item) => item.key === rule.metric)?.label} · {rule.operator === "above" ? "au-dessus de" : "sous"} {rule.threshold}</small></span>
                    </div>
                    <div className={styles.actionRow}>
                      <span className={`${styles.statusPill} ${result ? statusClass(result.status) : styles.statusIdle}`}>{result?.status === "triggered" ? "Déclenchée" : result?.status === "monitoring" ? "Surveillance" : result?.status === "unavailable" ? "Indisponible" : rule.enabled ? "En attente" : "Désactivée"}</span>
                      <button className={`${styles.toggle} ${rule.enabled ? styles.toggleOn : ""}`} type="button" aria-label={rule.enabled ? "Désactiver" : "Activer"} onClick={() => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))}><i /></button>
                      <button className={styles.iconButton} type="button" aria-label="Supprimer l’alerte" onClick={() => setRules((current) => current.filter((item) => item.id !== rule.id))}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className={styles.inlineBetween}>
                    <span className={styles.alertMeta}>{result?.message ?? "Première évaluation en cours…"}</span>
                    <strong className={result?.triggered ? styles.positive : ""}>{result ? formatValue(result) : "…"}</strong>
                  </div>
                  <div className={styles.actionRow}><Link className={styles.secondaryButton} href={`/focus/${rule.symbol}`}>Ouvrir Focus</Link><Link className={styles.secondaryButton} href={`/assistant?symbol=${rule.symbol}`}>Demander à l’Assistant</Link></div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className={styles.notice}><strong>Portée actuelle :</strong> les règles sont évaluées lorsque cette page est ouverte. Une surveillance continue côté serveur nécessiterait un compte utilisateur et une base persistante; Anatole ne prétend pas l’activer sans cette infrastructure.</div>
      <div style={{ textAlign: "right", color: "#5f7c91", fontSize: 10 }}>{snapshot ? `Dernière vérification ${new Date(snapshot.generated_at).toLocaleString("fr-CA")}` : null}</div>
    </main>
  );
}
