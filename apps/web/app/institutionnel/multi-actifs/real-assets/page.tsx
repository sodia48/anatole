import Link from "next/link";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function clean(
  value: string | string[] | undefined,
  maxLength = 120,
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

function pct(value: number | null, digits = 2): string {
  if (value === null) return "N/D";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)} %`;
}

function score(value: number | null, digits = 2): string {
  if (value === null) return "N/D";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

type Asset = {
  symbol: string;
  category: string;
  role: string;
  weight: number | null;
  oil: number | null;
  copper: number | null;
  gold: number | null;
  lithium: number | null;
  inflation: number | null;
};

function asset(
  p: SearchParams,
  index: number,
): Asset {
  const rawCategory = clean(p[`category_${index}`], 24);
  const rawRole = clean(p[`role_${index}`], 24);

  return {
    symbol: clean(p[`symbol_${index}`], 15)
      .toUpperCase()
      .replace(/\.TO$/, "")
      .replace(/[^A-Z0-9.^-]/g, ""),
    category:
      rawCategory ||
      "resources",
    role:
      rawRole ||
      "sensitive",
    weight: numeric(p[`weight_${index}`], 0, 100),
    oil: numeric(p[`oil_${index}`], -10, 10),
    copper: numeric(p[`copper_${index}`], -10, 10),
    gold: numeric(p[`gold_${index}`], -10, 10),
    lithium: numeric(p[`lithium_${index}`], -10, 10),
    inflation: numeric(p[`inflation_${index}`], -10, 10),
  };
}

function weightedSensitivity(
  assets: Asset[],
  key: "oil" | "copper" | "gold" | "lithium" | "inflation",
): number | null {
  const valid = assets.filter(
    (item) =>
      item.weight !== null &&
      item[key] !== null,
  );

  if (!valid.length) return null;

  return valid.reduce(
    (sum, item) =>
      sum +
      ((item.weight ?? 0) / 100) *
        (item[key] ?? 0),
    0,
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  energy: "Énergie",
  resources: "Ressources",
  infrastructure: "Infrastructure",
  realestate: "Immobilier",
  agriculture: "Agriculture",
};

const ROLE_LABELS: Record<string, string> = {
  producer: "Producteur",
  consumer: "Consommateur",
  infrastructure: "Infrastructure",
  realasset: "Actif réel",
  sensitive: "Sensible",
};

const FACTORS = [
  ["oil", "Pétrole"],
  ["copper", "Cuivre"],
  ["gold", "Or"],
  ["lithium", "Lithium"],
  ["inflation", "Inflation"],
] as const;

export default async function RealAssetsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const p = await searchParams;

  const assets = [1, 2, 3, 4].map((index) =>
    asset(p, index),
  );

  const active = assets.filter(
    (item) =>
      item.symbol ||
      item.weight !== null ||
      FACTORS.some(([key]) => item[key] !== null),
  );

  const shocks = {
    oil: numeric(p.shock_oil, -100, 100),
    copper: numeric(p.shock_copper, -100, 100),
    gold: numeric(p.shock_gold, -100, 100),
    lithium: numeric(p.shock_lithium, -100, 100),
    inflation: numeric(p.shock_inflation, -100, 100),
  };

  const totalWeight = active.length
    ? active.reduce(
        (sum, item) => sum + (item.weight ?? 0),
        0,
      )
    : null;

  const sensitivities = {
    oil: weightedSensitivity(active, "oil"),
    copper: weightedSensitivity(active, "copper"),
    gold: weightedSensitivity(active, "gold"),
    lithium: weightedSensitivity(active, "lithium"),
    inflation: weightedSensitivity(active, "inflation"),
  };

  const contributions = {
    oil:
      sensitivities.oil !== null &&
      shocks.oil !== null
        ? sensitivities.oil * shocks.oil
        : null,
    copper:
      sensitivities.copper !== null &&
      shocks.copper !== null
        ? sensitivities.copper * shocks.copper
        : null,
    gold:
      sensitivities.gold !== null &&
      shocks.gold !== null
        ? sensitivities.gold * shocks.gold
        : null,
    lithium:
      sensitivities.lithium !== null &&
      shocks.lithium !== null
        ? sensitivities.lithium * shocks.lithium
        : null,
    inflation:
      sensitivities.inflation !== null &&
      shocks.inflation !== null
        ? sensitivities.inflation * shocks.inflation
        : null,
  };

  const scenarioParts = Object.values(
    contributions,
  ).filter(
    (value): value is number => value !== null,
  );

  const scenarioImpact =
    scenarioParts.length
      ? scenarioParts.reduce(
          (sum, value) => sum + value,
          0,
        )
      : null;

  const categoryMap = new Map<string, number>();

  for (const item of active) {
    if (item.weight === null) continue;

    categoryMap.set(
      item.category,
      (categoryMap.get(item.category) ?? 0) +
        item.weight,
    );
  }

  const categories = [...categoryMap.entries()]
    .map(([category, weight]) => ({
      category,
      weight,
    }))
    .sort((a, b) => b.weight - a.weight);

  const edges = active.flatMap((item) =>
    FACTORS.flatMap(([key, label]) => {
      const beta = item[key];

      if (beta === null || beta === 0) {
        return [];
      }

      return [
        {
          symbol: item.symbol || "N/D",
          role: item.role,
          factor: label,
          beta,
        },
      ];
    }),
  );

  const hasResult =
    active.length > 0 ||
    Object.values(shocks).some(
      (value) => value !== null,
    );

  return (
    <main
      className={styles.shell}
      data-testid="institutional-real-assets-center"
    >
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel/multi-actifs">
            ← Multi-Asset
          </Link>

          <span>
            ANATOLE INSTITUTIONAL · REAL ASSETS & COMMODITIES
          </span>

          <h1>
            Real Assets & Commodity Exposure Lab
          </h1>

          <p>
            Relie positions, catégories d&apos;actifs
            réels et sensibilités aux matières premières.
            Les scénarios utilisent uniquement les poids,
            sensibilités et chocs saisis; aucun bêta
            propriétaire ou prix live n&apos;est inventé.
          </p>
        </div>

        <aside>
          <strong>
            Exposure graph, not a price forecast
          </strong>

          <span>
            Une sensibilité positive ou négative décrit
            une hypothèse analyste, pas une prévision de
            rendement ni une recommandation.
          </span>
        </aside>
      </header>

      <nav className={styles.nav}>
        <Link href="/institutionnel/multi-actifs">
          Multi-Asset →
        </Link>
        <Link href="/institutionnel/macro">
          Macro →
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
          <b>#58 Commodity Exposure Graph</b>
          <span>Bridge V1</span>
          <p>
            Les liens titre → matière première sont
            explicites et traçables.
          </p>
        </article>

        <article>
          <b>#59 Real Assets Intelligence</b>
          <span>Bridge V1</span>
          <p>
            Les poids énergie, ressources,
            infrastructure et immobilier sont consolidés.
          </p>
        </article>

        <article>
          <b>Commodity prices</b>
          <span>Non branchés</span>
          <p>
            Les scénarios utilisent des chocs saisis,
            pas des prix ou prévisions inventés.
          </p>
        </article>

        <article>
          <b>Sensitivities</b>
          <span>Inputs analyste</span>
          <p>
            Les coefficients ne sont pas estimés
            automatiquement en V1.
          </p>
        </article>
      </section>

      <section className={styles.panel}>
        <h2>
          Chocs scénario
        </h2>

        <form
          method="get"
          className={styles.form}
        >
          <div className={styles.five}>
            <label>
              Pétrole %
              <input
                name="shock_oil"
                defaultValue={first(p.shock_oil)}
                placeholder="10"
              />
            </label>

            <label>
              Cuivre %
              <input
                name="shock_copper"
                defaultValue={first(p.shock_copper)}
                placeholder="5"
              />
            </label>

            <label>
              Or %
              <input
                name="shock_gold"
                defaultValue={first(p.shock_gold)}
                placeholder="-3"
              />
            </label>

            <label>
              Lithium %
              <input
                name="shock_lithium"
                defaultValue={first(p.shock_lithium)}
                placeholder="12"
              />
            </label>

            <label>
              Inflation pp
              <input
                name="shock_inflation"
                defaultValue={first(
                  p.shock_inflation,
                )}
                placeholder="2"
              />
            </label>
          </div>

          {[1, 2, 3, 4].map((index) => (
            <fieldset
              key={index}
              className={styles.asset}
            >
              <legend>
                Actif {index}
              </legend>

              <div className={styles.four}>
                <label>
                  Titre
                  <input
                    name={`symbol_${index}`}
                    defaultValue={first(
                      p[`symbol_${index}`],
                    )}
                    placeholder="ENB"
                  />
                </label>

                <label>
                  Catégorie
                  <select
                    name={`category_${index}`}
                    defaultValue={
                      first(
                        p[`category_${index}`],
                      ) || "resources"
                    }
                  >
                    <option value="energy">
                      Énergie
                    </option>
                    <option value="resources">
                      Ressources
                    </option>
                    <option value="infrastructure">
                      Infrastructure
                    </option>
                    <option value="realestate">
                      Immobilier
                    </option>
                    <option value="agriculture">
                      Agriculture
                    </option>
                  </select>
                </label>

                <label>
                  Rôle
                  <select
                    name={`role_${index}`}
                    defaultValue={
                      first(p[`role_${index}`]) ||
                      "sensitive"
                    }
                  >
                    <option value="producer">
                      Producteur
                    </option>
                    <option value="consumer">
                      Consommateur
                    </option>
                    <option value="infrastructure">
                      Infrastructure
                    </option>
                    <option value="realasset">
                      Actif réel
                    </option>
                    <option value="sensitive">
                      Sensible
                    </option>
                  </select>
                </label>

                <label>
                  Poids %
                  <input
                    name={`weight_${index}`}
                    defaultValue={first(
                      p[`weight_${index}`],
                    )}
                    placeholder="25"
                  />
                </label>
              </div>

              <div className={styles.five}>
                <label>
                  β pétrole
                  <input
                    name={`oil_${index}`}
                    defaultValue={first(
                      p[`oil_${index}`],
                    )}
                    placeholder="1.0"
                  />
                </label>

                <label>
                  β cuivre
                  <input
                    name={`copper_${index}`}
                    defaultValue={first(
                      p[`copper_${index}`],
                    )}
                    placeholder="0"
                  />
                </label>

                <label>
                  β or
                  <input
                    name={`gold_${index}`}
                    defaultValue={first(
                      p[`gold_${index}`],
                    )}
                    placeholder="0"
                  />
                </label>

                <label>
                  β lithium
                  <input
                    name={`lithium_${index}`}
                    defaultValue={first(
                      p[`lithium_${index}`],
                    )}
                    placeholder="0"
                  />
                </label>

                <label>
                  β inflation
                  <input
                    name={`inflation_${index}`}
                    defaultValue={first(
                      p[`inflation_${index}`],
                    )}
                    placeholder="0.5"
                  />
                </label>
              </div>
            </fieldset>
          ))}

          <div className={styles.actions}>
            <button type="submit">
              Calculer les expositions
            </button>

            <Link href="/institutionnel/multi-actifs/real-assets">
              Effacer
            </Link>
          </div>
        </form>
      </section>

      {hasResult ? (
        <section
          className={styles.results}
          data-testid="institutional-real-assets-results"
        >
          <article className={styles.panel}>
            <h2>
              Sensibilités portefeuille
            </h2>

            <div className={styles.metrics}>
              <div>
                <span>Pétrole</span>
                <b>{score(sensitivities.oil)}</b>
              </div>

              <div>
                <span>Cuivre</span>
                <b>{score(sensitivities.copper)}</b>
              </div>

              <div>
                <span>Or</span>
                <b>{score(sensitivities.gold)}</b>
              </div>

              <div>
                <span>Lithium</span>
                <b>{score(sensitivities.lithium)}</b>
              </div>

              <div>
                <span>Inflation</span>
                <b>
                  {score(
                    sensitivities.inflation,
                  )}
                </b>
              </div>

              <div>
                <span>Poids saisis</span>
                <b>{pct(totalWeight)}</b>
              </div>
            </div>
          </article>

          <article className={styles.panel}>
            <h2>
              Impact du scénario
            </h2>

            <div className={styles.metrics}>
              <div>
                <span>Pétrole</span>
                <b>{pct(contributions.oil)}</b>
              </div>

              <div>
                <span>Cuivre</span>
                <b>{pct(contributions.copper)}</b>
              </div>

              <div>
                <span>Or</span>
                <b>{pct(contributions.gold)}</b>
              </div>

              <div>
                <span>Lithium</span>
                <b>
                  {pct(contributions.lithium)}
                </b>
              </div>

              <div>
                <span>Inflation</span>
                <b>
                  {pct(contributions.inflation)}
                </b>
              </div>

              <div>
                <span>Total estimé</span>
                <b>{pct(scenarioImpact)}</b>
              </div>
            </div>
          </article>

          <article className={styles.panel}>
            <h2>
              Répartition actifs réels
            </h2>

            <div className={styles.list}>
              {categories.map((item) => (
                <div key={item.category}>
                  <span>
                    {CATEGORY_LABELS[
                      item.category
                    ] ?? item.category}
                  </span>

                  <b>
                    {pct(item.weight)}
                  </b>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.panel}>
            <h2>
              Commodity exposure graph
            </h2>

            {edges.length ? (
              <div className={styles.edges}>
                {edges.map((edge, index) => (
                  <div
                    key={`${edge.symbol}-${edge.factor}-${index}`}
                  >
                    <span>
                      {edge.symbol}
                    </span>

                    <b>
                      {ROLE_LABELS[edge.role] ??
                        edge.role}
                    </b>

                    <strong>
                      → {edge.factor}
                    </strong>

                    <em>
                      {score(edge.beta)}
                    </em>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.note}>
                Aucun lien matière première
                renseigné.
              </p>
            )}
          </article>

          <article
            className={`${styles.panel} ${styles.full}`}
          >
            <h2>
              Méthode
            </h2>

            <p className={styles.note}>
              Sensibilité portefeuille = Σ poids actif ×
              sensibilité saisie. Contribution scénario =
              sensibilité portefeuille × choc saisi.
              L&apos;addition des contributions produit un
              scénario linéaire simplifié; elle ne tient
              pas compte des interactions, convexités,
              changements de régime ou réactions de prix
              non linéaires.
            </p>
          </article>
        </section>
      ) : (
        <section className={styles.empty}>
          <b>
            Aucune exposition définie.
          </b>

          <span>
            Renseigne un actif ou un choc pour
            produire le graphe d&apos;exposition.
          </span>
        </section>
      )}
    </main>
  );
}
