import { test, expect } from "@playwright/test";
import { resilientFetch } from "../../apps/web/lib/resilient-fetch";
import { LocalRequestLane } from "../../apps/web/lib/local-request-lane";

test.describe("Interactive transport unit contracts", () => {
  test.describe.configure({ mode: "serial" });
  let originalFetch: typeof fetch;
  test.beforeEach(() => { originalFetch = globalThis.fetch; });
  test.afterEach(() => { globalThis.fetch = originalFetch; });

  test("GET retries once, POST does not replay even with legacy retries option", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("offline", { status: 503 }); };
    expect((await resilientFetch("https://example.test/api", { timeoutMs: 2000, allowStale: false })).status).toBe(503);
    expect(calls).toBe(2);
    calls = 0;
    expect((await resilientFetch("https://example.test/api", { method: "POST", retries: 2 })).status).toBe(503);
    expect(calls).toBe(1);
  });

  test("total deadline includes retry-after and prevents another attempt", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("offline", { status: 503, headers: { "Retry-After": "8" } }); };
    const start = performance.now();
    await expect(resilientFetch("https://example.test/api", { timeoutMs: 80, retries: 2, allowStale: false })).rejects.toThrow();
    expect(performance.now() - start).toBeLessThan(500);
    expect(calls).toBe(1);
  });

  test("caller abort does not retry", async () => {
    let calls = 0;
    globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
      calls++;
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
    const controller = new AbortController();
    const promise = resilientFetch("https://example.test/api", { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toThrow("aborted");
    expect(calls).toBe(1);
  });

  test("stale GET remains available after exhausted request budget", async () => {
    const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      sessionStorage: { getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
      dispatchEvent: () => true, location: { pathname: "/focus/RY" },
      navigator: { userAgent: "test", sendBeacon: () => true },
    } });
    try {
      globalThis.fetch = async () => Response.json({ metric: 42 });
      await resilientFetch("https://example.test/stale");
      await expect.poll(() => storage.size).toBeGreaterThan(0);
      globalThis.fetch = async () => new Response("offline", { status: 503 });
      const result = await resilientFetch("https://example.test/stale", { retries: 0 });
      expect(result.headers.get("X-Anatole-Stale")).toBe("true");
      expect(await result.json()).toEqual({ metric: 42 });
    } finally {
      if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });

  test("lane single flight, key change and local cancellation", async () => {
    const lane = new LocalRequestLane();
    const controllers: AbortController[] = [];
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const work = async (controller: AbortController) => { controllers.push(controller); await blocked; };
    const first = lane.run("market:composite", work);
    expect(lane.run("market:composite", work)).toBe(first);
    await Promise.resolve();
    const second = lane.run("market:tsx60", work);
    await Promise.resolve();
    expect(controllers[0].signal.aborted).toBe(true);
    expect(controllers[1].signal.aborted).toBe(false);
    lane.cancel();
    expect(controllers[1].signal.aborted).toBe(true);
    release();
    await Promise.all([first, second]);
  });
});
