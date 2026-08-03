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
): string {
  if (!value) return "À confirmer";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(date);
}

function formatNumber(
  value: number | null,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "N/D";
  }

  return new Intl.NumberFormat("fr-CA", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMoney(
  value: number | null,
): string {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "N/D";
  }

  return new Intl.NumberFormat("fr-CA", {
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
): string {
  const currency =
    item.offer_currency ||
    (item.country === "Canada"
      ? "CAD"
      : "USD");

  const format = (value: number): string =>
    new Intl.NumberFormat("fr-CA", {
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

  return "Non publié";
}

function ipoPriceCaption(item: IpoItem): string {
  if (item.offer_price_status === "range") {
    return "Fourchette indicative";
  }

  if (item.offer_price_status === "reference") {
    return "Prix de référence";
  }

  if (item.offer_price_status === "final") {
    return "Prix IPO final";
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
            caught instanceof Error
              ? caught.message
              : "Le radar IPO est indisponible.",
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
    [],
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
            caught instanceof Error
              ? caught.message
              : "Le radar d’initiés est indisponible.",
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
    ],
  );

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  /*
   * Charger uniquement l’onglet visible. Le montage précédent lançait IPO et
   * un balayage de 24 à 40 titres en même temps.
   */
  useEffect(() => {
    if (tab === "ipo") {
      void loadIpo();

      return () => {
        ipoAbortRef.current?.abort();
      };
    }

    void loadInsiders();

    return () => {
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
      ? "Aperçu rapide…"
      : insidersLoadStage === "enriching"
        ? "Analyse étendue en cours…"
        : insidersRefreshing
          ? "Actualisation en arrière-plan…"
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
            MARCHÉS PRIMAIRES &
            GOUVERNANCE
          </span>
          <h1>
            IPO & transactions
            d’initiés
          </h1>
          <p>
            Nouvelles inscriptions
            canadiennes, dépôts
            réglementaires américains
            et mouvements d’initiés à
            vérifier dans les registres
            officiels.
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
              sociétés dans le radar
              IPO
            </span>
          </div>
          <div>
            <strong>
              {insidersAwaitingFirstResult
                ? "…"
                : insiderCoverageUnavailable
                  ? "Indisponible"
                  : insiders.summary
                      .transactions}
            </strong>
            <span>
              transactions détectées
            </span>
          </div>
        </div>
      </section>

      <nav
        className={styles.mainTabs}
        aria-label="Sections IPO et initiés"
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
            Inscriptions et pipeline
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
          <span>Initiés</span>
          <small>
            Achats, ventes et
            attributions
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
              <span>Événements</span>
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
                États-Unis
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
                Nouvelles inscriptions
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
                Dépôts réglementaires
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
                placeholder="Société, symbole, bourse ou statut"
                aria-label="Rechercher dans le radar IPO"
              />
            </label>

            <label
              className={
                styles.selectField
              }
            >
              <span>PAYS</span>
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
                  Canada + États-Unis
                </option>
                <option value="Canada">
                  Canada
                </option>
                <option value="États-Unis">
                  États-Unis
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
                  Sociétés seulement
                </option>
                <option value="all">
                  Tous les instruments
                </option>
                <option value="etf">
                  ETF
                </option>
                <option value="cdr">
                  CDR
                </option>
                <option value="fund">
                  Fonds
                </option>
                <option value="other">
                  Autres
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
                {ipoError} Les dernières
                données chargées restent
                affichées.
              </span>
              <button
                type="button"
                onClick={() =>
                  void loadIpo({
                    forceRefresh: true,
                  })
                }
              >
                Réessayer
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
                  Nouvelles inscriptions
                  et dépôts
                </h2>
              </div>
              <p>
                {ipoLoading
                  ? "Mise à jour…"
                  : `${filteredIpos.length} événements affichés`}
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
                          {item.status}
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
                          {item.country}
                        </span>
                        <span>
                          {item.exchange}
                        </span>
                        <span>
                          {
                            item.instrument_label
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
                            item.event_type
                          }
                        </span>
                        <strong>
                          {formatDate(
                            item.event_date,
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
                          {ipoPriceCaption(item)}
                        </span>
                        <strong>
                          {formatIpoPrice(item)}
                        </strong>
                        <small>
                          {item.offer_price_status ===
                          "not_published"
                            ? "Le prospectus ne publie pas encore de prix."
                            : item.offer_price_status ===
                                "range"
                              ? "Le prix final peut encore changer."
                              : "Prix extrait du document officiel."}
                        </small>
                      </div>

                      <div
                        className={
                          styles.confidence
                        }
                      >
                        <span>
                          Confiance de la
                          donnée
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
                            Ouvrir Focus
                          </button>
                        ) : (
                          <span>
                            Pipeline à confirmer
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
                          Source officielle ↗
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
                Aucun événement ne
                correspond aux filtres.
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
                  ÉTAT DES SOURCES
                </span>
                <h2>
                  Couverture officielle
                </h2>
              </div>
              <span>
                Actualisation toutes les
                30 minutes
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
                        ? "DISPONIBLE"
                        : source.status ===
                            "partial"
                          ? "PARTIEL"
                          : "INDISPONIBLE"}
                    </span>
                    <strong>
                      {source.source}
                    </strong>
                    <small>
                      {source.count} éléments
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
                  ? "Analyse…"
                  : insiderCoverageUnavailable
                    ? "Indisponible"
                    : insiders.summary
                        .transactions}
              </strong>
            </article>
            <article>
              <span>Achats</span>
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
              <span>Ventes</span>
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
                Ratio d’achats
              </span>
              <strong>
                {insidersAwaitingFirstResult
                  ? "…"
                  : insiderCoverageUnavailable
                    ? "Indisponible"
                    : `${insiders.summary.buy_ratio_percent.toFixed(
                        0,
                      )}%`}
              </strong>
            </article>
            <article>
              <span>
                Flux net estimé
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
                    ? "Indisponible"
                    : formatMoney(
                        insiders.summary
                          .net_value,
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
                  ANALYSE PAR TITRE
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
                Analyser
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
                  Retour au radar
                </button>
              ) : null}
            </form>

            <label
              className={
                styles.selectField
              }
            >
              <span>MARCHÉ</span>
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
                  États-Unis — SEC
                </option>
              </select>
            </label>

            <label
              className={
                styles.selectField
              }
            >
              <span>PÉRIODE</span>
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
                  30 jours
                </option>
                <option value={90}>
                  90 jours
                </option>
                <option value={180}>
                  180 jours
                </option>
                <option value={365}>
                  1 an
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
                  Toutes
                </option>
                <option value="buy">
                  Achats
                </option>
                <option value="sell">
                  Ventes
                </option>
                <option value="grant">
                  Attributions
                </option>
                <option value="exercise">
                  Exercices
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
                {insidersError} Les
                dernières données chargées
                restent affichées.
              </span>
              <button
                type="button"
                onClick={() =>
                  void loadInsiders({
                    forceRefresh: true,
                  })
                }
              >
                Réessayer
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
                  Les premières données sont
                  affichées dès qu’elles arrivent;
                  le radar complet continue sans
                  bloquer la page.
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
                  RADAR DES INITIÉS
                </span>
                <h2>
                  {activeTicker
                    ? `Transactions de ${activeTicker}`
                    : `Mouvements récents — ${insiders.market}`}
                </h2>
              </div>
              <p>
                {insidersLoading
                  ? "Analyse en cours…"
                  : `${filteredTrades.length} transactions · ${insiders.scanned_symbols} titres ou dépôts sondés`}
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
                    Titre et initié
                  </span>
                  <span>Opération</span>
                  <span>Actions</span>
                  <span>Prix</span>
                  <span>Valeur</span>
                  <span>Date</span>
                  <span>Vérifier</span>
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
                            trade.transaction_label
                          }
                        </strong>
                        <small>
                          {trade.transaction_code ||
                            trade.ownership ||
                            "Déclaration"}
                        </small>
                      </span>

                      <span>
                        {formatNumber(
                          trade.shares,
                        )}
                      </span>
                      <span>
                        {formatMoney(
                          trade.price,
                        )}
                      </span>
                      <span
                        className={tradeClass(
                          trade.transaction_type,
                        )}
                      >
                        {formatMoney(
                          trade.value,
                        )}
                        {trade.unusual ? (
                          <small
                            className={
                              styles.unusual
                            }
                          >
                            INHABITUELLE
                          </small>
                        ) : null}
                      </span>
                      <span>
                        {formatDate(
                          trade.trade_date,
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
                          Donnée ↗
                        </a>
                        <a
                          href={
                            trade.official_verification_url
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          Officiel ↗
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
                    ? "Couverture automatisée indisponible"
                    : "Aucune transaction normalisée"}
                </strong>
                <p>
                  {insiders.message ??
                    "Aucune transaction ne correspond aux filtres."}
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
                    Relancer la collecte
                  </button>
                  {insiderMarket ===
                  "canada" ? (
                    <a
                      href="https://www.sedi.ca/sedi/SVTReportsAccessController?locale=fr_CA&menukey=15.03.00"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Vérifier dans SEDI ↗
                    </a>
                  ) : (
                    <a
                      href="https://www.sec.gov/search-filings"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Vérifier dans EDGAR ↗
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
                Achats estimés
              </span>
              <strong
                className={
                  styles.positive
                }
              >
                {formatMoney(
                  insiders.summary
                    .buy_value,
                )}
              </strong>
            </article>
            <article>
              <span>
                Ventes estimées
              </span>
              <strong
                className={
                  styles.negative
                }
              >
                {formatMoney(
                  insiders.summary
                    .sell_value,
                )}
              </strong>
            </article>
            <article>
              <span>
                Attributions et exercices
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
                Transactions inhabituelles
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
                  ÉTAT DES SOURCES
                </span>
                <h2>
                  Couverture des initiés
                </h2>
              </div>
              <span>
                Les zéros ne sont affichés
                que lorsque des données ont
                réellement été observées.
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
                        ? "DISPONIBLE"
                        : source.status ===
                            "partial"
                          ? "PARTIEL"
                          : "INDISPONIBLE"}
                    </span>
                    <strong>
                      {source.source}
                    </strong>
                    <small>
                      {source.count} opérations
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
            Au Canada, Anatole
            automatise une source
            secondaire et fournit le
            lien de vérification SEDI.
            Aux États-Unis, les
            opérations proviennent des
            formulaires 4 et 4/A de la
            SEC. Les attributions et
            exercices sont exclus du
            flux net achats–ventes.
          </footer>
        </>
      )}
    </main>
  );
}
