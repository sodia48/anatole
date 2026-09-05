import { apiRequest } from "./base";
import type { ComparisonRange, ComparisonSnapshot, SymbolSearchResponse } from "./types";

export const intelligenceApi = {
  search: (query: string, signal?: AbortSignal) => apiRequest<SymbolSearchResponse>(`/api/v1/search/symbols?q=${encodeURIComponent(query)}&limit=20`, { timeoutMs: 20_000, signal }),
  compare: (symbols: string[], range: ComparisonRange, signal?: AbortSignal) => apiRequest<ComparisonSnapshot>("/api/v1/analysis/compare", { method: "POST", body: JSON.stringify({ symbols, range }), timeoutMs: 25_000, signal }),
};
