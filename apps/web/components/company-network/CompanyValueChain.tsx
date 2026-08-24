"use client";

import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type { CompanyNetworkNode, CompanyRelationship } from "@/lib/types";

import { confidenceLabel, relationshipStatusLabel } from "./labels";
import styles from "./CompanyNetwork.module.css";

function otherNode(centerId: string, relationship: CompanyRelationship, nodes: Map<string, CompanyNetworkNode>): CompanyNetworkNode | null {
  const id = relationship.source_node_id === centerId ? relationship.target_node_id : relationship.source_node_id;
  return nodes.get(id) ?? null;
}

function RelationshipCards({ title, relationships, center, nodes, language, onSelect }: { title: string; relationships: CompanyRelationship[]; center: CompanyNetworkNode; nodes: Map<string, CompanyNetworkNode>; language: AnatoleLanguage; onSelect: (item: CompanyRelationship) => void }) {
  return (
    <section className={styles.chainColumn}>
      <h3>{title}</h3>
      {relationships.length ? relationships.map((relationship) => {
        const node = otherNode(center.id, relationship, nodes);
        return node ? (
          <button type="button" key={relationship.id} className={styles.chainCard} onClick={() => onSelect(relationship)}>
            <strong>{node.ticker ?? "—"}</strong><span>{node.name}</span><small>{confidenceLabel(relationship.confidence, language)} · {relationshipStatusLabel(relationship.status, language)}</small>
          </button>
        ) : null;
      }) : <p className={styles.muted}>—</p>}
    </section>
  );
}

export function CompanyValueChain({ center, nodes, relationships, language, onSelect }: { center: CompanyNetworkNode; nodes: CompanyNetworkNode[]; relationships: CompanyRelationship[]; language: AnatoleLanguage; onSelect: (relationship: CompanyRelationship) => void }) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const suppliers = relationships.filter((item) => item.target_node_id === center.id && ["supplier", "parent"].includes(item.relationship_type));
  const customers = relationships.filter((item) => item.source_node_id === center.id && ["customer", "distributor", "major_contract"].includes(item.relationship_type));
  const markets = relationships.filter((item) => {
    const node = otherNode(center.id, item, byId);
    return node?.node_type === "end_market" || node?.node_type === "commodity";
  });
  const partners = relationships.filter((item) => ["strategic_partner", "joint_venture", "subsidiary"].includes(item.relationship_type));
  return (
    <div className={styles.valueChain} aria-label={pick(language, "Chaîne de valeur", "Value chain")}>
      <RelationshipCards title={pick(language, "Fournisseurs", "Suppliers")} relationships={suppliers} center={center} nodes={byId} language={language} onSelect={onSelect} />
      <section className={`${styles.chainColumn} ${styles.chainCenter}`}><h3>{pick(language, "Entreprise active", "Active company")}</h3><div className={styles.activeCompany}><strong>{center.ticker}</strong><span>{center.name}</span><small>{center.sector ?? "—"}</small></div></section>
      <RelationshipCards title={pick(language, "Clients / acheteurs", "Customers / buyers")} relationships={customers} center={center} nodes={byId} language={language} onSelect={onSelect} />
      <RelationshipCards title={pick(language, "Marchés finaux", "End markets")} relationships={markets} center={center} nodes={byId} language={language} onSelect={onSelect} />
      <section className={styles.chainBottom}><RelationshipCards title={pick(language, "Partenaires · coentreprises · filiales", "Partners · joint ventures · subsidiaries")} relationships={partners} center={center} nodes={byId} language={language} onSelect={onSelect} /></section>
      <p className={styles.competitorNote}>{pick(language, "Les concurrents constituent une couche distincte et ne sont pas déduits des relations commerciales.", "Competitors are a separate layer and are not inferred from commercial relationships.")}</p>
    </div>
  );
}
