"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Database,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import {
  analyzePortfolio,
  getCalendarSnapshot,
  getCockpitSnapshot,
  getDataQuality,
  getNewsSnapshot,
} from "@/lib/api";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";
import type {
  CalendarSnapshot,
  CockpitSnapshot,
  DataQualitySnapshot,
  NewsSnapshot,
  PortfolioPositionInput,
  PortfolioSnapshot,
} from "@/lib/types";
import {
  WORKSPACE_SYNC_EVENT,
  readLocalWorkspace,
} from "@/lib/workspace-sync";

import styles from "./InstitutionalCommandCenter.module.css";

type LoadState = "idle" | "loading" | "ready" | "partial";

type BriefItem = {
  key: string;
  eyebrow: string;
  title: string;
  detail: string;
  href: string;
};

function money(
  value: number | null | undefined,
  language: AnatoleLanguage,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return pick(language, "N/D", "N/A");
  }

  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(
  value: number | null | undefined,
  language: AnatoleLanguage,
  digits = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return pick(language, "N/D", "N/A");
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)} %`;
}

function timestamp(
  value: string | null | undefined,
  language: AnatoleLanguage,
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(localeFor(language), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function eventTime(
  value: string | null | undefined,
  language: AnatoleLanguage,
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(localeFor(language), {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function riskLabel(
  value: NonNullable<PortfolioSnapshot["risk"]>["risk_level"],
  language: AnatoleLanguage,
): string {
  if (!value) return pick(language, "N/D", "N/A");
  if (language === "fr") return value;

  return ({
    Faible: "Low",
    Modéré: "Moderate",
    Élevé: "High",
    "Très élevé": "Very high",
  } as Record<string, string>)[value] ?? value;
}

function qualityLabel(
  value: DataQualitySnapshot["overall_status"] | null,
  language: AnatoleLanguage,
): string {
  if (!value) return pick(language, "N/D", "N/A");
  if (language === "fr") return value;

  return ({
    Excellent: "Excellent",
    Bon: "Good",
    Dégradé: "Degraded",
    Critique: "Critical",
  } as Record<string, string>)[value] ?? value;
}

export function InstitutionalCommandCenter() {
  const { preferences } = usePreferences();
  const language = preferences.language;

  const [positions, setPositions] = useState<PortfolioPositionInput[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [market, setMarket] = useState<CockpitSnapshot | null>(null);
  const [news, setNews] = useState<NewsSnapshot | null>(null);
  const [calendar, setCalendar] = useState<CalendarSnapshot | null>(null);
  const [quality, setQuality] = useState<DataQualitySnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");

  useEffect(() => {
    const reload = () => {
      setPositions(readLocalWorkspace().data.portfolio);
    };

    const timer = window.setTimeout(reload, 0);
    window.addEventListener(WORKSPACE_SYNC_EVENT, reload);
    window.addEventListener("storage", reload);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(WORKSPACE_SYNC_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoadState("loading");
      let failures = 0;

      const portfolioTask = positions.length
        ? analyzePortfolio(positions, controller.signal, true)
            .then((value) => {
              if (!controller.signal.aborted) setPortfolio(value);
            })
            .catch(() => {
              failures += 1;
              if (!controller.signal.aborted) setPortfolio(null);
            })
        : Promise.resolve().then(() => {
            if (!controller.signal.aborted) setPortfolio(null);
          });

      const marketTask = getCockpitSnapshot("composite", controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setMarket(value);
        })
        .catch(() => {
          failures += 1;
          if (!controller.signal.aborted) setMarket(null);
        });

      const newsTask = getNewsSnapshot(language, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setNews(value);
        })
        .catch(() => {
          failures += 1;
          if (!controller.signal.aborted) setNews(null);
        });

      const calendarTask = getCalendarSnapshot(language, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setCalendar(value);
        })
        .catch(() => {
          failures += 1;
          if (!controller.signal.aborted) setCalendar(null);
        });

      const qualityTask = getDataQuality(controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setQuality(value);
        })
        .catch(() => {
          failures += 1;
          if (!controller.signal.aborted) setQuality(null);
        });

      await Promise.all([
        portfolioTask,
        marketTask,
        newsTask,
        calendarTask,
        qualityTask,
      ]);

      if (!controller.signal.aborted) {
        setLoadState(failures > 0 ? "partial" : "ready");
      }
    };

    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [language, positions]);

  const marketBreadth = useMemo(() => {
    if (!market) return null;
    const total = market.breadth.advancers + market.breadth.decliners;
    if (total <= 0) return null;
    return (market.breadth.advancers / total) * 100;
  }, [market]);

  const nextEvent = useMemo(() => {
    if (!calendar?.events.length) return null;
    return [...calendar.events]
      .filter((item) => Number.isFinite(new Date(item.starts_at).getTime()))
      .sort(
        (left, right) =>
          new Date(left.starts_at).getTime() -
          new Date(right.starts_at).getTime(),
      )[0] ?? null;
  }, [calendar]);

  const priorities = useMemo<BriefItem[]>(() => {
    const items: BriefItem[] = [];

    if (portfolio?.positions.length) {
      const movers = [...portfolio.positions]
        .sort(
          (left, right) =>
            Math.abs(right.day_change_percent) -
            Math.abs(left.day_change_percent),
        )
        .slice(0, 3);

      for (const position of movers) {
        items.push({
          key: `position:${position.symbol}`,
          eyebrow: pick(language, "PORTEFEUILLE", "PORTFOLIO"),
          title: `${position.symbol} · ${percent(position.day_change_percent, language)}`,
          detail: pick(
            language,
            `${position.name} · poids ${percent(position.weight_percent, language)} · source ${position.source || "N/D"}`,
            `${position.name} · weight ${percent(position.weight_percent, language)} · source ${position.source || "N/A"}`,
          ),
          href: `/focus/${encodeURIComponent(position.symbol)}`,
        });
      }
    }

    if (nextEvent) {
      items.push({
        key: `event:${nextEvent.id}`,
        eyebrow: pick(language, "CALENDRIER", "CALENDAR"),
        title: nextEvent.title,
        detail: `${eventTime(nextEvent.starts_at, language)} · ${nextEvent.source}`,
        href: "/calendrier",
      });
    }

    for (const item of news?.items.slice(0, 2) ?? []) {
      items.push({
        key: `news:${item.id}`,
        eyebrow: pick(language, "ACTUALITÉ", "NEWS"),
        title: item.title,
        detail: `${item.source} · ${timestamp(item.published_at, language)}`,
        href: item.url || "/actualites",
      });
    }

    if (
      quality &&
      quality.overall_status !== "Excellent" &&
      quality.overall_status !== "Bon"
    ) {
      items.push({
        key: "data-quality",
        eyebrow: pick(language, "DONNÉES", "DATA"),
        title: pick(
          language,
          `Qualité des données : ${quality.overall_status}`,
          `Data quality: ${qualityLabel(quality.overall_status, language)}`,
        ),
        detail: `${quality.overall_score}/100 · ${quality.provider_mode}`,
        href: "/parametres?section=quality",
      });
    }

    if (!items.length) {
      items.push({
        key: "empty",
        eyebrow: pick(language, "DÉMARRAGE", "GET STARTED"),
        title: positions.length
          ? pick(
              language,
              "Les flux institutionnels se chargent.",
              "Institutional feeds are loading.",
            )
          : pick(
              language,
              "Ajoute un portefeuille pour personnaliser le Command Center.",
              "Add a portfolio to personalize the Command Center.",
            ),
        detail: pick(
          language,
          "Aucune métrique n'est inventée : Anatole affiche une donnée réelle, sa source, ou N/D.",
          "No metric is fabricated: Anatole shows real data, its source, or N/A.",
        ),
        href: "/portefeuille",
      });
    }

    return items.slice(0, 6);
  }, [language, news, nextEvent, portfolio, positions.length, quality]);

  const latestTimestamp = useMemo(() => {
    const values = [
      portfolio?.generated_at,
      market?.generated_at,
      news?.generated_at,
      calendar?.generated_at,
      quality?.generated_at,
    ].filter((value): value is string => Boolean(value));

    if (!values.length) return null;

    return [...values].sort(
      (left, right) =>
        new Date(right).getTime() - new Date(left).getTime(),
    )[0] ?? null;
  }, [calendar, market, news, portfolio, quality]);

  const deskCards = [
    {
      key: "portfolio",
      icon: WalletCards,
      eyebrow: pick(language, "PORTFOLIO", "PORTFOLIO"),
      value: portfolio
        ? money(portfolio.total_market_value, language)
        : pick(language, "N/D", "N/A"),
      detail: portfolio
        ? pick(
            language,
            `Séance ${percent(portfolio.total_day_change_percent, language)} · ${portfolio.positions.length} positions`,
            `Day ${percent(portfolio.total_day_change_percent, language)} · ${portfolio.positions.length} positions`,
          )
        : pick(
            language,
            "Ajoute ou synchronise un portefeuille.",
            "Add or sync a portfolio.",
          ),
      href: "/portefeuille",
    },
    {
      key: "risk",
      icon: ShieldCheck,
      eyebrow: pick(language, "RISQUE", "RISK"),
      value: riskLabel(portfolio?.risk?.risk_level ?? null, language),
      detail: portfolio?.risk
        ? pick(
            language,
            `Top position ${percent(portfolio.risk.top_position_percent, language)} · diversification ${portfolio.risk.diversification_score?.toFixed(0) ?? "N/D"}`,
            `Top position ${percent(portfolio.risk.top_position_percent, language)} · diversification ${portfolio.risk.diversification_score?.toFixed(0) ?? "N/A"}`,
          )
        : pick(
            language,
            "Les mesures de risque nécessitent un portefeuille.",
            "Risk measures require a portfolio.",
          ),
      href: "/portefeuille",
    },
    {
      key: "research",
      icon: Newspaper,
      eyebrow: pick(language, "RESEARCH", "RESEARCH"),
      value: news
        ? `${news.items.length} ${pick(language, "publications", "items")}`
        : pick(language, "N/D", "N/A"),
      detail: pick(
        language,
        "Actualités sourcées aujourd'hui; le registre de thèses reste une fondation V1.",
        "Sourced news today; the thesis registry remains a V1 foundation.",
      ),
      href: "/actualites",
    },
    {
      key: "macro",
      icon: BarChart3,
      eyebrow: pick(language, "MACRO / MARCHÉ", "MACRO / MARKET"),
      value: market
        ? percent(market.weighted_change_percent, language)
        : pick(language, "N/D", "N/A"),
      detail: marketBreadth === null
        ? pick(
            language,
            "Participation du S&P/TSX Composite : N/D",
            "S&P/TSX Composite breadth: N/A",
          )
        : pick(
            language,
            `Participation haussière ${marketBreadth.toFixed(0)} %`,
            `Advancing breadth ${marketBreadth.toFixed(0)} %`,
          ),
      href: "/canada",
    },
    {
      key: "events",
      icon: CalendarDays,
      eyebrow: pick(language, "ÉVÉNEMENTS", "EVENTS"),
      value: nextEvent
        ? eventTime(nextEvent.starts_at, language)
        : pick(language, "N/D", "N/A"),
      detail: nextEvent?.title ?? pick(
        language,
        "Aucun événement disponible dans le flux actuel.",
        "No event available in the current feed.",
      ),
      href: "/calendrier",
    },
    {
      key: "data",
      icon: Database,
      eyebrow: pick(language, "DATA", "DATA"),
      value: quality
        ? `${quality.overall_score}/100`
        : pick(language, "N/D", "N/A"),
      detail: quality
        ? `${qualityLabel(quality.overall_status, language)} · ${quality.provider_mode}`
        : pick(
            language,
            "Qualité et provenance non disponibles.",
            "Quality and provenance unavailable.",
          ),
      href: "/parametres?section=quality",
    },
  ];

  return (
    <section
      id="command-center"
      className={styles.shell}
      data-testid="institutional-command-center"
    >
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>
            {pick(
              language,
              "INSTITUTIONAL COMMAND CENTER",
              "INSTITUTIONAL COMMAND CENTER",
            )}
          </span>
          <h2>
            {pick(
              language,
              "Le bureau du PM avant l'exécution.",
              "The PM desk before execution.",
            )}
          </h2>
          <p>
            {pick(
              language,
              "Portefeuille, risque, marché, événements et qualité des données sur une seule surface. Chaque métrique provient d'un flux Anatole existant; sinon elle reste explicitement N/D.",
              "Portfolio, risk, market, events and data quality on one surface. Every metric comes from an existing Anatole feed; otherwise it stays explicitly N/A.",
            )}
          </p>
        </div>

        <div className={styles.refreshState} aria-live="polite">
          <RefreshCw
            size={15}
            className={loadState === "loading" ? styles.spinning : undefined}
          />
          <div>
            <strong>
              {loadState === "loading"
                ? pick(language, "Actualisation", "Refreshing")
                : loadState === "partial"
                  ? pick(language, "Données partielles", "Partial data")
                  : pick(language, "Flux synchronisés", "Feeds synchronized")}
            </strong>
            <span>
              {latestTimestamp
                ? pick(
                    language,
                    `Dernière donnée ${timestamp(latestTimestamp, language)}`,
                    `Latest data ${timestamp(latestTimestamp, language)}`,
                  )
                : pick(
                    language,
                    "En attente des premières données",
                    "Waiting for first data",
                  )}
            </span>
          </div>
        </div>
      </header>

      <div
        className={styles.deskGrid}
        data-testid="institutional-desk-grid"
      >
        {deskCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.key}
              href={card.href}
              className={styles.deskCard}
              data-desk={card.key}
            >
              <div className={styles.cardTop}>
                <span className={styles.icon}>
                  <Icon size={17} />
                </span>
                <ArrowUpRight size={15} />
              </div>
              <span className={styles.eyebrow}>{card.eyebrow}</span>
              <strong>{card.value}</strong>
              <p>{card.detail}</p>
            </Link>
          );
        })}
      </div>

      <section
        className={styles.brief}
        data-testid="institutional-morning-brief"
      >
        <header>
          <div>
            <span className={styles.kicker}>
              {pick(language, "PM MORNING BRIEF", "PM MORNING BRIEF")}
            </span>
            <h3>
              {pick(
                language,
                "Priorités aujourd'hui",
                "Today's priorities",
              )}
            </h3>
          </div>
          <Link href="/aujourdhui">
            {pick(language, "Ouvrir Aujourd'hui", "Open Today")}
            <ArrowUpRight size={14} />
          </Link>
        </header>

        <div className={styles.priorityGrid}>
          {priorities.map((item) => (
            <Link
              href={item.href}
              key={item.key}
              className={styles.priority}
            >
              <span>{item.eyebrow}</span>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      <footer className={styles.evidence}>
        <div>
          <Activity size={15} />
          <strong>
            {pick(language, "Traçabilité des flux", "Feed traceability")}
          </strong>
        </div>
        <span>
          {pick(
            language,
            `Portefeuille ${portfolio ? timestamp(portfolio.generated_at, language) : "N/D"} · Marché ${market ? timestamp(market.generated_at, language) : "N/D"} · Actualités ${news ? timestamp(news.generated_at, language) : "N/D"} · Calendrier ${calendar ? timestamp(calendar.generated_at, language) : "N/D"} · Data ${quality ? timestamp(quality.generated_at, language) : "N/D"}`,
            `Portfolio ${portfolio ? timestamp(portfolio.generated_at, language) : "N/A"} · Market ${market ? timestamp(market.generated_at, language) : "N/A"} · News ${news ? timestamp(news.generated_at, language) : "N/A"} · Calendar ${calendar ? timestamp(calendar.generated_at, language) : "N/A"} · Data ${quality ? timestamp(quality.generated_at, language) : "N/A"}`,
          )}
        </span>
      </footer>
    </section>
  );
}
