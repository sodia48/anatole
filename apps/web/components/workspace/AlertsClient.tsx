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

import { WORKSPACE_SYNC_EVENT } from "@/lib/workspace-sync";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

import styles from "./Workspace.module.css";

const STORAGE_KEY = "anatole:alerts:v1";
const NOTIFIED_KEY = "anatole:alerts:notified:v1";

const METRICS: Array<{
  key: AlertMetric;
  label: readonly [string, string];
  defaultThreshold: number;
}> = [
  { key: "price", label: ["Prix", "Price"], defaultThreshold: 100 },
  { key: "change_percent", label: ["Variation du jour (%)", "Daily change (%)"], defaultThreshold: 3 },
  { key: "rsi_14", label: ["RSI 14", "RSI 14"], defaultThreshold: 70 },
  { key: "momentum_20d", label: ["Momentum 20 séances (%)", "20-session momentum (%)"], defaultThreshold: 5 },
  { key: "relative_volume", label: ["Volume relatif (x)", "Relative volume (x)"], defaultThreshold: 1.8 },
  { key: "score", label: ["Score Anatole", "Anatole score"], defaultThreshold: 70 },
];

function metricLabel(metric: AlertMetric, language: AnatoleLanguage): string {
  const copy = METRICS.find((item) => item.key === metric)?.label ?? [metric, metric];
  return pick(language, copy[0], copy[1]);
}

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
  const { preferences } = usePreferences();
  const language = preferences.language;
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
    const applySyncedRules = () => setRules(loadRules());
    window.addEventListener(WORKSPACE_SYNC_EVENT, applySyncedRules);
    return () => window.removeEventListener(WORKSPACE_SYNC_EVENT, applySyncedRules);
  }, []);

  useEffect(() => {
    const saved = loadRules();
    const requestedSymbol = searchParams.get("symbol")?.toUpperCase().replace(/\.TO$/, "");
    const timer = window.setTimeout(() => {
      setRules(saved);
      setSymbol(requestedSymbol ?? "");
      if ("Notification" in window) setPermission(Notification.permission);
      else setPermission("unsupported");
      hydrated.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  }, [rules]);

  useEffect(() => {
    const selected = METRICS.find((item) => item.key === metric);
    const timer = window.setTimeout(() => {
      if (selected) setThreshold(String(selected.defaultThreshold));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [metric]);

  useEffect(() => {
    if (!symbol.trim()) {
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
            new Notification(pick(language, `Alerte Anatole · ${item.symbol}`, `Anatole alert · ${item.symbol}`), {
              body: language === "fr" ? item.message : `${metricLabel(item.metric, language)} ${item.operator === "above" ? "above" : "below"} ${item.threshold}`,
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
      setError(language === "fr" && reason instanceof Error ? reason.message : pick(language, "Évaluation des alertes indisponible.", "Alert evaluation is unavailable."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!rules.length) return;
    const timer = window.setTimeout(() => void runEvaluation(rules), 350);
    const interval = window.setInterval(() => {
      if (!document.hidden) void runEvaluation(rules);
    }, 30_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, permission]);

  const addRule = () => {
    const clean = symbol.trim().toUpperCase().replace(/\.TO$/, "");
    const parsedThreshold = Number(threshold);
    if (!clean || !Number.isFinite(parsedThreshold)) {
      setError(pick(language, "Entre un symbole et un seuil numérique valide.", "Enter a symbol and a valid numeric threshold."));
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
          <span className="eyebrow">{pick(language, "MON ESPACE", "MY WORKSPACE")} · V0.7</span>
          <h1>{pick(language, "Alertes", "Alerts")}</h1>
          <p>{pick(language, "Surveille prix, variation, RSI, momentum, volume relatif et score Anatole. Les règles sont enregistrées sur cet appareil et évaluées toutes les 30 secondes lorsque la section est ouverte.", "Monitor price, change, RSI, momentum, relative volume, and Anatole score. Rules are saved on this device and evaluated every 30 seconds while this section is open.")}</p>
        </div>
        <div className={styles.heroMetric}>
          <strong>{triggered.length}</strong>
          <span>{pick(language, "alertes déclenchées", "triggered alerts")}</span>
          <small>{activeCount} {pick(language, `règle${activeCount > 1 ? "s" : ""} active${activeCount > 1 ? "s" : ""}`, `active rule${activeCount === 1 ? "" : "s"}`)} · {pick(language, "contrôle local", "local monitoring")}</small>
        </div>
      </section>

      <section className={`panel ${styles.toolbar}`}>
        <div className={styles.toolbarTop}>
          <div><span className="eyebrow">{pick(language, "CRÉATION", "CREATE")}</span><h2>{pick(language, "Nouvelle règle", "New rule")}</h2><p>{pick(language, "Les notifications du navigateur sont facultatives; la page affiche toujours l’état de chaque seuil.", "Browser notifications are optional; the page always displays the state of every threshold.")}</p></div>
          <div className={styles.actionRow}>
            <button className={styles.secondaryButton} type="button" onClick={requestNotifications} disabled={permission === "granted" || permission === "unsupported"}>
              <BellRing size={15} /> {permission === "granted" ? pick(language, "Notifications actives", "Notifications enabled") : permission === "denied" ? pick(language, "Notifications refusées", "Notifications denied") : permission === "unsupported" ? pick(language, "Non supportées", "Unsupported") : pick(language, "Activer les notifications", "Enable notifications")}
            </button>
            <button className={styles.secondaryButton} type="button" disabled={loading || !rules.length} onClick={() => void runEvaluation()}><RefreshCw size={15} /> {loading ? pick(language, "Vérification…", "Checking…") : pick(language, "Vérifier maintenant", "Check now")}</button>
          </div>
        </div>

        <div className={styles.alertFormGrid}>
          <div className={styles.searchField}>
            <label htmlFor="alert-symbol">{pick(language, "Symbole", "Symbol")}</label>
            <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 12, top: 14, color: "#7393aa" }} /><input id="alert-symbol" className={styles.searchInput} style={{ paddingLeft: 36 }} value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="MDA, RY, XIC…" /></div>
            {suggestions.length ? <div className={styles.suggestions}>{suggestions.map((item) => <button className={styles.suggestion} key={item.symbol} type="button" onClick={() => { setSymbol(item.symbol); setSuggestions([]); }}><strong>{item.symbol}</strong><span><b>{item.name}</b><small>{item.sector} · {item.exchange}</small></span></button>)}</div> : null}
          </div>
          <div className={styles.field}><label htmlFor="alert-metric">{pick(language, "Indicateur", "Metric")}</label><select id="alert-metric" value={metric} onChange={(event) => setMetric(event.target.value as AlertMetric)}>{METRICS.map((item) => <option value={item.key} key={item.key}>{pick(language, item.label[0], item.label[1])}</option>)}</select></div>
          <div className={styles.field}><label htmlFor="alert-operator">{pick(language, "Condition", "Condition")}</label><select id="alert-operator" value={operator} onChange={(event) => setOperator(event.target.value as "above" | "below")}><option value="above">{pick(language, "Au-dessus de", "Above")}</option><option value="below">{pick(language, "Sous", "Below")}</option></select></div>
          <div className={styles.field}><label htmlFor="alert-threshold">{pick(language, "Seuil", "Threshold")}</label><input id="alert-threshold" inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} /></div>
          <button className={styles.primaryButton} type="button" onClick={addRule}><Plus size={16} /> {pick(language, "Créer", "Create")}</button>
        </div>
      </section>

      {error ? <div className={styles.errorNotice}>{error}</div> : null}

      <section className={styles.kpiGrid}>
        <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Règles totales", "Total rules")}</span><strong>{rules.length}</strong><small>{pick(language, "Stockées localement", "Stored locally")}</small></article>
        <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Actives", "Active")}</span><strong>{activeCount}</strong><small>{pick(language, "Évaluées toutes les 30 s", "Evaluated every 30 s")}</small></article>
        <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Déclenchées", "Triggered")}</span><strong className={triggered.length ? styles.positive : ""}>{triggered.length}</strong><small>{pick(language, "Dernière évaluation", "Latest evaluation")}</small></article>
        <article className={`panel ${styles.kpiCard}`}><span>{pick(language, "Indisponibles", "Unavailable")}</span><strong className={snapshot?.unavailable_count ? styles.negative : ""}>{snapshot?.unavailable_count ?? 0}</strong><small>{pick(language, "Sources temporaires", "Temporary sources")}</small></article>
        <article className={`panel ${styles.kpiCard}`}><span>Notifications</span><strong>{permission === "granted" ? pick(language, "Actives", "Enabled") : pick(language, "Locales", "Local")}</strong><small>{permission === "granted" ? pick(language, "Navigateur autorisé", "Browser allowed") : pick(language, "Affichage dans la page", "Displayed on page")}</small></article>
      </section>

      <section className={`panel ${styles.panel}`}>
        <div className={styles.sectionHeading}><div><span className="eyebrow">{pick(language, "SURVEILLANCE", "MONITORING")}</span><h2>{pick(language, "Règles configurées", "Configured rules")}</h2><p>{pick(language, "Une alerte déclenchée ne répète pas sans cesse la même notification.", "A triggered alert does not repeatedly send the same notification.")}</p></div></div>
        {!rules.length ? (
          <div className={styles.emptyState}><Bell size={30} /><strong>{pick(language, "Aucune alerte", "No alerts")}</strong><span>{pick(language, "Crée un premier seuil de prix, RSI ou score Anatole.", "Create your first price, RSI, or Anatole score threshold.")}</span></div>
        ) : (
          <div className={styles.alertList}>
            {rules.map((rule) => {
              const result = resultsById.get(rule.id);
              return (
                <article className={`${styles.alertCard} ${result?.triggered ? styles.alertCardTriggered : ""}`} key={rule.id}>
                  <div className={styles.alertMain}>
                    <div className={styles.alertIdentity}>
                      <span className={styles.symbolBadge}>{rule.symbol}</span>
                      <span><b>{result?.name ?? rule.symbol}</b><small>{metricLabel(rule.metric, language)} · {rule.operator === "above" ? pick(language, "au-dessus de", "above") : pick(language, "sous", "below")} {rule.threshold}</small></span>
                    </div>
                    <div className={styles.actionRow}>
                      <span className={`${styles.statusPill} ${result ? statusClass(result.status) : styles.statusIdle}`}>{result?.status === "triggered" ? pick(language, "Déclenchée", "Triggered") : result?.status === "monitoring" ? pick(language, "Surveillance", "Monitoring") : result?.status === "unavailable" ? pick(language, "Indisponible", "Unavailable") : rule.enabled ? pick(language, "En attente", "Pending") : pick(language, "Désactivée", "Disabled")}</span>
                      <button className={`${styles.toggle} ${rule.enabled ? styles.toggleOn : ""}`} type="button" aria-label={rule.enabled ? pick(language, "Désactiver", "Disable") : pick(language, "Activer", "Enable")} onClick={() => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))}><i /></button>
                      <button className={styles.iconButton} type="button" aria-label={pick(language, "Supprimer l’alerte", "Delete alert")} onClick={() => setRules((current) => current.filter((item) => item.id !== rule.id))}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className={styles.inlineBetween}>
                    <span className={styles.alertMeta}>{result ? (language === "en" ? `${metricLabel(rule.metric, language)} ${rule.operator === "above" ? "above" : "below"} ${rule.threshold}` : result.message) : pick(language, "Première évaluation en cours…", "Initial evaluation in progress…")}</span>
                    <strong className={result?.triggered ? styles.positive : ""}>{result ? formatValue(result) : "…"}</strong>
                  </div>
                  <div className={styles.actionRow}><Link className={styles.secondaryButton} href={`/focus/${rule.symbol}`}>{pick(language, "Ouvrir Focus", "Open Focus")}</Link><Link className={styles.secondaryButton} href={`/assistant?symbol=${rule.symbol}`}>{pick(language, "Demander à l’Assistant", "Ask the Assistant")}</Link></div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className={styles.notice}><strong>{pick(language, "Portée actuelle :", "Current scope:")}</strong> {pick(language, "les règles sont évaluées lorsque cette page est ouverte. Une surveillance continue côté serveur nécessiterait un compte utilisateur et une base persistante; Anatole ne prétend pas l’activer sans cette infrastructure.", "rules are evaluated while this page is open. Continuous server-side monitoring would require an account and persistent database; Anatole does not claim to enable it without that infrastructure.")}</div>
      <div style={{ textAlign: "right", color: "#5f7c91", fontSize: 10 }}>{snapshot ? `${pick(language, "Dernière vérification", "Last checked")} ${new Date(snapshot.generated_at).toLocaleString(localeFor(language))}` : null}</div>
    </main>
  );
}
