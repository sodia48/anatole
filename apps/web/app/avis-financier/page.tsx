import Link from "next/link";
import styles from "@/components/legal/Legal.module.css";

export default function AvisFinancierPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>ANATOLE · INFORMATION FINANCIÈRE</span>
        <h1>Avis financier</h1>
        <p>Les contenus d’Anatole servent à comprendre et organiser l’information. Ils ne constituent pas un conseil financier, juridique, fiscal ou comptable.</p>
        <div className={styles.meta}>Version du 1er août 2026</div>
      </header>

      <section className={styles.notice}>
        <h2>Aucune recommandation de placement</h2>
        <p>Anatole Conseil, le Screener, Terminal Pro, les alertes et les indicateurs décrivent des données, des scénarios et des risques. Ils ne disent pas à l’utilisateur quoi acheter ou vendre.</p>
      </section>

      <section className={styles.section}>
        <h2>Risques</h2>
        <p>La valeur des titres et des ETF peut fluctuer fortement. Les performances passées, scores, consensus, indicateurs techniques et simulations ne garantissent aucun résultat futur.</p>
      </section>

      <section className={styles.section}>
        <h2>Décisions importantes</h2>
        <p>Pour une décision adaptée à une situation personnelle, l’utilisateur devrait consulter un professionnel autorisé dans sa juridiction.</p>
      </section>

      <nav className={styles.links}>
        <Link href="/conditions">Conditions</Link>
        <Link href="/confidentialite">Confidentialité</Link>
        <Link href="/cockpit">Retour à Anatole</Link>
      </nav>
    </main>
  );
}
