"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Gauge,
  LayoutDashboard,
  Newspaper,
  ShieldCheck,
  Star,
} from "lucide-react";

import { ANATOLE_VERSION_LABEL } from "@/lib/version";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

import { useAccount } from "@/components/providers/AccountProvider";
import {
  usePreferences,
} from "@/components/providers/PreferencesProvider";
import {
  analyzePortfolio,
  evaluateAlerts,
  getCalendarSnapshot,
  getCockpitSnapshot,
  getNewsSnapshot,
  getPsychologySnapshot,
  getTerminalSnapshot,
  getWatchlistSnapshot,
  type CockpitUniverse,
} from "@/lib/api";
import type {
  AlertEvaluation,
  AlertSnapshot,
  CalendarSnapshot,
  CockpitSnapshot,
  NewsItem,
  NewsSnapshot,
  PortfolioSnapshot,
  PsychologySnapshot,
  Quote,
  TerminalAlert,
  TerminalOpportunity,
  TerminalSnapshot,
  WatchlistSnapshot,
} from "@/lib/types";
import {
  WORKSPACE_SYNC_EVENT,
  emptyWorkspace,
  readLocalWorkspace,
  type SyncedWorkspaceData,
} from "@/lib/workspace-sync";

import styles from "./page.module.css";

type LoadState = "idle" | "loading" | "ready" | "partial";
type AttentionTone = "positive" | "negative" | "watch" | "neutral";

type AttentionItem = {
  key: string;
  title: string;
  detail: string;
  meta: string;
  href: string;
  tone: AttentionTone;
  priority: number;
};

