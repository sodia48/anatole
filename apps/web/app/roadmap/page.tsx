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
    items: ["Portefeuille local", "Alertes de marché", "Notifications navigateur", "Assistant contextuel", "Qualité des données", "Observabilité des sources"],
  },
  {
    title: "Bêta publique et comptes",
    version: "v0.8",
    status: "planned",
    items: ["Comptes utilisateurs", "PostgreSQL", "Synchronisation multiappareil", "Alertes serveur", "Rapports", "Feedback bêta"],
  },
];

const featureIds = ["comptes", "synchronisation", "alertes-serveur", "rapports", "feedback-beta"];

export default function RoadmapPage() {
  return (
    <div className="roadmap-page">
      <header className="panel roadmap-header">
        <div><span className="eyebrow">PARITÉ BÊTA STREAMLIT</span><h1>Migration Anatole</h1><p>La nouvelle plateforme progresse par blocs testables, sans fragiliser les sections déjà en production.</p></div>
        <div className="roadmap-progress"><strong>15</strong><span>sections actives</span><small>Cockpit · Focus · Watchlist · Screener · Actualités · Calendrier · ETF · IPO & insiders · Psychologie · Comparateur · Terminal Pro · Portefeuille · Alertes · Assistant · Qualité</small></div>
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
        <div><span className="eyebrow">PROCHAINE PHASE</span><h2>Comptes et synchronisation</h2><p>Le socle fonctionnel est complet. La prochaine étape concerne la persistance serveur et la bêta multiutilisateur.</p></div>
        <div className="feature-anchor-grid">{featureIds.map((id) => <span id={id} key={id}>{id.replace(/-/g, " ")}</span>)}</div>
        <Link href="/cockpit" className="primary-button">Retour au Cockpit</Link>
      </section>
    </div>
  );
}
