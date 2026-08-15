import type {
  AnatoleLanguage,
} from "@/lib/preferences";

export type RegionCode =
  | "ALL"
  | "CA"
  | "QC"
  | "ON"
  | "BC"
  | "AB"
  | "SK"
  | "MB"
  | "NB"
  | "NS"
  | "PE"
  | "NL";

export const REGION_CODES: RegionCode[] = [
  "ALL",
  "CA",
  "QC",
  "ON",
  "BC",
  "AB",
  "SK",
  "MB",
  "NB",
  "NS",
  "PE",
  "NL",
];

const LABELS: Record<
  Exclude<RegionCode, "ALL">,
  { fr: string; en: string }
> = {
  CA: { fr: "Canada", en: "Canada" },
  QC: { fr: "Québec", en: "Quebec" },
  ON: { fr: "Ontario", en: "Ontario" },
  BC: { fr: "Colombie-Britannique", en: "British Columbia" },
  AB: { fr: "Alberta", en: "Alberta" },
  SK: { fr: "Saskatchewan", en: "Saskatchewan" },
  MB: { fr: "Manitoba", en: "Manitoba" },
  NB: { fr: "Nouveau-Brunswick", en: "New Brunswick" },
  NS: { fr: "Nouvelle-Écosse", en: "Nova Scotia" },
  PE: { fr: "Île-du-Prince-Édouard", en: "Prince Edward Island" },
  NL: { fr: "Terre-Neuve-et-Labrador", en: "Newfoundland and Labrador" },
};

export function regionLabel(
  code: RegionCode,
  language: AnatoleLanguage,
): string {
  if (code === "ALL") {
    return language === "fr" ? "Toutes" : "All";
  }
  return LABELS[code][language];
}

export function itemRegions(
  regions: string[] | undefined,
): string[] {
  return regions?.length ? regions : ["CA"];
}

export function matchesRegion(
  regions: string[] | undefined,
  selected: RegionCode,
): boolean {
  if (selected === "ALL") return true;
  const values = itemRegions(regions);
  if (selected === "CA") {
    return values.includes("CA");
  }
  // Province view intentionally keeps Canada-wide releases visible as the
  // shared context requested by the product.
  return values.includes(selected) || values.includes("CA");
}

export function regionSummary(
  regions: string[] | undefined,
  language: AnatoleLanguage,
): string {
  const values = itemRegions(regions);
  const provinces = values.filter((code) => code !== "CA");

  if (provinces.length >= 8) {
    return language === "fr"
      ? "Canada + provinces"
      : "Canada + provinces";
  }

  if (provinces.length === 1 && !values.includes("CA")) {
    return regionLabel(provinces[0] as RegionCode, language);
  }

  if (provinces.length > 1) {
    return provinces
      .slice(0, 2)
      .map((code) => regionLabel(code as RegionCode, language))
      .join(" · ") + (provinces.length > 2 ? " +" : "");
  }

  return regionLabel("CA", language);
}
