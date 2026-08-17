"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  type InsiderSnapshot,
  type InsiderTransactionType,
  type IpoInstrumentType,
  type IpoItem,
  type IpoSnapshot,
  getInsiderSnapshot,
  getIpoSnapshot,
} from "../../lib/ipo-insiders-api";

import styles from "./IpoInsiders.module.css";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

type MainTab = "ipo" | "insiders";
type IpoCountryFilter =
  | "all"
  | "Canada"
  | "États-Unis";
type IpoTypeFilter =
  | "all"
  | IpoInstrumentType;
type InsiderMarket = "canada" | "us";
type InsiderLoadStage =
  | "idle"
  | "preview"
  | "enriching"
  | "ready";
type InsiderTypeFilter =
  | "all"
  | InsiderTransactionType;

const EMPTY_IPO: IpoSnapshot = {
  items: [],
  summary: {
    total: 0,
    canada: 0,
    united_states: 0,
    companies: 0,
    newly_listed: 0,
    regulatory_filings: 0,
  },
  sources: [],
  generated_at: "",
  refresh_after_seconds: 1800,
  message: null,
};

const EMPTY_INSIDERS: InsiderSnapshot = {
  trades: [],
  summary: {
    transactions: 0,
    companies: 0,
    buys: 0,
    sells: 0,
    grants_and_exercises: 0,
    buy_value: 0,
    sell_value: 0,
    net_value: 0,
    buy_ratio_percent: 0,
    unusual_transactions: 0,
  },
  sources: [],
  market: "Canada",
  requested_ticker: null,
  scanned_symbols: 0,
  generated_at: "",
  refresh_after_seconds: 900,
  message: null,
};

function formatDate(
  value: string | null,
  language: AnatoleLanguage,
): string {
  if (!value) return pick(language, "À confirmer", "To be confirmed");

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(localeFor(language), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(date);
}

function formatNumber(
  value: number | null,
  language: AnatoleLanguage,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "N/D";
  }

  return new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMoney(
  value: number | null,
  language: AnatoleLanguage,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "N/D";
  }

  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency: "CAD",
    notation:
      Math.abs(value) >= 1_000_000
        ? "compact"
        : "standard",
    maximumFractionDigits:
      Math.abs(value) >= 1_000_000
        ? 2
        : 0,
  }).format(value);
}

function formatIpoPrice(
  item: IpoItem,
  language: AnatoleLanguage,
): string {
  const currency =
    item.offer_currency ||
    (item.country === "Canada"
      ? "CAD"
      : "USD");

  const format = (value: number): string =>
    new Intl.NumberFormat(localeFor(language), {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  if (
    item.offer_price_status === "range" &&
    item.offer_price_low !== null &&
    item.offer_price_high !== null
  ) {
    return `${format(item.offer_price_low)} – ${format(
      item.offer_price_high,
    )}`;
  }

  if (
    item.offer_price !== null &&
    (item.offer_price_status === "final" ||
      item.offer_price_status === "reference")
  ) {
    const prefix =
      item.offer_price_status === "reference"
        ? "≈ "
        : "";
    return `${prefix}${format(item.offer_price)}`;
  }

  return pick(language, "Non publié", "Not published");
}

function ipoPriceCaption(item: IpoItem, language: AnatoleLanguage): string {
  if (item.offer_price_status === "range") {
    return pick(language, "Fourchette indicative", "Indicative range");
  }

  if (item.offer_price_status === "reference") {
    return pick(language, "Prix de référence", "Reference price");
  }

  if (item.offer_price_status === "final") {
    return pick(language, "Prix IPO final", "Final IPO price");
  }

  return "Prix IPO";
}

function sourceClass(
  status:
    | "available"
    | "partial"
    | "unavailable",
): string {
  if (status === "available") {
    return styles.sourceAvailable;
  }

  if (status === "partial") {
    return styles.sourcePartial;
  }

  return styles.sourceUnavailable;
}

const IPO_CACHE_KEY =
  "anatole:ipo-insiders:ipo:v1";

function insiderCacheKey({
  market,
  days,
  ticker,
}: {
  market: InsiderMarket;
  days: number;
  ticker: string;
}): string {
  return [
    "anatole:ipo-insiders:insiders:v2",
    market,
    days,
    ticker || "radar",
  ].join(":");
}

function readCachedSnapshot<T>(
  key: string,
): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      saved_at?: number;
      value?: T;
    };

    if (
      !parsed.value ||
      !parsed.saved_at ||
      Date.now() - parsed.saved_at >
        6 * 60 * 60 * 1000
    ) {
      return null;
    }

    return parsed.value;
  } catch {
    return null;
  }
}

function writeCachedSnapshot<T>(
  key: string,
  value: T,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        saved_at: Date.now(),
        value,
      }),
    );
  } catch {
    // Le cache navigateur est facultatif.
  }
}

function isAbortError(value: unknown): boolean {
  return (
    value instanceof DOMException &&
    value.name === "AbortError"
  );
}

