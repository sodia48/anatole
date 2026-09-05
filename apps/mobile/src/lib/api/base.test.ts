import * as SecureStore from "expo-secure-store";

import { ApiError, apiRequest } from "./base";

describe("mobile API client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends the bearer token to FastAPI", async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue("session-token");
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(apiRequest<{ ok: boolean }>("/api/v1/account/me", { auth: true })).resolves.toEqual({ ok: true });
    const init = jest.mocked(globalThis.fetch).mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer session-token");
  });

  it("preserves HTTP status and clears an invalid session on 401", async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue("expired");
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Session expirée." }), {
      status: 401,
      headers: { "Content-Type": "application/json", "X-Request-ID": "mobile-test" },
    }));

    await expect(apiRequest("/api/v1/account/me", { auth: true })).rejects.toEqual(expect.objectContaining({
      status: 401,
      requestId: "mobile-test",
      message: "Session expirée.",
    }));
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it("fails fast without a second transport retry", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError("network unavailable"));
    await expect(apiRequest<{ ok: boolean }>("/api/v1/market/cockpit")).rejects.toThrow("network unavailable");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("never retries an unsafe POST blindly", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError("network unavailable"));
    await expect(apiRequest("/api/v1/account/login", { method: "POST", body: "{}" })).rejects.toThrow("network unavailable");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("propagates navigation cancellation without retrying or converting it to a timeout", async () => {
    const controller = new AbortController();
    globalThis.fetch = jest.fn((...args: Parameters<typeof fetch>) => new Promise<Response>((_resolve, reject) => {
      const init = args[1];
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("navigation cancelled");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    })) as jest.MockedFunction<typeof fetch>;
    const request = apiRequest("/api/v1/stocks/RY/news", { signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toEqual(expect.objectContaining({ name: "AbortError" }));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves Expo native cancellation for React Query", async () => {
    const controller = new AbortController();
    const nativeCancellation = new Error("Fetch request has been canceled (NativeResponse.swift)");
    nativeCancellation.name = "FetchRequestCanceledException";
    globalThis.fetch = jest.fn((...args: Parameters<typeof fetch>) => new Promise<Response>((_resolve, reject) => {
      args[1]?.signal?.addEventListener("abort", () => reject(nativeCancellation), { once: true });
    })) as jest.MockedFunction<typeof fetch>;

    const request = apiRequest("/api/v1/market/cockpit", { signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toBe(nativeCancellation);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("converts only its own timeout into a clean ApiError 408", async () => {
    jest.useFakeTimers();
    const nativeCancellation = new Error("Fetch request has been canceled");
    nativeCancellation.name = "FetchRequestCanceledException";
    globalThis.fetch = jest.fn((...args: Parameters<typeof fetch>) => new Promise<Response>((_resolve, reject) => {
      args[1]?.signal?.addEventListener("abort", () => reject(nativeCancellation), { once: true });
    })) as jest.MockedFunction<typeof fetch>;

    const request = apiRequest("/api/v1/market/cockpit", { timeoutMs: 50 });
    const assertion = expect(request).rejects.toEqual(expect.objectContaining({
      name: "ApiError",
      status: 408,
      message: "La requête a expiré.",
    } satisfies Partial<ApiError>));
    await jest.advanceTimersByTimeAsync(50);
    await assertion;
    jest.useRealTimers();
  });
});
