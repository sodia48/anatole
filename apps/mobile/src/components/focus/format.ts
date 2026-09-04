export type FormatLanguage = "fr" | "en";

function locale(language: FormatLanguage): string {
  return language === "fr" ? "fr-CA" : "en-CA";
}

function decimal(value: number, language: FormatLanguage, maximumFractionDigits: number): string {
  return value.toLocaleString(locale(language), { maximumFractionDigits });
}

export function valueOrNd(value: number | null | undefined, digits = 2, language: FormatLanguage = "fr"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/D";
  return decimal(value, language, digits);
}

export function compactNumberOrNd(value: number | null | undefined, language: FormatLanguage = "fr"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/D";
  const absolute = Math.abs(value);
  const units = language === "fr"
    ? [{ threshold: 1e12, suffix: " T" }, { threshold: 1e9, suffix: " G" }, { threshold: 1e6, suffix: " M" }, { threshold: 1e3, suffix: " k" }]
    : [{ threshold: 1e12, suffix: "T" }, { threshold: 1e9, suffix: "B" }, { threshold: 1e6, suffix: "M" }, { threshold: 1e3, suffix: "K" }];
  const unit = units.find((candidate) => absolute >= candidate.threshold);
  if (!unit) return decimal(value, language, 2);
  return `${decimal(value / unit.threshold, language, 2)}${unit.suffix}`;
}

export function moneyOrNd(value: number | null | undefined, currency = "CAD", compact = false, language: FormatLanguage = "fr"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/D";
  if (compact) {
    const amount = compactNumberOrNd(value, language);
    return language === "fr" ? `${amount} ${currency}` : `${currency} ${amount}`;
  }
  return value.toLocaleString(locale(language), { style: "currency", currency, maximumFractionDigits: 2 });
}

export function percentOrNd(value: number | null | undefined, language: FormatLanguage = "fr"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/D";
  const formatted = value.toFixed(2).replace(".", language === "fr" ? "," : ".");
  return `${formatted} %`;
}
