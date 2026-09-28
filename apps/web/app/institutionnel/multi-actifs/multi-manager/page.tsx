import Link from "next/link";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function clean(
  value: string | string[] | undefined,
  maxLength = 500,
): string {
  return first(value).trim().slice(0, maxLength);
}

function numeric(
  value: string | string[] | undefined,
  min = -1000000,
  max = 1000000,
): number | null {
  const raw = first(value).trim().replace(",", ".");
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;

  return Math.min(max, Math.max(min, parsed));
}

type Holding = {
  symbol: string;
  weight: number;
};

type Manager = {
  name: string;
  allocation: number | null;
  feeBps: number | null;
  value: number | null;
  quality: number | null;
  momentum: number | null;
  holdings: Holding[];
};

function parseHoldings(raw: string): Holding[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [symbolRaw, weightRaw] = item.split(":");
      const symbol = (symbolRaw ?? "")
        .trim()
        .toUpperCase()
        .replace(/\.TO$/, "")
        .replace(/[^A-Z0-9.^-]/g, "")
        .slice(0, 15);

      const weight = Number(
        (weightRaw ?? "").trim().replace(",", "."),
      );

      if (!symbol || !Number.isFinite(weight)) return null;

      return {
        symbol,
        weight: Math.min(100, Math.max(0, weight)),
      };
    })
    .filter((item): item is Holding => item !== null)
    .slice(0, 30);
}

function manager(
  p: SearchParams,
  index: number,
): Manager {
  return {
    name:
      clean(p[`manager_${index}`], 80) ||
      `Gestionnaire ${index}`,
    allocation: numeric(
      p[`allocation_${index}`],
      0,
      100,
    ),
    feeBps: numeric(
      p[`fee_${index}`],
      0,
      5000,
    ),
    value: numeric(
      p[`value_${index}`],
      -3,
      3,
    ),
    quality: numeric(
      p[`quality_${index}`],
      -3,
      3,
    ),
    momentum: numeric(
      p[`momentum_${index}`],
      -3,
      3,
    ),
    holdings: parseHoldings(
      clean(p[`holdings_${index}`], 1500),
    ),
  };
}

