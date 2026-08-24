import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type { CompanyRelationship } from "@/lib/types";

const RELATION_LABELS: Record<CompanyRelationship["relationship_type"], [string, string]> = {
  supplier: ["Fournisseur", "Supplier"],
  customer: ["Client", "Customer"],
  distributor: ["Distributeur", "Distributor"],
  strategic_partner: ["Partenaire stratégique", "Strategic partner"],
  joint_venture: ["Coentreprise", "Joint venture"],
  parent: ["Maison mère", "Parent"],
  subsidiary: ["Filiale", "Subsidiary"],
  major_contract: ["Contrat majeur", "Major contract"],
};

const CONFIDENCE_LABELS: Record<CompanyRelationship["confidence"], [string, string]> = {
  verified: ["Vérifié", "Verified"],
  corroborated: ["Corroboré", "Corroborated"],
  secondary: ["Secondaire", "Secondary"],
};

const STATUS_LABELS: Record<CompanyRelationship["status"], [string, string]> = {
  active: ["Active", "Active"],
  historical: ["Historique", "Historical"],
  unknown: ["Inconnu", "Unknown"],
};

const MATERIALITY_LABELS: Record<CompanyRelationship["materiality"], [string, string]> = {
  critical: ["Critique", "Critical"],
  material: ["Matérielle", "Material"],
  notable: ["Notable", "Notable"],
  unknown: ["Inconnue", "Unknown"],
};

export function relationshipLabel(type: CompanyRelationship["relationship_type"], language: AnatoleLanguage): string {
  return pick(language, ...RELATION_LABELS[type]);
}

export function confidenceLabel(value: CompanyRelationship["confidence"], language: AnatoleLanguage): string {
  return pick(language, ...CONFIDENCE_LABELS[value]);
}

export function relationshipStatusLabel(value: CompanyRelationship["status"], language: AnatoleLanguage): string {
  return pick(language, ...STATUS_LABELS[value]);
}

export function materialityLabel(value: CompanyRelationship["materiality"], language: AnatoleLanguage): string {
  return pick(language, ...MATERIALITY_LABELS[value]);
}

export function availabilityLabel(value: "available" | "partial" | "unavailable", language: AnatoleLanguage): string {
  const labels = {
    available: ["Disponible", "Available"],
    partial: ["Partielle", "Partial"],
    unavailable: ["Indisponible", "Unavailable"],
  } as const;
  const [fr, en] = labels[value];
  return pick(language, fr, en);
}

export function sourceLabel(value: string, language: AnatoleLanguage): string {
  if (value === "Documents officiels") return pick(language, "Documents officiels", "Official documents");
  return value;
}
