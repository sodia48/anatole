"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
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

  const loadIpo =
    useCallback(async () => {
      const controller =
        new AbortController();

      try {
        const snapshot =
          await getIpoSnapshot(
            controller.signal,
          );
        setIpo(snapshot);
        setIpoError(null);
      } catch (caught) {
        setIpoError(
          caught instanceof Error
            ? caught.message
            : "Le radar IPO est indisponible.",
        );
      } finally {
        setIpoLoading(false);
      }

      return () =>
        controller.abort();
    }, []);

  const loadInsiders =
    useCallback(async () => {
      const controller =
        new AbortController();

      try {
        const snapshot =
          await getInsiderSnapshot(
            {
              market: insiderMarket,
              ticker:
                activeTicker ||
                undefined,
              days: insiderDays,
              scanLimit:
                activeTicker
                  ? 25
                  : 16,
            },
            controller.signal,
          );
        setInsiders(snapshot);
        setInsidersError(null);
      } catch (caught) {
        setInsidersError(
          caught instanceof Error
            ? caught.message
            : "Le radar d’initiés est indisponible.",
        );
      } finally {
        setInsidersLoading(false);
      }

      return () =>
        controller.abort();
    }, [
      activeTicker,
      insiderDays,
      insiderMarket,
    ]);

  useEffect(() => {
    void loadIpo();
  }, [loadIpo]);

  useEffect(() => {
    void loadInsiders();
  }, [loadInsiders]);

  useEffect(() => {
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
    ipo.refresh_after_seconds,
    loadIpo,
  ]);

  useEffect(() => {
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

  function submitTicker(
    event: FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();
    setInsidersLoading(true);
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
              {
                insiders.summary
                  .transactions
              }
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
            setTab("ipo")
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
            setTab("insiders")
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
              {ipoError} Les dernières
              données chargées restent
              affichées.
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
                {
                  insiders.summary
                    .transactions
                }
              </strong>
            </article>
            <article>
              <span>Achats</span>
              <strong
                className={
                  styles.positive
                }
              >
                {
                  insiders.summary
                    .buys
                }
              </strong>
            </article>
            <article>
              <span>Ventes</span>
              <strong
                className={
                  styles.negative
                }
              >
                {
                  insiders.summary
                    .sells
                }
              </strong>
            </article>
            <article>
              <span>
                Ratio d’achats
              </span>
              <strong>
                {insiders.summary.buy_ratio_percent.toFixed(
                  0,
                )}
                %
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
                {formatMoney(
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
                    setInsidersLoading(
                      true,
                    );
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
                  setInsidersLoading(
                    true,
                  );
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
                  setInsidersLoading(
                    true,
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
              {insidersError} Les
              dernières données chargées
              restent affichées.
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
            ) : (
              <div
                className={
                  styles.empty
                }
              >
                {insiders.message ??
                  "Aucune transaction ne correspond aux filtres."}
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
