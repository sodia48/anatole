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

import { useAccount } from "@/components/providers/AccountProvider";
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

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "N/D";
  }
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatEventDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date à confirmer";
  return new Intl.DateTimeFormat("fr-CA", {
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

function marketLabel(change: number, ratio: number): string {
  if (change >= 0.75 && ratio >= 0.65) return "Participation largement positive";
  if (change > 0 && ratio >= 0.5) return "Marché constructif";
  if (change <= -0.75 && ratio <= 0.35) return "Pression vendeuse étendue";
  if (change < 0 && ratio < 0.5) return "Marché sous pression";
  return "Séance partagée";
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

function terminalAlertItem(alert: TerminalAlert): AttentionItem {
  return {
    key: `terminal-alert:${alert.id}`,
    title: alert.title,
    detail: alert.detail,
    meta: `${alert.category}${alert.symbol ? ` · ${alert.symbol}` : ""}`,
    href: alert.symbol ? `/focus/${encodeURIComponent(alert.symbol)}` : "/terminal",
    tone: alert.severity === "high" ? "negative" : "watch",
    priority: alert.severity === "high" ? 92 : alert.severity === "watch" ? 75 : 55,
  };
}

function opportunityItem(item: TerminalOpportunity): AttentionItem {
  return {
    key: `opportunity:${item.symbol}:${item.opportunity_type}`,
    title: `${item.symbol} · ${item.opportunity_type}`,
    detail: item.reasons.slice(0, 2).join(" · ") || item.signal,
    meta: `${item.sector} · Score ${Math.round(item.score)} · ${formatPercent(item.change_percent)}`,
    href: `/focus/${encodeURIComponent(item.symbol)}`,
    tone: toneFromChange(item.change_percent),
    priority: 62 + Math.min(20, Math.abs(item.change_percent) * 2),
  };
}

function triggeredAlertItem(item: AlertEvaluation): AttentionItem {
  return {
    key: `user-alert:${item.id}`,
    title: `${item.symbol} · alerte déclenchée`,
    detail: item.message,
    meta: `${item.metric_label} · seuil ${item.threshold}${item.unit}`,
    href: `/focus/${encodeURIComponent(item.symbol)}`,
    tone: "watch",
    priority: 100,
  };
}

function quoteAttentionItem(item: Quote): AttentionItem {
  return {
    key: `watchlist:${item.symbol}`,
    title: `${item.symbol} bouge de ${formatPercent(item.change_percent)}`,
    detail: item.name,
    meta: `Watchlist · ${item.delayed ? "Donnée différée" : "Flux actif"}`,
    href: `/focus/${encodeURIComponent(item.symbol)}`,
    tone: toneFromChange(item.change_percent),
    priority: 65 + Math.min(22, Math.abs(item.change_percent) * 3),
  };
}

function newsAttentionItem(item: NewsItem): AttentionItem {
  return {
    key: `news:${item.id}`,
    title: item.title,
    detail: item.summary || "Consulte le détail de cette actualité.",
    meta: `${item.source} · ${formatTime(item.published_at)}`,
    href: item.url || "/actualites",
    tone: item.sentiment === "negative" ? "negative" : item.sentiment === "positive" ? "positive" : "neutral",
    priority: 38 + Math.abs(item.sentiment_score ?? 0) * 10,
  };
}

export default function TodayPage() {
  const { user, syncState } = useAccount();
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
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const mounted = useRef(true);
  const loadingRef = useRef(false);

  const universe: CockpitUniverse = workspace.cockpit_universe === "composite"
    ? "composite"
    : workspace.preferences.default_universe === "composite"
      ? "composite"
      : "tsx60";

  const reloadWorkspace = useCallback(() => {
    setWorkspace(readLocalWorkspace().data);
  }, []);

  useEffect(() => {
    mounted.current = true;
    reloadWorkspace();
    const onSync = () => reloadWorkspace();
    window.addEventListener(WORKSPACE_SYNC_EVENT, onSync);
    window.addEventListener("storage", onSync);
    window.addEventListener("anatole-watchlist-change", onSync);
    return () => {
      mounted.current = false;
      window.removeEventListener(WORKSPACE_SYNC_EVENT, onSync);
      window.removeEventListener("storage", onSync);
      window.removeEventListener("anatole-watchlist-change", onSync);
    };
  }, [reloadWorkspace]);

  const recordIssues = useCallback((next: SourceIssue[]) => {
    if (!mounted.current) return;
    setIssues(next);
    setState(next.length ? "partial" : "ready");
    setLastUpdated(new Date().toISOString());
  }, []);

  const loadMarket = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const controller = new AbortController();
    const nextIssues: SourceIssue[] = [];
    try {
      const value = await getCockpitSnapshot(universe, controller.signal);
      if (mounted.current) setCockpit(value);
    } catch (reason) {
      nextIssues.push({
        source: "Marché",
        message: reason instanceof Error ? reason.message : "Données indisponibles",
      });
    }
    if (nextIssues.length && mounted.current) {
      setIssues((current) => [...current.filter((item) => item.source !== "Marché"), ...nextIssues]);
      setState("partial");
    }
  }, [universe]);

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
              message: reason instanceof Error ? reason.message : "Données indisponibles",
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
              source: "Portefeuille",
              message: reason instanceof Error ? reason.message : "Données indisponibles",
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
              source: "Alertes",
              message: reason instanceof Error ? reason.message : "Données indisponibles",
            });
          }),
      );
    } else if (mounted.current) {
      setAlerts(null);
    }

    await Promise.all(tasks);
    if (mounted.current) {
      setIssues((current) => [
        ...current.filter((item) => !["Watchlist", "Portefeuille", "Alertes"].includes(item.source)),
        ...nextIssues,
      ]);
      if (nextIssues.length) setState("partial");
    }
  }, [workspace.alerts, workspace.portfolio, workspace.watchlist]);

  const loadContext = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const controller = new AbortController();
    const nextIssues: SourceIssue[] = [];
    const results = await Promise.allSettled([
      getTerminalSnapshot(controller.signal),
      getPsychologySnapshot(controller.signal),
      getNewsSnapshot(controller.signal),
      getCalendarSnapshot(controller.signal),
    ]);
    const setters = [
      (value: TerminalSnapshot) => setTerminal(value),
      (value: PsychologySnapshot) => setPsychology(value),
      (value: NewsSnapshot) => setNews(value),
      (value: CalendarSnapshot) => setCalendar(value),
    ] as const;
    const names = ["Terminal", "Psychologie", "Actualités", "Calendrier"];

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        if (mounted.current) setters[index](result.value as never);
      } else {
        nextIssues.push({
          source: names[index],
          message: result.reason instanceof Error ? result.reason.message : "Données indisponibles",
        });
      }
    });

    recordIssues(nextIssues);
  }, [recordIssues]);

  const loadAll = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setState((current) => current === "idle" ? "loading" : current);
    try {
      await Promise.all([loadMarket(), loadPersonal(), loadContext()]);
      if (mounted.current && !lastUpdated) setLastUpdated(new Date().toISOString());
    } finally {
      loadingRef.current = false;
    }
  }, [lastUpdated, loadContext, loadMarket, loadPersonal]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const fast = window.setInterval(() => void loadMarket(), 15_000);
    const personal = window.setInterval(() => void loadPersonal(), 30_000);
    const context = window.setInterval(() => void loadContext(), 120_000);
    return () => {
      window.clearInterval(fast);
      window.clearInterval(personal);
      window.clearInterval(context);
    };
  }, [loadContext, loadMarket, loadPersonal]);

  const upcomingEvents = useMemo(() => {
    const now = Date.now() - 30 * 60 * 1000;
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
      if (alert.triggered) items.push(triggeredAlertItem(alert));
    }
    for (const alert of terminal?.alerts ?? []) items.push(terminalAlertItem(alert));
    for (const quote of watchlist?.items ?? []) {
      if (Math.abs(quote.change_percent) >= 2.25) items.push(quoteAttentionItem(quote));
    }
    for (const opportunity of terminal?.opportunities ?? []) items.push(opportunityItem(opportunity));
    for (const item of news?.items.slice(0, 4) ?? []) items.push(newsAttentionItem(item));
    return uniqueAttention(items);
  }, [alerts, news, terminal, watchlist]);

  const topSector = useMemo(
    () => [...(cockpit?.sectors ?? [])].sort((a, b) => b.change_percent - a.change_percent)[0] ?? null,
    [cockpit],
  );
  const weakSector = useMemo(
    () => [...(cockpit?.sectors ?? [])].sort((a, b) => a.change_percent - b.change_percent)[0] ?? null,
    [cockpit],
  );

  const marketReading = useMemo(() => {
    if (!cockpit) return "La lecture du marché sera disponible dès la première synchronisation.";
    const direction = cockpit.weighted_change_percent >= 0 ? "progresse" : "recule";
    const participation = Math.round(normalizeAdvanceRatio(cockpit.breadth) * 100);
    const sectorSentence = topSector && weakSector
      ? `${topSector.sector} mène (${formatPercent(topSector.change_percent)}), tandis que ${weakSector.sector} ferme la marche (${formatPercent(weakSector.change_percent)}).`
      : "Les données sectorielles se mettent à jour.";
    const regime = terminal ? ` Le régime Terminal est ${terminal.regime.toLowerCase()} avec un risque ${terminal.risk_level.toLowerCase()}.` : "";
    return `Le ${universe === "composite" ? "S&P/TSX Composite" : "S&P/TSX 60"} ${direction} de ${formatPercent(Math.abs(cockpit.weighted_change_percent))}. ${participation} % des titres avancent. ${sectorSentence}${regime}`;
  }, [cockpit, terminal, topSector, universe, weakSector]);

  const displayName = firstName(user?.display_name);
  const hasPersonalData = Boolean(workspace.watchlist.length || workspace.portfolio.length || workspace.alerts.length);
  const marketChange = cockpit?.weighted_change_percent ?? 0;
  const advanceRatio = normalizeAdvanceRatio(cockpit?.breadth);
  const marketState = cockpit ? marketLabel(marketChange, advanceRatio) : "Synchronisation du marché";
  const sourceCount = [cockpit, watchlist, portfolio, alerts, terminal, psychology, news, calendar].filter(Boolean).length;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>ANATOLE AUJOURD’HUI · v1.2.3</span>
          <h1>{displayName ? `Bonjour ${displayName}` : "Aujourd’hui sur les marchés"}</h1>
          <p>Une lecture quotidienne claire du marché canadien et de ton espace, sans recommandation de placement.</p>
        </div>
        <div className={styles.heroStatus}>
          <span className={`${styles.liveDot} ${issues.length ? styles.warningDot : ""}`} />
          <div>
            <strong>{state === "loading" ? "Chargement…" : issues.length ? "Mode résilient" : "Données actives"}</strong>
            <small>{sourceCount}/8 sources · mis à jour {formatTime(lastUpdated)}</small>
          </div>
          <button type="button" onClick={() => void loadAll()} disabled={loadingRef.current}>
            Actualiser
          </button>
        </div>
      </header>

      {issues.length ? (
        <section className={styles.resilientNotice} aria-live="polite">
          <ShieldCheck size={19} />
          <div>
            <strong>Certaines sources répondent lentement.</strong>
            <span>La dernière donnée valide reste affichée. Sources concernées : {issues.map((item) => item.source).join(", ")}.</span>
          </div>
        </section>
      ) : null}

      <section className={styles.marketSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>LE MARCHÉ EN 30 SECONDES</span>
            <h2>{universe === "composite" ? "S&P/TSX Composite" : "S&P/TSX 60"}</h2>
          </div>
          <Link href="/cockpit">Ouvrir le Cockpit <span>→</span></Link>
        </div>

        <div className={styles.marketGrid}>
          <article className={`${styles.primaryMarketCard} ${marketChange >= 0 ? styles.positiveCard : styles.negativeCard}`}>
            <div>
              <span>Variation pondérée</span>
              <strong>{cockpit ? formatPercent(marketChange) : "—"}</strong>
              <small>{marketState}</small>
            </div>
            <dl>
              <div><dt>Progressions</dt><dd>{cockpit?.breadth.advancers ?? "—"}</dd></div>
              <div><dt>Baisses</dt><dd>{cockpit?.breadth.decliners ?? "—"}</dd></div>
              <div><dt>Ratio de hausse</dt><dd>{cockpit ? formatParticipation(advanceRatio) : "—"}</dd></div>
            </dl>
          </article>

          <article className={styles.metricCard}>
            <Activity size={21} />
            <span>Psychologie</span>
            <strong>{psychology?.label ?? "En attente"}</strong>
            <small>{psychology ? `Score ${Math.round(psychology.score)}/100` : "Calcul en cours"}</small>
          </article>

          <article className={styles.metricCard}>
            <Gauge size={21} />
            <span>Régime Terminal</span>
            <strong>{terminal?.regime ?? "En attente"}</strong>
            <small>{terminal ? `Risque ${terminal.risk_level.toLowerCase()} · score ${Math.round(terminal.regime_score)}` : "Analyse en cours"}</small>
          </article>

          <article className={styles.metricCard}>
            <LayoutDashboard size={21} />
            <span>Secteur en tête</span>
            <strong>{topSector?.sector ?? "En attente"}</strong>
            <small>{topSector ? formatPercent(topSector.change_percent) : "Données sectorielles"}</small>
          </article>
        </div>
      </section>

      <section className={styles.personalSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>MON ESPACE AUJOURD’HUI</span>
            <h2>{user ? "Ton espace synchronisé" : "Ton espace local"}</h2>
          </div>
          <span className={styles.syncBadge}>{user ? (syncState === "synced" ? "Synchronisé" : "Compte connecté") : "Mode local"}</span>
        </div>

        {hasPersonalData ? (
          <div className={styles.personalGrid}>
            <Link href="/watchlist" className={styles.personalCard}>
              <div className={styles.cardTitle}><Star size={20} /><span>Watchlist</span></div>
              <strong>{workspace.watchlist.length} titre{workspace.watchlist.length > 1 ? "s" : ""}</strong>
              <small>{watchlist ? `${watchlist.summary.advancers} en hausse · ${watchlist.summary.decliners} en baisse` : "Synchronisation en cours"}</small>
            </Link>

            <Link href="/portefeuille" className={styles.personalCard}>
              <div className={styles.cardTitle}><BriefcaseBusiness size={20} /><span>Portefeuille de suivi</span></div>
              <strong>{portfolio ? formatPercent(portfolio.total_day_change_percent) : `${workspace.portfolio.length} position${workspace.portfolio.length > 1 ? "s" : ""}`}</strong>
              <small>{portfolio ? `${formatMoney(portfolio.total_market_value)} suivis aujourd’hui` : "Évaluation en cours"}</small>
            </Link>

            <Link href="/alertes" className={styles.personalCard}>
              <div className={styles.cardTitle}><Bell size={20} /><span>Alertes</span></div>
              <strong>{alerts?.triggered_count ?? 0} déclenchée{(alerts?.triggered_count ?? 0) > 1 ? "s" : ""}</strong>
              <small>{workspace.alerts.length} règle{workspace.alerts.length > 1 ? "s" : ""} surveillée{workspace.alerts.length > 1 ? "s" : ""}</small>
            </Link>

            <Link href="/comparateur" className={styles.personalCard}>
              <div className={styles.cardTitle}><Activity size={20} /><span>Comparateur</span></div>
              <strong>{workspace.comparator_symbols.length} titre{workspace.comparator_symbols.length > 1 ? "s" : ""}</strong>
              <small>{workspace.comparator_symbols.length ? workspace.comparator_symbols.join(" · ") : "Aucune comparaison active"}</small>
            </Link>
          </div>
        ) : (
          <div className={styles.emptyPersonal}>
            <div>
              <Star size={24} />
              <h3>Personnalise ton briefing</h3>
              <p>Ajoute des titres à la Watchlist, des positions de suivi ou des alertes. Aujourd’hui les réunira automatiquement ici.</p>
            </div>
            <div className={styles.emptyActions}>
              <Link href="/watchlist">Créer ma Watchlist</Link>
              <Link href="/portefeuille">Ajouter une position</Link>
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
              <span className={styles.eyebrow}>CE QUI MÉRITE L’ATTENTION</span>
              <h2>{attention.length ? `${attention.length} éléments à surveiller` : "Aucun signal prioritaire"}</h2>
            </div>
            <Link href="/terminal">Voir Terminal Pro <span>→</span></Link>
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
                <strong>Aucun élément prioritaire détecté.</strong>
                <span>Les signaux Terminal, les alertes et les mouvements de la Watchlist apparaîtront ici.</span>
              </div>
            )}
          </div>
        </section>

        <section className={styles.calendarSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>PROCHAINS ÉVÉNEMENTS</span>
              <h2>Calendrier</h2>
            </div>
            <Link href="/calendrier">Voir tout <span>→</span></Link>
          </div>

          <div className={styles.eventList}>
            {upcomingEvents.length ? upcomingEvents.map((event) => (
              <article key={event.id}>
                <span className={`${styles.importance} ${styles[event.importance.toLowerCase()] ?? ""}`} />
                <div>
                  <strong>{event.title}</strong>
                  <span>{event.country} · {event.category}</span>
                  <small>{formatEventDate(event.starts_at)}</small>
                </div>
              </article>
            )) : (
              <div className={styles.emptyList}>
                <CalendarDays size={24} />
                <strong>Aucun événement imminent chargé.</strong>
                <span>Le calendrier se mettra à jour automatiquement.</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className={styles.readingSection}>
        <div className={styles.readingIcon}><Newspaper size={25} /></div>
        <div className={styles.readingCopy}>
          <span className={styles.eyebrow}>LECTURE ANATOLE</span>
          <h2>Ce que les données montrent</h2>
          <p>{marketReading}</p>
          <small>Lecture descriptive fondée sur les données affichées. Elle ne constitue ni une recommandation, ni un conseil de placement.</small>
        </div>
        <div className={styles.readingLinks}>
          <Link href="/actualites">Actualités</Link>
          <Link href="/psychologie">Psychologie</Link>
          <Link href="/terminal">Terminal Pro</Link>
        </div>
      </section>
    </main>
  );
}
