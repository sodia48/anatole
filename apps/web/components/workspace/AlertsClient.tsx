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
} from "@/components/layout/AppIcons";
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
const NOTIFIED_AT_KEY = "anatole:alerts:notified-at:v1";

const METRICS: Array<{
  key: AlertMetric;
  defaultThreshold: number;
}> = [
  { key: "price", defaultThreshold: 100 },
  { key: "change_percent", defaultThreshold: 3 },
  { key: "rsi_14", defaultThreshold: 70 },
  { key: "momentum_20d", defaultThreshold: 5 },
  { key: "relative_volume", defaultThreshold: 1.8 },
  { key: "score", defaultThreshold: 70 },
];

const FUNDAMENTAL_EVENTS = [
  { key: "fundamental_margin_drop", threshold: 3 },
  { key: "fundamental_debt_rise", threshold: 0.25 },
  { key: "fundamental_fcf_drop", threshold: 20 },
  { key: "fundamental_results", threshold: null },
] as const;

type FundamentalEvent = typeof FUNDAMENTAL_EVENTS[number]["key"];

export type AlertsCopy = Record<AnatoleLanguage, {
  intro: string;
  createHint: string;
  scope: string;
  sectionHint: string;
  emptyHint: string;
  metricLabels: string[];
  eventLabels: string[];
  kpiLabels: string[];
  statusLabels: string[];
  errorLabels: string[];
  permissionLabels: string[];
  actionLabels: string[];
}>;

function metricLabel(metric: AlertMetric | null | undefined, strings: AlertsCopy[AnatoleLanguage]): string {
  if (!metric) return "";
  const index = METRICS.findIndex((item) => item.key === metric);
  return strings.metricLabels[index] ?? metric;
}

