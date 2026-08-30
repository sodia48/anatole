import * as SecureStore from "expo-secure-store";

import { apiRequest } from "./base";

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

  it("retries one safe GET after a network failure", async () => {
    globalThis.fetch = jest.fn()
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(apiRequest<{ ok: boolean }>("/api/v1/market/cockpit")).resolves.toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("never retries an unsafe POST blindly", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError("network unavailable"));
    await expect(apiRequest("/api/v1/account/login", { method: "POST", body: "{}" })).rejects.toThrow("network unavailable");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
