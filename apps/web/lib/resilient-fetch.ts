import {
  rememberApiTrace,
  reportClientEvent,
  type ApiTrace,
} from "./reliability";
import { ANATOLE_VERSION } from "./version";

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const CACHE_PREFIX = "anatole:0.9:last-good:";
const DEFAULT_STALE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_BODY_LENGTH = 1_500_000;

type ResilientFetchOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  allowStale?: boolean;
  staleTtlMs?: number;
};

type CachedResponse = {
  body: string;
  contentType: string;
  storedAt: number;
  requestId: string;
};

function abortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError");
}

function requestId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const timer = globalThis.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

function urlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function cacheKey(url: string): string {
  let hash = 2166136261;
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${CACHE_PREFIX}${(hash >>> 0).toString(16)}`;
}

function canUseStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.sessionStorage);
  } catch {
    return false;
  }
}

async function storeLastGood(response: Response, url: string, id: string): Promise<void> {
  if (!canUseStorage() || !response.ok) return;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return;

  try {
    const body = await response.clone().text();
    if (!body || body.length > MAX_CACHE_BODY_LENGTH) return;
    const cached: CachedResponse = {
      body,
      contentType,
      storedAt: Date.now(),
      requestId: response.headers.get("X-Request-ID") ?? id,
    };
    window.sessionStorage.setItem(cacheKey(url), JSON.stringify(cached));
  } catch {
    // Le cache de secours est facultatif.
  }
}

function readLastGood(url: string, staleTtlMs: number): CachedResponse | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(cacheKey(url));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedResponse;
    if (Date.now() - cached.storedAt > staleTtlMs) {
      window.sessionStorage.removeItem(cacheKey(url));
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function staleResponse(
  cached: CachedResponse,
  id: string,
  originStatus: number | null,
): Response {
  return new Response(cached.body, {
    status: 200,
    headers: {
      "Content-Type": cached.contentType,
      "X-Request-ID": cached.requestId || id,
      "X-Anatole-Stale": "true",
      "X-Anatole-Origin-Status": originStatus === null ? "network" : String(originStatus),
      "Cache-Control": "no-store",
    },
  });
}

function saveTrace(trace: ApiTrace): void {
  rememberApiTrace(trace);
}

export async function resilientFetch(
  input: RequestInfo | URL,
  options: ResilientFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 12_000,
    retries = 2,
    allowStale,
    staleTtlMs = DEFAULT_STALE_TTL_MS,
    signal: callerSignal,
    ...init
  } = options;

  const url = urlString(input);
  const method = (init.method ?? "GET").toUpperCase();
  const mayServeStale =
    allowStale ??
    (method === "GET" && !url.endsWith("/health") && !url.includes("/reliability/status"));
  const id = requestId();
  const startedAt = performance.now?.() ?? Date.now();
  let lastError: unknown;
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (callerSignal?.aborted) throw abortError();

    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    const abortFromCaller = () => controller.abort();
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const headers = new Headers(init.headers);
      if (!headers.has("X-Request-ID")) headers.set("X-Request-ID", id);
      headers.set("X-Anatole-Client-Version", ANATOLE_VERSION);

      const response = await fetch(input, {
        ...init,
        headers,
        signal: controller.signal,
      });
      lastStatus = response.status;

      if (!RETRYABLE_STATUSES.has(response.status) || attempt === retries) {
        const durationMs = Math.round((performance.now?.() ?? Date.now()) - startedAt);
        if (response.ok) {
          await storeLastGood(response, url, id);
          saveTrace({
            requestId: response.headers.get("X-Request-ID") ?? id,
            url,
            status: response.status,
            durationMs,
            attempts: attempt + 1,
            stale: false,
            recordedAt: new Date().toISOString(),
          });
          return response;
        }

        if (mayServeStale && RETRYABLE_STATUSES.has(response.status)) {
          const cached = readLastGood(url, staleTtlMs);
          if (cached) {
            saveTrace({
              requestId: cached.requestId || id,
              url,
              status: response.status,
              durationMs,
              attempts: attempt + 1,
              stale: true,
              recordedAt: new Date().toISOString(),
            });
            reportClientEvent({
              kind: "api_failure",
              message: `Données de secours utilisées après HTTP ${response.status}`,
              requestId: id,
            });
            return staleResponse(cached, id, response.status);
          }
        }

        saveTrace({
          requestId: response.headers.get("X-Request-ID") ?? id,
          url,
          status: response.status,
          durationMs,
          attempts: attempt + 1,
          stale: false,
          recordedAt: new Date().toISOString(),
        });
        return response;
      }

      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1_000, 8_000)
        : 450 * 2 ** attempt + Math.random() * 180;
      await wait(delay, callerSignal);
    } catch (error) {
      lastError = error;
      if (callerSignal?.aborted) throw abortError();
      if (attempt === retries) break;
      await wait(450 * 2 ** attempt + Math.random() * 180, callerSignal);
    } finally {
      globalThis.clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  }

  const durationMs = Math.round((performance.now?.() ?? Date.now()) - startedAt);
  if (mayServeStale) {
    const cached = readLastGood(url, staleTtlMs);
    if (cached) {
      saveTrace({
        requestId: cached.requestId || id,
        url,
        status: lastStatus,
        durationMs,
        attempts: retries + 1,
        stale: true,
        recordedAt: new Date().toISOString(),
      });
      reportClientEvent({
        kind: "api_failure",
        message: "Données de secours utilisées après une erreur réseau",
        requestId: id,
      });
      return staleResponse(cached, id, lastStatus);
    }
  }

  saveTrace({
    requestId: id,
    url,
    status: lastStatus,
    durationMs,
    attempts: retries + 1,
    stale: false,
    recordedAt: new Date().toISOString(),
  });
  reportClientEvent({
    kind: "api_failure",
    message: lastError instanceof Error ? lastError.message : "API temporairement indisponible",
    stack: lastError instanceof Error ? lastError.stack : null,
    requestId: id,
  });

  throw lastError instanceof Error
    ? lastError
    : new Error("API temporairement indisponible");
}
