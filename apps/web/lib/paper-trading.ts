import { resilientFetch } from "./resilient-fetch";
import type {
  PaperAccount,
  PaperOrder,
  PaperOrderPreview,
  PaperOrderRequest,
} from "./types";

async function paperError(response: Response): Promise<Error> {
  try {
    const body = await response.json() as { detail?: string };
    if (typeof body.detail === "string") return new Error(body.detail);
  } catch {
    // The BFF may return a proxy-level non-JSON response.
  }
  return new Error(`Erreur PAPER ${response.status}`);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await resilientFetch(`/api/paper${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    credentials: "same-origin",
    cache: "no-store",
    retries: init.method === "POST" ? 0 : 1,
    timeoutMs: 35_000,
    allowStale: false,
  });
  if (!response.ok) throw await paperError(response);
  return await response.json() as T;
}

export const getPaperAccount = (): Promise<PaperAccount> => request("/account");

export const refreshPaperAccount = (): Promise<PaperAccount> => request(
  "/refresh",
  { method: "POST" },
);

export const previewPaperOrder = (
  order: PaperOrderRequest,
): Promise<PaperOrderPreview> => request("/orders/preview", {
  method: "POST",
  body: JSON.stringify(order),
});

export const placePaperOrder = (
  order: PaperOrderRequest,
): Promise<PaperOrder> => request("/orders", {
  method: "POST",
  body: JSON.stringify(order),
});

export const cancelPaperOrder = (id: string): Promise<PaperOrder> => request(
  `/orders/${encodeURIComponent(id)}/cancel`,
  { method: "POST" },
);

export const resetPaperAccount = (
  initialCapital = 100_000,
  commission = 0,
): Promise<PaperAccount> => request("/reset", {
  method: "POST",
  body: JSON.stringify({
    confirmation: "RESET PAPER",
    initial_capital: initialCapital,
    commission,
  }),
});
