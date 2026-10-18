import Link from "next/link";
import { FocusGlyph } from "@/components/focus-pro/FocusGlyph";
import styles from "./FundamentalPortal.module.css";

function Localized({ fr, en }: { fr: string; en: string }) {
  return <><span data-lang="fr">{fr}</span><span data-lang="en">{en}</span></>;
}

const modules = [
  { id: "diagnostic", icon: "Radar", fr: "Diagnostic 360°", en: "360° diagnostic", descriptionFr: "Santé financière et qualité des bénéfices", descriptionEn: "Financial health and earnings quality" },
  { id: "peers", icon: "GitCompareArrows", fr: "Comparateur sectoriel", en: "Sector comparison", descriptionFr: "Concurrents, ratios et classements", descriptionEn: "Peers, ratios and rankings" },
  { id: "scenarios", icon: "SlidersHorizontal", fr: "Simulateur", en: "Simulator", descriptionFr: "Hypothèses, scénarios et valorisation", descriptionEn: "Assumptions, scenarios and valuation" },
  { id: "documents", icon: "FileText", fr: "Analyse documentaire", en: "Document research", descriptionFr: "Rapports officiels et traçabilité", descriptionEn: "Official reports and traceability" },
  { id: "sector", icon: "Landmark", fr: "Intelligence sectorielle", en: "Sector intelligence", descriptionFr: "Indicateurs propres à chaque industrie", descriptionEn: "Industry-specific metrics" },
  { id: "alerts", icon: "BellRing", fr: "Surveillance", en: "Monitoring", descriptionFr: "Alertes et changements fondamentaux", descriptionEn: "Alerts and fundamental changes" },
  { id: "capital", icon: "TrendingUp", fr: "Analystes et capital", en: "Analysts and capital", descriptionFr: "Révisions, dividendes et investissements", descriptionEn: "Revisions, dividends and investment" },
  { id: "assistant", icon: "Bot", fr: "Assistant financier", en: "Financial assistant", descriptionFr: "Explications et analyses transversales", descriptionEn: "Explanations and cross-cutting analysis" },
] as const;

export function FundamentalPortal({ ticker }: { ticker: string }) {
  return <section className={styles.portal} aria-label="Anatole Fundamental Intelligence 360">
    <header className={styles.header}>
      <span className={styles.brandIcon}><FocusGlyph name="Sparkles" size={24} /></span>
      <div><p className={styles.eyebrow}>ANATOLE INTELLIGENCE</p>
        <h2>Anatole Fundamental Intelligence 360</h2>
        <p><Localized fr="Un environnement d’analyse financière entièrement intégré" en="A fully integrated financial research environment" /></p>
        <span className={styles.ticker}>{ticker}</span>
      </div>
    </header>
    <div className={styles.grid}>{modules.map(item => {
      const href = item.id === "alerts" ? "/alertes" : item.id === "assistant" ? `/assistant?symbol=${encodeURIComponent(ticker)}`
        : `/focus/${encodeURIComponent(ticker)}?view=${item.id}`;
      return <Link key={item.id} className={styles.module} href={href}>
        <span className={styles.moduleIcon}><FocusGlyph name={item.icon} size={23} strokeWidth={1.8} /></span>
        <strong><Localized fr={item.fr} en={item.en} /></strong>
        <span className={styles.description}><Localized fr={item.descriptionFr} en={item.descriptionEn} /></span>
      </Link>;
    })}</div>
    <p className={styles.disclaimer}><FocusGlyph name="Activity" size={16} /><Localized
      fr="Données sourcées, périodes et méthodes visibles dans chaque module. Aucun conseil d’investissement."
      en="Sources, periods and methods are visible in each module. No investment advice." /></p>
  </section>;
}