function signed(
  value: number | null,
  digits = 2,
): string {
  if (value === null) return "N/D";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function pct(
  value: number | null,
  digits = 2,
): string {
  if (value === null) return "N/D";
  return `${value.toFixed(digits)} %`;
}

function bps(
  value: number | null,
): string {
  if (value === null) return "N/D";
  return `${value.toFixed(1)} bps`;
}

function weightedFactor(
  managers: Manager[],
  key: "value" | "quality" | "momentum",
): number | null {
  const valid = managers.filter(
    (item) =>
      item.allocation !== null &&
      item[key] !== null,
  );

  const total = valid.reduce(
    (sum, item) => sum + (item.allocation ?? 0),
    0,
  );

  if (!valid.length || total <= 0) return null;

  return valid.reduce(
    (sum, item) =>
      sum +
      (item.allocation ?? 0) * (item[key] ?? 0),
    0,
  ) / total;
}

export default async function MultiManagerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const p = await searchParams;
  const managers = [1, 2, 3].map((index) =>
    manager(p, index),
  );

  const active = managers.filter(
    (item) =>
      item.allocation !== null ||
      item.holdings.length > 0 ||
      item.feeBps !== null ||
      item.value !== null ||
      item.quality !== null ||
      item.momentum !== null,
  );

  const totalAllocation = active.length
    ? active.reduce(
        (sum, item) => sum + (item.allocation ?? 0),
        0,
      )
    : null;

  const normalizedWeights =
    totalAllocation !== null && totalAllocation > 0
      ? active
          .filter((item) => item.allocation !== null)
          .map(
            (item) =>
              (item.allocation ?? 0) / totalAllocation,
          )
      : [];

  const hhi = normalizedWeights.length
    ? normalizedWeights.reduce(
        (sum, weight) =>
          sum + weight * weight * 10000,
        0,
      )
    : null;

  const effectiveManagers =
    normalizedWeights.length && hhi !== null && hhi > 0
      ? 10000 / hhi
      : null;

  const feeManagers = active.filter(
    (item) =>
      item.allocation !== null &&
      item.feeBps !== null,
  );

  const feeAllocation = feeManagers.reduce(
    (sum, item) => sum + (item.allocation ?? 0),
    0,
  );

  const weightedFee =
    feeManagers.length && feeAllocation > 0
      ? feeManagers.reduce(
          (sum, item) =>
            sum +
            (item.allocation ?? 0) *
              (item.feeBps ?? 0),
          0,
        ) / feeAllocation
      : null;

  const exposureMap = new Map<
    string,
    {
      totalWeight: number;
      managers: string[];
    }
  >();

  for (const item of active) {
    if (item.allocation === null) continue;

    for (const holding of item.holdings) {
      const contribution =
        (item.allocation / 100) * holding.weight;

      const existing = exposureMap.get(
        holding.symbol,
      ) ?? {
        totalWeight: 0,
        managers: [],
      };

      exposureMap.set(holding.symbol, {
        totalWeight:
          existing.totalWeight + contribution,
        managers: [
          ...new Set([
            ...existing.managers,
            item.name,
          ]),
        ],
      });
    }
  }

  const exposures = [...exposureMap.entries()]
    .map(([symbol, data]) => ({
      symbol,
      ...data,
    }))
    .sort(
      (a, b) => b.totalWeight - a.totalWeight,
    );

  const overlaps = exposures.filter(
    (item) => item.managers.length >= 2,
  );

  const overlapExposure = overlaps.length
    ? overlaps.reduce(
        (sum, item) => sum + item.totalWeight,
        0,
      )
    : 0;

  const factorValue = weightedFactor(
    active,
    "value",
  );

  const factorQuality = weightedFactor(
    active,
    "quality",
  );

  const factorMomentum = weightedFactor(
    active,
    "momentum",
  );

  const hasResult = active.length > 0;

  return (
    <main
      className={styles.shell}
      data-testid="institutional-multimanager-center"
    >
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel/multi-actifs">
            ← Multi-Asset
          </Link>

          <span>
            ANATOLE INSTITUTIONAL · MULTI-MANAGER X-RAY
          </span>

          <h1>
            Multi-Manager & Look-Through Lab
          </h1>

          <p>
            Agrège plusieurs mandats saisis par
            l&apos;analyste pour mesurer concentration,
            chevauchements, facteurs, frais et exposition
            finale. V1 ne prétend pas récupérer les
            portefeuilles des gestionnaires automatiquement.
          </p>
        </div>

        <aside>
          <strong>
            Manual mandates, transparent aggregation
          </strong>

          <span>
            Les holdings utilisent le format
            SYMBOLE:POIDS, séparés par des virgules.
            Les résultats viennent uniquement des inputs.
          </span>
        </aside>
      </header>

      <nav className={styles.nav}>
        <Link href="/institutionnel/multi-actifs">
          Multi-Asset →
        </Link>
        <Link href="/etf">
          ETF Intelligence →
        </Link>
        <Link href="/institutionnel/facteurs">
          Factor X-Ray →
        </Link>
        <Link href="/institutionnel/risque">
          Risk Center →
        </Link>
      </nav>

      <section className={styles.states}>
        <article>
          <b>#51 Multi-Manager View</b>
          <span>Bridge V1</span>
          <p>
            Agrégation multi-mandats, concentration,
            facteurs et overlap.
          </p>
        </article>

        <article>
          <b>#52 Fund-of-Funds X-Ray</b>
          <span>Bridge existant</span>
          <p>
            Le look-through ETF/fonds reste relié au
            moteur multi-actifs existant.
          </p>
        </article>

        <article>
          <b>Data ingestion</b>
          <span>À brancher</span>
          <p>
            Les portefeuilles réels devront venir d&apos;un
            PMS, fichier ou connecteur institutionnel.
          </p>
        </article>

        <article>
          <b>Manager analytics</b>
          <span>V1 déterministe</span>
          <p>
            Les scores facteurs sont saisis manuellement,
            pas inférés.
          </p>
        </article>
      </section>

      <section className={styles.panel}>
        <h2>
          Mandats
        </h2>

        <form
          method="get"
          className={styles.form}
        >
          {[1, 2, 3].map((index) => (
            <fieldset
              key={index}
              className={styles.manager}
            >
              <legend>
                Gestionnaire {index}
              </legend>

              <div className={styles.three}>
                <label>
                  Nom
                  <input
                    name={`manager_${index}`}
                    defaultValue={first(
                      p[`manager_${index}`],
                    )}
                    placeholder={`Manager ${index}`}
                  />
                </label>

                <label>
                  Allocation %
                  <input
                    name={`allocation_${index}`}
                    defaultValue={first(
                      p[`allocation_${index}`],
                    )}
                    placeholder="50"
                  />
                </label>

                <label>
                  Frais bps
                  <input
                    name={`fee_${index}`}
                    defaultValue={first(
                      p[`fee_${index}`],
                    )}
                    placeholder="60"
                  />
                </label>
              </div>

              <div className={styles.three}>
                <label>
                  Value [-3,3]
                  <input
                    name={`value_${index}`}
                    defaultValue={first(
                      p[`value_${index}`],
                    )}
                    placeholder="0.5"
                  />
                </label>

                <label>
                  Quality [-3,3]
                  <input
                    name={`quality_${index}`}
                    defaultValue={first(
                      p[`quality_${index}`],
                    )}
                    placeholder="1.0"
                  />
                </label>

                <label>
                  Momentum [-3,3]
                  <input
                    name={`momentum_${index}`}
                    defaultValue={first(
                      p[`momentum_${index}`],
                    )}
                    placeholder="-0.5"
                  />
                </label>
              </div>

              <label>
                Holdings
                <textarea
                  name={`holdings_${index}`}
                  defaultValue={first(
                    p[`holdings_${index}`],
                  )}
                  rows={3}
                  placeholder="RY:20, TD:15, ENB:10"
                />
              </label>
            </fieldset>
          ))}

          <div className={styles.actions}>
            <button type="submit">
              Calculer le X-Ray
            </button>

            <Link href="/institutionnel/multi-actifs/multi-manager">
              Effacer
            </Link>
          </div>
        </form>
      </section>

      {hasResult ? (
        <section
          className={styles.results}
          data-testid="institutional-multimanager-results"
        >
          <article className={styles.panel}>
            <h2>
              Vue portefeuille
            </h2>

            <div className={styles.metrics}>
              <div>
                <span>Allocation saisie</span>
                <b>{pct(totalAllocation)}</b>
              </div>

              <div>
                <span>Frais pondérés</span>
                <b>{bps(weightedFee)}</b>
              </div>

              <div>
                <span>HHI gestionnaires</span>
                <b>
                  {hhi?.toFixed(0) ?? "N/D"}
                </b>
              </div>

              <div>
                <span>Gestionnaires effectifs</span>
                <b>
                  {effectiveManagers?.toFixed(2) ??
                    "N/D"}
                </b>
              </div>

              <div>
                <span>Holdings uniques</span>
                <b>{exposures.length}</b>
              </div>

              <div>
                <span>Overlap</span>
                <b>{pct(overlapExposure)}</b>
              </div>
            </div>
          </article>

          <article className={styles.panel}>
            <h2>
              Facteurs agrégés
            </h2>

            <div className={styles.metrics}>
              <div>
                <span>Value</span>
                <b>{signed(factorValue)}</b>
              </div>

              <div>
                <span>Quality</span>
                <b>{signed(factorQuality)}</b>
              </div>

              <div>
                <span>Momentum</span>
                <b>{signed(factorMomentum)}</b>
              </div>
            </div>

            <p className={styles.note}>
              Chaque score est la moyenne des scores
              gestionnaires pondérée par leur allocation.
            </p>
          </article>

          <article
            className={`${styles.panel} ${styles.full}`}
          >
            <h2>
              Look-through holdings
            </h2>

            {exposures.length ? (
              <div className={styles.table}>
                <div className={styles.head}>
                  <span>Titre</span>
                  <span>Poids final</span>
                  <span>Gestionnaires</span>
                  <span>Overlap</span>
                </div>

                {exposures.map((item) => (
                  <div key={item.symbol}>
                    <b>{item.symbol}</b>
                    <span>
                      {pct(item.totalWeight)}
                    </span>
                    <span>
                      {item.managers.join(" · ")}
                    </span>
                    <strong>
                      {item.managers.length >= 2
                        ? `${item.managers.length}x`
                        : "—"}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.note}>
                Aucun holding parsable.
              </p>
            )}

            <p className={styles.note}>
              Poids final d&apos;un titre = allocation du
              gestionnaire × poids du titre dans ce mandat.
              Les poids non renseignés ne sont pas estimés.
            </p>
          </article>
        </section>
      ) : (
        <section className={styles.empty}>
          <b>
            Aucun mandat défini.
          </b>

          <span>
            Renseigne au moins un gestionnaire pour
            calculer le X-Ray.
          </span>
        </section>
      )}
    </main>
  );
}
