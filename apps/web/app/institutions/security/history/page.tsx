import Link from "next/link";
import { positionHistory } from "@/lib/institution-history-server";
import styles from "../../history.module.css";

export const dynamic = "force-dynamic";

export default async function SecurityHistoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 80);
  const history = query ? await positionHistory(query) : null;
  const periods = history?.periods ?? [];
  const maximum = Math.max(1, ...periods.map((period) => period.value));
  const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
  return <main className={styles.page}>
    <Link className={styles.back} href="/institutions">← Retour aux institutions</Link>
    <header className={styles.intro}><span className={styles.eyebrow}>SEC EDGAR · Form 13F</span><h1>Historique d’une position · {periods[0]?.ticker ?? query}</h1><p>Valeur et nombre de gestionnaires déclarants, par trimestre réellement publié. Ces données ne constituent pas un historique de transactions.</p></header>
    <form className={styles.search} action="/institutions/security/history" method="get"><label htmlFor="history-query">Ticker vérifié ou CUSIP</label><input id="history-query" name="q" defaultValue={query} maxLength={80} required /><button type="submit">Rechercher</button></form>
    {query && !history ? <p className={styles.notice}>Historique momentanément indisponible ou symbole non vérifié. Essayez le CUSIP officiel.</p> : query && periods.length === 0 ? <p className={styles.notice}>Aucune période publiée pour ce titre.</p> : periods.length > 0 && <>
      {periods.length === 1 && <p className={styles.notice}>Un seul trimestre est disponible pour ce titre.</p>}
      <section className={styles.chart} aria-label="Évolution de la position déclarée"><h2>Valeur déclarée · {periods[0].issuer}</h2><p>USD · données du Form 13F · sans extrapolation</p><ol className={styles.bars}>{periods.map((period) => <li key={period.report_period}><span className={styles.bar} style={{ height: `${Math.max(6, period.value / maximum * 150)}px` }} /><strong>{money.format(period.value)}</strong><small>{period.report_period}</small></li>)}</ol></section>
      <section className={styles.details} aria-label="Détails des positions">{periods.toReversed().map((period) => <details key={period.report_period}><summary>{period.report_period} · {period.managers_holding} gestionnaires</summary><dl><dt>Valeur déclarée</dt><dd>{money.format(period.value)}</dd><dt>Actions déclarées (SH)</dt><dd>{period.shares === null ? "N/D" : new Intl.NumberFormat("fr-CA").format(period.shares)}</dd><dt>Gestionnaires détenteurs</dt><dd>{period.managers_holding}</dd><dt>CUSIP</dt><dd>{period.cusip}</dd></dl>{period.filing_urls.filter((url) => url.startsWith("https://www.sec.gov/")).map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">Dépôt SEC {index + 1} ↗ </a>)}</details>)}</section>
    </>}
  </main>;
}
