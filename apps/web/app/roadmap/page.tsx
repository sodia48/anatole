import Link from "next/link";
import { CheckCircle2, Clock3, Layers3 } from "lucide-react";

const phases = [
  {
    title: "Socle plateforme",
    version: "v0.4",
    status: "done",
    items: ["Navigation desktop et mobile", "Recherche universelle Ctrl K", "Préférences persistantes", "État global de l’API", "Pont Next.js vers FastAPI"],
  },
  {
    title: "Marchés",
    version: "v0.5",
    status: "done",
    items: ["Screener TSX 60", "Actualités officielles", "Calendrier économique", "Répertoire ETF", "Psychologie du marché", "IPO et transactions d’initiés"],
  },
  {
    title: "Analyse professionnelle",
    version: "v0.6",
    status: "done",
    items: ["Focus Chart Studio", "Comparateur multi-actifs", "Corrélations", "Terminal Pro", "Radar d'opportunités"],
  },
  {
    title: "Espace utilisateur et intelligence",
    version: "v0.7",
    status: "done",
    items: ["Portefeuille local", "Alertes de marché", "Notifications navigateur", "Anatole Conseil sans recommandations", "Qualité des données", "Observabilité des sources"],
  },
  {
    title: "Fiabilité production et bêta privée",
    version: "v0.8",
    status: "done",
    items: ["X-Request-ID de bout en bout", "Mesure des erreurs 5xx et latences", "Dernière donnée valide", "Signalements bêta intégrés", "Tests Playwright", "Quality gate GitHub"],
  },
  {
    title: "Comptes et synchronisation",
    version: "v0.9",
    status: "active",
    items: ["Compte optionnel", "Sessions sécurisées", "PostgreSQL ou SQLite", "Synchronisation multiappareil", "Migration des données locales", "Gestion de toutes les sessions"],
  },
  {
    title: "Notifications et historique",
    version: "v1.0",
    status: "planned",
    items: ["Alertes côté serveur", "Historique des déclenchements", "Notifications hors application", "Récupération de compte", "Export et suppression du compte"],
  },
];

const featureIds = ["compte-optionnel", "sessions", "postgresql", "migration-locale", "synchronisation"];

export default function RoadmapPage() {
  return (
    <div className="roadmap-page">
      <header className="panel roadmap-header">
        <div><span className="eyebrow">PARITÉ BÊTA STREAMLIT</span><h1>Migration Anatole</h1><p>La nouvelle plateforme progresse par blocs testables, sans fragiliser les sections déjà en production.</p></div>
        <div className="roadmap-progress"><strong>16</strong><span>sections actives</span><small>Cockpit · Focus · Watchlist · Screener · Actualités · Calendrier · ETF · IPO & insiders · Psychologie · Comparateur · Terminal Pro · Portefeuille · Alertes · Anatole Conseil · Qualité · Compte</small></div>
      </header>

      <section className="roadmap-summary">
        <article className="panel"><CheckCircle2 size={21} /><div><strong>Backend en ligne</strong><span>FastAPI sur Render</span></div></article>
        <article className="panel"><CheckCircle2 size={21} /><div><strong>Frontend en ligne</strong><span>Next.js sur Vercel</span></div></article>
        <article className="panel"><Layers3 size={21} /><div><strong>Architecture modulaire</strong><span>Migration section par section</span></div></article>
      </section>

      <section className="roadmap-timeline">
        {phases.map((phase) => (
          <article className={`panel roadmap-phase roadmap-${phase.status}`} key={phase.version}>
            <div className="roadmap-phase-marker">{phase.status === "done" || phase.status === "active" ? <CheckCircle2 size={20} /> : <Clock3 size={20} />}</div>
            <div className="roadmap-phase-copy">
              <div className="roadmap-phase-title"><span>{phase.version}</span><h2>{phase.title}</h2><em>{phase.status === "done" ? "Terminé" : phase.status === "active" ? "En cours" : phase.status === "next" ? "Prochaine" : "Planifiée"}</em></div>
              <div className="roadmap-items">{phase.items.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
          </article>
        ))}
      </section>

      <section className="panel feature-index">
        <div><span className="eyebrow">PHASE ACTIVE</span><h2>Compte et synchronisation</h2><p>Anatole reste entièrement utilisable en mode local. Le compte ajoute une restauration sécurisée de l’espace utilisateur sur plusieurs appareils.</p></div>
        <div className="feature-anchor-grid">{featureIds.map((id) => <span id={id} key={id}>{id.replace(/-/g, " ")}</span>)}</div>
        <Link href="/cockpit" className="primary-button">Retour au Cockpit</Link>
      </section>
    </div>
  );
}
