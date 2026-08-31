export function normalizeTicker(value: string): string {
  return value.trim().toUpperCase().replace(/\.(TO|V)$/i, "");
}

export function tickerWithTorontoSuffix(value: string): string {
  const normalized = normalizeTicker(value);
  return normalized ? `${normalized}.TO` : "";
}
