export function valueOrNd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/D";
  return value.toLocaleString("fr-CA", { maximumFractionDigits: digits });
}

export function moneyOrNd(value: number | null | undefined, currency = "CAD", compact = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/D";
  return value.toLocaleString("fr-CA", { style: "currency", currency, notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 2 });
}

export function percentOrNd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/D";
  return `${(value * 100).toFixed(2)} %`;
}
