import Link from "next/link";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function numeric(
  value: string | string[] | undefined,
  min = 0,
  max = 100,
): number | null {
  const raw = first(value).trim().replace(",", ".");
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

function pct(value: number | null): string {
  return value === null ? "N/D" : `${value.toFixed(1)} %`;
}

function cad(value: number | null): string {
  return value === null ? "N/D" : `${value.toFixed(0)} CAD`;
}

type Allocation = {
  label: string;
  current: number | null;
  target: number | null;
};

export default async function InstitutionalMultiAssetPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const p = await searchParams;

  const portfolioValue = numeric(p.portfolio_value, 0, 10_000_000_000);

  const allocations: Allocation[] = [
    {
      label: "Actions",
      current: numeric(p.equity_current),
      target: numeric(p.equity_target),
    },
    {
      label: "Revenu fixe",
      current: numeric(p.fixed_current),
      target: numeric(p.fixed_target),
    },
    {
      label: "Actifs réels",
      current: numeric(p.real_current),
      target: numeric(p.real_target),
    },
    {
      label: "Alternatifs",
      current: numeric(p.alt_current),
      target: numeric(p.alt_target),
    },
    {
      label: "Cash",
      current: numeric(p.cash_current),
      target: numeric(p.cash_target),
    },
  ];

  const currentValues = allocations.map((item) => item.current);
  const targetValues = allocations.map((item) => item.target);

  const currentComplete = currentValues.every((value) => value !== null);
  const targetComplete = targetValues.every((value) => value !== null);

  const currentTotal = currentComplete
    ? currentValues.reduce((sum, value) => sum + (value ?? 0), 0)
    : null;

  const targetTotal = targetComplete
    ? targetValues.reduce((sum, value) => sum + (value ?? 0), 0)
    : null;

  const foreignExposure = numeric(p.foreign_exposure);
  const currentHedge = numeric(p.current_hedge);
  const targetHedge = numeric(p.target_hedge);
  const costBps = numeric(p.cost_bps, 0, 500);

  const foreignNotional =
    portfolioValue !== null && foreignExposure !== null
      ? portfolioValue * (foreignExposure / 100)
      : null;

  const currentHedgeNotional =
    foreignNotional !== null && currentHedge !== null
      ? foreignNotional * (currentHedge / 100)
      : null;

  const targetHedgeNotional =
    foreignNotional !== null && targetHedge !== null
      ? foreignNotional * (targetHedge / 100)
      : null;

  const hedgeTradeNotional =
    currentHedgeNotional !== null && targetHedgeNotional !== null
      ? Math.abs(targetHedgeNotional - currentHedgeNotional)
      : null;

  const hedgeCost =
    hedgeTradeNotional !== null && costBps !== null
      ? hedgeTradeNotional * (costBps / 10_000)
      : null;

  const hasScenario =
    portfolioValue !== null ||
    allocations.some((item) => item.current !== null || item.target !== null) ||
    foreignExposure !== null ||
    currentHedge !== null ||
    targetHedge !== null;

  return (
    <main
      className={styles.shell}
      data-testid="institutional-multi-asset-center"
    >
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel">← Command Center</Link>
          <span>ANATOLE INSTITUTIONAL · FUNDS & MULTI-ASSET</span>
          <h1>Multi-Asset & FX Overlay Center</h1>
          <p>
            Réunit les briques ETF, options et allocation multi-actifs autour
            d&apos;un scénario déterministe. Les calculs ci-dessous viennent
            uniquement des paramètres saisis; aucune exposition cachée
            n&apos;est inventée.
          </p>
        </div>

        <aside>
          <strong>Exposure first</strong>
          <span>
            V1 calcule allocation, variation de poids et couverture FX
            hypothétique. Revenu fixe institutionnel, crédit et look-through
            multi-gestionnaires restent des couches distinctes.
          </span>
        </aside>
      </header>

      <nav className={styles.nav}>
        <Link href="/etf">ETF Intelligence →</Link>
        <Link href="/options">Options Risk →</Link>
        <Link href="/institutionnel/risque">Risk Center →</Link>
        <Link href="/institutionnel/macro">Macro →</Link>
        <Link href="/institutionnel/construction">Construction →</Link>
        <Link href="/institutionnel/multi-actifs/fixed-income">Fixed Income & Credit →</Link>
        <Link href="/institutionnel/multi-actifs/multi-manager">Multi-Manager X-Ray →</Link>
      </nav>

      <section className={styles.states}>
        <article>
          <b>ETF Intelligence</b>
          <span>Bridge actif</span>
          <p>Composition, historique et holdings restent disponibles dans ETF.</p>
        </article>

        <article>
          <b>Options Risk</b>
          <span>Bridge actif</span>
          <p>La couche options existante reste la source spécialisée.</p>
        </article>

        <article>
          <b>FX Overlay</b>
          <span>Bridge V1</span>
          <p>Calcule un ajustement de couverture à partir des expositions saisies.</p>
        </article>

        <article>
          <b>Fixed Income / Credit</b>
          <span>Roadmap</span>
          <p>Duration, convexité, courbe et crédit exigent encore des données dédiées.</p>
        </article>
      </section>

      <section className={styles.panel}>
        <h2>Allocation multi-actifs</h2>

        <form method="get" className={styles.form}>
          <label>
            Valeur du portefeuille (CAD)
            <input
              name="portfolio_value"
              defaultValue={first(p.portfolio_value)}
              placeholder="1000000"
              inputMode="decimal"
            />
          </label>

          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Classe</span>
              <span>Actuel %</span>
              <span>Cible %</span>
            </div>

            <div>
              <b>Actions</b>
              <input name="equity_current" defaultValue={first(p.equity_current)} placeholder="55" />
              <input name="equity_target" defaultValue={first(p.equity_target)} placeholder="50" />
            </div>

            <div>
              <b>Revenu fixe</b>
              <input name="fixed_current" defaultValue={first(p.fixed_current)} placeholder="25" />
              <input name="fixed_target" defaultValue={first(p.fixed_target)} placeholder="30" />
            </div>

            <div>
              <b>Actifs réels</b>
              <input name="real_current" defaultValue={first(p.real_current)} placeholder="8" />
              <input name="real_target" defaultValue={first(p.real_target)} placeholder="8" />
            </div>

            <div>
              <b>Alternatifs</b>
              <input name="alt_current" defaultValue={first(p.alt_current)} placeholder="7" />
              <input name="alt_target" defaultValue={first(p.alt_target)} placeholder="7" />
            </div>

            <div>
              <b>Cash</b>
              <input name="cash_current" defaultValue={first(p.cash_current)} placeholder="5" />
              <input name="cash_target" defaultValue={first(p.cash_target)} placeholder="5" />
            </div>
          </div>

          <h2>FX Overlay</h2>

          <div className={styles.four}>
            <label>
              Exposition devises étrangères %
              <input
                name="foreign_exposure"
                defaultValue={first(p.foreign_exposure)}
                placeholder="30"
              />
            </label>

            <label>
              Couverture actuelle %
              <input
                name="current_hedge"
                defaultValue={first(p.current_hedge)}
                placeholder="25"
              />
            </label>

            <label>
              Couverture cible %
              <input
                name="target_hedge"
                defaultValue={first(p.target_hedge)}
                placeholder="50"
              />
            </label>

            <label>
              Coût explicite bps
              <input
                name="cost_bps"
                defaultValue={first(p.cost_bps)}
                placeholder="5"
              />
            </label>
          </div>

          <div className={styles.actions}>
            <button type="submit">Calculer le scénario</button>
            <Link href="/institutionnel/multi-actifs">Effacer</Link>
          </div>
        </form>
      </section>

      {hasScenario ? (
        <section
          className={styles.results}
          data-testid="institutional-multi-asset-results"
        >
          <article className={styles.panel}>
            <h2>Allocation</h2>

            <div className={styles.allocationGrid}>
              {allocations.map((item) => {
                const delta =
                  item.current !== null && item.target !== null
                    ? item.target - item.current
                    : null;

                const targetNotional =
                  portfolioValue !== null && item.target !== null
                    ? portfolioValue * (item.target / 100)
                    : null;

                return (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <b>{pct(item.current)} → {pct(item.target)}</b>
                    <strong>
                      Δ {pct(delta)} · {cad(targetNotional)}
                    </strong>
                  </div>
                );
              })}
            </div>

            <div className={styles.total}>
              <span>
                Total actuel: <b>{pct(currentTotal)}</b>
              </span>
              <span>
                Total cible: <b>{pct(targetTotal)}</b>
              </span>
              <strong>
                {targetTotal === null
                  ? "Allocation cible incomplète"
                  : Math.abs(targetTotal - 100) < 0.001
                    ? "Allocation cible = 100 %"
                    : `Allocation cible à revoir: ${pct(targetTotal)}`}
              </strong>
            </div>
          </article>

          <article className={styles.panel}>
            <h2>FX Overlay</h2>

            <div className={styles.metrics}>
              <div>
                <span>Exposition étrangère</span>
                <b>{cad(foreignNotional)}</b>
              </div>

              <div>
                <span>Couverture actuelle</span>
                <b>{cad(currentHedgeNotional)}</b>
              </div>

              <div>
                <span>Couverture cible</span>
                <b>{cad(targetHedgeNotional)}</b>
              </div>

              <div>
                <span>Notionnel à ajuster</span>
                <b>{cad(hedgeTradeNotional)}</b>
              </div>

              <div>
                <span>Coût explicite</span>
                <b>{cad(hedgeCost)}</b>
              </div>

              <div>
                <span>Couverture cible</span>
                <b>{pct(targetHedge)}</b>
              </div>
            </div>

            <p className={styles.note}>
              Le notionnel de couverture est calculé sur la valeur du portefeuille
              et le pourcentage d&apos;exposition étrangère saisis. Il ne tient pas
              compte du basis, du carry, des forwards disponibles, des conventions
              de devise ni du slippage réel.
            </p>
          </article>
        </section>
      ) : (
        <section className={styles.empty}>
          <b>Aucun scénario multi-actifs défini.</b>
          <span>
            Renseigne les allocations ou le FX overlay pour obtenir des calculs
            transparents et reproductibles.
          </span>
        </section>
      )}

      <section className={styles.panel}>
        <h2>Architecture institutionnelle</h2>

        <div className={styles.architecture}>
          <article>
            <b>Multi-manager X-Ray</b>
            <span>Bridge V1</span>
            <p>Agrégation, overlap, facteurs et concentration sur mandats saisis.</p>
          </article>

          <article>
            <b>Fixed Income Workbench</b>
            <span>Bridge V1</span>
            <p>Duration, convexité, courbe et scénarios disponibles sur données saisies.</p>
          </article>

          <article>
            <b>Credit Intelligence</b>
            <span>Bridge V1</span>
            <p>Spread, couverture et refinancement analysés sans données inventées.</p>
          </article>

          <article>
            <b>Commodity / Real Assets</b>
            <span>Fondation</span>
            <p>La couche macro peut déjà servir de contexte, sans faux look-through.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
