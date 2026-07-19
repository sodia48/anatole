import Link from "next/link";
import { CheckCircle2, Clock3, Layers3 } from "lucide-react";

const phases = [
  {
    title: "Socle plateforme",
    version: "v0.4",
    status: "active",
    items: ["Navigation complète desktop et mobile", "Recherche universelle Ctrl K", "Préférences persistantes", "État global de l’API", "Cadences live centralisées"],
  },
  {
    title: "Marchés",
    version: "v0.5",
    status: "next",
    items: ["Screener TSX 60 et Composite", "Actualités", "Calendrier économique", "ETF", "IPO", "Insiders", "Psychologie du marché"],
  },
  {
    title: "Analyse professionnelle",
    version: "v0.6",
    status: "planned",
    items: ["Focus Chart Studio", "Outils de dessin persistants", "Comparateur", "Backtesting", "Corrélations", "Terminal Pro"],
  },
  {
    title: "Espace utilisateur",
    version: "v0.7",
    status: "planned",
    items: ["Comptes", "PostgreSQL", "Portefeuille", "Alertes", "Notifications", "Rapports", "Synchronisation multiappareil"],
  },
  {
    title: "Intelligence et bêta publique",
    version: "v0.8",
    status: "planned",
    items: ["Assistant contextuel", "Qualité des données", "Consentement", "Feedback", "Diagnostics administrateur", "État des sources"],
  },
];

const featureIds = ["screener", "actualites", "calendrier", "etf", "ipo", "comparateur", "psychologie", "terminal", "portefeuille", "alertes", "assistant", "qualite"];

export default function RoadmapPage() {
  return (
    <div className="roadmap-page">
      <header className="panel roadmap-header">
        <div><span className="eyebrow">PARITÉ BÊTA STREAMLIT</span><h1>Migration Anatole</h1><p>La nouvelle plateforme progresse par blocs testables, sans fragiliser Cockpit, Focus ou Watchlist.</p></div>
        <div className="roadmap-progress"><strong>3</strong><span>fonctions actives</span><small>Cockpit · Focus · Watchlist</small></div>
      </header>

      <section className="roadmap-summary">
        <article className="panel"><CheckCircle2 size={21} /><div><strong>Backend en ligne</strong><span>FastAPI sur Render</span></div></article>
        <article className="panel"><CheckCircle2 size={21} /><div><strong>Frontend en ligne</strong><span>Next.js sur Vercel</span></div></article>
        <article className="panel"><Layers3 size={21} /><div><strong>Architecture modulaire</strong><span>Migration section par section</span></div></article>
      </section>

      <section className="roadmap-timeline">
        {phases.map((phase, index) => (
          <article className={`panel roadmap-phase roadmap-${phase.status}`} key={phase.version}>
            <div className="roadmap-phase-marker">{phase.status === "active" ? <CheckCircle2 size={20} /> : <Clock3 size={20} />}</div>
            <div className="roadmap-phase-copy">
              <div className="roadmap-phase-title"><span>{phase.version}</span><h2>{phase.title}</h2>{phase.status === "active" ? <em>En cours</em> : phase.status === "next" ? <em>Prochaine</em> : <em>Planifiée</em>}</div>
              <div className="roadmap-items">{phase.items.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
          </article>
        ))}
      </section>

      <section className="panel feature-index">
        <div><span className="eyebrow">REGISTRE</span><h2>Sections de la bêta à migrer</h2><p>Les liens « Bientôt » de la navigation arrivent ici jusqu’à leur activation.</p></div>
        <div className="feature-anchor-grid">
          {featureIds.map((id) => <span id={id} key={id}>{id.replace(/-/g, " ")}</span>)}
        </div>
        <Link href="/cockpit" className="primary-button">Retour au Cockpit</Link>
      </section>
    </div>
  );
}
