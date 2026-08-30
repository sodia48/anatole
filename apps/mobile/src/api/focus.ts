import { marketApi } from "@/src/lib/api/market";

export const focusApi = {
  snapshot: marketApi.focus,
  news: marketApi.stockNews,
};

export type { FocusSnapshot, StockNewsSnapshot } from "@/src/lib/api/types";
