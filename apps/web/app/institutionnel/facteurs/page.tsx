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
  min: number,
  max: number,
): number | null {
  const raw = first(value).trim().replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

function pct(value: number | null, digits = 1): string {
  return value === null ? "N/D" : `${value.toFixed(digits)} %`;
}

function score(value: number | null): string {
  if (value === null) return "N/D";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

type Position = {
  symbol: string;
  weight: number | null;
  risk: number | null;
  value: number | null;
  quality: number | null;
  momentum: number | null;
  growth: number | null;
  dependencies: string[];
};

function position(
  p: SearchParams,
  index: number,
): Position {
  const dependencies = clean(p[`dependencies_${index}`], 400)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);

  return {
    symbol: clean(p[`symbol_${index}`], 15)
      .toUpperCase()
      .replace(/\.TO$/, ""),
    weight: numeric(p[`weight_${index}`], 0, 100),
    risk: numeric(p[`risk_${index}`], 0, 100),
    value: numeric(p[`value_${index}`], -3, 3),
    quality: numeric(p[`quality_${index}`], -3, 3),
    momentum: numeric(p[`momentum_${index}`], -3, 3),
    growth: numeric(p[`growth_${index}`], -3, 3),
    dependencies,
  };
}

function weightedFactor(
  positions: Position[],
  key: "value" | "quality" | "momentum" | "growth",
): number | null {
  const valid = positions.filter(
    (item) => item.weight !== null && item[key] !== null,
  );

  const totalWeight = valid.reduce(
    (sum, item) => sum + (item.weight ?? 0),
    0,
  );

  if (!valid.length || totalWeight <= 0) return null;

  return valid.reduce(
    (sum, item) =>
      sum + (item.weight ?? 0) * (item[key] ?? 0),
    0,
  ) / totalWeight;
}

export default async function InstitutionalFactorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const p = await searchParams;
  const positions = [1, 2, 3, 4].map((index) => position(p, index));

  const riskCap = numeric(p.risk_cap, 0, 100);
  const priorCorrelation = numeric(p.prior_correlation, -1, 1);
  const currentCorrelation = numeric(p.current_correlation, -1, 1);

  const activePositions = positions.filter(
    (item) =>
      item.symbol ||
      item.weight !== null ||
      item.risk !== null ||
      item.dependencies.length > 0,
  );

  const weightValues = activePositions
    .map((item) => item.weight)
    .filter((value): value is number => value !== null);

  const riskValues = activePositions
    .map((item) => item.risk)
    .filter((value): value is number => value !== null);

  const weightTotal = weightValues.length
    ? weightValues.reduce((sum, value) => sum + value, 0)
    : null;

  const riskTotal = riskValues.length
    ? riskValues.reduce((sum, value) => sum + value, 0)
    : null;

  const factorValue = weightedFactor(activePositions, "value");
  const factorQuality = weightedFactor(activePositions, "quality");
  const factorMomentum = weightedFactor(activePositions, "momentum");
  const factorGrowth = weightedFactor(activePositions, "growth");

  const dependencyMap = new Map<string, string[]>();

  for (const item of activePositions) {
    for (const tag of item.dependencies) {
      const existing = dependencyMap.get(tag) ?? [];
      dependencyMap.set(
        tag,
        item.symbol
          ? [...new Set([...existing, item.symbol])]
          : existing,
      );
    }
  }

  const sharedDependencies = [...dependencyMap.entries()]
    .filter(([, symbols]) => symbols.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  const correlationShift =
    priorCorrelation !== null && currentCorrelation !== null
      ? currentCorrelation - priorCorrelation
      : null;

  const correlationLabel =
    correlationShift === null
      ? "Régime non calculé"
      : correlationShift >= 0.1
        ? "Corrélations en hausse"
        : correlationShift <= -0.1
          ? "Corrélations en baisse"
          : "Régime relativement stable";

  const overRiskBudget = activePositions.filter(
    (item) =>
      item.risk !== null &&
      riskCap !== null &&
      item.risk > riskCap,
  );

  const hasSnapshot =
    activePositions.length > 0 ||
    riskCap !== null ||
    priorCorrelation !== null ||
    currentCorrelation !== null;

  return (
    <main
      className={styles.shell}
      data-testid="institutional-factor-xray-center"
    >
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel">← Command Center</Link>
          <span>ANATOLE INSTITUTIONAL · PORTFOLIO X-RAY</span>
          <h1>Factor, Dependency & Risk Budget Lab</h1>
          <p>
            Décompose un snapshot de portefeuille en facteurs, contribution au
            risque, dépendances communes et changement de corrélation. Les
            expositions sont calculées uniquement à partir des valeurs saisies;
            V1 ne prétend pas les extraire automatiquement du marché.
          </p>
        </div>

        <aside>
          <strong>Manual snapshot, deterministic math</strong>
          <span>
            Utilise des scores factoriels de -3 à +3, des poids et des
            contributions au risque renseignés par l&apos;analyste. Aucun facteur
            propriétaire n&apos;est inventé.
          </span>
        </aside>
      </header>

      <nav className={styles.nav}>
        <Link href="/portefeuille">Portefeuille →</Link>
        <Link href="/institutionnel/risque">Risk Center →</Link>
        <Link href="/institutionnel/macro">Macro →</Link>
        <Link href="/psychologie">Psychologie marché →</Link>
        <Link href="/institutionnel/attribution">Attribution →</Link>
      </nav>

      <section className={styles.states}>
        <article><b>#2 Portfolio Digital Twin</b><span>Fondation structurée</span></article>
        <article><b>#5 Factor Exposure Engine</b><span>Bridge V1</span></article>
        <article><b>#8 Dependency Graph</b><span>Bridge V1</span></article>
        <article><b>#28 Crowding Risk</b><span>Fondation</span></article>
        <article><b>#29 Correlation Regime</b><span>Bridge V1</span></article>
        <article><b>#31 Risk Budgeting</b><span>Bridge V1</span></article>
      </section>

      <section className={styles.panel}>
        <h2>Snapshot portefeuille</h2>

        <form method="get" className={styles.form}>
          <div className={styles.controls}>
            <label>
              Budget de risque max par position (%)
              <input
                name="risk_cap"
                defaultValue={first(p.risk_cap)}
                placeholder="25"
                inputMode="decimal"
              />
            </label>

            <label>
              Corrélation moyenne précédente
              <input
                name="prior_correlation"
                defaultValue={first(p.prior_correlation)}
                placeholder="0.35"
                inputMode="decimal"
              />
            </label>

            <label>
              Corrélation moyenne actuelle
              <input
                name="current_correlation"
                defaultValue={first(p.current_correlation)}
                placeholder="0.55"
                inputMode="decimal"
              />
            </label>
          </div>

          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Titre</span>
              <span>Poids %</span>
              <span>Risque %</span>
              <span>Value</span>
              <span>Quality</span>
              <span>Momentum</span>
              <span>Growth</span>
              <span>Dépendances</span>
            </div>

            {[1, 2, 3, 4].map((index) => (
              <div key={index}>
                <input name={`symbol_${index}`} defaultValue={first(p[`symbol_${index}`])} placeholder={`Titre ${index}`} />
                <input name={`weight_${index}`} defaultValue={first(p[`weight_${index}`])} placeholder="25" />
                <input name={`risk_${index}`} defaultValue={first(p[`risk_${index}`])} placeholder="25" />
                <input name={`value_${index}`} defaultValue={first(p[`value_${index}`])} placeholder="0.5" />
                <input name={`quality_${index}`} defaultValue={first(p[`quality_${index}`])} placeholder="1.0" />
                <input name={`momentum_${index}`} defaultValue={first(p[`momentum_${index}`])} placeholder="-0.5" />
                <input name={`growth_${index}`} defaultValue={first(p[`growth_${index}`])} placeholder="1.5" />
                <input name={`dependencies_${index}`} defaultValue={first(p[`dependencies_${index}`])} placeholder="CAD, pétrole, taux US" />
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <button type="submit">Analyser le snapshot</button>
            <Link href="/institutionnel/facteurs">Effacer</Link>
          </div>
        </form>
      </section>

      {hasSnapshot ? (
        <>
          <section
            className={styles.results}
            data-testid="institutional-factor-xray-results"
          >
            <article className={styles.panel}>
              <h2>Expositions factorielles pondérées</h2>

              <div className={styles.metrics}>
                <div><span>Value</span><b>{score(factorValue)}</b></div>
                <div><span>Quality</span><b>{score(factorQuality)}</b></div>
                <div><span>Momentum</span><b>{score(factorMomentum)}</b></div>
                <div><span>Growth</span><b>{score(factorGrowth)}</b></div>
              </div>

              <p className={styles.note}>
                Chaque exposition = moyenne des scores saisis pondérée par les
                poids renseignés. Ce n&apos;est pas un modèle factoriel calibré
                sur des rendements historiques.
              </p>
            </article>

            <article className={styles.panel}>
              <h2>Risk budget</h2>

              <div className={styles.metrics}>
                <div><span>Poids saisis</span><b>{pct(weightTotal)}</b></div>
                <div><span>Risque saisi</span><b>{pct(riskTotal)}</b></div>
                <div><span>Cap position</span><b>{pct(riskCap)}</b></div>
                <div><span>Au-dessus du cap</span><b>{overRiskBudget.length}</b></div>
              </div>

              <div className={styles.list}>
                {activePositions.map((item, index) => (
                  <div key={`${item.symbol}-${index}`}>
                    <span>{item.symbol || `Position ${index + 1}`}</span>
                    <b>{pct(item.risk)}</b>
                    <strong>
                      {item.risk !== null && riskCap !== null
                        ? item.risk > riskCap
                          ? "À revoir"
                          : "OK"
                        : "N/D"}
                    </strong>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className={styles.results}>
            <article className={styles.panel}>
              <h2>Dépendances croisées</h2>

              {sharedDependencies.length ? (
                <div className={styles.dependencies}>
                  {sharedDependencies.map(([tag, symbols]) => (
                    <div key={tag}>
                      <span>{tag}</span>
                      <b>{symbols.join(" · ")}</b>
                      <strong>{symbols.length} titres</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.note}>
                  Aucun tag de dépendance partagé par au moins deux titres.
                </p>
              )}
            </article>

            <article className={styles.panel}>
              <h2>Correlation regime</h2>

              <div className={styles.metrics}>
                <div><span>Avant</span><b>{score(priorCorrelation)}</b></div>
                <div><span>Actuel</span><b>{score(currentCorrelation)}</b></div>
                <div><span>Variation</span><b>{score(correlationShift)}</b></div>
                <div><span>Lecture</span><b>{correlationLabel}</b></div>
              </div>

              <p className={styles.note}>
                Le régime repose seulement sur les deux corrélations moyennes
                fournies. V1 ne calcule pas encore une matrice de corrélation
                automatiquement à partir des historiques de prix.
              </p>
            </article>
          </section>
        </>
      ) : (
        <section className={styles.empty}>
          <b>Aucun snapshot défini.</b>
          <span>
            Renseigne quelques positions pour calculer les facteurs, le budget
            de risque et les dépendances communes.
          </span>
        </section>
      )}
    </main>
  );
}
