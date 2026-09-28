import Link from "next/link";
import styles from "./page.module.css";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] ?? "" : v ?? "";
const clean = (v: string | string[] | undefined, n = 1200) => first(v).trim().slice(0, n);
function num(v: string | string[] | undefined, min = -100000, max = 100000) {
  const raw = first(v).trim().replace(",", ".");
  if (!raw) return null;
  const x = Number(raw);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : null;
}
function fmt(v: number | null, unit: string, digits = 0) {
  if (v === null) return "N/D";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)} ${unit}`;
}

export default async function InstitutionalAttributionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const p = await searchParams;
  const symbol = clean(p.symbol, 15).toUpperCase().replace(/\.TO$/, "");
  const decisionRef = clean(p.decision_ref, 120);
  const period = clean(p.period, 80);
  const portfolioReturn = num(p.portfolio_return, -100, 1000);
  const benchmarkReturn = num(p.benchmark_return, -100, 1000);
  const components = [
    ["Allocation", num(p.allocation_bps)],
    ["Sélection", num(p.selection_bps)],
    ["FX", num(p.fx_bps)],
    ["Facteurs", num(p.factor_bps)],
    ["Timing", num(p.timing_bps)],
    ["Frais / autres", num(p.fees_bps)],
  ] as const;
  const entered = components.filter(([, v]) => v !== null);
  const excessBps = portfolioReturn !== null && benchmarkReturn !== null
    ? (portfolioReturn - benchmarkReturn) * 100 : null;
  const explainedBps = entered.length ? entered.reduce((s, [, v]) => s + (v ?? 0), 0) : null;
  const residualBps = excessBps !== null && explainedBps !== null ? excessBps - explainedBps : null;
  const thesis = clean(p.thesis);
  const expected = clean(p.expected);
  const actual = clean(p.actual);
  const changed = clean(p.changed);
  const lesson = clean(p.lesson);
  const process = clean(p.process, 30) || "inconclusive";
  const processLabels: Record<string,string> = {
    disciplined: "Processus discipliné", mixed: "Processus mixte",
    weak: "Processus à améliorer", inconclusive: "Évaluation non concluante",
  };
  const hasReview = Boolean(symbol || decisionRef || period || thesis || actual || lesson) ||
    portfolioReturn !== null || benchmarkReturn !== null || entered.length > 0;

  return (
    <main className={styles.shell} data-testid="institutional-attribution-center">
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel">← Command Center</Link>
          <span>ANATOLE INSTITUTIONAL · ATTRIBUTION & REVIEW</span>
          <h1>Performance Attribution & Decision Review</h1>
          <p>Compare le résultat d&apos;une décision à son benchmark et documente les contributions saisies par l&apos;analyste.</p>
        </div>
        <aside><strong>Outcome ≠ process quality</strong><span>Résultat, attribution et qualité du processus restent séparés.</span></aside>
      </header>

      <nav className={styles.nav}>
        <Link href="/portefeuille">Portefeuille →</Link>
        <Link href="/institutionnel/recherche">Research & Thesis →</Link>
        <Link href="/institutionnel/attribution/avancee">Advanced Attribution →</Link>
        <Link href="/institutionnel/comite">Comité →</Link>
        <Link href="/institutionnel/risque">Risk Center →</Link>
      </nav>

      <section className={styles.states}>
        <article><b>Decision Attribution</b><span>Bridge V1</span></article>
        <article><b>Advanced Attribution</b><span>Fondation structurée</span></article>
        <article><b>Committee Memo</b><span>Bridge actif</span></article>
        <article><b>Risk Context</b><span>Bridge actif</span></article>
      </section>

      <section className={styles.panel}>
        <h2>Construire le post-mortem</h2>
        <form method="get" className={styles.form}>
          <div className={styles.three}>
            <label>Titre<input name="symbol" defaultValue={symbol} placeholder="RY" /></label>
            <label>Référence décision<input name="decision_ref" defaultValue={decisionRef} placeholder="IC-2026-001" /></label>
            <label>Période<input name="period" defaultValue={period} placeholder="T3, 12 mois..." /></label>
          </div>
          <div className={styles.two}>
            <label>Rendement portefeuille / position %<input name="portfolio_return" defaultValue={first(p.portfolio_return)} placeholder="8" /></label>
            <label>Rendement benchmark %<input name="benchmark_return" defaultValue={first(p.benchmark_return)} placeholder="5" /></label>
          </div>
          <div className={styles.three}>
            <label>Allocation bps<input name="allocation_bps" defaultValue={first(p.allocation_bps)} placeholder="50" /></label>
            <label>Sélection bps<input name="selection_bps" defaultValue={first(p.selection_bps)} placeholder="200" /></label>
            <label>FX bps<input name="fx_bps" defaultValue={first(p.fx_bps)} placeholder="25" /></label>
          </div>
          <div className={styles.three}>
            <label>Facteurs bps<input name="factor_bps" defaultValue={first(p.factor_bps)} placeholder="10" /></label>
            <label>Timing bps<input name="timing_bps" defaultValue={first(p.timing_bps)} placeholder="15" /></label>
            <label>Frais / autres bps<input name="fees_bps" defaultValue={first(p.fees_bps)} placeholder="-10" /></label>
          </div>
          <label>Thèse initiale<textarea name="thesis" defaultValue={thesis} rows={4} /></label>
          <div className={styles.two}>
            <label>Ce qui était attendu<textarea name="expected" defaultValue={expected} rows={4} /></label>
            <label>Ce qui s&apos;est produit<textarea name="actual" defaultValue={actual} rows={4} /></label>
          </div>
          <div className={styles.two}>
            <label>Ce qui a changé<textarea name="changed" defaultValue={changed} rows={4} /></label>
            <label>Leçon à conserver<textarea name="lesson" defaultValue={lesson} rows={4} /></label>
          </div>
          <label>Évaluation humaine du processus<select name="process" defaultValue={process}>
            <option value="inconclusive">Évaluation non concluante</option>
            <option value="disciplined">Processus discipliné</option>
            <option value="mixed">Processus mixte</option>
            <option value="weak">Processus à améliorer</option>
          </select></label>
          <div className={styles.actions}><button type="submit">Générer la revue</button><Link href="/institutionnel/attribution">Effacer</Link></div>
        </form>
      </section>

      {hasReview ? (
        <section className={styles.memo} data-testid="institutional-attribution-memo">
          <header><div><span>DECISION POST-MORTEM</span><h2>{symbol || "Dossier sans ticker"}</h2></div><b>{period || "Période N/D"} · {processLabels[process] ?? processLabels.inconclusive}</b></header>
          <div className={styles.metrics}>
            <article><span>RENDEMENT</span><strong>{fmt(portfolioReturn,"% ",1)}</strong></article>
            <article><span>BENCHMARK</span><strong>{fmt(benchmarkReturn,"% ",1)}</strong></article>
            <article><span>EXCESS RETURN</span><strong>{fmt(excessBps,"bps")}</strong></article>
            <article><span>EXPLIQUÉ</span><strong>{fmt(explainedBps,"bps")}</strong></article>
            <article><span>RÉSIDUEL</span><strong>{fmt(residualBps,"bps")}</strong></article>
            <article><span>COUVERTURE</span><strong>{entered.length}/6</strong></article>
          </div>
          <div className={styles.parts}>{components.map(([name,v]) => <article key={name}><span>{name}</span><strong>{fmt(v,"bps")}</strong></article>)}</div>
          <div className={styles.grid}>
            <article><span>THÈSE INITIALE</span><p>{thesis || "N/D"}</p></article>
            <article><span>ATTENDU</span><p>{expected || "N/D"}</p></article>
            <article><span>RÉALISÉ</span><p>{actual || "N/D"}</p></article>
            <article><span>CE QUI A CHANGÉ</span><p>{changed || "N/D"}</p></article>
            <article className={styles.full}><span>LEÇON</span><p>{lesson || "N/D"}</p></article>
          </div>
          <footer>
            <span>{entered.length === 6 ? "Les six composantes saisies sont rapprochées de l'excess return." : "Attribution partielle."} Les contributions sont des entrées analyste V1, pas une attribution automatique certifiée.</span>
            <div><Link href="/institutionnel/recherche">Revoir la thèse →</Link><Link href="/institutionnel/comite">Revoir la décision →</Link></div>
          </footer>
        </section>
      ) : (
        <section className={styles.empty}><b>Aucune revue structurée.</b><span>Renseigne résultat, benchmark et processus pour produire un post-mortem.</span></section>
      )}
    </main>
  );
}
