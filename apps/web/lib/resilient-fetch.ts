import {
  rememberApiTrace,
  reportClientEvent,
  type ApiTrace,
} from "./reliability";
import { ANATOLE_VERSION } from "./version";

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const BODYLESS_STATUSES = new Set([204, 205, 304]);
const CACHE_PREFIX = "anatole:0.9:last-good:";

function responseMayHaveBody(method: string, status: number): boolean {
  return method !== "HEAD" && !BODYLESS_STATUSES.has(status);
}
const DEFAULT_STALE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_BODY_LENGTH = 1_500_000;

type ResilientFetchOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  idempotent?: boolean;
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

    const onAbort = () => {
      globalThis.clearTimeout(timer);
      reject(abortError());
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
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

const PERSISTENT_PUBLIC_CACHE_PREFIXES = [
  "/api/anatole/api/v1/market/cockpit",
  "/api/anatole/api/v1/discovery/psychology",
  "/api/anatole/api/v1/discovery/news",
  "/api/anatole/api/v1/discovery/calendar",
  "/api/anatole/api/v1/discovery/earnings-calendar",
  "/api/anatole/api/v1/discovery/etfs",
  "/api/anatole/api/v1/discovery/screener",
  "/api/anatole/api/v1/discovery/ipo",
  "/api/anatole/api/v1/discovery/insiders",
  "/api/anatole/api/v1/analysis/terminal",
  "/api/anatole/api/v1/stocks/",
];

function cacheStorage(url: string): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    const persistent = PERSISTENT_PUBLIC_CACHE_PREFIXES.some((prefix) =>
      url.startsWith(prefix),
    );
    return persistent ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

async function storeLastGood(response: Response, url: string, id: string): Promise<void> {
  const storage = cacheStorage(url);
  if (!storage || !response.ok) return;
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
    storage.setItem(cacheKey(url), JSON.stringify(cached));
  } catch {
    // Le cache de secours est facultatif.
  }
}

function readLastGood(url: string, staleTtlMs: number): CachedResponse | null {
  const storage = cacheStorage(url);
  if (!storage) return null;

  try {
    const key = cacheKey(url);
    const raw = storage.getItem(key);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedResponse;
    if (Date.now() - cached.storedAt > staleTtlMs) {
      storage.removeItem(key);
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
    retries: requestedRetries,
    idempotent = false,
    allowStale,
    staleTtlMs = DEFAULT_STALE_TTL_MS,
    signal: callerSignal,
    ...init
  } = options;

  const url = urlString(input);
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const retries = method === "GET" || idempotent ? Math.max(0, requestedRetries ?? 1) : 0;
  const mayServeStale =
    method === "GET" && (allowStale ??
    (!url.endsWith("/health") && !url.includes("/reliability/status")));
  const id = requestId();
  const startedAt = performance.now?.() ?? Date.now();
  const remaining = () => timeoutMs - ((performance.now?.() ?? Date.now()) - startedAt);
  let attempts = 0;
  let lastError: unknown;
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (callerSignal?.aborted) throw abortError();
    if (remaining() <= 0) break;
    attempts += 1;

    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), remaining());
    const abortFromCaller = () => controller.abort();
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const headers = new Headers(init.headers);
      if (!headers.has("X-Request-ID")) headers.set("X-Request-ID", id);
      headers.set("X-Anatole-Client-Version", ANATOLE_VERSION);

      let response = await fetch(input, {
        ...init,
        headers,
        signal: controller.signal,
      });
      lastStatus = response.status;
      if (response.ok && response.body && responseMayHaveBody(method, response.status)) {
        // The same abort timer also bounds body download, not just headers.
        const body = await response.arrayBuffer();
        response = new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }

      if (!RETRYABLE_STATUSES.has(response.status) || attempt === retries) {
        const durationMs = Math.round((performance.now?.() ?? Date.now()) - startedAt);
        if (response.ok) {
          if (method === "GET") void storeLastGood(response, url, id);
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
      await response.body?.cancel();
      const retryBudget = remaining();
      if (retryBudget <= 0 || delay >= retryBudget) break;
      await wait(delay, callerSignal);
    } catch (error) {
      lastError = error;
      if (callerSignal?.aborted) throw abortError();
      if (attempt === retries || remaining() <= 0) break;
      const delay = 450 * 2 ** attempt + Math.random() * 180;
      const retryBudget = remaining();
      if (retryBudget <= 0 || delay >= retryBudget) break;
      await wait(delay, callerSignal);
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
        attempts,
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
    attempts,
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