function alertRuleLabel(rule: AlertRule, strings: AlertsCopy[AnatoleLanguage]): string {
  if (rule.kind === "event") {
    const index = FUNDAMENTAL_EVENTS.findIndex((item) => item.key === rule.event_type);
    return strings.eventLabels[index] ?? "";
  }
  return metricLabel(rule.metric, strings);
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

export function AlertsClient({ copy }: { copy: AlertsCopy }) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const strings = copy[language];
  const searchParams = useSearchParams();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [symbol, setSymbol] = useState("");
  const [metric, setMetric] = useState<AlertMetric>("price");
  const [operator, setOperator] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("100");
  const [ruleKind, setRuleKind] = useState<"threshold" | "event">("threshold");
  const [fundamentalEvent, setFundamentalEvent] = useState<FundamentalEvent>("fundamental_margin_drop");
  const [fundamentalFrequency, setFundamentalFrequency] = useState(1440);
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
      if (selected && ruleKind === "threshold") setThreshold(String(selected.defaultThreshold));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [metric, ruleKind]);

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
        const lastNotified = JSON.parse(window.localStorage.getItem(NOTIFIED_AT_KEY) ?? "{}") as Record<string, number>;
        let changed = false;
        for (const item of result.items) {
          const key = item.event_fingerprint ? `${item.id}:${item.event_fingerprint}` : `${item.id}:${item.triggered}:${Math.round((item.current_value ?? 0) * 100)}`;
          const rule = current.find((entry) => entry.id === item.id);
          const cooldownMs = (rule?.cooldown_minutes ?? 1_440) * 60_000;
          if (item.triggered && !notified.has(key) && Date.now() - (lastNotified[item.id] ?? 0) >= cooldownMs) {
            new Notification(pick(language, `Alerte Anatole · ${item.symbol}`, `Anatole alert · ${item.symbol}`), {
              body: item.message,
              tag: item.id,
            });
            notified.add(key);
            lastNotified[item.id] = Date.now();
            changed = true;
          }
        }
        if (changed) {
          window.localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notified].slice(-100)));
          window.localStorage.setItem(NOTIFIED_AT_KEY, JSON.stringify(lastNotified));
        }
      }
    } catch (reason) {
      setError(language === "fr" && reason instanceof Error ? reason.message : strings.errorLabels[0]);
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
    if (ruleKind === "event") {
      const selected = FUNDAMENTAL_EVENTS.find((item) => item.key === fundamentalEvent);
      const value = selected?.threshold === null ? null : parsedThreshold;
      if (!clean || (value !== null && (!Number.isFinite(value) || value <= 0 || value > 100))) {
        setError(strings.errorLabels[1]);
        return;
      }
      setRules((current) => [...current, { id: `${clean}-${fundamentalEvent}-${Date.now()}`, symbol: clean, kind: "event", event_type: fundamentalEvent, threshold: value, cooldown_minutes: fundamentalFrequency, enabled: true }]);
      setError(null);
      return;
    }
    if (!clean || !Number.isFinite(parsedThreshold)) {
      setError(strings.errorLabels[2]);
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
          <p>{strings.intro}</p>
        </div>
        <div className={styles.heroMetric}>
          <strong>{triggered.length}</strong>
          <span>{pick(language, "alertes déclenchées", "triggered alerts")}</span>
          <small>{activeCount} {pick(language, `règle${activeCount > 1 ? "s" : ""} active${activeCount > 1 ? "s" : ""}`, `active rule${activeCount === 1 ? "" : "s"}`)} · {pick(language, "contrôle local", "local monitoring")}</small>
        </div>
      </section>

      <section className={`panel ${styles.toolbar}`}>
        <div className={styles.toolbarTop}>
          <div><span className="eyebrow">{pick(language, "CRÉATION", "CREATE")}</span><h2>{pick(language, "Nouvelle règle", "New rule")}</h2><p>{strings.createHint}</p></div>
          <div className={styles.actionRow}>
            <button className={styles.secondaryButton} type="button" onClick={requestNotifications} disabled={permission === "granted" || permission === "unsupported"}>
              <BellRing size={15} /> {permission === "granted" ? strings.permissionLabels[0] : permission === "denied" ? strings.permissionLabels[1] : permission === "unsupported" ? strings.permissionLabels[2] : strings.permissionLabels[3]}
            </button>
            <button className={styles.secondaryButton} type="button" disabled={loading || !rules.length} onClick={() => void runEvaluation()}><RefreshCw size={15} /> {loading ? strings.actionLabels[0] : strings.actionLabels[1]}</button>
          </div>
        </div>

        <div className={styles.alertFormGrid}>
          <div className={styles.searchField}>
            <label htmlFor="alert-symbol">{pick(language, "Symbole", "Symbol")}</label>
            <div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 12, top: 14, color: "var(--text-secondary)" }} /><input id="alert-symbol" className={styles.searchInput} style={{ paddingLeft: 36 }} value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="MDA, RY, XIC…" /></div>
            {suggestions.length ? <div className={styles.suggestions}>{suggestions.map((item) => <button className={styles.suggestion} key={item.symbol} type="button" onClick={() => { setSymbol(item.symbol); setSuggestions([]); }}><strong>{item.symbol}</strong><span><b>{item.name}</b><small>{item.sector} · {item.exchange}</small></span></button>)}</div> : null}
          </div>
          <div className={styles.field}><label htmlFor="alert-kind">{pick(language, "Type de règle", "Rule type")}</label><select id="alert-kind" value={ruleKind} onChange={(event) => { const kind = event.target.value as "threshold" | "event"; setRuleKind(kind); if (kind === "event") setThreshold("3"); }}><option value="threshold">{pick(language, "Seuil de marché", "Market threshold")}</option><option value="event">{pick(language, "Événement fondamental", "Fundamental event")}</option></select></div>
          {ruleKind === "threshold" ? <div className={styles.field}><label htmlFor="alert-metric">{pick(language, "Indicateur", "Metric")}</label><select id="alert-metric" value={metric} onChange={(event) => setMetric(event.target.value as AlertMetric)}>{METRICS.map((item, index) => <option value={item.key} key={item.key}>{strings.metricLabels[index]}</option>)}</select></div> : <div className={styles.field}><label htmlFor="fundamental-event">{pick(language, "Événement fondamental", "Fundamental event")}</label><select id="fundamental-event" value={fundamentalEvent} onChange={(event) => { const selected = FUNDAMENTAL_EVENTS.find((item) => item.key === event.target.value); if (selected) { setFundamentalEvent(selected.key); setThreshold(String(selected.threshold ?? "")); } }}>{FUNDAMENTAL_EVENTS.map((item, index) => <option key={item.key} value={item.key}>{strings.eventLabels[index]}</option>)}</select></div>}
          {ruleKind === "threshold" ? <div className={styles.field}><label htmlFor="alert-operator">{pick(language, "Condition", "Condition")}</label><select id="alert-operator" value={operator} onChange={(event) => setOperator(event.target.value as "above" | "below")}><option value="above">{pick(language, "Au-dessus de", "Above")}</option><option value="below">{pick(language, "Sous", "Below")}</option></select></div> : <div className={styles.field}><label htmlFor="fundamental-frequency">{pick(language, "Rappel minimal", "Minimum reminder")}</label><select id="fundamental-frequency" value={fundamentalFrequency} onChange={(event) => setFundamentalFrequency(Number(event.target.value))}><option value={1440}>{pick(language, "1 jour", "1 day")}</option><option value={10080}>{pick(language, "1 semaine", "1 week")}</option><option value={43200}>{pick(language, "30 jours", "30 days")}</option></select></div>}
          {(ruleKind === "threshold" || fundamentalEvent !== "fundamental_results") ? <div className={styles.field}><label htmlFor="alert-threshold">{ruleKind === "event" ? pick(language, "Changement minimal", "Minimum change") : pick(language, "Seuil", "Threshold")}</label><input id="alert-threshold" inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} /></div> : null}
          <button className={styles.primaryButton} type="button" onClick={addRule}><Plus size={16} /> {pick(language, "Créer", "Create")}</button>
        </div>
      </section>

      {error ? <div className={styles.errorNotice}>{error}</div> : null}

      <section className={styles.kpiGrid}>
        <article className={`panel ${styles.kpiCard}`}><span>{strings.kpiLabels[0]}</span><strong>{rules.length}</strong><small>{strings.kpiLabels[1]}</small></article>
        <article className={`panel ${styles.kpiCard}`}><span>{strings.kpiLabels[2]}</span><strong>{activeCount}</strong><small>{strings.kpiLabels[3]}</small></article>
        <article className={`panel ${styles.kpiCard}`}><span>{strings.kpiLabels[4]}</span><strong className={triggered.length ? styles.positive : ""}>{triggered.length}</strong><small>{strings.kpiLabels[5]}</small></article>
        <article className={`panel ${styles.kpiCard}`}><span>{strings.kpiLabels[6]}</span><strong className={snapshot?.unavailable_count ? styles.negative : ""}>{snapshot?.unavailable_count ?? 0}</strong><small>{strings.kpiLabels[7]}</small></article>
        <article className={`panel ${styles.kpiCard}`}><span>Notifications</span><strong>{permission === "granted" ? strings.kpiLabels[8] : strings.kpiLabels[9]}</strong><small>{permission === "granted" ? strings.kpiLabels[10] : strings.kpiLabels[11]}</small></article>
      </section>

      <section className={`panel ${styles.panel}`}>
        <div className={styles.sectionHeading}><div><span className="eyebrow">{pick(language, "SURVEILLANCE", "MONITORING")}</span><h2>{pick(language, "Règles configurées", "Configured rules")}</h2><p>{strings.sectionHint}</p></div></div>
        {!rules.length ? (
          <div className={styles.emptyState}><Bell size={30} /><strong>{pick(language, "Aucune alerte", "No alerts")}</strong><span>{strings.emptyHint}</span></div>
        ) : (
          <div className={styles.alertList}>
            {rules.map((rule) => {
              const result = resultsById.get(rule.id);
              return (
                <article className={`${styles.alertCard} ${result?.triggered ? styles.alertCardTriggered : ""}`} key={rule.id}>
                  <div className={styles.alertMain}>
                    <div className={styles.alertIdentity}>
                      <span className={styles.symbolBadge}>{rule.symbol}</span>
                      <span><b>{result?.name ?? rule.symbol}</b><small>{alertRuleLabel(rule, strings)}{rule.kind === "event" ? ` · ${rule.cooldown_minutes ?? 1440} min` : ` · ${rule.operator === "above" ? pick(language, "au-dessus de", "above") : pick(language, "sous", "below")} ${rule.threshold}`}</small></span>
                    </div>
                    <div className={styles.actionRow}>
                      <span className={`${styles.statusPill} ${result ? statusClass(result.status) : styles.statusIdle}`}>{result?.status === "triggered" ? strings.statusLabels[0] : result?.status === "monitoring" ? strings.statusLabels[1] : result?.status === "unavailable" ? strings.statusLabels[2] : rule.enabled ? strings.statusLabels[3] : strings.statusLabels[4]}</span>
                      <button className={`${styles.toggle} ${rule.enabled ? styles.toggleOn : ""}`} type="button" aria-label={rule.enabled ? strings.actionLabels[2] : strings.actionLabels[3]} onClick={() => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))}><i /></button>
                      <button className={styles.iconButton} type="button" aria-label={strings.actionLabels[4]} onClick={() => setRules((current) => current.filter((item) => item.id !== rule.id))}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className={styles.inlineBetween}>
                    <span className={styles.alertMeta}>{result ? (rule.kind === "event" || language === "fr" ? result.message : `${metricLabel(rule.metric, strings)} ${rule.operator === "above" ? "above" : "below"} ${rule.threshold}`) : pick(language, "Première évaluation en cours…", "Initial evaluation in progress…")}</span>
                    <strong className={result?.triggered ? styles.positive : ""}>{result ? formatValue(result) : "…"}</strong>
                  </div>
                  <div className={styles.actionRow}><Link className={styles.secondaryButton} href={`/focus/${rule.symbol}`}>{strings.actionLabels[5]}</Link><Link className={styles.secondaryButton} href={`/assistant?symbol=${rule.symbol}`}>{strings.actionLabels[6]}</Link>{result?.source?.startsWith("https://") ? <a className={styles.secondaryButton} href={result.source} rel="noopener noreferrer" target="_blank">{strings.actionLabels[7]}</a> : null}</div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className={styles.notice}><strong>{pick(language, "Portée actuelle :", "Current scope:")}</strong> {strings.scope}</div>
      <div style={{ textAlign: "right", color: "var(--text-secondary)", fontSize: 10 }}>{snapshot ? `${pick(language, "Dernière vérification", "Last checked")} ${new Date(snapshot.generated_at).toLocaleString(localeFor(language))}` : null}</div>
    </main>
  );
}
