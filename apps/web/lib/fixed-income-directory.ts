import type { DataQuality, MunicipalityProfile, ProvinceProfile } from "@/lib/fixed-income";

// Offline-only issuer directory. No borrowing amounts, prices, or yields are inferred here.
// A profile marked unavailable means that the LIVE structured API response was not received.
function unavailableQuality(scope: string, source: string): DataQuality {
  return {
    scope,
    status: "unavailable",
    source,
    observed_at: null,
    freshness: "unavailable",
    coverage: "Live structured profile unavailable; official issuer directory only",
  };
}

const provinceDirectory: ReadonlyArray<readonly [string, string, string]> = [
  ["QC", "Québec", "https://www.finances.gouv.qc.ca/investor_relations/"],
  ["ON", "Ontario", "https://www.ofina.on.ca/main.html"],
  ["BC", "British Columbia", "https://www2.gov.bc.ca/gov/content/governments/finances/debt/reports-publications"],
  ["AB", "Alberta", "https://www.alberta.ca/investor-relations"],
  ["SK", "Saskatchewan", "https://www.saskatchewan.ca/Government/Budget-Planning-and-Reporting/Investor-Relations"],
  ["MB", "Manitoba", "https://www.gov.mb.ca/investor/index.html"],
  ["NB", "New Brunswick", "https://www.gnb.ca/en/topic/your-gov/budget-finance/investor-relations.html"],
  ["NS", "Nova Scotia", "https://www.novascotia.ca/programs-and-services/investor-relations"],
  ["PE", "Prince Edward Island", "https://www.princeedwardisland.ca/en/information/finance-and-affordability/debt-management"],
  ["NL", "Newfoundland and Labrador", "https://investorrelations.gov.nl.ca/"],
  ["YT", "Yukon", "https://yukon.ca/en/news/yukon-government-introduces-new-debt-management-policy/"],
  ["NT", "Northwest Territories", "https://www.fin.gov.nt.ca/en/services/public-accounts"],
  ["NU", "Nunavut", "https://www.gov.nu.ca/en/department-finance/budget-2025-26"],
];

const municipalityDirectory: ReadonlyArray<readonly [string, string, string, string]> = [
  ["toronto", "Toronto", "ON", "https://www.toronto.ca/city-government/budget-finances/city-finance/investor-relations/"],
  ["montreal", "Montréal", "QC", "https://montreal.ca/sujets/politiques-financieres"],
  ["vancouver", "Vancouver", "BC", "https://vancouver.ca/your-government/investor-relations.aspx"],
  ["calgary", "Calgary", "AB", "https://www.calgary.ca/our-finances/investor-relations.html"],
  ["edmonton", "Edmonton", "AB", "https://www.edmonton.ca/city_government/budget_finances/financial-reports"],
  ["ottawa", "Ottawa", "ON", "https://ottawa.ca/en/investor-relations/city-ottawa-debenture-activity"],
  ["winnipeg", "Winnipeg", "MB", "https://www.winnipeg.ca/city-governance/strategic-plans-policies"],
  ["quebec", "Québec", "QC", "https://www.ville.quebec.qc.ca/apropos/profil-financier/investisseurs/programme-financement.aspx"],
  ["halifax", "Halifax", "NS", "https://www.halifax.ca/sites/default/files/documents/city-hall/budget-finances/final-2025-26-budget-business-plan.pdf"],
];

export const fallbackProvinceProfiles: ProvinceProfile[] = provinceDirectory.map(([code, name, url]) => ({
  code,
  name,
  issuer: name,
  coverage: "unavailable",
  borrowing_program_amount: null,
  fiscal_year: null,
  debt_outstanding: null,
  average_term: null,
  green_social_sustainable_program: null,
  source_urls: [url],
  recent_issues: [],
  quality: unavailableQuality("province_profiles", url),
}));

export const fallbackMunicipalityProfiles: MunicipalityProfile[] = municipalityDirectory.map(([slug, city, province, url]) => ({
  slug,
  city,
  province,
  coverage: "unavailable",
  debt_outstanding: null,
  borrowing_program_amount: null,
  green_social_sustainable_program: null,
  recent_issues: [],
  source_urls: [url],
  quality: unavailableQuality("municipal_profiles", url),
}));