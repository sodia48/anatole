import { expect, test } from "@playwright/test";

test("shows sourced volatility, Greeks, term structure, skew and earnings", async ({ page }, testInfo) => {
  const make = (side: "call" | "put", strike: number, iv: number | null, delta: number | null, expiry = "2027-11-25") => ({
    symbol: `SYNTH-${expiry}-${side}-${strike}`, underlying: "RY", market: "tsx", contract: null, side, strike,
    expiration: expiry, exchange: "TEST", bid: 1, ask: 2, last: 1.5, change: null, percent_change: null,
    volume: 12, open_interest: 20, implied_volatility: iv, delta, gamma: 0.01, theta: -0.02, vega: 0.1,
    in_the_money: false, source: "synthetic fixture", delayed: true,
  });
  const contracts = [
    make("put", 90, 30, -0.25), make("call", 110, 20, 0.25),
    make("call", 100, 24, 0.5), make("put", 100, 25, -0.5),
    make("put", 80, null, null), make("call", 100, 26, 0.5, "2027-12-23"),
  ];
  await page.route("**/api/anatole/api/v1/options/universe?**", (route) => route.fulfill({ json: {
    market: "tsx", items: [], source_statuses: [], generated_at: "2026-10-27T12:00:00Z", refresh_after_seconds: 3600,
  } }));
  await page.route("**/api/anatole/api/v1/options/chain?**", (route) => route.fulfill({ json: {
    market: "tsx", symbol: "RY", provider_symbol: "RY", name: "Synthetic RY", category: "Banks", exchange: "TEST",
    underlying_price: 100, requested_expiration: null, expirations: ["2027-11-25", "2027-12-23"], contracts,
    analytics: null, source_statuses: [], generated_at: "2026-10-27T12:00:00Z", refresh_after_seconds: 3600, stale: true,
  } }));
  await page.route("**/api/anatole/api/v1/discovery/earnings-calendar?**", (route) => route.fulfill({ json: {
    status: "partial", stale: true, events: [
      { ticker: "RY", symbol: "RY.TO", company: "Synthetic RY", window_start: "2027-11-20T00:00:00Z",
        window_end: "2027-11-21T00:00:00Z", time_is_estimated: true, source: "synthetic calendar", url: "https://example.com/earnings" },
      { ticker: "TD", symbol: "TD.TO", company: "Unrelated fixture", window_start: "2027-11-20T00:00:00Z",
        window_end: "2027-11-21T00:00:00Z", time_is_estimated: true, source: "synthetic calendar", url: "https://example.com/other" },
    ],
  } }));
  await page.goto("/options");
  await expect(page.getByRole("heading", { name: "RY · Synthetic RY" })).toBeVisible();
  await page.getByRole("button", { name: "Intelligence de volatilité" }).click();
  const region = page.getByRole("region", { name: "Intelligence de volatilité" });
  await expect(region.getByText(/origine détaillée par contrat n'est pas disponible/i)).toBeVisible();
  await expect(region.getByRole("img", { name: /Smile/ })).toBeVisible();
  await expect(region.getByText(/10\.00 points de pourcentage/)).toBeVisible();
  await expect(region.getByRole("heading", { name: "Greeks Dashboard" })).toBeVisible();
  await expect(region.getByText("PUT 80 · SYNTH-2027-11-25-put-80")).toBeVisible();
  await expect(region.getByText(/synthetic calendar/)).toContainText("calendrier périmé");
  await expect(region.getByText(/synthetic calendar/)).toContainText("fenêtre UTC avant la date d'échéance affichée");
  await expect(region.getByText(/lignes relient les points/i)).toBeVisible();
  await expect(region.getByText("Unrelated fixture")).toHaveCount(0);
  await expect(region.getByRole("row", { name: /2027-12-23/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("volatility-synthetic.png"), fullPage: true });
});
