export type FinancialLanguage = "fr" | "en";
export type FinancialUnit = "money" | "percent" | "ratio" | "eps" | "plain";

export function formatFinancialNumber(
  value: number | null | undefined,
  { language, unit = "plain", currency = null, exact = false }: {
    language: FinancialLanguage; unit?: FinancialUnit; currency?: string | null; exact?: boolean;
  },
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return language === "fr" ? "N/D" : "N/A";
  const locale = language === "fr" ? "fr-CA" : "en-CA";
  const magnitude = Math.abs(value);
  const divisor = !exact && unit === "money"
    ? magnitude >= 1e9 ? 1e9 : magnitude >= 1e6 ? 1e6 : magnitude >= 1e3 ? 1e3 : 1 : 1;
  const amount = value / divisor;
  const decimals = exact ? 12 : 2;
  const rounded = new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(amount);
  const visible = !exact && amount !== 0 && Math.abs(amount) < .005
    ? `${value < 0 ? "−" : ""}<${language === "fr" ? "0,01" : "0.01"}` : rounded;
  const suffix = divisor === 1e9 ? ` ${language === "fr" ? "G" : "B"}`
    : divisor === 1e6 ? " M" : divisor === 1e3 ? ` ${language === "fr" ? "k" : "K"}` : "";
  if (unit === "percent") return `${visible} %`;
  if (unit === "ratio") return `${visible}×`;
  if (unit === "money") return `${visible}${suffix}${currency ? ` ${currency}` : ""}`;
  return visible;
}

export function exactFinancialNumber(value: number | null | undefined, language: FinancialLanguage): string {
  return formatFinancialNumber(value, { language, exact: true });
}

/** A signed bar on a fixed zero-centred axis; never renders a loss as a gain. */
export function signedBar(value: number | null | undefined, bound: number): { left: `${number}%`; width: `${number}%` } {
  const ratio = value !== null && value !== undefined && Number.isFinite(value) && bound > 0
    ? Math.min(Math.abs(value) / bound, 1) * 50 : 0;
  return { left: `${value !== null && value !== undefined && value < 0 ? 50 - ratio : 50}%`, width: `${ratio}%` };
}

export function analystRecommendation(key: string | null, language: FinancialLanguage): string {
  const labels: Record<string, [string, string]> = {
    strong_buy: ["Achat fort", "Strong buy"], buy: ["Achat", "Buy"], hold: ["Conserver", "Hold"],
    sell: ["Vente", "Sell"], strong_sell: ["Vente forte", "Strong sell"],
  };
  return key && labels[key] ? labels[key][language === "fr" ? 0 : 1] : language === "fr" ? "N/D" : "N/A";
}

export function comparableDelta(a: number | null | undefined, b: number | null | undefined, language: FinancialLanguage,
                                unit: "percent" | "ratio"): string | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const absolute = formatFinancialNumber(a - b, { language, unit });
  const relative = Math.abs(b) > 1e-9 && Math.sign(a) === Math.sign(b)
    ? ` · ${formatFinancialNumber((a - b) / Math.abs(b) * 100, { language, unit: "percent" })}` : "";
  return `${absolute}${relative}`;
}
