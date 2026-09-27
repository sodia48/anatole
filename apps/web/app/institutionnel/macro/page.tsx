import Link from "next/link";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;
type Direction = "up" | "down" | "flat";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
function clean(value: string | string[] | undefined, max = 1200): string {
  return first(value).trim().slice(0, max);
}
function dir(value: string | string[] | undefined): Direction {
  const raw = first(value);
  return raw === "up" || raw === "down" ? raw : "flat";
}
function label(value: Direction): string {
  return value === "up" ? "En hausse" : value === "down" ? "En baisse" : "Stable / mixte";
}
function regime(growth: Direction, inflation: Direction): string {
  if (growth === "up" && inflation === "down") return "Croissance + désinflation";
  if (growth === "up" && inflation === "up") return "Reflation";
  if (growth === "down" && inflation === "up") return "Ralentissement inflationniste";
  if (growth === "down" && inflation === "down") return "Ralentissement désinflationniste";
  return "Transition / régime mixte";
}
function sensitivities(rates: Direction, credit: Direction, cad: Direction, oil: Direction) {
  const items: string[] = [];
  if (rates !== "flat") items.push("Taux : duration, immobilier, utilities et refinancement.");
  if (credit !== "flat") items.push("Crédit : spreads, bilans endettés et refinancement.");
  if (cad !== "flat") items.push("CAD : exportateurs, importateurs et conversion des revenus étrangers.");
  if (oil !== "flat") items.push("Pétrole : énergie, transport, intrants industriels et régions productrices.");
  return items.length ? items : ["Aucune sensibilité directionnelle forte saisie."];
}

export default async function InstitutionalMacroPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const p = await searchParams;
  const growth = dir(p.growth);
  const inflation = dir(p.inflation);
  const rates = dir(p.rates);
  const credit = dir(p.credit);
  const cad = dir(p.cad);
  const oil = dir(p.oil);
  const horizon = clean(p.horizon, 80);
  const evidence = clean(p.evidence);
  const provinces = clean(p.provinces, 500);
  const portfolio = clean(p.portfolio);
  const invalidation = clean(p.invalidation);
  const hasMemo =
    [growth, inflation, rates, credit, cad, oil].some((v) => v !== "flat") ||
    Boolean(horizon || evidence || provinces || portfolio || invalidation);

  return (
    <main className={styles.shell} data-testid="institutional-macro-center">
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel">← Command Center</Link>
          <span>ANATOLE INSTITUTIONAL · MACRO & REGIMES</span>
          <h1>Macro & Regime Center</h1>
          <p>
            Relie Canada 360, psychologie de marché, calendrier et actualités à un
            scénario macro explicite. Le scénario reste une hypothèse utilisateur,
            jamais une prévision présentée comme un fait.
          </p>
        </div>
        <aside>
          <strong>Scenario ≠ forecast</strong>
          <span>Données observées et hypothèses restent clairement séparées.</span>
        </aside>
      </header>

      <nav className={styles.nav}>
        <Link href="/canada">Canada 360 →</Link>
        <Link href="/psychologie">Psychologie marché →</Link>
        <Link href="/calendrier">Calendrier macro →</Link>
        <Link href="/actualites">Actualités →</Link>
        <Link href="/institutionnel/risque">Risk Center →</Link>
      </nav>

      <section className={styles.states}>
        <article><b>Macro Transmission</b><span>Bridge actif</span></article>
        <article><b>Economic Regime</b><span>Bridge V1</span></article>
        <article><b>Canada 360</b><span>Données live</span></article>
        <article><b>Market Psychology</b><span>Données live</span></article>
      </section>

      <section className={styles.panel}>
        <h2>Construire un scénario de régime</h2>
        <form method="get" className={styles.form}>
          <div className={styles.three}>
            <label>Croissance<select name="growth" defaultValue={growth}><option value="up">Accélère</option><option value="flat">Stable / mixte</option><option value="down">Ralentit</option></select></label>
            <label>Inflation<select name="inflation" defaultValue={inflation}><option value="up">Monte</option><option value="flat">Stable / mixte</option><option value="down">Baisse</option></select></label>
            <label>Taux<select name="rates" defaultValue={rates}><option value="up">Montent</option><option value="flat">Stables / mixtes</option><option value="down">Baissent</option></select></label>
          </div>
          <div className={styles.three}>
            <label>Crédit<select name="credit" defaultValue={credit}><option value="up">Se resserre</option><option value="flat">Stable / mixte</option><option value="down">Se détend</option></select></label>
            <label>CAD<select name="cad" defaultValue={cad}><option value="up">Se renforce</option><option value="flat">Stable / mixte</option><option value="down">S&apos;affaiblit</option></select></label>
            <label>Pétrole<select name="oil" defaultValue={oil}><option value="up">Monte</option><option value="flat">Stable / mixte</option><option value="down">Baisse</option></select></label>
          </div>
          <label>Horizon<input name="horizon" defaultValue={horizon} placeholder="3-6 mois, 12 mois..." /></label>
          <div className={styles.two}>
            <label>Preuves / données à vérifier<textarea name="evidence" defaultValue={evidence} rows={5} /></label>
            <label>Provinces / régions à surveiller<textarea name="provinces" defaultValue={provinces} rows={5} /></label>
          </div>
          <div className={styles.two}>
            <label>Transmission vers le portefeuille<textarea name="portfolio" defaultValue={portfolio} rows={5} /></label>
            <label>Conditions d&apos;invalidation<textarea name="invalidation" defaultValue={invalidation} rows={5} /></label>
          </div>
          <div className={styles.actions}>
            <button type="submit">Générer le mémo macro</button>
            <Link href="/institutionnel/macro">Effacer</Link>
          </div>
        </form>
      </section>

      {hasMemo ? (
        <section className={styles.memo} data-testid="institutional-macro-memo">
          <header><div><span>HYPOTHETICAL REGIME MEMO</span><h2>{regime(growth, inflation)}</h2></div><b>{horizon || "Horizon N/D"}</b></header>
          <div className={styles.metrics}>
            {[["Croissance", growth],["Inflation", inflation],["Taux", rates],["Crédit", credit],["CAD", cad],["Pétrole", oil]].map(([name, value]) => (
              <div key={name}><span>{name}</span><b>{label(value as Direction)}</b></div>
            ))}
          </div>
          <div className={styles.grid}>
            <article><span>SENSIBILITÉS À INVESTIGUER</span><ul>{sensitivities(rates, credit, cad, oil).map((item) => <li key={item}>{item}</li>)}</ul></article>
            <article><span>PREUVES / DONNÉES</span><p>{evidence || "N/D"}</p></article>
            <article><span>PROVINCES / RÉGIONS</span><p>{provinces || "N/D"}</p></article>
            <article><span>TRANSMISSION PORTEFEUILLE</span><p>{portfolio || "N/D"}</p></article>
            <article className={styles.full}><span>INVALIDATION</span><p>{invalidation || "N/D"}</p></article>
          </div>
          <footer>
            <span>Le label de régime découle seulement des directions sélectionnées; il ne constitue pas une prévision.</span>
            <div><Link href="/canada">Valider dans Canada 360 →</Link><Link href="/psychologie">Comparer au marché →</Link></div>
          </footer>
        </section>
      ) : (
        <section className={styles.empty}><b>Aucun scénario macro structuré.</b><span>Sélectionne des hypothèses pour produire un mémo explicitement hypothétique.</span></section>
      )}
    </main>
  );
}
