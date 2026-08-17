import Link from "next/link";
import { ANATOLE_VERSION_LABEL } from "@/lib/version";
import styles from "./page.module.css";

export default function BienvenuePage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <span>ANATOLE {ANATOLE_VERSION_LABEL} · BÊTA PRIVÉE</span>
        <h1>Le marché canadien, organisé clairement.</h1>
        <p>Explore le TSX 60 et le Composite, construis ton espace de suivi et utilise les outils d’analyse d’Anatole sans recevoir de recommandations de placement.</p>
      </header>

      <section className={styles.steps}>
        <article><strong>1. Choisis ton univers</strong><p>Commence avec le TSX 60 ou élargis immédiatement au Composite.</p></article>
        <article><strong>2. Organise ton suivi</strong><p>Ajoute des titres à la Watchlist, au Comparateur ou au Portefeuille de suivi.</p></article>
        <article><strong>3. Garde le contrôle</strong><p>Synchronise tes données, règle les préférences et consulte la qualité des sources.</p></article>
      </section>

      <nav className={styles.actions}>
        <Link href="/cockpit">Ouvrir le Cockpit</Link>
        <Link href="/parametres?section=account">Compte et synchronisation</Link>
        <Link href="/avis-financier">Lire l’avis financier</Link>
      </nav>
    </main>
  );
}
