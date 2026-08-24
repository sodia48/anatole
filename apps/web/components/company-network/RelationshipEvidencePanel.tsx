"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type { CompanyNetworkSnapshot, CompanyRelationship } from "@/lib/types";

import {
  availabilityLabel,
  confidenceLabel,
  materialityLabel,
  relationshipLabel,
  relationshipStatusLabel,
  sourceLabel,
} from "./labels";
import styles from "./CompanyNetwork.module.css";

function number(value: number, currency?: string | null): string {
  return new Intl.NumberFormat("fr-CA", { style: currency ? "currency" : "decimal", currency: currency ?? undefined, maximumFractionDigits: 2 }).format(value);
}

export function RelationshipEvidencePanel({ snapshot, selected, language, onSelect }: { snapshot: CompanyNetworkSnapshot; selected: CompanyRelationship | null; language: AnatoleLanguage; onSelect: (relationship: CompanyRelationship) => void }) {
  const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const dependencies = snapshot.relationships.filter((item) => item.materiality === "critical" || item.materiality === "material");
  return (
    <div className={styles.evidenceGrid}>
      <section className={styles.panel} aria-label={pick(language, "Relations et preuves", "Relationships and evidence")}>
        <h3>{pick(language, "Preuves traçables", "Traceable evidence")}</h3>
        <div className={styles.relationshipList}>{snapshot.relationships.map((relationship) => (
          <button type="button" key={relationship.id} className={selected?.id === relationship.id ? styles.selectedCard : styles.relationshipCard} onClick={() => onSelect(relationship)}>
            <strong>{nodes.get(relationship.source_node_id)?.name} → {nodes.get(relationship.target_node_id)?.name}</strong>
            <span>{relationshipLabel(relationship.relationship_type, language)} · {confidenceLabel(relationship.confidence, language)}</span>
            <small>{relationship.source_count} {pick(language, "source(s)", "source(s)")} · {relationshipStatusLabel(relationship.status, language)}</small>
          </button>
        ))}</div>
      </section>
      <section className={styles.panel} aria-label={pick(language, "Détail de la relation", "Relationship detail")}>
        <h3>{pick(language, "Détail", "Detail")}</h3>
        {selected ? <div className={styles.detailList}>
          <p><span>{pick(language, "Nature", "Nature")}</span><strong>{relationshipLabel(selected.relationship_type, language)}</strong></p>
          <p><span>{pick(language, "Direction", "Direction")}</span><strong>{nodes.get(selected.source_node_id)?.name} → {nodes.get(selected.target_node_id)?.name}</strong></p>
          <p><span>{pick(language, "Confiance", "Confidence")}</span><strong data-confidence={selected.confidence}>{confidenceLabel(selected.confidence, language)}</strong></p>
          <p><span>{pick(language, "Importance", "Materiality")}</span><strong>{materialityLabel(selected.materiality, language)}</strong></p>
          {selected.revenue_share_percent !== null ? <p><span>{pick(language, "Part du revenu déclarée", "Reported revenue share")}</span><strong>{selected.revenue_share_percent.toFixed(2)} %</strong></p> : null}
          {selected.contract_value !== null ? <p><span>{pick(language, "Valeur du contrat", "Contract value")}</span><strong>{number(selected.contract_value, selected.contract_currency)}</strong></p> : null}
          <p><span>{pick(language, "Dernière confirmation", "Last confirmation")}</span><strong>{selected.last_verified_at ? new Date(selected.last_verified_at).toLocaleDateString() : "—"}</strong></p>
          {selected.correlation_1y !== null ? <p title={pick(language, "La corrélation des cours ne démontre pas une relation causale.", "Price correlation does not demonstrate a causal relationship.")}><span>{pick(language, "Corrélation boursière 1 an", "1-year market correlation")}</span><strong>{selected.correlation_1y.toFixed(2)}</strong></p> : null}
          <div className={styles.sourceCards}>{selected.evidence.map((evidence) => <article key={evidence.id}><strong><ShieldCheck size={14} />{evidence.title}</strong><blockquote>{evidence.excerpt}</blockquote><small>{evidence.issuer} · {evidence.document_date ? new Date(evidence.document_date).toLocaleDateString() : "—"}</small><a href={evidence.url} target="_blank" rel="noreferrer">{pick(language, "Voir la source", "View source")} <ExternalLink size={13} /></a></article>)}</div>
        </div> : <p className={styles.muted}>{pick(language, "Sélectionnez une relation.", "Select a relationship.")}</p>}
      </section>
      <section className={styles.panel}>
        <h3>{pick(language, "Portée économique", "Economic reach")}</h3>
        <p className={styles.disclaimer}>{pick(language, "Nombre de relations vérifiées par secteur — pas une part de revenu.", "Count of verified relationships by sector — not a revenue share.")}</p>
        {snapshot.sector_exposure.map((item) => <p key={item.sector} className={styles.metricRow}><span>{item.sector}</span><strong>{item.verified_relationship_count}</strong>{item.quantified_revenue_share_percent !== null ? <em>{item.quantified_revenue_share_percent.toFixed(2)} % {pick(language, "quantifié", "quantified")}</em> : null}</p>)}
      </section>
      <section className={styles.panel}>
        <h3>{pick(language, "Dépendances clés", "Key dependencies")}</h3>
        {dependencies.length ? dependencies.map((item) => <button type="button" key={item.id} className={styles.dependency} onClick={() => onSelect(item)}><strong>{nodes.get(item.source_node_id)?.name} → {nodes.get(item.target_node_id)?.name}</strong><span>{materialityLabel(item.materiality, language)}{item.revenue_share_percent !== null ? ` · ${item.revenue_share_percent}%` : ""}</span></button>) : <p className={styles.muted}>{pick(language, "Aucune dépendance matérielle n’est justifiée par les preuves disponibles.", "No material dependency is supported by the available evidence.")}</p>}
      </section>
      <section className={styles.panel}>
        <h3>{pick(language, "Sources", "Sources")}</h3>
        {snapshot.sources.map((source) => <article className={styles.sourceStatus} key={source.source}><div><strong>{sourceLabel(source.source, language)}</strong><span data-status={source.status}>{availabilityLabel(source.status, language)}</span></div><p>{pick(language, source.detail, source.detail_en ?? source.detail)}</p></article>)}
      </section>
    </div>
  );
}
