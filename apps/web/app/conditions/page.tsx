"use client";

import Link from "next/link";
import styles from "@/components/legal/Legal.module.css";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { pick } from "@/lib/i18n";

export default function ConditionsPage() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>{pick(language, "ANATOLE · DOCUMENT LÉGAL", "ANATOLE · LEGAL DOCUMENT")}</span>
        <h1>{pick(language, "Conditions d’utilisation", "Terms of use")}</h1>
        <p>{pick(language, "Anatole est une plateforme d’information financière et d’aide à l’organisation. Elle ne fournit pas de recommandation personnalisée d’achat, de vente ou de conservation.", "Anatole is a financial information and organization platform. It does not provide personalized recommendations to buy, sell, or hold investments.")}</p>
        <div className={styles.meta}>{pick(language, "Version du 1er août 2026", "Version dated August 1, 2026")}</div>
      </header>

      <section className={styles.section}>
        <h2>{pick(language, "Utilisation du service", "Use of the service")}</h2>
        <p>{pick(language, "L’utilisateur demeure responsable de ses décisions. Les données peuvent être retardées, incomplètes ou temporairement indisponibles. Anatole peut modifier, suspendre ou retirer une fonction bêta afin de protéger la stabilité du service.", "Users remain responsible for their decisions. Data may be delayed, incomplete, or temporarily unavailable. Anatole may modify, suspend, or remove a beta feature to protect service stability.")}</p>
      </section>

      <section className={styles.section}>
        <h2>{pick(language, "Compte et sécurité", "Account and security")}</h2>
        <ul>
          <li>{pick(language, "Un compte doit utiliser une adresse courriel valide.", "An account must use a valid email address.")}</li>
          <li>{pick(language, "Le mot de passe et les sessions ne doivent pas être partagés.", "Passwords and sessions must not be shared.")}</li>
          <li>{pick(language, "Toute utilisation abusive, automatisée ou destinée à contourner les limites techniques peut entraîner une suspension.", "Abusive or automated use intended to bypass technical limits may result in suspension.")}</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>{pick(language, "Données et disponibilité", "Data and availability")}</h2>
        <p>{pick(language, "Les cotations, historiques, estimations, nouvelles et indicateurs proviennent de sources externes. Anatole affiche leur fraîcheur lorsque cette information est disponible, sans garantir une disponibilité continue.", "Quotes, histories, estimates, news, and indicators come from external sources. Anatole displays freshness when available but does not guarantee continuous availability.")}</p>
      </section>

      <nav className={styles.links}>
        <Link href="/confidentialite">{pick(language, "Confidentialité", "Privacy")}</Link>
        <Link href="/avis-financier">{pick(language, "Avis financier", "Financial notice")}</Link>
        <Link href="/parametres?section=account">{pick(language, "Retour au compte", "Back to account")}</Link>
      </nav>
    </main>
  );
}
