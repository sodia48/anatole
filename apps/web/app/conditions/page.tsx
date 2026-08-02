import Link from "next/link";
import styles from "@/components/legal/Legal.module.css";

export default function ConditionsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>ANATOLE · DOCUMENT LÉGAL</span>
        <h1>Conditions d’utilisation</h1>
        <p>Anatole est une plateforme d’information financière et d’aide à l’organisation. Elle ne fournit pas de recommandation personnalisée d’achat, de vente ou de conservation.</p>
        <div className={styles.meta}>Version du 1er août 2026</div>
      </header>

      <section className={styles.section}>
        <h2>Utilisation du service</h2>
        <p>L’utilisateur demeure responsable de ses décisions. Les données peuvent être retardées, incomplètes ou temporairement indisponibles. Anatole peut modifier, suspendre ou retirer une fonction bêta afin de protéger la stabilité du service.</p>
      </section>

      <section className={styles.section}>
        <h2>Compte et sécurité</h2>
        <ul>
          <li>Un compte doit utiliser une adresse courriel valide.</li>
          <li>Le mot de passe et les sessions ne doivent pas être partagés.</li>
          <li>Toute utilisation abusive, automatisée ou destinée à contourner les limites techniques peut entraîner une suspension.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Données et disponibilité</h2>
        <p>Les cotations, historiques, estimations, nouvelles et indicateurs proviennent de sources externes. Anatole affiche leur fraîcheur lorsque cette information est disponible, sans garantir une disponibilité continue.</p>
      </section>

      <nav className={styles.links}>
        <Link href="/confidentialite">Confidentialité</Link>
        <Link href="/avis-financier">Avis financier</Link>
        <Link href="/parametres?section=account">Retour au compte</Link>
      </nav>
    </main>
  );
}
