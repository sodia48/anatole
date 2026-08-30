export function normalizeTicker(value: string): string {
  return value.trim().toUpperCase().replace(/\.(TO|V)$/i, "");
}
