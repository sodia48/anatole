import Link from "next/link";
import styles from "@/components/legal/Legal.module.css";

export default function ConfidentialitePage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>ANATOLE · VIE PRIVÉE</span>
        <h1>Politique de confidentialité</h1>
        <p>Anatole limite la collecte aux données nécessaires au compte, à la synchronisation et à la fiabilité de la plateforme.</p>
        <div className={styles.meta}>Version du 1er août 2026</div>
      </header>

      <section className={styles.section}>
        <h2>Données du compte</h2>
        <ul>
          <li>Adresse courriel et nom affiché facultatif.</li>
          <li>Mot de passe stocké uniquement sous forme dérivée et salée.</li>
          <li>Watchlist, portefeuille de suivi, alertes, préférences et profil Anatole Conseil lorsque la synchronisation est activée.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Ce qui n’est pas demandé</h2>
        <p>Anatole ne demande aucun identifiant bancaire, numéro de carte, accès à un compte de courtage, pièce d’identité ou numéro d’assurance sociale.</p>
      </section>

      <section className={styles.section}>
        <h2>Contrôle de l’utilisateur</h2>
        <p>L’utilisateur peut exporter ses données, fermer ses sessions et supprimer définitivement son compte depuis le Centre de contrôle.</p>
      </section>

      <nav className={styles.links}>
        <Link href="/conditions">Conditions</Link>
        <Link href="/avis-financier">Avis financier</Link>
        <Link href="/parametres?section=account">Gérer mon compte</Link>
      </nav>
    </main>
  );
}