type SourceIssue = {
  source: string;
  message: string;
};

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "N/D";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} %`;
}

function terminalRegimeLabel(value: string, language: AnatoleLanguage): string {
  if (language === "fr") return value;
  return ({
    Haussier: "Bullish",
    Constructif: "Constructive",
    Neutre: "Neutral",
    Fragile: "Fragile",
    Baissier: "Bearish",
  } as Record<string, string>)[value] ?? value;
}

function terminalRiskLabel(value: string, language: AnatoleLanguage): string {
  if (language === "fr") return value;
  return ({
    Faible: "Low",
    Modéré: "Moderate",
    Élevé: "High",
    Critique: "Critical",
  } as Record<string, string>)[value] ?? value;
}

/**
 * Normalise la participation haussière dans l'intervalle 0–1.
 *
 * Le backend historique a pu fournir `advance_ratio` sous trois formes :
 * 0.3729, 37.29 ou 3729. Les comptes progressions/baisses restent la
 * source prioritaire et évitent toute double multiplication par 100.
 */
function normalizeAdvanceRatio(
  breadth: CockpitSnapshot["breadth"] | null | undefined,
): number {
  if (!breadth) return 0;

  const advancers = Number.isFinite(breadth.advancers)
    ? Math.max(0, breadth.advancers)
    : 0;
  const decliners = Number.isFinite(breadth.decliners)
    ? Math.max(0, breadth.decliners)
    : 0;
  const directionalTotal = advancers + decliners;

  if (directionalTotal > 0) {
    return Math.min(1, Math.max(0, advancers / directionalTotal));
  }

  const raw = Number(breadth.advance_ratio);
  if (!Number.isFinite(raw) || raw <= 0) return 0;

  const normalized =
    raw <= 1
      ? raw
      : raw <= 100
        ? raw / 100
        : raw / 10_000;

  return Math.min(1, Math.max(0, normalized));
}

function formatParticipation(
  ratio: number,
): string {
  return `${Math.round(
    Math.min(1, Math.max(0, ratio)) * 100,
  )} %`;
}

function formatMoney(value: number | null | undefined, language: AnatoleLanguage): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "N/D";
  }
  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(value: string | null | undefined, language: AnatoleLanguage): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(localeFor(language), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatEventDate(value: string, language: AnatoleLanguage): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return pick(language, "Date à confirmer", "Date to be confirmed");
  return new Intl.DateTimeFormat(localeFor(language), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function firstName(displayName: string | null | undefined): string | null {
  const value = displayName?.trim();
  return value ? value.split(/\s+/)[0] : null;
}

function marketLabel(change: number, ratio: number, language: AnatoleLanguage): string {
  if (change >= 0.75 && ratio >= 0.65) return pick(language, "Participation largement positive", "Broadly positive participation");
  if (change > 0 && ratio >= 0.5) return pick(language, "Marché constructif", "Constructive market");
  if (change <= -0.75 && ratio <= 0.35) return pick(language, "Pression vendeuse étendue", "Broad selling pressure");
  if (change < 0 && ratio < 0.5) return pick(language, "Marché sous pression", "Market under pressure");
  return pick(language, "Séance partagée", "Mixed session");
}

function toneFromChange(change: number): AttentionTone {
  if (change >= 1.5) return "positive";
  if (change <= -1.5) return "negative";
  return "neutral";
}

function uniqueAttention(items: AttentionItem[]): AttentionItem[] {
  const seen = new Set<string>();
  return items
    .sort((a, b) => b.priority - a.priority)
    .filter((item) => {
      const key = item.key.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function terminalAlertItem(alert: TerminalAlert, language: AnatoleLanguage): AttentionItem {
  return {
    key: `terminal-alert:${alert.id}`,
    title: language === "fr" ? alert.title : alert.id === "market-breadth" ? "Weak market breadth" : alert.id.startsWith("volume:") ? `Unusual activity in ${alert.symbol}` : alert.id.startsWith("rsi:") ? `${alert.symbol} is technically extended` : `Pullback within a positive trend — ${alert.symbol}`,
    detail: language === "fr" ? alert.detail : "This market signal deserves a closer review in Focus.",
    meta: `${language === "fr" ? alert.category : "Market signal"}${alert.symbol ? ` · ${alert.symbol}` : ""}`,
    href: alert.symbol ? `/focus/${encodeURIComponent(alert.symbol)}` : "/terminal",
    tone: alert.severity === "high" ? "negative" : "watch",
    priority: alert.severity === "high" ? 92 : alert.severity === "watch" ? 75 : 55,
  };
}

function opportunityItem(item: TerminalOpportunity, language: AnatoleLanguage): AttentionItem {
  return {
    key: `opportunity:${item.symbol}:${item.opportunity_type}`,
    title: `${item.symbol} · ${language === "fr" ? item.opportunity_type : ({ Leadership: "Leadership", "Sous pression": "Under pressure", Accélération: "Acceleration", Tendance: "Trend" } as Record<string, string>)[item.opportunity_type] ?? item.opportunity_type}`,
    detail: language === "fr" ? item.reasons.slice(0, 2).join(" · ") || item.signal : "Score, momentum, volume, and trend place this security on the research radar.",
    meta: `${item.sector} · Score ${Math.round(item.score)} · ${formatPercent(item.change_percent)}`,
    href: `/focus/${encodeURIComponent(item.symbol)}`,
    tone: toneFromChange(item.change_percent),
    priority: 62 + Math.min(20, Math.abs(item.change_percent) * 2),
  };
}

function triggeredAlertItem(item: AlertEvaluation, language: AnatoleLanguage): AttentionItem {
  return {
    key: `user-alert:${item.id}`,
    title: `${item.symbol} · ${pick(language, "alerte déclenchée", "alert triggered")}`,
    detail: language === "fr" ? item.message : `${item.metric_label}: the configured threshold was reached.`,
    meta: `${item.metric_label} · ${pick(language, "seuil", "threshold")} ${item.threshold}${item.unit}`,
    href: `/focus/${encodeURIComponent(item.symbol)}`,
    tone: "watch",
    priority: 100,
  };
}

function quoteAttentionItem(item: Quote, language: AnatoleLanguage): AttentionItem {
  return {
    key: `watchlist:${item.symbol}`,
    title: pick(language, `${item.symbol} bouge de ${formatPercent(item.change_percent)}`, `${item.symbol} moves ${formatPercent(item.change_percent)}`),
    detail: item.name,
    meta: `Watchlist · ${item.delayed ? pick(language, "Donnée différée", "Delayed data") : pick(language, "Flux actif", "Active feed")}`,
    href: `/focus/${encodeURIComponent(item.symbol)}`,
    tone: toneFromChange(item.change_percent),
    priority: 65 + Math.min(22, Math.abs(item.change_percent) * 3),
  };
}

function newsAttentionItem(item: NewsItem, language: AnatoleLanguage): AttentionItem {
  return {
    key: `news:${item.id}`,
    title: item.title,
    detail: item.summary || pick(language, "Consulte le détail de cette actualité.", "Open this news item for details."),
    meta: `${item.source} · ${formatTime(item.published_at, language)}`,
    href: item.url || "/actualites",
    tone: item.sentiment === "negative" ? "negative" : item.sentiment === "positive" ? "positive" : "neutral",
    priority: 38 + Math.abs(item.sentiment_score ?? 0) * 10,
  };
}

export default function TodayPage() {
  const { user, syncState } = useAccount();
  const { preferences } =
    usePreferences();
  const language =
    preferences.language;
  const [workspace, setWorkspace] = useState<SyncedWorkspaceData>(() => emptyWorkspace());
  const [cockpit, setCockpit] = useState<CockpitSnapshot | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistSnapshot | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [alerts, setAlerts] = useState<AlertSnapshot | null>(null);
  const [terminal, setTerminal] = useState<TerminalSnapshot | null>(null);
  const [psychology, setPsychology] = useState<PsychologySnapshot | null>(null);
  const [news, setNews] = useState<NewsSnapshot | null>(null);
  const [calendar, setCalendar] = useState<CalendarSnapshot | null>(null);
  const [issues, setIssues] = useState<SourceIssue[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const mounted = useRef(true);
  const loadingRef = useRef(false);

  const [universe, setUniverse] =
    useState<CockpitUniverse>(
      "composite",
    );
  const [
    marketSwitching,
    setMarketSwitching,
  ] = useState(false);

  const selectUniverse =
    useCallback(
      (next: CockpitUniverse) => {
        if (next === universe) {
          return;
        }

        setUniverse(next);
        setCockpit(null);
        setMarketSwitching(true);
        setIssues((current) =>
          current.filter(
            (item) =>
              item.source !== pick(language, "Marché", "Market"),
          ),
        );
      },
      [language, universe],
    );

  const prepareCockpitLink =
    useCallback(() => {
      try {
        window.localStorage.setItem(
          "anatole-cockpit-universe",
          universe,
        );
      } catch {
        // La préférence Cockpit reste facultative.
      }
    }, [universe]);

  const reloadWorkspace = useCallback(() => {
    setWorkspace(readLocalWorkspace().data);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(reloadWorkspace, 0);
    const onSync = () => reloadWorkspace();
    window.addEventListener(WORKSPACE_SYNC_EVENT, onSync);
    window.addEventListener("storage", onSync);
    window.addEventListener("anatole-watchlist-change", onSync);
    return () => {
      mounted.current = false;
      window.clearTimeout(timer);
      window.removeEventListener(WORKSPACE_SYNC_EVENT, onSync);
      window.removeEventListener("storage", onSync);
      window.removeEventListener("anatole-watchlist-change", onSync);
    };
  }, [reloadWorkspace]);

  useEffect(() => {
    /*
     * Le changement FR / EN doit être visible immédiatement :
     * l’ancienne édition est retirée avant le rechargement officiel.
     */
    const timer = window.setTimeout(() => {
      setNews(null);
      setCalendar(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [language]);

  const recordIssues = useCallback((next: SourceIssue[]) => {
    if (!mounted.current) return;
    setIssues(next);
    setState(next.length ? "partial" : "ready");
    setLastUpdated(new Date().toISOString());
  }, []);

  const loadMarket = useCallback(async () => {
    if (
      document.visibilityState ===
      "hidden"
    ) {
      return;
    }

    const controller =
      new AbortController();
    const nextIssues: SourceIssue[] = [];

    try {
      const value =
        await getCockpitSnapshot(
          universe,
          controller.signal,
        );

      if (mounted.current) {
        setCockpit(value);
      }
    } catch (reason) {
      nextIssues.push({
        source: pick(language, "Marché", "Market"),
        message:
          reason instanceof Error
            ? reason.message
            : pick(language, "Données indisponibles", "Data unavailable"),
      });
    } finally {
      if (mounted.current) {
        setMarketSwitching(false);
      }
    }

    if (
      nextIssues.length &&
      mounted.current
    ) {
      setIssues((current) => [
        ...current.filter(
          (item) =>
            item.source !== pick(language, "Marché", "Market"),
        ),
        ...nextIssues,
      ]);
      setState("partial");
    }
  }, [language, universe]);

  const loadPersonal = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const controller = new AbortController();
    const tasks: Array<Promise<void>> = [];
    const nextIssues: SourceIssue[] = [];

    if (workspace.watchlist.length) {
      tasks.push(
        getWatchlistSnapshot(workspace.watchlist, controller.signal)
          .then((value) => { if (mounted.current) setWatchlist(value); })
          .catch((reason) => {
            nextIssues.push({
              source: "Watchlist",
              message: language === "fr" && reason instanceof Error ? reason.message : pick(language, "Données indisponibles", "Data unavailable"),
            });
          }),
      );
    } else if (mounted.current) {
      setWatchlist(null);
    }

    if (workspace.portfolio.length) {
      tasks.push(
        analyzePortfolio(workspace.portfolio, controller.signal)
          .then((value) => { if (mounted.current) setPortfolio(value); })
          .catch((reason) => {
            nextIssues.push({
              source: pick(language, "Portefeuille", "Portfolio"),
              message: language === "fr" && reason instanceof Error ? reason.message : pick(language, "Données indisponibles", "Data unavailable"),
            });
          }),
      );
    } else if (mounted.current) {
      setPortfolio(null);
    }

    if (workspace.alerts.length) {
      tasks.push(
        evaluateAlerts(workspace.alerts, controller.signal)
          .then((value) => { if (mounted.current) setAlerts(value); })
          .catch((reason) => {
            nextIssues.push({
              source: pick(language, "Alertes", "Alerts"),
              message: language === "fr" && reason instanceof Error ? reason.message : pick(language, "Données indisponibles", "Data unavailable"),
            });
          }),
      );
    } else if (mounted.current) {
      setAlerts(null);
    }

    await Promise.all(tasks);
    if (mounted.current) {
      setIssues((current) => [
        ...current.filter((item) => !["Watchlist", pick(language, "Portefeuille", "Portfolio"), pick(language, "Alertes", "Alerts")].includes(item.source)),
        ...nextIssues,
      ]);
      if (nextIssues.length) setState("partial");
    }
  }, [language, workspace.alerts, workspace.portfolio, workspace.watchlist]);

  const loadContext = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const controller = new AbortController();
    const nextIssues: SourceIssue[] = [];
    const results = await Promise.allSettled([
      getTerminalSnapshot(controller.signal),
      getPsychologySnapshot(controller.signal),
      getNewsSnapshot(language, controller.signal),
      getCalendarSnapshot(
        language,
        controller.signal,
      ),
    ]);
    const setters = [
      (value: TerminalSnapshot) => setTerminal(value),
      (value: PsychologySnapshot) => setPsychology(value),
      (value: NewsSnapshot) => setNews(value),
      (value: CalendarSnapshot) => setCalendar(value),
    ] as const;
    const names = ["Terminal", pick(language, "Psychologie", "Psychology"), pick(language, "Actualités", "News"), pick(language, "Calendrier", "Calendar")];

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        if (mounted.current) setters[index](result.value as never);
      } else {
        nextIssues.push({
          source: names[index],
          message: language === "fr" && result.reason instanceof Error ? result.reason.message : pick(language, "Données indisponibles", "Data unavailable"),
        });
      }
    });

    recordIssues(nextIssues);
  }, [language, recordIssues]);

  const loadAll = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setRefreshing(true);
    setState((current) => current === "idle" ? "loading" : current);
    try {
      await Promise.all([loadMarket(), loadPersonal(), loadContext()]);
      if (mounted.current && !lastUpdated) setLastUpdated(new Date().toISOString());
    } finally {
      loadingRef.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [lastUpdated, loadContext, loadMarket, loadPersonal]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAll(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    const marketInterval =
      universe === "composite"
        ? 45_000
        : 15_000;

    const fast =
      window.setInterval(
        () => {
          if (!document.hidden) void loadMarket();
        },
        marketInterval,
      );
    const personal =
      window.setInterval(
        () => {
          if (!document.hidden) void loadPersonal();
        },
        30_000,
      );
    const context =
      window.setInterval(
        () => {
          if (!document.hidden) void loadContext();
        },
        120_000,
      );

    return () => {
      window.clearInterval(fast);
      window.clearInterval(personal);
      window.clearInterval(context);
    };
  }, [
    loadContext,
    loadMarket,
    loadPersonal,
    universe,
  ]);

  const upcomingEvents = useMemo(() => {
    const now = new Date(calendar?.generated_at ?? 0).getTime() - 30 * 60 * 1000;
    return (calendar?.events ?? [])
      .filter((event) => {
        const time = new Date(event.starts_at).getTime();
        return Number.isFinite(time) && time >= now;
      })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, 5);
  }, [calendar]);

  const watchlistMovers = useMemo(
    () => [...(watchlist?.items ?? [])]
      .sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent))
      .slice(0, 4),
    [watchlist],
  );

  const attention = useMemo(() => {
    const items: AttentionItem[] = [];
    for (const alert of alerts?.items ?? []) {
      if (alert.triggered) items.push(triggeredAlertItem(alert, language));
    }
    for (const alert of terminal?.alerts ?? []) items.push(terminalAlertItem(alert, language));
    for (const quote of watchlist?.items ?? []) {
      if (Math.abs(quote.change_percent) >= 2.25) items.push(quoteAttentionItem(quote, language));
    }
    for (const opportunity of terminal?.opportunities ?? []) items.push(opportunityItem(opportunity, language));
    for (const item of news?.items.slice(0, 4) ?? []) items.push(newsAttentionItem(item, language));
    return uniqueAttention(items);
  }, [alerts, language, news, terminal, watchlist]);

  const topSector = useMemo(
    () => [...(cockpit?.sectors ?? [])].sort((a, b) => b.change_percent - a.change_percent)[0] ?? null,
    [cockpit],
  );
  const weakSector = useMemo(
    () => [...(cockpit?.sectors ?? [])].sort((a, b) => a.change_percent - b.change_percent)[0] ?? null,
    [cockpit],
  );

  const marketReading = useMemo(() => {
    if (!cockpit) return pick(language, "La lecture du marché sera disponible dès la première synchronisation.", "The market reading will be available after the first synchronization.");
    const direction = cockpit.weighted_change_percent >= 0 ? pick(language, "progresse", "is up") : pick(language, "recule", "is down");
    const participation = Math.round(normalizeAdvanceRatio(cockpit.breadth) * 100);
    const sectorSentence = topSector && weakSector
      ? pick(language, `${topSector.sector} mène (${formatPercent(topSector.change_percent)}), tandis que ${weakSector.sector} ferme la marche (${formatPercent(weakSector.change_percent)}).`, `${topSector.sector} leads (${formatPercent(topSector.change_percent)}), while ${weakSector.sector} trails (${formatPercent(weakSector.change_percent)}).`)
      : pick(language, "Les données sectorielles se mettent à jour.", "Sector data is updating.");
    const regime = terminal?.regime && terminal.risk_level ? pick(language, ` Le régime Terminal est ${terminal.regime.toLowerCase()} avec un risque ${terminal.risk_level.toLowerCase()}.`, ` The Terminal regime is ${terminalRegimeLabel(terminal.regime, language).toLowerCase()} with ${terminalRiskLabel(terminal.risk_level, language).toLowerCase()} risk.`) : "";
    return pick(language, `Le ${universe === "composite" ? "S&P/TSX Composite" : "S&P/TSX 60"} ${direction} de ${formatPercent(Math.abs(cockpit.weighted_change_percent))}. ${participation} % des titres avancent. ${sectorSentence}${regime}`, `The ${universe === "composite" ? "S&P/TSX Composite" : "S&P/TSX 60"} ${direction} ${formatPercent(Math.abs(cockpit.weighted_change_percent))}. ${participation}% of securities are advancing. ${sectorSentence}${regime}`);
  }, [cockpit, language, terminal, topSector, universe, weakSector]);

  const displayName = firstName(user?.display_name);
  const hasPersonalData = Boolean(workspace.watchlist.length || workspace.portfolio.length || workspace.alerts.length);
  const marketChange = cockpit?.weighted_change_percent ?? 0;
  const advanceRatio = normalizeAdvanceRatio(cockpit?.breadth);
  const marketState = cockpit ? marketLabel(marketChange, advanceRatio, language) : pick(language, "Synchronisation du marché", "Synchronizing market");
  const sourceCount = [cockpit, watchlist, portfolio, alerts, terminal, psychology, news, calendar].filter(Boolean).length;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>ANATOLE {pick(language, "AUJOURD’HUI", "TODAY")} · {ANATOLE_VERSION_LABEL}</span>
          <h1>{displayName ? pick(language, `Bonjour ${displayName}`, `Hello ${displayName}`) : pick(language, "Aujourd’hui sur les marchés", "Today in the markets")}</h1>
          <p>{pick(language, "Une lecture quotidienne claire du marché canadien et de ton espace, sans recommandation de placement.", "A clear daily view of the Canadian market and your workspace, without investment recommendations.")}</p>
        </div>
        <div className={styles.heroStatus}>
          <span className={`${styles.liveDot} ${issues.length ? styles.warningDot : ""}`} />
          <div>
            <strong>{state === "loading" ? pick(language, "Chargement…", "Loading…") : issues.length ? pick(language, "Mode résilient", "Resilient mode") : pick(language, "Données actives", "Live data")}</strong>
            <small>{sourceCount}/8 sources · {pick(language, "mis à jour", "updated")} {formatTime(lastUpdated, language)}</small>
          </div>
          <button type="button" onClick={() => void loadAll()} disabled={refreshing}>
            {pick(language, "Actualiser", "Refresh")}
          </button>
        </div>
      </header>

      {issues.length ? (
        <section className={styles.resilientNotice} aria-live="polite">
          <ShieldCheck size={19} />
          <div>
            <strong>{pick(language, "Certaines sources répondent lentement.", "Some sources are responding slowly.")}</strong>
            <span>{pick(language, "La dernière donnée valide reste affichée. Sources concernées :", "The latest valid data remains visible. Affected sources:")} {issues.map((item) => item.source).join(", ")}.</span>
          </div>
        </section>
      ) : null}

      <section className={styles.marketSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>
              {pick(language, "LE MARCHÉ EN 30 SECONDES", "THE MARKET IN 30 SECONDS")}
            </span>
            <h2>
              {universe === "composite"
                ? "S&P/TSX Composite"
                : "S&P/TSX 60"}
            </h2>
            <span
              className={
                styles.universeCaption
              }
            >
              {universe === "composite"
                ? pick(language, "Vue principale · marché canadien élargi", "Primary view · broad Canadian market")
                : pick(language, "Vue concentrée · grandes capitalisations", "Focused view · large caps")}
              {marketSwitching
                ? pick(language, " · actualisation…", " · refreshing…")
                : ""}
            </span>
          </div>

          <div
            className={
              styles.marketHeadingActions
            }
          >
            <div
              className={
                styles.universeSwitch
              }
              role="group"
              aria-label={pick(language, "Univers de marché", "Market universe")}
            >
              <button
                type="button"
                className={
                  universe === "composite"
                    ? styles.universeActive
                    : undefined
                }
                aria-pressed={
                  universe === "composite"
                }
                onClick={() =>
                  selectUniverse(
                    "composite",
                  )
                }
              >
                Composite
              </button>

              <button
                type="button"
                className={
                  universe === "tsx60"
                    ? styles.universeActive
                    : undefined
                }
                aria-pressed={
                  universe === "tsx60"
                }
                onClick={() =>
                  selectUniverse(
                    "tsx60",
                  )
                }
              >
                TSX 60
              </button>
            </div>

            <Link
              href="/cockpit"
              onClick={
                prepareCockpitLink
              }
            >
              {pick(language, "Ouvrir le Cockpit", "Open Cockpit")}
              <span>→</span>
            </Link>
          </div>
        </div>

        <div className={styles.marketGrid}>
          <article className={`${styles.primaryMarketCard} ${marketChange >= 0 ? styles.positiveCard : styles.negativeCard}`}>
            <div>
              <span>{pick(language, "Variation pondérée", "Weighted change")}</span>
              <strong>{cockpit ? formatPercent(marketChange) : "—"}</strong>
              <small>
                {marketSwitching
                  ? universe ===
                    "composite"
                    ? pick(language, "Chargement du marché canadien élargi…", "Loading the broad Canadian market…")
                    : pick(language, "Chargement du TSX 60…", "Loading the TSX 60…")
                  : marketState}
              </small>
            </div>
            <dl>
              <div><dt>{pick(language, "Progressions", "Advancers")}</dt><dd>{cockpit?.breadth.advancers ?? "—"}</dd></div>
              <div><dt>{pick(language, "Baisses", "Decliners")}</dt><dd>{cockpit?.breadth.decliners ?? "—"}</dd></div>
              <div><dt>{pick(language, "Ratio de hausse", "Advance ratio")}</dt><dd>{cockpit ? formatParticipation(advanceRatio) : "—"}</dd></div>
            </dl>
          </article>

          <article className={styles.metricCard}>
            <Activity size={21} />
            <span>{pick(language, "Psychologie", "Psychology")}</span>
            <strong>{psychology ? (language === "fr" ? psychology.label : ({ Euphorique: "Euphoric", Optimiste: "Optimistic", Neutre: "Neutral", Prudent: "Cautious", Craintif: "Fearful" } as Record<string, string>)[psychology.label] ?? psychology.label) : pick(language, "En attente", "Pending")}</strong>
            <small>{psychology ? `Score ${Math.round(psychology.score)}/100` : pick(language, "Calcul en cours", "Calculating")}</small>
          </article>

          <article className={styles.metricCard}>
            <Gauge size={21} />
            <span>{pick(language, "Régime Terminal", "Terminal regime")}</span>
            <strong>{terminal?.regime ? terminalRegimeLabel(terminal.regime, language) : pick(language, "N/D", "N/A")}</strong>
            <small>{terminal?.risk_level && terminal.regime_score != null ? `${pick(language, "Risque", "Risk")} ${terminalRiskLabel(terminal.risk_level, language).toLowerCase()} · score ${Math.round(terminal.regime_score)}` : pick(language, "Couverture insuffisante", "Insufficient coverage")}</small>
          </article>

          <article className={styles.metricCard}>
            <LayoutDashboard size={21} />
            <span>{pick(language, "Secteur en tête", "Leading sector")}</span>
            <strong>{topSector?.sector ?? pick(language, "En attente", "Pending")}</strong>
            <small>{topSector ? formatPercent(topSector.change_percent) : pick(language, "Données sectorielles", "Sector data")}</small>
          </article>
        </div>
      </section>

      <section className={styles.personalSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>{pick(language, "MON ESPACE AUJOURD’HUI", "MY WORKSPACE TODAY")}</span>
            <h2>{user ? pick(language, "Ton espace synchronisé", "Your synchronized workspace") : pick(language, "Ton espace local", "Your local workspace")}</h2>
          </div>
          <span className={styles.syncBadge}>{user ? (syncState === "synced" ? pick(language, "Synchronisé", "Synchronized") : pick(language, "Compte connecté", "Account connected")) : pick(language, "Mode local", "Local mode")}</span>
        </div>

        {hasPersonalData ? (
          <div className={styles.personalGrid}>
            <Link href="/watchlist" className={styles.personalCard}>
              <div className={styles.cardTitle}><Star size={20} /><span>Watchlist</span></div>
              <strong>{workspace.watchlist.length} {pick(language, `titre${workspace.watchlist.length > 1 ? "s" : ""}`, `securit${workspace.watchlist.length === 1 ? "y" : "ies"}`)}</strong>
              <small>{watchlist ? pick(language, `${watchlist.summary.advancers} en hausse · ${watchlist.summary.decliners} en baisse`, `${watchlist.summary.advancers} up · ${watchlist.summary.decliners} down`) : pick(language, "Synchronisation en cours", "Synchronizing")}</small>
            </Link>

            <Link href="/portefeuille" className={styles.personalCard}>
              <div className={styles.cardTitle}><BriefcaseBusiness size={20} /><span>{pick(language, "Portefeuille de suivi", "Tracking portfolio")}</span></div>
              <strong>{portfolio ? formatPercent(portfolio.total_day_change_percent) : `${workspace.portfolio.length} position${workspace.portfolio.length > 1 ? "s" : ""}`}</strong>
              <small>{portfolio ? `${formatMoney(portfolio.total_market_value, language)} ${pick(language, "suivis aujourd’hui", "tracked today")}` : pick(language, "Évaluation en cours", "Valuation in progress")}</small>
            </Link>

            <Link href="/alertes" className={styles.personalCard}>
              <div className={styles.cardTitle}><Bell size={20} /><span>{pick(language, "Alertes", "Alerts")}</span></div>
              <strong>{alerts?.triggered_count ?? 0} {pick(language, `déclenchée${(alerts?.triggered_count ?? 0) > 1 ? "s" : ""}`, `triggered`)}</strong>
              <small>{workspace.alerts.length} {pick(language, `règle${workspace.alerts.length > 1 ? "s" : ""} surveillée${workspace.alerts.length > 1 ? "s" : ""}`, `monitored rule${workspace.alerts.length === 1 ? "" : "s"}`)}</small>
            </Link>

            <Link href="/comparateur" className={styles.personalCard}>
              <div className={styles.cardTitle}><Activity size={20} /><span>{pick(language, "Comparateur", "Comparator")}</span></div>
              <strong>{workspace.comparator_symbols.length} {pick(language, `titre${workspace.comparator_symbols.length > 1 ? "s" : ""}`, `securit${workspace.comparator_symbols.length === 1 ? "y" : "ies"}`)}</strong>
              <small>{workspace.comparator_symbols.length ? workspace.comparator_symbols.join(" · ") : pick(language, "Aucune comparaison active", "No active comparison")}</small>
            </Link>
          </div>
        ) : (
          <div className={styles.emptyPersonal}>
            <div>
              <Star size={24} />
              <h3>{pick(language, "Personnalise ton briefing", "Personalize your briefing")}</h3>
              <p>{pick(language, "Ajoute des titres à la Watchlist, des positions de suivi ou des alertes. Aujourd’hui les réunira automatiquement ici.", "Add securities to Watchlist, tracking positions, or alerts. Today will bring them together here automatically.")}</p>
            </div>
            <div className={styles.emptyActions}>
              <Link href="/watchlist">{pick(language, "Créer ma Watchlist", "Create my Watchlist")}</Link>
              <Link href="/portefeuille">{pick(language, "Ajouter une position", "Add a position")}</Link>
            </div>
          </div>
        )}

        {watchlistMovers.length ? (
          <div className={styles.moversStrip}>
            {watchlistMovers.map((item) => (
              <Link href={`/focus/${encodeURIComponent(item.symbol)}`} key={item.symbol}>
                <span>{item.symbol}</span>
                <strong className={item.change_percent >= 0 ? styles.positiveText : styles.negativeText}>{formatPercent(item.change_percent)}</strong>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.attentionSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>{pick(language, "CE QUI MÉRITE L’ATTENTION", "WHAT DESERVES ATTENTION")}</span>
              <h2>{attention.length ? pick(language, `${attention.length} éléments à surveiller`, `${attention.length} items to monitor`) : pick(language, "Aucun signal prioritaire", "No priority signal")}</h2>
            </div>
            <Link href="/terminal">{pick(language, "Voir Terminal Pro", "View Pro Terminal")} <span>→</span></Link>
          </div>

          <div className={styles.attentionList}>
            {attention.length ? attention.map((item) => (
              <Link href={item.href} className={`${styles.attentionItem} ${styles[item.tone]}`} key={item.key} target={item.href.startsWith("http") ? "_blank" : undefined} rel={item.href.startsWith("http") ? "noreferrer" : undefined}>
                <span className={styles.attentionMarker} />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <small>{item.meta}</small>
                </div>
                <span className={styles.itemArrow}>→</span>
              </Link>
            )) : (
              <div className={styles.emptyList}>
                <ShieldCheck size={24} />
                <strong>{pick(language, "Aucun élément prioritaire détecté.", "No priority item detected.")}</strong>
                <span>{pick(language, "Les signaux Terminal, les alertes et les mouvements de la Watchlist apparaîtront ici.", "Terminal signals, alerts, and Watchlist moves will appear here.")}</span>
              </div>
            )}
          </div>
        </section>

        <section className={styles.calendarSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>{pick(language, "PROCHAINS ÉVÉNEMENTS", "UPCOMING EVENTS")}</span>
              <h2>{pick(language, "Calendrier", "Calendar")}</h2>
            </div>
            <Link href="/calendrier">{pick(language, "Voir tout", "View all")} <span>→</span></Link>
          </div>

          <div className={styles.eventList}>
            {upcomingEvents.length ? upcomingEvents.map((event) => (
              <article key={event.id}>
                <span className={`${styles.importance} ${styles[event.importance.toLowerCase()] ?? ""}`} />
                <div>
                  <strong>{event.title}</strong>
                  <span>{event.country} · {event.category}</span>
                  <small>{formatEventDate(event.starts_at, language)}</small>
                </div>
              </article>
            )) : (
              <div className={styles.emptyList}>
                <CalendarDays size={24} />
                <strong>{pick(language, "Aucun événement imminent chargé.", "No upcoming event loaded.")}</strong>
                <span>{pick(language, "Le calendrier se mettra à jour automatiquement.", "The calendar will update automatically.")}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className={styles.readingSection}>
        <div className={styles.readingIcon}><Newspaper size={25} /></div>
        <div className={styles.readingCopy}>
          <span className={styles.eyebrow}>{pick(language, "LECTURE ANATOLE", "ANATOLE READING")}</span>
          <h2>{pick(language, "Ce que les données montrent", "What the data shows")}</h2>
          <p>{marketReading}</p>
          <small>{pick(language, "Lecture descriptive fondée sur les données affichées. Elle ne constitue ni une recommandation, ni un conseil de placement.", "A descriptive reading based on the displayed data. It is neither a recommendation nor investment advice.")}</small>
        </div>
        <div className={styles.readingLinks}>
          <Link href="/actualites">{pick(language, "Actualités", "News")}</Link>
          <Link href="/psychologie">{pick(language, "Psychologie", "Psychology")}</Link>
          <Link href="/terminal">Terminal Pro</Link>
        </div>
      </section>
    </main>
  );
}
