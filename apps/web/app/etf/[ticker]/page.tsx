"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  type EtfHoldingDriver,
  type EtfHoldingsSnapshot,
  getEtfHoldings,
} from "../../../lib/etf-holdings-api";

import styles from "./page.module.css";

function formatPercent(
  value: number | null,
  digits = 2,
): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/D";
  }

  return `${
    value > 0 ? "+" : ""
  }${value.toFixed(digits)} %`;
}

function formatContribution(
  value: number | null,
): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/D";
  }

  return `${
    value > 0 ? "+" : ""
  }${value.toFixed(3)} pt`;
}

function formatMoney(
  value: number | null,
  currency = "CAD",
): string {
  if (value === null || !(value > 0)) {
    return "N/D";
  }

  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function contributionClass(
  value: number | null,
): string {
  if (value === null || Math.abs(value) < 0.0005) {
    return styles.neutral;
  }

  return value > 0
    ? styles.positive
    : styles.negative;
}

function holdingDestination(
  holding: EtfHoldingDriver,
): string {
  return holding.instrument_type === "etf"
    ? `/etf/${encodeURIComponent(
        holding.display_symbol,
      )}`
    : `/focus/${encodeURIComponent(
        holding.display_symbol,
      )}`;
}

export default function EtfHoldingsPage() {
  const params = useParams<{
    ticker: string;
  }>();
  const router = useRouter();
  const ticker = decodeURIComponent(
    params.ticker ?? "",
  ).toUpperCase();

  const [snapshot, setSnapshot] =
    useState<EtfHoldingsSnapshot | null>(
      null,
    );
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ticker) {
      return;
    }

    const controller =
      new AbortController();

    try {
      const next =
        await getEtfHoldings(
          ticker,
          controller.signal,
        );

      setSnapshot(next);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Les positions de cet ETF sont indisponibles.",
      );
    } finally {
      setLoading(false);
    }

    return () =>
      controller.abort();
  }, [ticker]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const seconds =
      snapshot?.refresh_after_seconds ??
      30;
    const interval =
      window.setInterval(
        () => void load(),
        Math.max(
          seconds,
          30,
        ) * 1000,
      );

    return () =>
      window.clearInterval(interval);
  }, [
    load,
    snapshot?.refresh_after_seconds,
  ]);

  const maxWeight = useMemo(
    () =>
      Math.max(
        1,
        ...(snapshot?.holdings.map(
          (holding) =>
            holding.weight_percent,
        ) ?? []),
      ),
    [snapshot?.holdings],
  );

  if (
    loading &&
    snapshot === null
  ) {
    return (
      <main className={styles.page}>
        <section
          className={styles.loadingPanel}
        >
          <span
            className={styles.liveDot}
          />
          <div>
            <h1>
              Chargement des positions
              de {ticker}
            </h1>
            <p>
              Anatole récupère les
              principales participations
              du fonds.
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (
    snapshot === null
  ) {
    return (
      <main className={styles.page}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() =>
            router.push("/etf")
          }
        >
          ← Retour aux ETF
        </button>
        <section
          className={styles.errorPanel}
        >
          <h1>
            Positions indisponibles
          </h1>
          <p>
            {error ??
              "Impossible de charger cet ETF."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div
        className={styles.topActions}
      >
        <button
          type="button"
          className={styles.backButton}
          onClick={() =>
            router.push("/etf")
          }
        >
          ← Carte des ETF
        </button>

        <div
          className={styles.liveStatus}
        >
          <span
            className={styles.liveDot}
          />
          <strong>LIVE</strong>
          <span>
            actualisation automatique
          </span>
        </div>
      </div>

      <section className={styles.hero}>
        <div>
          <div
            className={styles.identity}
          >
            <span
              className={styles.ticker}
            >
              {snapshot.ticker}
            </span>
            <div>
              <h1>{snapshot.name}</h1>
              <p>
                {snapshot.provider} ·{" "}
                {snapshot.category}
              </p>
            </div>
          </div>

          <p
            className={styles.exposure}
          >
            {snapshot.exposure}
          </p>
        </div>

        <div
          className={styles.heroQuote}
        >
          <strong>
            {formatMoney(
              snapshot.price,
              snapshot.currency,
            )}
          </strong>
          <span
            className={contributionClass(
              snapshot.change_percent,
            )}
          >
            {formatPercent(
              snapshot.change_percent,
            )}
          </span>
          <small>
            Donnée potentiellement
            différée
          </small>
        </div>
      </section>

      {error ? (
        <div
          className={styles.warning}
        >
          {error} Les dernières données
          chargées restent affichées.
        </div>
      ) : null}

      <section
        className={styles.metrics}
      >
        <article>
          <span>
            Poids des principales
            positions
          </span>
          <strong>
            {snapshot.top_holdings_weight_percent.toFixed(
              1,
            )}
            %
          </strong>
        </article>

        <article>
          <span>
            Contribution nette estimée
          </span>
          <strong
            className={contributionClass(
              snapshot.net_driver_contribution_percent_points,
            )}
          >
            {formatContribution(
              snapshot.net_driver_contribution_percent_points,
            )}
          </strong>
        </article>

        <article>
          <span>
            Positions avec cotation
          </span>
          <strong>
            {snapshot.quoted_holdings}/
            {
              snapshot.total_holdings_returned
            }
          </strong>
        </article>

        <article>
          <span>
            Moteurs positifs / négatifs
          </span>
          <strong>
            <b
              className={
                styles.positive
              }
            >
              {formatContribution(
                snapshot.positive_driver_contribution_percent_points,
              )}
            </b>
            {" · "}
            <b
              className={
                styles.negative
              }
            >
              {formatContribution(
                snapshot.negative_driver_contribution_percent_points,
              )}
            </b>
          </strong>
        </article>
      </section>

      <section
        className={styles.mainGrid}
      >
        <article
          className={styles.holdingsPanel}
        >
          <header
            className={styles.panelHeader}
          >
            <div>
              <span
                className={styles.eyebrow}
              >
                POSITIONS MOTRICES
              </span>
              <h2>
                Principales
                participations
              </h2>
            </div>
            <p>
              Participation dans l’ETF
              et contribution estimée à
              la séance
            </p>
          </header>

          {snapshot.holdings.length ? (
            <div
              className={
                styles.holdingsTable
              }
            >
              <div
                className={
                  styles.tableHeader
                }
              >
                <span>Position</span>
                <span>Participation</span>
                <span>Variation</span>
                <span>Contribution</span>
              </div>

              {snapshot.holdings.map(
                (holding) => (
                  <button
                    type="button"
                    key={`${holding.rank}-${holding.symbol}`}
                    className={
                      styles.holdingRow
                    }
                    onClick={() =>
                      router.push(
                        holdingDestination(
                          holding,
                        ),
                      )
                    }
                  >
                    <span
                      className={
                        styles.holdingIdentity
                      }
                    >
                      <b>
                        {holding.rank}
                      </b>
                      <span
                        className={
                          styles.symbol
                        }
                      >
                        {
                          holding.display_symbol
                        }
                      </span>
                      <span>
                        <strong>
                          {holding.name}
                        </strong>
                        <small>
                          {holding.instrument_type ===
                          "etf"
                            ? "ETF sous-jacent"
                            : "Action"}
                        </small>
                      </span>
                    </span>

                    <span
                      className={
                        styles.weightCell
                      }
                    >
                      <strong>
                        {holding.weight_percent.toFixed(
                          2,
                        )}
                        %
                      </strong>
                      <span
                        className={
                          styles.weightTrack
                        }
                      >
                        <i
                          style={{
                            width: `${Math.max(
                              2,
                              holding.weight_percent /
                                maxWeight *
                                100,
                            )}%`,
                          }}
                        />
                      </span>
                    </span>

                    <span
                      className={contributionClass(
                        holding.change_percent,
                      )}
                    >
                      {formatPercent(
                        holding.change_percent,
                      )}
                    </span>

                    <span
                      className={contributionClass(
                        holding.contribution_percent_points,
                      )}
                    >
                      {formatContribution(
                        holding.contribution_percent_points,
                      )}
                    </span>
                  </button>
                ),
              )}
            </div>
          ) : (
            <div
              className={styles.empty}
            >
              Aucune position détaillée
              n’est disponible pour cet
              ETF.
            </div>
          )}
        </article>

        <aside
          className={styles.sideColumn}
        >
          <article
            className={styles.sidePanel}
          >
            <span
              className={styles.eyebrow}
            >
              ALLOCATION
            </span>
            <h2>
              Répartition sectorielle
            </h2>

            <div
              className={
                styles.allocationList
              }
            >
              {snapshot.sectors
                .slice(0, 10)
                .map((sector) => (
                  <div
                    key={sector.key}
                  >
                    <span>
                      <b>
                        {sector.label}
                      </b>
                      <strong>
                        {sector.weight_percent.toFixed(
                          1,
                        )}
                        %
                      </strong>
                    </span>
                    <i>
                      <em
                        style={{
                          width: `${Math.min(
                            sector.weight_percent,
                            100,
                          )}%`,
                        }}
                      />
                    </i>
                  </div>
                ))}
            </div>

            {!snapshot.sectors.length ? (
              <p
                className={
                  styles.muted
                }
              >
                La répartition
                sectorielle n’est pas
                publiée pour ce fonds.
              </p>
            ) : null}
          </article>

          <article
            className={styles.sidePanel}
          >
            <span
              className={styles.eyebrow}
            >
              CLASSES D’ACTIFS
            </span>
            <h2>
              Composition globale
            </h2>

            <div
              className={
                styles.assetGrid
              }
            >
              {snapshot.asset_classes.map(
                (asset) => (
                  <div
                    key={asset.key}
                  >
                    <span>
                      {asset.label}
                    </span>
                    <strong>
                      {asset.weight_percent.toFixed(
                        1,
                      )}
                      %
                    </strong>
                  </div>
                ),
              )}
            </div>

            {!snapshot.asset_classes
              .length ? (
              <p
                className={
                  styles.muted
                }
              >
                La composition par
                classe d’actifs n’est
                pas publiée.
              </p>
            ) : null}
          </article>
        </aside>
      </section>

      {snapshot.description ? (
        <section
          className={styles.description}
        >
          <span
            className={styles.eyebrow}
          >
            MANDAT DU FONDS
          </span>
          <h2>À propos de l’ETF</h2>
          <p>
            {snapshot.description}
          </p>
        </section>
      ) : null}

      <footer
        className={styles.footer}
      >
        Source :{" "}
        {snapshot.source_url ? (
          <a
            href={snapshot.source_url}
            target="_blank"
            rel="noreferrer"
          >
            {snapshot.source_name}
          </a>
        ) : (
          snapshot.source_name
        )}
        {" · "}
        Mise à jour :{" "}
        {new Intl.DateTimeFormat(
          "fr-CA",
          {
            dateStyle: "medium",
            timeStyle: "medium",
          },
        ).format(
          new Date(
            snapshot.generated_at,
          ),
        )}
        {" · "}
        La contribution est une
        approximation fondée sur le
        poids publié et la variation de
        séance.
      </footer>
    </main>
  );
}
