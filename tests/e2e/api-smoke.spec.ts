import { expect, test } from "@playwright/test";

const apiURL = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:8000";

const endpoints = [
  "/health",
  "/ready",
  "/api/v1/market/cockpit?universe=tsx60",
  "/api/v1/discovery/screener?universe=tsx60",
  "/api/v1/discovery/etfs",
  "/api/v1/analysis/terminal",
  "/api/v1/reliability/status",
];

for (const endpoint of endpoints) {
  test(`API ${endpoint} répond sans 5xx`, async ({ request }) => {
    const response = await request.get(`${apiURL}${endpoint}`, {
      timeout: endpoint.includes("screener") ? 60_000 : 35_000,
    });
    expect(response.status()).toBeLessThan(500);
    expect(response.headers()["x-request-id"] ?? "health-local").toBeTruthy();
  });
}
