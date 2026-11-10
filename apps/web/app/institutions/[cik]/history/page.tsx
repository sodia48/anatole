import Link from "next/link";
import { managerHistory } from "@/lib/institution-history-server";
import styles from "../../history.module.css";

export const dynamic = "force-dynamic";

export default async function ManagerHistoryPage({ params }: { params: Promise<{ cik: string }> }) {
  const { cik } = await params;
  const history = await managerHistory(cik);
  const periods = history?.periods ?? [];
  const maximum = Math.max(1, ...periods.map((period) => period.total_13f_value));
  const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
  return <main className={styles.page}>
    <Link className={styles.back} href={`/institutions/${encodeURIComponent(cik)}`}>← Retour au gestionnaire</Link>
    <header className={styles.intro}><span className={styles.eyebrow}>SEC EDGAR · Form 13F</span><h1>Historique trimestriel · {history?.name ?? cik}</h1><p>Seuls les trimestres publiés dans le stockage Anatole apparaissent. Les variations de valeur ne représentent pas nécessairement des achats ou des ventes.</p></header>
    {!history ? <p className={styles.notice}>Historique momentanément indisponible.</p> : periods.length === 0 ? <p className={styles.notice}>Aucun trimestre publié pour ce gestionnaire.</p> : <>
      {periods.length === 1 && <p className={styles.notice}>Un seul trimestre est disponible. La série sera complétée après publication de nouveaux dépôts validés.</p>}
      <section className={styles.chart} aria-label="Évolution de la valeur déclarée"><h2>Valeur des positions 13F déclarées</h2><p>USD · fin de trimestre · données officielles publiées</p><ol className={styles.bars}>{periods.map((period) => <li key={period.report_period}><span className={styles.bar} style={{ height: `${Math.max(6, period.total_13f_value / maximum * 150)}px` }} /><strong>{money.format(period.total_13f_value)}</strong><small>{period.report_period}</small></li>)}</ol></section>
      <section className={styles.details} aria-label="Détails trimestriels">{periods.toReversed().map((period) => <details key={period.report_period}><summary>{period.report_period} · {money.format(period.total_13f_value)}</summary><dl><dt>Titres déclarés</dt><dd>{period.holdings_count}</dd><dt>Concentration 10 premiers</dt><dd>{period.top10_concentration_percent.toFixed(1)} %</dd><dt>Nouvelles positions</dt><dd>{period.comparison_available ? period.new_positions_count : "N/D"}</dd><dt>Positions fermées</dt><dd>{period.comparison_available ? period.closed_positions_count : "N/D"}</dd><dt>Dépôt du</dt><dd>{period.filed_at}</dd></dl>{period.filing_url.startsWith("https://www.sec.gov/") && <a href={period.filing_url} target="_blank" rel="noreferrer">Ouvrir le dépôt SEC</a>}</details>)}</section>
    </>}
  </main>;
}
