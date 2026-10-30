export type TrackedOption = {
  id: string; symbol: string; underlying: string; market: "tsx" | "commodities"; contract: string | null;
  side: "call" | "put"; strike: number; expiration: string; expiry_at: string; direction: "long" | "short";
  quantity: number; multiplier: number; premium: number; currency: string; reminder_days: number;
};

function validExpiry(date: string, datetime: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(datetime) ||
    datetime.slice(0, 10) !== date) return false;
  const day = Date.parse(date);
  return Number.isFinite(day) && new Date(day).toISOString().slice(0, 10) === date && Number.isFinite(Date.parse(datetime));
}

function validCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code) || code === "XXX") return false;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "currency" }).of(code);
    return Boolean(name && name !== code);
  } catch { return false; }
}

export function validTrackedOption(value: unknown): value is TrackedOption {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<TrackedOption>;
  return typeof p.id === "string" && p.id.length > 0 && p.id.length <= 100 &&
    typeof p.symbol === "string" && p.symbol.length > 0 && p.symbol.length <= 160 &&
    typeof p.underlying === "string" && p.underlying.length > 0 && p.underlying.length <= 80 &&
    (p.market === "tsx" || p.market === "commodities") &&
    (p.contract === null || (typeof p.contract === "string" && p.contract.length <= 80)) &&
    (p.market !== "commodities" || Boolean(p.contract)) &&
    (p.side === "call" || p.side === "put") && typeof p.strike === "number" && Number.isFinite(p.strike) &&
    typeof p.expiration === "string" && typeof p.expiry_at === "string" && validExpiry(p.expiration, p.expiry_at) &&
    (p.direction === "long" || p.direction === "short") &&
    typeof p.quantity === "number" && Number.isSafeInteger(p.quantity) && p.quantity >= 1 && p.quantity <= 10000 &&
    typeof p.multiplier === "number" && Number.isFinite(p.multiplier) && p.multiplier > 0 && p.multiplier <= 1000000 &&
    typeof p.premium === "number" && Number.isFinite(p.premium) && p.premium >= 0 && p.premium <= 1000000 &&
    typeof p.currency === "string" && validCurrency(p.currency) &&
    typeof p.reminder_days === "number" && Number.isInteger(p.reminder_days) && p.reminder_days >= 0 && p.reminder_days <= 30;
}

export function parseTrackedOptions(raw: string | null): TrackedOption[] | null {
  if (raw === null) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const envelope = data as { version?: unknown; positions?: unknown };
    if (envelope.version !== 1 || !Array.isArray(envelope.positions) || envelope.positions.length > 100 ||
      !envelope.positions.every(validTrackedOption)) return null;
    const positions = envelope.positions as TrackedOption[];
    return new Set(positions.map((item) => item.id)).size === positions.length ? positions : null;
  } catch {
    return null;
  }
}