function tradeClass(
  type: InsiderTransactionType,
): string {
  if (type === "buy") {
    return styles.positive;
  }

  if (type === "sell") {
    return styles.negative;
  }

  return styles.neutral;
}

export function IpoInsidersClient({
  initialTab = "ipo",
}: {
  initialTab?: MainTab;
}) {
  const router = useRouter();
  const { preferences } = usePreferences();
  const language = preferences.language;
  const ipoAbortRef =
    useRef<AbortController | null>(null);
  const insidersAbortRef =
    useRef<AbortController | null>(null);

  const [tab, setTab] =
    useState<MainTab>(initialTab);

  const [ipo, setIpo] =
    useState<IpoSnapshot>(EMPTY_IPO);
  const [ipoLoading, setIpoLoading] =
    useState(true);
  const [ipoError, setIpoError] =
    useState<string | null>(null);
  const [ipoQuery, setIpoQuery] =
    useState("");
  const [ipoCountry, setIpoCountry] =
    useState<IpoCountryFilter>("all");
  const [ipoType, setIpoType] =
    useState<IpoTypeFilter>("company");

  const [insiders, setInsiders] =
    useState<InsiderSnapshot>(
      EMPTY_INSIDERS,
    );
  const [
    insidersLoading,
    setInsidersLoading,
  ] = useState(true);
  const [
    insidersError,
    setInsidersError,
  ] = useState<string | null>(null);
  const [
    insidersLoadStage,
    setInsidersLoadStage,
  ] =
    useState<InsiderLoadStage>("idle");
  const [
    insidersRefreshing,
    setInsidersRefreshing,
  ] = useState(false);

  const [
    insiderMarket,
    setInsiderMarket,
  ] =
    useState<InsiderMarket>("canada");
  const [
    insiderDays,
    setInsiderDays,
  ] = useState(180);
  const [
    insiderInput,
    setInsiderInput,
  ] = useState("");
  const [
    activeTicker,
    setActiveTicker,
  ] = useState("");
  const [
    insiderType,
    setInsiderType,
  ] =
    useState<InsiderTypeFilter>("all");

  const loadIpo = useCallback(
    async ({
      forceRefresh = false,
    }: {
      forceRefresh?: boolean;
    } = {}): Promise<void> => {
      ipoAbortRef.current?.abort();

      const controller =
        new AbortController();
      ipoAbortRef.current = controller;
      const cached =
        readCachedSnapshot<IpoSnapshot>(
          IPO_CACHE_KEY,
        );

      if (cached) {
        setIpo(cached);
      }

      setIpoLoading(!cached);
      setIpoError(null);

      try {
        const snapshot =
          await getIpoSnapshot(
            controller.signal,
            forceRefresh,
          );

        if (!controller.signal.aborted) {
          setIpo(snapshot);
          writeCachedSnapshot(
            IPO_CACHE_KEY,
            snapshot,
          );
        }
      } catch (caught) {
        if (
          !controller.signal.aborted &&
          !isAbortError(caught)
        ) {
          setIpoError(
            language === "fr" && caught instanceof Error
              ? caught.message
              : pick(language, "Le radar IPO est indisponible.", "The IPO radar is unavailable."),
          );
        }
      } finally {
        if (
          ipoAbortRef.current ===
          controller
        ) {
          setIpoLoading(false);
        }
      }
    },
    [language],
  );

  const loadInsiders = useCallback(
    async ({
      forceRefresh = false,
    }: {
      forceRefresh?: boolean;
    } = {}): Promise<void> => {
      insidersAbortRef.current?.abort();

      const controller =
        new AbortController();
      insidersAbortRef.current =
        controller;

      const cacheKey = insiderCacheKey({
        market: insiderMarket,
        days: insiderDays,
        ticker: activeTicker,
      });
      const cached =
        readCachedSnapshot<InsiderSnapshot>(
          cacheKey,
        );
      const hasCachedData =
        Boolean(cached?.trades.length);

      if (cached) {
        setInsiders(cached);
      }

      setInsidersError(null);
      setInsidersLoading(!hasCachedData);
      setInsidersRefreshing(hasCachedData);
      setInsidersLoadStage("preview");

      try {
        const preview =
          await getInsiderSnapshot(
            {
              market: insiderMarket,
              ticker:
                activeTicker ||
                undefined,
              days: insiderDays,
              scanLimit:
                activeTicker
                  ? 1
                  : insiderMarket === "canada"
                    ? 8
                    : 10,
            },
            controller.signal,
            forceRefresh,
          );

        if (controller.signal.aborted) {
          return;
        }

        const previewHasData =
          preview.trades.length > 0;

        if (previewHasData) {
          setInsiders(preview);
          writeCachedSnapshot(
            cacheKey,
            preview,
          );
          setInsidersLoading(false);
          setInsidersRefreshing(
            !activeTicker,
          );
        }

        if (activeTicker) {
          if (!previewHasData) {
            setInsiders(preview);
            writeCachedSnapshot(
              cacheKey,
              preview,
            );
          }
          setInsidersLoadStage("ready");
          return;
        }

        setInsidersLoadStage(
          "enriching",
        );

        const enriched =
          await getInsiderSnapshot(
            {
              market: insiderMarket,
              days: insiderDays,
              scanLimit: 24,
            },
            controller.signal,
            forceRefresh,
          );

        if (!controller.signal.aborted) {
          setInsiders(enriched);
          writeCachedSnapshot(
            cacheKey,
            enriched,
          );
          setInsidersLoadStage("ready");
        }
      } catch (caught) {
        if (
          !controller.signal.aborted &&
          !isAbortError(caught)
        ) {
          setInsidersError(
            language === "fr" && caught instanceof Error
              ? caught.message
              : pick(language, "Le radar d’initiés est indisponible.", "The insider radar is unavailable."),
          );
        }
      } finally {
        if (
          insidersAbortRef.current ===
          controller
        ) {
          setInsidersLoading(false);
          setInsidersRefreshing(false);
          setInsidersLoadStage("ready");
        }
      }
    },
    [
      activeTicker,
      insiderDays,
      insiderMarket,
      language,
    ],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setTab(initialTab), 0);
    return () => window.clearTimeout(timer);
  }, [initialTab]);

  /*
   * Charger uniquement l’onglet visible. Le montage précédent lançait IPO et
   * un balayage de 24 à 40 titres en même temps.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (tab === "ipo") void loadIpo();
      else void loadInsiders();
    }, 0);

    if (tab === "ipo") {

      return () => {
        window.clearTimeout(timer);
        ipoAbortRef.current?.abort();
      };
    }

    return () => {
      window.clearTimeout(timer);
      insidersAbortRef.current?.abort();
    };
  }, [
    tab,
    loadInsiders,
    loadIpo,
  ]);

  useEffect(() => {
    if (tab !== "ipo") return;

    const interval =
      window.setInterval(
        () => void loadIpo(),
        Math.max(
          ipo.refresh_after_seconds,
          1800,
        ) * 1000,
      );

    return () =>
      window.clearInterval(interval);
  }, [
    tab,
    ipo.refresh_after_seconds,
    loadIpo,
  ]);

  useEffect(() => {
    if (tab !== "insiders") return;

    const interval =
      window.setInterval(
        () => void loadInsiders(),
        Math.max(
          insiders.refresh_after_seconds,
          900,
        ) * 1000,
      );

    return () =>
      window.clearInterval(interval);
  }, [
    tab,
    insiders.refresh_after_seconds,
    loadInsiders,
  ]);

  const filteredIpos =
    useMemo(() => {
      const needle = ipoQuery
        .trim()
        .toLocaleLowerCase("fr");

      return ipo.items.filter(
        (item) => {
          if (
            ipoCountry !== "all" &&
            item.country !==
              ipoCountry
          ) {
            return false;
          }

          if (
            ipoType !== "all" &&
            item.instrument_type !==
              ipoType
          ) {
            return false;
          }

          if (!needle) {
            return true;
          }

          return [
            item.company,
            item.symbol,
            item.exchange,
            item.status,
            item.event_type,
          ].some((value) =>
            value
              .toLocaleLowerCase(
                "fr",
              )
              .includes(needle),
          );
        },
      );
    }, [
      ipo.items,
      ipoCountry,
      ipoQuery,
      ipoType,
    ]);

  const filteredTrades =
    useMemo(
      () =>
        insiders.trades.filter(
          (trade) =>
            insiderType ===
              "all" ||
            trade.transaction_type ===
              insiderType,
        ),
      [
        insiderType,
        insiders.trades,
      ],
    );

  const insidersAwaitingFirstResult =
    insidersLoading &&
    insiders.summary.transactions === 0 &&
    insiders.trades.length === 0;

  const insiderCoverageUnavailable =
    !insidersLoading &&
    insidersLoadStage === "ready" &&
    insiders.summary.transactions === 0 &&
    insiders.sources.length > 0 &&
    insiders.sources.every(
      (source) => source.count === 0,
    );

  const insiderProgressLabel =
    insidersLoadStage === "preview"
      ? pick(language, "Aperçu rapide…", "Quick preview…")
      : insidersLoadStage === "enriching"
        ? pick(language, "Analyse étendue en cours…", "Extended analysis in progress…")
        : insidersRefreshing
          ? pick(language, "Actualisation en arrière-plan…", "Refreshing in the background…")
          : null;

  function activateTab(
    nextTab: MainTab,
  ): void {
    setTab(nextTab);
  }

  function submitTicker(
    event: FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();
    setActiveTicker(
      insiderInput
        .trim()
        .toUpperCase(),
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span
            className={styles.eyebrow}
          >
            {pick(language, "MARCHÉS PRIMAIRES & GOUVERNANCE", "PRIMARY MARKETS & GOVERNANCE")}
          </span>
          <h1>
            {pick(language, "IPO & transactions d’initiés", "IPOs & insider transactions")}
          </h1>
          <p>
            {pick(language, "Nouvelles inscriptions canadiennes, dépôts réglementaires américains et mouvements d’initiés à vérifier dans les registres officiels.", "Canadian new listings, U.S. regulatory filings, and insider activity to verify in official registries.")}
          </p>
        </div>

        <div
          className={
            styles.heroMetrics
          }
        >
          <div>
            <strong>
              {
                ipo.summary
                  .companies
              }
            </strong>
            <span>
              {pick(language, "sociétés dans le radar IPO", "companies in the IPO radar")}
            </span>
          </div>
          <div>
            <strong>
              {insidersAwaitingFirstResult
                ? "…"
                : insiderCoverageUnavailable
                  ? pick(language, "Indisponible", "Unavailable")
                  : insiders.summary
                      .transactions}
            </strong>
            <span>
              {pick(language, "transactions détectées", "transactions detected")}
            </span>
          </div>
        </div>
      </section>

      <nav
        className={styles.mainTabs}
        aria-label={pick(language, "Sections IPO et initiés", "IPO and insider sections")}
      >
        <button
          type="button"
          className={
            tab === "ipo"
              ? styles.mainTabActive
              : styles.mainTab
          }
          onClick={() =>
            activateTab("ipo")
          }
        >
          <span>IPO</span>
          <small>
            {pick(language, "Inscriptions et pipeline", "Listings and pipeline")}
          </small>
        </button>

        <button
          type="button"
          className={
            tab === "insiders"
              ? styles.mainTabActive
              : styles.mainTab
          }
          onClick={() =>
            activateTab("insiders")
          }
        >
          <span>{pick(language, "Initiés", "Insiders")}</span>
          <small>
            {pick(language, "Achats, ventes et attributions", "Purchases, sales, and grants")}
          </small>
        </button>
      </nav>

      {tab === "ipo" ? (
        <>
          <section
            className={
              styles.metricGrid
            }
          >
            <article>
              <span>{pick(language, "Événements", "Events")}</span>
              <strong>
                {ipo.summary.total}
              </strong>
            </article>
            <article>
              <span>Canada</span>
              <strong>
                {ipo.summary.canada}
              </strong>
            </article>
            <article>
              <span>
                {pick(language, "États-Unis", "United States")}
              </span>
              <strong>
                {
                  ipo.summary
                    .united_states
                }
              </strong>
            </article>
            <article>
              <span>
                {pick(language, "Nouvelles inscriptions", "New listings")}
              </span>
              <strong>
                {
                  ipo.summary
                    .newly_listed
                }
              </strong>
            </article>
            <article>
              <span>
                {pick(language, "Dépôts réglementaires", "Regulatory filings")}
              </span>
              <strong>
                {
                  ipo.summary
                    .regulatory_filings
                }
              </strong>
            </article>
          </section>

          <section
            className={styles.filters}
          >
            <label
              className={
                styles.search
              }
            >
              <span
                aria-hidden="true"
              >
                ⌕
              </span>
              <input
                value={ipoQuery}
                onChange={(event) =>
                  setIpoQuery(
                    event.target
                      .value,
                  )
                }
                placeholder={pick(language, "Société, symbole, bourse ou statut", "Company, symbol, exchange, or status")}
                aria-label={pick(language, "Rechercher dans le radar IPO", "Search the IPO radar")}
              />
            </label>

            <label
              className={
                styles.selectField
              }
            >
              <span>{pick(language, "PAYS", "COUNTRY")}</span>
              <select
                value={ipoCountry}
                onChange={(event) =>
                  setIpoCountry(
                    event.target
                      .value as IpoCountryFilter,
                  )
                }
              >
                <option value="all">
                  {pick(language, "Canada + États-Unis", "Canada + United States")}
                </option>
                <option value="Canada">
                  Canada
                </option>
                <option value="États-Unis">
                  {pick(language, "États-Unis", "United States")}
                </option>
              </select>
            </label>

            <label
              className={
                styles.selectField
              }
            >
              <span>TYPE</span>
              <select
                value={ipoType}
                onChange={(event) =>
                  setIpoType(
                    event.target
                      .value as IpoTypeFilter,
                  )
                }
              >
                <option value="company">
                  {pick(language, "Sociétés seulement", "Companies only")}
                </option>
                <option value="all">
                  {pick(language, "Tous les instruments", "All instruments")}
                </option>
                <option value="etf">
                  ETF
                </option>
                <option value="cdr">
                  CDR
                </option>
                <option value="fund">
                  {pick(language, "Fonds", "Funds")}
                </option>
                <option value="other">
                  {pick(language, "Autres", "Other")}
                </option>
              </select>
            </label>
          </section>

          {ipoError ? (
            <div
              className={
                styles.warning
              }
            >
              <span>
                {ipoError} {pick(language, "Les dernières données chargées restent affichées.", "The latest loaded data remains visible.")}
              </span>
              <button
                type="button"
                onClick={() =>
                  void loadIpo({
                    forceRefresh: true,
                  })
                }
              >
                {pick(language, "Réessayer", "Try again")}
              </button>
            </div>
          ) : null}

          <section
            className={
              styles.sectionPanel
            }
          >
            <header
              className={
                styles.panelHeader
              }
            >
              <div>
                <span
                  className={
                    styles.eyebrow
                  }
                >
                  RADAR IPO
                </span>
                <h2>
                  {pick(language, "Nouvelles inscriptions et dépôts", "New listings and filings")}
                </h2>
              </div>
              <p>
                {ipoLoading
                  ? pick(language, "Mise à jour…", "Updating…")
                  : pick(language, `${filteredIpos.length} événements affichés`, `${filteredIpos.length} events shown`)}
              </p>
            </header>

            {filteredIpos.length ? (
              <div
                className={
                  styles.ipoGrid
                }
              >
                {filteredIpos.map(
                  (item) => (
                    <article
                      className={
                        styles.ipoCard
                      }
                      key={item.id}
                    >
                      <div
                        className={
                          styles.cardTop
                        }
                      >
                        <span
                          className={
                            styles.symbol
                          }
                        >
                          {item.symbol ||
                            "N/D"}
                        </span>
                        <span
                          className={
                            item.status ===
                            "Cotée"
                              ? styles.statusListed
                              : styles.statusFiled
                          }
                        >
                          {language === "fr" ? item.status : ({ "Cotée": "Listed", "Dépôt": "Filed", "À venir": "Upcoming" } as Record<string, string>)[item.status] ?? item.status}
                        </span>
                      </div>

                      <h3>
                        {item.company}
                      </h3>

                      <div
                        className={
                          styles.cardMeta
                        }
                      >
                        <span>
                          {item.country === "États-Unis" ? pick(language, "États-Unis", "United States") : item.country}
                        </span>
                        <span>
                          {item.exchange}
                        </span>
                        <span>
                          {
                            language === "fr" ? item.instrument_label : ({ Société: "Company", Fonds: "Fund", Autre: "Other" } as Record<string, string>)[item.instrument_label] ?? item.instrument_label
                          }
                        </span>
                      </div>

                      <div
                        className={
                          styles.eventLine
                        }
                      >
                        <span>
                          {
                            language === "fr" ? item.event_type : item.event_type.startsWith("Dépôt réglementaire") ? item.event_type.replace("Dépôt réglementaire", "Regulatory filing") : item.event_type === "Nouvelle inscription" ? "New listing" : item.event_type
                          }
                        </span>
                        <strong>
                          {formatDate(
                            item.event_date,
                            language,
                          )}
                        </strong>
                      </div>

                      <div
                        className={
                          item.offer_price_status ===
                          "not_published"
                            ? `${styles.priceBlock} ${styles.priceUnavailable}`
                            : styles.priceBlock
                        }
                      >
                        <span>
                          {ipoPriceCaption(item, language)}
                        </span>
                        <strong>
                          {formatIpoPrice(item, language)}
                        </strong>
                        <small>
                          {item.offer_price_status ===
                          "not_published"
                            ? pick(language, "Le prospectus ne publie pas encore de prix.", "The prospectus does not yet publish a price.")
                            : item.offer_price_status ===
                                "range"
                              ? pick(language, "Le prix final peut encore changer.", "The final price may still change.")
                              : pick(language, "Prix extrait du document officiel.", "Price extracted from the official document.")}
                        </small>
                      </div>

                      <div
                        className={
                          styles.confidence
                        }
                      >
                        <span>
                          {pick(language, "Confiance de la donnée", "Data confidence")}
                        </span>
                        <strong>
                          {
                            item.confidence_score
                          }
                          /100
                        </strong>
                        <i>
                          <em
                            style={{
                              width: `${item.confidence_score}%`,
                            }}
                          />
                        </i>
                      </div>

                      <div
                        className={
                          styles.cardActions
                        }
                      >
                        {item.focus_available &&
                        item.symbol ? (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/focus/${encodeURIComponent(
                                  item.symbol,
                                )}`,
                              )
                            }
                          >
                            {pick(language, "Ouvrir Focus", "Open Focus")}
                          </button>
                        ) : (
                          <span>
                            {pick(language, "Pipeline à confirmer", "Pipeline to be confirmed")}
                          </span>
                        )}

                        <a
                          href={
                            item.price_source_url ??
                            item.source_url
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          {pick(language, "Source officielle ↗", "Official source ↗")}
                        </a>
                      </div>
                    </article>
                  ),
                )}
              </div>
            ) : (
              <div
                className={
                  styles.empty
                }
              >
                {pick(language, "Aucun événement ne correspond aux filtres.", "No event matches the filters.")}
              </div>
            )}
          </section>

          <section
            className={
              styles.sourcesPanel
            }
          >
            <header>
              <div>
                <span
                  className={
                    styles.eyebrow
                  }
                >
                  {pick(language, "ÉTAT DES SOURCES", "SOURCE STATUS")}
                </span>
                <h2>
                  {pick(language, "Couverture officielle", "Official coverage")}
                </h2>
              </div>
              <span>
                {pick(language, "Actualisation toutes les 30 minutes", "Refresh every 30 minutes")}
              </span>
            </header>

            <div
              className={
                styles.sourceGrid
              }
            >
              {ipo.sources.map(
                (source) => (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    key={source.source}
                  >
                    <span
                      className={sourceClass(
                        source.status,
                      )}
                    >
                      {source.status ===
                      "available"
                        ? pick(language, "DISPONIBLE", "AVAILABLE")
                        : source.status ===
                            "partial"
                          ? pick(language, "PARTIEL", "PARTIAL")
                          : pick(language, "INDISPONIBLE", "UNAVAILABLE")}
                    </span>
                    <strong>
                      {source.source}
                    </strong>
                    <small>
                      {source.count} {pick(language, "éléments", "items")}
                      {source.detail
                        ? ` · ${source.detail}`
                        : ""}
                    </small>
                  </a>
                ),
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          <section
            className={
              styles.metricGrid
            }
          >
            <article>
              <span>Transactions</span>
              <strong>
                {insidersAwaitingFirstResult
                  ? pick(language, "Analyse…", "Analyzing…")
                  : insiderCoverageUnavailable
                    ? pick(language, "Indisponible", "Unavailable")
                    : insiders.summary
                        .transactions}
              </strong>
            </article>
            <article>
              <span>{pick(language, "Achats", "Purchases")}</span>
              <strong
                className={
                  styles.positive
                }
              >
                {insidersAwaitingFirstResult
                  ? "…"
                  : insiderCoverageUnavailable
                    ? "—"
                    : insiders.summary
                        .buys}
              </strong>
            </article>
            <article>
              <span>{pick(language, "Ventes", "Sales")}</span>
              <strong
                className={
                  styles.negative
                }
              >
                {insidersAwaitingFirstResult
                  ? "…"
                  : insiderCoverageUnavailable
                    ? "—"
                    : insiders.summary
                        .sells}
              </strong>
            </article>
            <article>
              <span>
                {pick(language, "Ratio d’achats", "Purchase ratio")}
              </span>
              <strong>
                {insidersAwaitingFirstResult
                  ? "…"
                  : insiderCoverageUnavailable
                    ? pick(language, "Indisponible", "Unavailable")
                    : `${insiders.summary.buy_ratio_percent.toFixed(
                        0,
                      )}%`}
              </strong>
            </article>
            <article>
              <span>
                {pick(language, "Flux net estimé", "Estimated net flow")}
              </span>
              <strong
                className={
                  insiders.summary
                    .net_value >= 0
                    ? styles.positive
                    : styles.negative
                }
              >
                {insidersAwaitingFirstResult
                  ? "…"
                  : insiderCoverageUnavailable
                    ? pick(language, "Indisponible", "Unavailable")
                    : formatMoney(
                        insiders.summary
                          .net_value,
                        language,
                      )}
              </strong>
            </article>
          </section>

          <section
            className={
              styles.insiderControls
            }
          >
            <form
              className={
                styles.tickerForm
              }
              onSubmit={submitTicker}
            >
              <label>
                <span>
                  {pick(language, "ANALYSE PAR TITRE", "SECURITY ANALYSIS")}
                </span>
                <input
                  value={insiderInput}
                  onChange={(event) =>
                    setInsiderInput(
                      event.target
                        .value,
                    )
                  }
                  placeholder="Ex. RY, SHOP, AAPL"
                />
              </label>
              <button type="submit">
                {pick(language, "Analyser", "Analyze")}
              </button>
              {activeTicker ? (
                <button
                  type="button"
                  className={
                    styles.secondaryButton
                  }
                  onClick={() => {
                    setActiveTicker("");
                    setInsiderInput("");
                  }}
                >
                  {pick(language, "Retour au radar", "Back to radar")}
                </button>
              ) : null}
            </form>

            <label
              className={
                styles.selectField
              }
            >
              <span>{pick(language, "MARCHÉ", "MARKET")}</span>
              <select
                value={insiderMarket}
                onChange={(event) => {
                  setInsiderMarket(
                    event.target
                      .value as InsiderMarket,
                  );
                  setActiveTicker("");
                  setInsiderInput("");
                }}
              >
                <option value="canada">
                  Canada — SEDI
                </option>
                <option value="us">
                  {pick(language, "États-Unis — SEC", "United States — SEC")}
                </option>
              </select>
            </label>

            <label
              className={
                styles.selectField
              }
            >
              <span>{pick(language, "PÉRIODE", "PERIOD")}</span>
              <select
                value={insiderDays}
                onChange={(event) => {
                  setInsiderDays(
                    Number(
                      event.target
                        .value,
                    ),
                  );
                }}
              >
                <option value={30}>
                  {pick(language, "30 jours", "30 days")}
                </option>
                <option value={90}>
                  {pick(language, "90 jours", "90 days")}
                </option>
                <option value={180}>
                  {pick(language, "180 jours", "180 days")}
                </option>
                <option value={365}>
                  {pick(language, "1 an", "1 year")}
                </option>
              </select>
            </label>

            <label
              className={
                styles.selectField
              }
            >
              <span>TRANSACTION</span>
              <select
                value={insiderType}
                onChange={(event) =>
                  setInsiderType(
                    event.target
                      .value as InsiderTypeFilter,
                  )
                }
              >
                <option value="all">
                  {pick(language, "Toutes", "All")}
                </option>
                <option value="buy">
                  {pick(language, "Achats", "Purchases")}
                </option>
                <option value="sell">
                  {pick(language, "Ventes", "Sales")}
                </option>
                <option value="grant">
                  {pick(language, "Attributions", "Grants")}
                </option>
                <option value="exercise">
                  {pick(language, "Exercices", "Exercises")}
                </option>
              </select>
            </label>
          </section>

          {insidersError ? (
            <div
              className={
                styles.warning
              }
            >
              <span>
                {insidersError} {pick(language, "Les dernières données chargées restent affichées.", "The latest loaded data remains visible.")}
              </span>
              <button
                type="button"
                onClick={() =>
                  void loadInsiders({
                    forceRefresh: true,
                  })
                }
              >
                {pick(language, "Réessayer", "Try again")}
              </button>
            </div>
          ) : null}

          {insiderProgressLabel ? (
            <div
              className={
                styles.collectionProgress
              }
              role="status"
              aria-live="polite"
            >
              <span
                className={
                  styles.collectionSpinner
                }
                aria-hidden="true"
              />
              <div>
                <strong>
                  {insiderProgressLabel}
                </strong>
                <small>
                  {pick(language, "Les premières données sont affichées dès qu’elles arrivent; le radar complet continue sans bloquer la page.", "The first data appears as soon as it arrives; the full radar continues without blocking the page.")}
                </small>
              </div>
            </div>
          ) : null}

          <section
            className={
              styles.sectionPanel
            }
          >
            <header
              className={
                styles.panelHeader
              }
            >
              <div>
                <span
                  className={
                    styles.eyebrow
                  }
                >
                  {pick(language, "RADAR DES INITIÉS", "INSIDER RADAR")}
                </span>
                <h2>
                  {activeTicker
                    ? pick(language, `Transactions de ${activeTicker}`, `${activeTicker} transactions`)
                    : pick(language, `Mouvements récents — ${insiders.market}`, `Recent activity — ${insiders.market}`)}
                </h2>
              </div>
              <p>
                {insidersLoading
                  ? pick(language, "Analyse en cours…", "Analysis in progress…")
                  : pick(language, `${filteredTrades.length} transactions · ${insiders.scanned_symbols} titres ou dépôts sondés`, `${filteredTrades.length} transactions · ${insiders.scanned_symbols} securities or filings scanned`)}
              </p>
            </header>

            {filteredTrades.length ? (
              <div
                className={
                  styles.tradeTable
                }
              >
                <div
                  className={
                    styles.tradeHeader
                  }
                >
                  <span>
                    {pick(language, "Titre et initié", "Security and insider")}
                  </span>
                  <span>{pick(language, "Opération", "Transaction")}</span>
                  <span>{pick(language, "Actions", "Shares")}</span>
                  <span>{pick(language, "Prix", "Price")}</span>
                  <span>{pick(language, "Valeur", "Value")}</span>
                  <span>{pick(language, "Date", "Date")}</span>
                  <span>{pick(language, "Vérifier", "Verify")}</span>
                </div>

                {filteredTrades.map(
                  (trade) => (
                    <div
                      className={
                        styles.tradeRow
                      }
                      key={trade.id}
                    >
                      <button
                        type="button"
                        className={
                          styles.tradeIdentity
                        }
                        onClick={() =>
                          router.push(
                            `/focus/${encodeURIComponent(
                              trade.ticker,
                            )}`,
                          )
                        }
                      >
                        <span
                          className={
                            styles.symbol
                          }
                        >
                          {trade.ticker ||
                            "N/D"}
                        </span>
                        <span>
                          <strong>
                            {
                              trade.insider_name
                            }
                          </strong>
                          <small>
                            {trade.company}
                            {trade.role
                              ? ` · ${trade.role}`
                              : ""}
                          </small>
                        </span>
                      </button>

                      <span
                        className={tradeClass(
                          trade.transaction_type,
                        )}
                      >
                        <strong>
                          {
                            language === "fr" ? trade.transaction_label : ({ Achat: "Purchase", Vente: "Sale", Attribution: "Grant", Exercice: "Exercise" } as Record<string, string>)[trade.transaction_label] ?? trade.transaction_label
                          }
                        </strong>
                        <small>
                          {trade.transaction_code ||
                            trade.ownership ||
                            pick(language, "Déclaration", "Filing")}
                        </small>
                      </span>

                      <span>
                        {formatNumber(
                          trade.shares,
                          language,
                        )}
                      </span>
                      <span>
                        {formatMoney(
                          trade.price,
                          language,
                        )}
                      </span>
                      <span
                        className={tradeClass(
                          trade.transaction_type,
                        )}
                      >
                        {formatMoney(
                          trade.value,
                          language,
                        )}
                        {trade.unusual ? (
                          <small
                            className={
                              styles.unusual
                            }
                          >
                            {pick(language, "INHABITUELLE", "UNUSUAL")}
                          </small>
                        ) : null}
                      </span>
                      <span>
                        {formatDate(
                          trade.trade_date,
                          language,
                        )}
                      </span>
                      <span
                        className={
                          styles.verificationLinks
                        }
                      >
                        <a
                          href={
                            trade.source_url
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          {pick(language, "Donnée ↗", "Data ↗")}
                        </a>
                        <a
                          href={
                            trade.official_verification_url
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          {pick(language, "Officiel ↗", "Official ↗")}
                        </a>
                      </span>
                    </div>
                  ),
                )}
              </div>
            ) : insidersAwaitingFirstResult ? (
              <div
                className={
                  styles.loadingRows
                }
                aria-hidden="true"
              >
                {Array.from({
                  length: 4,
                }).map((_, index) => (
                  <span key={index} />
                ))}
              </div>
            ) : (
              <div
                className={
                  styles.empty
                }
              >
                <strong>
                  {insiderCoverageUnavailable
                    ? pick(language, "Couverture automatisée indisponible", "Automated coverage unavailable")
                    : pick(language, "Aucune transaction normalisée", "No normalized transaction")}
                </strong>
                <p>
                  {language === "fr" ? insiders.message ?? "Aucune transaction ne correspond aux filtres." : "No transaction matches the filters."}
                </p>
                <div
                  className={
                    styles.emptyActions
                  }
                >
                  <button
                    type="button"
                    disabled={insidersLoading}
                    onClick={() =>
                      void loadInsiders({
                        forceRefresh: true,
                      })
                    }
                  >
                    {pick(language, "Relancer la collecte", "Restart collection")}
                  </button>
                  {insiderMarket ===
                  "canada" ? (
                    <a
                      href="https://www.sedi.ca/sedi/SVTReportsAccessController?locale=fr_CA&menukey=15.03.00"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {pick(language, "Vérifier dans SEDI ↗", "Verify in SEDI ↗")}
                    </a>
                  ) : (
                    <a
                      href="https://www.sec.gov/search-filings"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {pick(language, "Vérifier dans EDGAR ↗", "Verify in EDGAR ↗")}
                    </a>
                  )}
                </div>
              </div>
            )}
          </section>

          <section
            className={
              styles.flowPanel
            }
          >
            <article>
              <span>
                {pick(language, "Achats estimés", "Estimated purchases")}
              </span>
              <strong
                className={
                  styles.positive
                }
              >
                {formatMoney(
                  insiders.summary
                    .buy_value,
                  language,
                )}
              </strong>
            </article>
            <article>
              <span>
                {pick(language, "Ventes estimées", "Estimated sales")}
              </span>
              <strong
                className={
                  styles.negative
                }
              >
                {formatMoney(
                  insiders.summary
                    .sell_value,
                  language,
                )}
              </strong>
            </article>
            <article>
              <span>
                {pick(language, "Attributions et exercices", "Grants and exercises")}
              </span>
              <strong>
                {
                  insiders.summary
                    .grants_and_exercises
                }
              </strong>
            </article>
            <article>
              <span>
                {pick(language, "Transactions inhabituelles", "Unusual transactions")}
              </span>
              <strong>
                {
                  insiders.summary
                    .unusual_transactions
                }
              </strong>
            </article>
          </section>

          <section
            className={
              styles.sourcesPanel
            }
          >
            <header>
              <div>
                <span
                  className={
                    styles.eyebrow
                  }
                >
                  {pick(language, "ÉTAT DES SOURCES", "SOURCE STATUS")}
                </span>
                <h2>
                  {pick(language, "Couverture des initiés", "Insider coverage")}
                </h2>
              </div>
              <span>
                {pick(language, "Les zéros ne sont affichés que lorsque des données ont réellement été observées.", "Zeros are shown only when data has actually been observed.")}
              </span>
            </header>

            <div
              className={
                styles.sourceGrid
              }
            >
              {insiders.sources.map(
                (source) => (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    key={source.source}
                  >
                    <span
                      className={sourceClass(
                        source.status,
                      )}
                    >
                      {source.status ===
                      "available"
                        ? pick(language, "DISPONIBLE", "AVAILABLE")
                        : source.status ===
                            "partial"
                          ? pick(language, "PARTIEL", "PARTIAL")
                          : pick(language, "INDISPONIBLE", "UNAVAILABLE")}
                    </span>
                    <strong>
                      {source.source}
                    </strong>
                    <small>
                      {source.count} {pick(language, "opérations", "transactions")}
                      {source.detail
                        ? ` · ${source.detail}`
                        : ""}
                    </small>
                  </a>
                ),
              )}
            </div>
          </section>

          <footer
            className={
              styles.methodFooter
            }
          >
            {pick(language, "Au Canada, Anatole automatise une source secondaire et fournit le lien de vérification SEDI. Aux États-Unis, les opérations proviennent des formulaires 4 et 4/A de la SEC. Les attributions et exercices sont exclus du flux net achats–ventes.", "In Canada, Anatole automates a secondary source and provides a SEDI verification link. In the United States, transactions come from SEC Forms 4 and 4/A. Grants and exercises are excluded from net purchase-sale flow.")}
          </footer>
        </>
      )}
    </main>
  );
}
