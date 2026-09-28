import Link from "next/link";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function clean(
  value: string | string[] | undefined,
  maxLength = 300,
): string {
  return first(value).trim().slice(0, maxLength);
}

function numeric(
  value: string | string[] | undefined,
  min = -1_000_000_000,
  max = 1_000_000_000,
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

function money(value: number | null): string {
  if (value === null) return "N/D";

  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function days(value: number | null): string {
  return value === null ? "N/D" : `${value.toFixed(2)} j`;
}

type Check = {
  label: string;
  value: string;
  pass: boolean | null;
};

export default async function InstitutionalPreTradePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const p = await searchParams;

  const symbol = clean(p.symbol, 15)
    .toUpperCase()
    .replace(/\.TO$/, "")
    .replace(/[^A-Z0-9.^-]/g, "");

  const side = clean(p.side, 8) === "sell" ? "sell" : "buy";
  const portfolioValue = numeric(p.portfolio_value, 1, 100_000_000_000);
  const tradeNotional = numeric(p.trade_notional, 0, 100_000_000_000);

  const currentWeight = numeric(p.current_weight, 0, 100);
  const currentSector = numeric(p.current_sector, 0, 100);
  const currentCash = numeric(p.current_cash, 0, 100);

  const maxPosition = numeric(p.max_position, 0, 100);
  const maxSector = numeric(p.max_sector, 0, 100);
  const minCash = numeric(p.min_cash, 0, 100);
  const maxTurnover = numeric(p.max_turnover, 0, 100);

  const advCad = numeric(p.adv_cad, 0, 100_000_000_000);
  const maxDays = numeric(p.max_days, 0, 1000);
  const costBps = numeric(p.cost_bps, 0, 1000);

  const mandate = clean(p.mandate, 1200);
  const liquidityEvidence = clean(p.liquidity_evidence, 1200);
  const rationale = clean(p.rationale, 1200);

  const tradeWeight =
    portfolioValue !== null && tradeNotional !== null
      ? (tradeNotional / portfolioValue) * 100
      : null;

  const signedTradeWeight =
    tradeWeight === null
      ? null
      : side === "buy"
        ? tradeWeight
        : -tradeWeight;

  const projectedPosition =
    currentWeight !== null && signedTradeWeight !== null
      ? currentWeight + signedTradeWeight
      : null;

  const projectedSector =
    currentSector !== null && signedTradeWeight !== null
      ? currentSector + signedTradeWeight
      : null;

  const projectedCash =
    currentCash !== null && signedTradeWeight !== null
      ? currentCash - signedTradeWeight
      : null;

  const turnover =
    tradeWeight === null ? null : Math.abs(tradeWeight);

  const daysToLiquidate =
    tradeNotional !== null &&
    advCad !== null &&
    advCad > 0
      ? tradeNotional / advCad
      : null;

  const explicitCost =
    tradeNotional !== null && costBps !== null
      ? tradeNotional * (costBps / 10_000)
      : null;

  const checks: Check[] = [
    {
      label: "Limite position",
      value:
        projectedPosition !== null && maxPosition !== null
          ? `${pct(projectedPosition)} / max ${pct(maxPosition)}`
          : "N/D",
      pass:
        projectedPosition !== null && maxPosition !== null
          ? projectedPosition >= 0 && projectedPosition <= maxPosition
          : null,
    },
    {
      label: "Limite secteur",
      value:
        projectedSector !== null && maxSector !== null
          ? `${pct(projectedSector)} / max ${pct(maxSector)}`
          : "N/D",
      pass:
        projectedSector !== null && maxSector !== null
          ? projectedSector >= 0 && projectedSector <= maxSector
          : null,
    },
    {
      label: "Cash minimum",
      value:
        projectedCash !== null && minCash !== null
          ? `${pct(projectedCash)} / min ${pct(minCash)}`
          : "N/D",
      pass:
        projectedCash !== null && minCash !== null
          ? projectedCash >= minCash
          : null,
    },
    {
      label: "Turnover max",
      value:
        turnover !== null && maxTurnover !== null
          ? `${pct(turnover)} / max ${pct(maxTurnover)}`
          : "N/D",
      pass:
        turnover !== null && maxTurnover !== null
          ? turnover <= maxTurnover
          : null,
    },
    {
      label: "Liquidité",
      value:
        daysToLiquidate !== null && maxDays !== null
          ? `${days(daysToLiquidate)} / max ${days(maxDays)}`
          : "N/D",
      pass:
        daysToLiquidate !== null && maxDays !== null
          ? daysToLiquidate <= maxDays
          : null,
    },
  ];

  const evaluated = checks.filter((check) => check.pass !== null);
  const failed = evaluated.filter((check) => check.pass === false);

  const status =
    failed.length > 0
      ? `${failed.length} contrainte(s) à revoir`
      : evaluated.length === checks.length
        ? "Toutes les contraintes évaluées passent"
        : evaluated.length > 0
          ? "Contrôles partiels"
          : "Contrôles non évalués";

  const hasResult =
    Boolean(symbol || mandate || liquidityEvidence || rationale) ||
    [
      portfolioValue,
      tradeNotional,
      currentWeight,
      currentSector,
      currentCash,
      maxPosition,
      maxSector,
      minCash,
      maxTurnover,
      advCad,
      maxDays,
      costBps,
    ].some((value) => value !== null);

  return (
    <main
      className={styles.shell}
      data-testid="institutional-pretrade-engine"
    >
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel/construction">
            ← Construction Lab
          </Link>
          <span>
            ANATOLE INSTITUTIONAL · PRE-TRADE & MANDATE
          </span>
          <h1>Pre-Trade Risk & Mandate Engine</h1>
          <p>
            Projette l&apos;effet d&apos;un trade hypothétique sur concentration,
            secteur, cash, turnover et liquidité. Les contraintes viennent des
            valeurs saisies; aucun ordre n&apos;est envoyé et aucun ADV n&apos;est inventé.
          </p>
        </div>

        <aside>
          <strong>Check before execution</strong>
          <span>
            Un contrôle qui échoue signifie qu&apos;une contrainte saisie mérite
            une revue. Ce moteur ne remplace ni conformité, ni OMS, ni approbation humaine.
          </span>
        </aside>
      </header>

      <nav className={styles.nav}>
        <Link href="/institutionnel/construction">Construction →</Link>
        <Link href="/institutionnel/risque">Risk Center →</Link>
        <Link href="/terminal">Terminal / liquidité →</Link>
        <Link href="/institutionnel/comite">Comité →</Link>
        <Link href="/institutionnel/gouvernance">Gouvernance →</Link>
      </nav>

      <section className={styles.states}>
        <article>
          <b>#40 Pre-Trade Risk Check</b>
          <span>Bridge V1</span>
          <p>Projection déterministe des poids, cash, turnover et liquidité.</p>
        </article>
        <article>
          <b>#41 Mandate & Constraint Engine</b>
          <span>Bridge V1</span>
          <p>Cinq contraintes encodées et évaluées explicitement.</p>
        </article>
        <article>
          <b>Execution</b>
          <span>Non connectée</span>
          <p>Aucun ordre n&apos;est envoyé depuis cette surface.</p>
        </article>
        <article>
          <b>Compliance</b>
          <span>Revue humaine</span>
          <p>Les contrôles ne constituent pas une approbation réglementaire.</p>
        </article>
      </section>

      <section className={styles.panel}>
        <h2>Trade hypothétique</h2>

        <form method="get" className={styles.form}>
          <div className={styles.four}>
            <label>
              Titre
              <input
                name="symbol"
                defaultValue={symbol}
                placeholder="RY"
                maxLength={15}
              />
            </label>

            <label>
              Sens
              <select
                name="side"
                defaultValue={side}
              >
                <option value="buy">Achat</option>
                <option value="sell">Vente</option>
              </select>
            </label>

            <label>
              Valeur portefeuille CAD
              <input
                name="portfolio_value"
                defaultValue={first(p.portfolio_value)}
                placeholder="1000000"
              />
            </label>

            <label>
              Notionnel trade CAD
              <input
                name="trade_notional"
                defaultValue={first(p.trade_notional)}
                placeholder="50000"
              />
            </label>
          </div>

          <h2>État actuel</h2>

          <div className={styles.three}>
            <label>
              Poids position %
              <input
                name="current_weight"
                defaultValue={first(p.current_weight)}
                placeholder="4"
              />
            </label>

            <label>
              Poids secteur %
              <input
                name="current_sector"
                defaultValue={first(p.current_sector)}
                placeholder="20"
              />
            </label>

            <label>
              Cash %
              <input
                name="current_cash"
                defaultValue={first(p.current_cash)}
                placeholder="8"
              />
            </label>
          </div>

          <h2>Contraintes mandat</h2>

          <div className={styles.five}>
            <label>
              Max position %
              <input
                name="max_position"
                defaultValue={first(p.max_position)}
                placeholder="8"
              />
            </label>

            <label>
              Max secteur %
              <input
                name="max_sector"
                defaultValue={first(p.max_sector)}
                placeholder="25"
              />
            </label>

            <label>
              Min cash %
              <input
                name="min_cash"
                defaultValue={first(p.min_cash)}
                placeholder="3"
              />
            </label>

            <label>
              Max turnover %
              <input
                name="max_turnover"
                defaultValue={first(p.max_turnover)}
                placeholder="5"
              />
            </label>

            <label>
              Max days-to-liquidate
              <input
                name="max_days"
                defaultValue={first(p.max_days)}
                placeholder="1"
              />
            </label>
          </div>

          <h2>Liquidité & coût</h2>

          <div className={styles.two}>
            <label>
              ADV CAD
              <input
                name="adv_cad"
                defaultValue={first(p.adv_cad)}
                placeholder="250000"
              />
            </label>

            <label>
              Coût explicite bps
              <input
                name="cost_bps"
                defaultValue={first(p.cost_bps)}
                placeholder="8"
              />
            </label>
          </div>

          <div className={styles.two}>
            <label>
              Mandat / règle interne
              <textarea
                name="mandate"
                defaultValue={mandate}
                rows={4}
              />
            </label>

            <label>
              Preuve de liquidité
              <textarea
                name="liquidity_evidence"
                defaultValue={liquidityEvidence}
                rows={4}
                placeholder="Source de l'ADV, période observée, limites..."
              />
            </label>
          </div>

          <label>
            Rationale
            <textarea
              name="rationale"
              defaultValue={rationale}
              rows={4}
            />
          </label>

          <div className={styles.actions}>
            <button type="submit">Exécuter les contrôles</button>
            <Link href="/institutionnel/construction/pretrade">
              Effacer
            </Link>
          </div>
        </form>
      </section>

      {hasResult ? (
        <section
          className={styles.results}
          data-testid="institutional-pretrade-results"
        >
          <article className={styles.panel}>
            <header className={styles.resultHeader}>
              <div>
                <span>PROJECTED TRADE</span>
                <h2>{symbol || "Titre N/D"} · {side === "buy" ? "Achat" : "Vente"}</h2>
              </div>
              <b>{status}</b>
            </header>

            <div className={styles.metrics}>
              <div>
                <span>Δ poids</span>
                <b>{pct(signedTradeWeight)}</b>
              </div>
              <div>
                <span>Position après</span>
                <b>{pct(projectedPosition)}</b>
              </div>
              <div>
                <span>Secteur après</span>
                <b>{pct(projectedSector)}</b>
              </div>
              <div>
                <span>Cash après</span>
                <b>{pct(projectedCash)}</b>
              </div>
              <div>
                <span>Days-to-liquidate</span>
                <b>{days(daysToLiquidate)}</b>
              </div>
              <div>
                <span>Coût explicite</span>
                <b>{money(explicitCost)}</b>
              </div>
            </div>
          </article>

          <article className={styles.panel}>
            <h2>Mandate checks</h2>

            <div className={styles.checks}>
              {checks.map((check) => (
                <div key={check.label}>
                  <span>{check.label}</span>
                  <b>{check.value}</b>
                  <strong>
                    {check.pass === null
                      ? "N/D"
                      : check.pass
                        ? "PASS"
                        : "REVIEW"}
                  </strong>
                </div>
              ))}
            </div>
          </article>

          <article className={`${styles.panel} ${styles.full}`}>
            <h2>Evidence</h2>

            <div className={styles.notes}>
              <article>
                <span>MANDAT</span>
                <p>{mandate || "N/D"}</p>
              </article>

              <article>
                <span>LIQUIDITÉ</span>
                <p>{liquidityEvidence || "N/D"}</p>
              </article>

              <article>
                <span>RATIONALE</span>
                <p>{rationale || "N/D"}</p>
              </article>
            </div>

            <p className={styles.note}>
              Days-to-liquidate V1 = notionnel du trade / ADV CAD saisi.
              Aucun market impact, slippage implicite, VaR, facteur ou
              capacité d&apos;exécution n&apos;est inféré.
            </p>
          </article>
        </section>
      ) : (
        <section className={styles.empty}>
          <b>Aucun contrôle pré-trade exécuté.</b>
          <span>
            Renseigne un trade et des contraintes pour obtenir une projection.
          </span>
        </section>
      )}
    </main>
  );
}
