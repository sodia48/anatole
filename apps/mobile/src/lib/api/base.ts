import Constants from "expo-constants";

import { handleUnauthorized, sessionStore } from "./session";

type ApiOptions = RequestInit & { auth?: boolean; timeoutMs?: number };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isRequestCancellation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; message?: unknown };
  const name = typeof candidate.name === "string" ? candidate.name.toLowerCase() : "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  return name === "aborterror"
    || name === "fetchrequestcanceledexception"
    || name === "cancellederror"
    || name === "cancelederror"
    || message.includes("request has been canceled")
    || message.includes("request has been cancelled");
}

export function shouldSuppressQueryError(error: unknown): boolean {
  if (isRequestCancellation(error)) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; message?: unknown };
  const technicalDetail = `${String(candidate.name ?? "")} ${String(candidate.message ?? "")}`;
  return /FetchRequestCanceledException|NativeResponse\.swift|AbortError/i.test(technicalDetail);
}

export function apiBaseUrl(): string {
  const configured = Constants.expoConfig?.extra?.apiUrl;
  return (typeof configured === "string" ? configured : "https://anatole-api.onrender.com").replace(/\/+$/, "");
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let message = `Erreur API ${response.status}`;
  try {
    const payload = await response.json() as { detail?: unknown; message?: unknown };
    const detail = payload.detail ?? payload.message;
    if (typeof detail === "string" && detail.trim()) message = detail.trim();
    if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string") message = detail.message;
  } catch {
    // Some reverse-proxy errors are HTML or plain text.
  }
  return new ApiError(message, response.status, response.headers.get("X-Request-ID"));
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = false, timeoutMs = 12_000, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (auth) {
    const token = await sessionStore.get();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const { signal: externalSignal, ...fetchInit } = init;
  const controller = new AbortController();
  let externalCancellation = externalSignal?.aborted ?? false;
  const abortFromExternal = () => {
    externalCancellation = true;
    controller.abort();
  };
  if (externalCancellation) controller.abort();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  let timeoutTriggered = false;
  const timeout = setTimeout(() => {
    if (controller.signal.aborted) return;
    timeoutTriggered = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, { ...fetchInit, headers, signal: controller.signal });
    if (!response.ok) {
      const error = await errorFromResponse(response);
      if (response.status === 401 && auth) await handleUnauthorized();
      throw error;
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timeoutTriggered) {
      throw new ApiError("La requête a expiré.", 408, null);
    }
    if (externalCancellation) throw error;
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}
