import Link from "next/link";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
function text(value: string | string[] | undefined, max = 1200) {
  return first(value).trim().slice(0, max);
}
function number(value: string | string[] | undefined, max = 100) {
  const raw = first(value).trim().replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(0, parsed));
}
function pct(value: number | null) {
  return value === null ? "N/D" : `${value.toFixed(1)} %`;
}
function money(value: number | null) {
  return value === null
    ? "N/D"
    : new Intl.NumberFormat("fr-CA", {
        style: "currency",
        currency: "CAD",
        maximumFractionDigits: 0,
      }).format(value);
}

type Scenario = {
  name: string;
  target: number | null;
  change: number | null;
  turnover: number | null;
  notional: number | null;
  cost: number | null;
  checks: Array<{ label: string; value: string; pass: boolean | null }>;
  status: string;
};

function scenario(
  name: string,
  current: number | null,
  target: number | null,
  portfolioValue: number | null,
  costBps: number | null,
  maxPosition: number | null,
  cashAfter: number | null,
  minCash: number | null,
  sectorAfter: number | null,
  maxSector: number | null,
  maxTurnover: number | null,
): Scenario {
  const change = current !== null && target !== null ? target - current : null;
  const turnover = change === null ? null : Math.abs(change);
  const notional =
    portfolioValue !== null && turnover !== null
      ? portfolioValue * turnover / 100
      : null;
  const cost =
    notional !== null && costBps !== null
      ? notional * costBps / 10_000
      : null;

  const checks = [
    {
      label: "Position",
      value:
        target !== null && maxPosition !== null
          ? `${pct(target)} / max ${pct(maxPosition)}`
          : "N/D",
      pass:
        target !== null && maxPosition !== null
          ? target <= maxPosition
          : null,
    },
    {
      label: "Secteur",
      value:
        sectorAfter !== null && maxSector !== null
          ? `${pct(sectorAfter)} / max ${pct(maxSector)}`
          : "N/D",
      pass:
        sectorAfter !== null && maxSector !== null
          ? sectorAfter <= maxSector
          : null,
    },
    {
      label: "Cash",
      value:
        cashAfter !== null && minCash !== null
          ? `${pct(cashAfter)} / min ${pct(minCash)}`
          : "N/D",
      pass:
        cashAfter !== null && minCash !== null
          ? cashAfter >= minCash
          : null,
    },
    {
      label: "Turnover",
      value:
        turnover !== null && maxTurnover !== null
          ? `${pct(turnover)} / max ${pct(maxTurnover)}`
          : "N/D",
      pass:
        turnover !== null && maxTurnover !== null
          ? turnover <= maxTurnover
          : null,
    },
  ];

  const evaluated = checks.filter((item) => item.pass !== null);
  const failed = evaluated.filter((item) => item.pass === false).length;
  const status = failed
    ? `${failed} contrainte(s) à revoir`
    : evaluated.length
      ? "Aucune violation détectée"
      : "Contraintes incomplètes";

  return { name, target, change, turnover, notional, cost, checks, status };
}

