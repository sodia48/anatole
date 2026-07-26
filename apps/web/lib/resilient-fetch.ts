const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

type ResilientFetchOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
};

function abortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError");
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

export async function resilientFetch(
  input: RequestInfo | URL,
  options: ResilientFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 12_000,
    retries = 2,
    signal: callerSignal,
    ...init
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (callerSignal?.aborted) {
      throw abortError();
    }

    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    const abortFromCaller = () => controller.abort();
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      if (
        !RETRYABLE_STATUSES.has(response.status) ||
        attempt === retries
      ) {
        return response;
      }

      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1_000, 8_000)
        : 450 * 2 ** attempt + Math.random() * 180;

      await wait(delay, callerSignal);
    } catch (error) {
      lastError = error;

      if (callerSignal?.aborted) {
        throw abortError();
      }

      if (attempt === retries) {
        throw error;
      }

      await wait(
        450 * 2 ** attempt + Math.random() * 180,
        callerSignal,
      );
    } finally {
      globalThis.clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("API temporarily unavailable");
}
