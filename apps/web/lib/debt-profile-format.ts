import type { MunicipalityProfile, ProvinceProfile } from "./fixed-income";

export function formatDebtAmount(value: number, language: "fr" | "en", currency = "CAD"): string {
  const billions = Math.abs(value) >= 1_000_000_000;
  const scaled = value / (billions ? 1_000_000_000 : 1_000_000);
  return `${scaled.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 })} ${billions ? (language === "fr" ? "G" : "B") : "M"}${currency ? ` ${currency}` : ""}`;
}

type Profile = ProvinceProfile | MunicipalityProfile;
export function hasDebtFacts(row: Profile): boolean {
  return row.borrowing_program_amount != null || row.debt_outstanding != null ||
    ("average_term" in row && row.average_term != null) || row.recent_issues.length > 0 ||
    Boolean(row.green_social_sustainable_program) || ("bond_programs" in row && Boolean(row.bond_programs?.length));
}

export function richestProfilesFirst<T extends Profile>(rows: T[]): T[] {
  const rank = (row: T) => (row.coverage === "partial" || row.coverage === "full") && hasDebtFacts(row) ? 0 : 1;
  return [...rows].sort((a, b) => rank(a) - rank(b));
}
