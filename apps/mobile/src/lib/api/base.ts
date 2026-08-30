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
  const { auth = false, timeoutMs = 25_000, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (auth) {
    const token = await sessionStore.get();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const { signal: externalSignal, ...fetchInit } = init;
  const safeToRetry = !fetchInit.method || ["GET", "HEAD"].includes(fetchInit.method.toUpperCase());
  const attempts = safeToRetry ? 2 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, timeoutMs);
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
      if (externalSignal?.aborted) throw error;
      if (attempt + 1 < attempts) continue;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiError("La requête a expiré.", 408, null);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abort);
    }
  }
  throw new ApiError("La requête a échoué.", 0, null);
}
