"use client";

import Link from "next/link";
import styles from "@/components/legal/Legal.module.css";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { pick } from "@/lib/i18n";

export default function AvisFinancierPage() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>{pick(language, "ANATOLE · INFORMATION FINANCIÈRE", "ANATOLE · FINANCIAL INFORMATION")}</span>
        <h1>{pick(language, "Avis financier", "Financial notice")}</h1>
        <p>{pick(language, "Les contenus d’Anatole servent à comprendre et organiser l’information. Ils ne constituent pas un conseil financier, juridique, fiscal ou comptable.", "Anatole content helps users understand and organize information. It is not financial, legal, tax, or accounting advice.")}</p>
        <div className={styles.meta}>{pick(language, "Version du 1er août 2026", "Version dated August 1, 2026")}</div>
      </header>

      <section className={styles.notice}>
        <h2>{pick(language, "Aucune recommandation de placement", "No investment recommendations")}</h2>
        <p>{pick(language, "Anatole Conseil, le Screener, Terminal Pro, les alertes et les indicateurs décrivent des données, des scénarios et des risques. Ils ne disent pas à l’utilisateur quoi acheter ou vendre.", "Anatole Advisor, the Screener, Terminal Pro, alerts, and indicators describe data, scenarios, and risks. They do not tell users what to buy or sell.")}</p>
      </section>

      <section className={styles.section}>
        <h2>{pick(language, "Risques", "Risks")}</h2>
        <p>{pick(language, "La valeur des titres et des ETF peut fluctuer fortement. Les performances passées, scores, consensus, indicateurs techniques et simulations ne garantissent aucun résultat futur.", "The value of securities and ETFs may fluctuate significantly. Past performance, scores, consensus, technical indicators, and simulations do not guarantee future results.")}</p>
      </section>

      <section className={styles.section}>
        <h2>{pick(language, "Décisions importantes", "Important decisions")}</h2>
        <p>{pick(language, "Pour une décision adaptée à une situation personnelle, l’utilisateur devrait consulter un professionnel autorisé dans sa juridiction.", "For decisions tailored to a personal situation, users should consult an authorized professional in their jurisdiction.")}</p>
      </section>

      <nav className={styles.links}>
        <Link href="/conditions">{pick(language, "Conditions", "Terms")}</Link>
        <Link href="/confidentialite">{pick(language, "Confidentialité", "Privacy")}</Link>
        <Link href="/cockpit">{pick(language, "Retour à Anatole", "Back to Anatole")}</Link>
      </nav>
    </main>
  );
}
