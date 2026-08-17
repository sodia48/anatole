"use client";

import Link from "next/link";
import styles from "@/components/legal/Legal.module.css";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { pick } from "@/lib/i18n";

export default function ConfidentialitePage() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>{pick(language, "ANATOLE · VIE PRIVÉE", "ANATOLE · PRIVACY")}</span>
        <h1>{pick(language, "Politique de confidentialité", "Privacy policy")}</h1>
        <p>{pick(language, "Anatole limite la collecte aux données nécessaires au compte, à la synchronisation et à la fiabilité de la plateforme.", "Anatole limits collection to data required for accounts, synchronization, and platform reliability.")}</p>
        <div className={styles.meta}>{pick(language, "Version du 1er août 2026", "Version dated August 1, 2026")}</div>
      </header>

      <section className={styles.section}>
        <h2>{pick(language, "Données du compte", "Account data")}</h2>
        <ul>
          <li>{pick(language, "Adresse courriel et nom affiché facultatif.", "Email address and optional display name.")}</li>
          <li>{pick(language, "Mot de passe stocké uniquement sous forme dérivée et salée.", "Password stored only as a salted derived value.")}</li>
          <li>{pick(language, "Watchlist, portefeuille de suivi, alertes, préférences et profil Anatole Conseil lorsque la synchronisation est activée.", "Watchlist, tracking portfolio, alerts, preferences, and Anatole Advisor profile when synchronization is enabled.")}</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>{pick(language, "Ce qui n’est pas demandé", "What Anatole does not request")}</h2>
        <p>{pick(language, "Anatole ne demande aucun identifiant bancaire, numéro de carte, accès à un compte de courtage, pièce d’identité ou numéro d’assurance sociale.", "Anatole does not request banking credentials, card numbers, brokerage access, identity documents, or social insurance numbers.")}</p>
      </section>

      <section className={styles.section}>
        <h2>{pick(language, "Contrôle de l’utilisateur", "User control")}</h2>
        <p>{pick(language, "L’utilisateur peut exporter ses données, fermer ses sessions et supprimer définitivement son compte depuis le Centre de contrôle.", "Users can export their data, close sessions, and permanently delete their account from the Control Center.")}</p>
      </section>

      <nav className={styles.links}>
        <Link href="/conditions">{pick(language, "Conditions", "Terms")}</Link>
        <Link href="/avis-financier">{pick(language, "Avis financier", "Financial notice")}</Link>
        <Link href="/parametres?section=account">{pick(language, "Gérer mon compte", "Manage my account")}</Link>
      </nav>
    </main>
  );
}