export default async function InstitutionalConstructionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const p = await searchParams;
  const symbol = text(p.symbol, 15).toUpperCase().replace(/\.TO$/, "");
  const value = number(p.portfolio_value, 10_000_000_000);
  const current = number(p.current_weight);
  const maxPosition = number(p.max_position);
  const minCash = number(p.min_cash);
  const maxSector = number(p.max_sector);
  const maxTurnover = number(p.max_turnover);
  const costBps = number(p.cost_bps, 500);

  const a = scenario(
    "Scénario A",
    current,
    number(p.target_a),
    value,
    costBps,
    maxPosition,
    number(p.cash_a),
    minCash,
    number(p.sector_a),
    maxSector,
    maxTurnover,
  );
  const b = scenario(
    "Scénario B",
    current,
    number(p.target_b),
    value,
    costBps,
    maxPosition,
    number(p.cash_b),
    minCash,
    number(p.sector_b),
    maxSector,
    maxTurnover,
  );

  const mandate = text(p.mandate);
  const liquidity = text(p.liquidity);
  const rationale = text(p.rationale);
  const active = Boolean(symbol || a.target !== null || b.target !== null);

  return (
    <main className={styles.shell} data-testid="institutional-construction-center">
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel">← Command Center</Link>
          <span>ANATOLE INSTITUTIONAL · CONSTRUCTION & PRE-TRADE</span>
          <h1>Portfolio Construction & Pre-Trade Lab</h1>
          <p>
            Compare deux allocations hypothétiques avant exécution. Anatole
            calcule seulement ce qui découle des paramètres saisis.
          </p>
        </div>
        <aside>
          <strong>Hypothetical, not executable</strong>
          <span>
            Aucun ordre, aucune recommandation, aucun ADV, market impact,
            slippage, VaR ou days-to-liquidate inventé.
          </span>
        </aside>
      </header>

      <nav className={styles.nav}>
        <Link href="/portefeuille">Portefeuille →</Link>
        <Link href="/institutionnel/risque">Risk Center →</Link>
        <Link href="/terminal">Liquidité / Terminal →</Link>
        <Link href="/institutionnel/comite">Comité →</Link>
      </nav>

      <section className={styles.states}>
        <article><b>Construction</b><span>Bridge actif</span></article>
        <article><b>Rééquilibrage</b><span>Bridge V1</span></article>
        <article><b>Pre-Trade Risk</b><span>Fondation</span></article>
        <article><b>Mandate Engine</b><span>Fondation</span></article>
      </section>

      <section className={styles.panel}>
        <h2>Définir le trade hypothétique</h2>
        <form method="get" className={styles.form}>
          <div className={styles.three}>
            <label>Titre<input name="symbol" defaultValue={symbol} placeholder="RY" /></label>
            <label>Valeur portefeuille CAD<input name="portfolio_value" defaultValue={first(p.portfolio_value)} placeholder="1000000" /></label>
            <label>Poids actuel %<input name="current_weight" defaultValue={first(p.current_weight)} placeholder="4" /></label>
          </div>
          <div className={styles.three}>
            <label>Cible A %<input name="target_a" defaultValue={first(p.target_a)} placeholder="5" /></label>
            <label>Cible B %<input name="target_b" defaultValue={first(p.target_b)} placeholder="7" /></label>
            <label>Limite position %<input name="max_position" defaultValue={first(p.max_position)} placeholder="6" /></label>
          </div>
          <div className={styles.three}>
            <label>Cash A %<input name="cash_a" defaultValue={first(p.cash_a)} placeholder="4" /></label>
            <label>Cash B %<input name="cash_b" defaultValue={first(p.cash_b)} placeholder="6" /></label>
            <label>Cash minimum %<input name="min_cash" defaultValue={first(p.min_cash)} placeholder="3" /></label>
          </div>
          <div className={styles.three}>
            <label>Secteur A %<input name="sector_a" defaultValue={first(p.sector_a)} placeholder="22" /></label>
            <label>Secteur B %<input name="sector_b" defaultValue={first(p.sector_b)} placeholder="20" /></label>
            <label>Limite secteur %<input name="max_sector" defaultValue={first(p.max_sector)} placeholder="25" /></label>
          </div>
          <div className={styles.two}>
            <label>Turnover max %<input name="max_turnover" defaultValue={first(p.max_turnover)} placeholder="2" /></label>
            <label>Coût explicite bps<input name="cost_bps" defaultValue={first(p.cost_bps)} placeholder="8" /></label>
          </div>
          <div className={styles.two}>
            <label>Mandat<textarea name="mandate" defaultValue={mandate} rows={4} /></label>
            <label>Preuve de liquidité<textarea name="liquidity" defaultValue={liquidity} rows={4} /></label>
          </div>
          <label>Raison du rééquilibrage<textarea name="rationale" defaultValue={rationale} rows={4} /></label>
          <div className={styles.actions}>
            <button type="submit">Comparer les scénarios</button>
            <Link href="/institutionnel/construction">Effacer</Link>
          </div>
        </form>
      </section>

      {active ? (
        <section className={styles.compare} data-testid="institutional-pretrade-comparison">
          {[a, b].map((s) => (
            <article key={s.name} className={styles.scenario}>
              <header>
                <div><span>{s.name}</span><h2>{symbol || "Titre N/D"} · {pct(s.target)}</h2></div>
                <strong>{s.status}</strong>
              </header>
              <div className={styles.metrics}>
                <div><span>Δ poids</span><b>{pct(s.change)}</b></div>
                <div><span>Turnover</span><b>{pct(s.turnover)}</b></div>
                <div><span>Notionnel</span><b>{money(s.notional)}</b></div>
                <div><span>Coût explicite</span><b>{money(s.cost)}</b></div>
              </div>
              <div className={styles.checks}>
                {s.checks.map((c) => (
                  <div key={c.label}>
                    <span>{c.label}</span>
                    <b>{c.value}</b>
                    <strong>{c.pass === null ? "N/D" : c.pass ? "OK" : "À revoir"}</strong>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className={styles.empty}>
          <b>Aucun scénario défini.</b>
          <span>Renseigne les poids et contraintes pour comparer deux chemins.</span>
        </section>
      )}

      <section className={styles.panel}>
        <h2>Evidence & limits</h2>
        <div className={styles.limitGrid}>
          <article><b>Calculé</b><p>Poids, turnover, notionnel et coût explicite.</p></article>
          <article><b>Contrôlé</b><p>Position, secteur, cash et turnover saisis.</p></article>
          <article><b>Non calculé V1</b><p>Market impact, VaR, facteurs, ADV et days-to-liquidate.</p></article>
          <article><b>À vérifier</b><p>Risk Center, Terminal et workflow Comité.</p></article>
        </div>
        {(mandate || liquidity || rationale) ? (
          <div className={styles.notes}>
            <article><span>MANDAT</span><p>{mandate || "N/D"}</p></article>
            <article><span>LIQUIDITÉ</span><p>{liquidity || "N/D"}</p></article>
            <article><span>RATIONALE</span><p>{rationale || "N/D"}</p></article>
          </div>
        ) : null}
      </section>
    </main>
  );
}
