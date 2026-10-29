import AsyncStorage from "@react-native-async-storage/async-storage";
import type { OptionContract } from "@/src/lib/api/options";

export type NumericFilter = "volume" | "oi" | "spread" | "deltaMin" | "deltaMax" | "ivMin" | "ivMax";
export type OptionFilters = Record<NumericFilter, string> & {
  moneyness: "all" | "atm" | "itm" | "otm";
  freshness: "all" | "fresh" | "delayed";
  availability: "all" | "quoted" | "missing";
};

export const defaultOptionFilters: OptionFilters = {
  volume: "", oi: "", spread: "", deltaMin: "", deltaMax: "", ivMin: "", ivMax: "",
  moneyness: "all", freshness: "all", availability: "all",
};

export const OPTION_FILTERS_STORAGE_KEY = "anatole.mobile.options.filters.v1";
let pendingWrite: Promise<void> = Promise.resolve();

export async function loadOptionFilters(): Promise<OptionFilters> {
  await pendingWrite;
  return restoreOptionFilters(await AsyncStorage.getItem(OPTION_FILTERS_STORAGE_KEY));
}

export function saveOptionFilters(filters: OptionFilters): Promise<void> {
  const snapshot = JSON.stringify(filters);
  pendingWrite = pendingWrite.then(() => AsyncStorage.setItem(OPTION_FILTERS_STORAGE_KEY, snapshot)).catch(() => undefined);
  return pendingWrite;
}

export function restoreOptionFilters(raw: string | null): OptionFilters {
  if (!raw) return { ...defaultOptionFilters };
  try {
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { ...defaultOptionFilters };
    const data = saved as Record<string, unknown>;
    const next = { ...defaultOptionFilters };
    for (const key of ["volume", "oi", "spread", "deltaMin", "deltaMax", "ivMin", "ivMax"] as const) {
      if (typeof data[key] === "string" && data[key].length <= 32) next[key] = data[key];
    }
    if (["all", "atm", "itm", "otm"].includes(String(data.moneyness))) next.moneyness = data.moneyness as OptionFilters["moneyness"];
    if (["all", "fresh", "delayed"].includes(String(data.freshness))) next.freshness = data.freshness as OptionFilters["freshness"];
    if (["all", "quoted", "missing"].includes(String(data.availability))) next.availability = data.availability as OptionFilters["availability"];
    return next;
  } catch {
    return { ...defaultOptionFilters };
  }
}

export function filterOptions(items: OptionContract[], filters: OptionFilters, spot: number | null, stale: boolean): OptionContract[] {
  let nearest: number | null = null;
  if (spot != null && Number.isFinite(spot) && spot > 0) {
    for (const item of items) {
      if (!Number.isFinite(item.strike)) continue;
      const distance = Math.abs(item.strike - spot);
      nearest = nearest == null ? distance : Math.min(nearest, distance);
    }
  }
  return items.filter((item) => {
    const compare = (actual: number | null | undefined, input: string, minimum: boolean) => {
      if (!input.trim()) return true;
      const target = Number(input.trim().replace(",", "."));
      return Number.isFinite(target) && actual != null && Number.isFinite(actual) &&
        (minimum ? actual >= target : actual <= target);
    };
    const spread = item.bid != null && item.ask != null && Number.isFinite(item.bid) && Number.isFinite(item.ask) && item.ask >= item.bid
      ? item.ask - item.bid : null;
    if ((filters.availability === "quoted" && spread == null) || (filters.availability === "missing" && spread != null)) return false;
    if (!compare(item.volume, filters.volume, true) || !compare(item.open_interest, filters.oi, true) ||
      !compare(spread, filters.spread, false) || !compare(item.delta, filters.deltaMin, true) ||
      !compare(item.delta, filters.deltaMax, false) || !compare(item.implied_volatility, filters.ivMin, true) ||
      !compare(item.implied_volatility, filters.ivMax, false)) return false;
    // Commodity snapshot retrieval time does not establish quote freshness.
    if (filters.freshness === "fresh" && (stale || item.delayed || item.market === "commodities")) return false;
    if (filters.freshness === "delayed" && !stale && !item.delayed) return false;
    if (filters.moneyness !== "all") {
      if (spot == null || !Number.isFinite(spot) || spot <= 0) return false;
      if (filters.moneyness === "atm" && Math.abs(item.strike - spot) !== nearest) return false;
      if (filters.moneyness === "itm" && !(item.side === "call" ? spot > item.strike : spot < item.strike)) return false;
      if (filters.moneyness === "otm" && !(item.side === "call" ? spot < item.strike : spot > item.strike)) return false;
    }
    return true;
  });
}
