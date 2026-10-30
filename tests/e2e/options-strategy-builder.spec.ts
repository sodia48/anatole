import { expect, test } from "@playwright/test";

test("builds and compares hypothetical spreads using the payoff API", async ({ page }, testInfo) => {
  const market = "tsx";
  const expiry = "2027-11-25";
  const contracts = [100, 110].map((strike) => ({
    symbol: `SYNTHETIC-CALL-${strike}`, underlying: "RY", market, contract: null, side: "call", strike,
    expiration: expiry, exchange: "TEST", bid: 1, ask: 2, last: 1.5, change: null, percent_change: null,
    volume: 12, open_interest: 20, implied_volatility: 20, delta: 0.5, gamma: 0.01, theta: -0.02, vega: 0.1,
    in_the_money: false, source: "synthetic fixture", delayed: true,
  }));
  await page.route("**/api/anatole/api/v1/options/universe?**", (route) => route.fulfill({ json: {
    market, items: [], source_statuses: [], generated_at: "2026-10-27T12:00:00Z", refresh_after_seconds: 3600,
  } }));
  await page.route("**/api/anatole/api/v1/options/chain?**", (route) => route.fulfill({ json: {
    market, symbol: "RY", provider_symbol: "RY", name: "Synthetic RY", category: "Banks", exchange: "TEST",
    underlying_price: 105, requested_expiration: null, expirations: [expiry], contracts,
    analytics: null, source_statuses: [], generated_at: "2026-10-27T12:00:00Z", refresh_after_seconds: 3600, stale: true,
  } }));
  await page.goto("/options");
  await expect(page.getByRole("heading", { name: "RY · Synthetic RY" })).toBeVisible();
  for (const strike of ["100,00", "110,00"]) {
    await page.getByRole("button", { name: new RegExp(`CALL ${strike}`) }).click();
    await page.getByRole("region", { name: "Détails du contrat" }).getByRole("button", { name: "Ajouter à la stratégie" }).click();
  }
  const builder = page.getByRole("region", { name: "Constructeur de stratégie" });
  await expect(builder.getByText(/simulation théorique à une échéance/i)).toBeVisible();
  await builder.getByLabel("Stratégie prédéfinie").selectOption("bull-call");
  await expect(builder.getByLabel("Sens").nth(1)).toHaveValue("short");
  await builder.getByLabel("Prime hypothétique par unité").nth(0).fill("2");
  await builder.getByLabel("Prime hypothétique par unité").nth(1).fill("1");
  for (let i = 0; i < 2; i++) {
    await builder.getByLabel("Multiplicateur vérifié").nth(i).fill("100");
    await builder.getByLabel("J'ai vérifié que ce contrat utilise une prime payée initialement.").nth(i).check();
  }
  const confirmationBounds = await builder.locator(".op-strategy-confirm").first().boundingBox();
  expect(confirmationBounds).not.toBeNull();
  expect(confirmationBounds!.height).toBeLessThan(100);
  await builder.getByLabel("Devise commune vérifiée (ISO)").fill("CAD");
  await builder.getByLabel("Échéance avec fuseau").fill("2027-11-25T16:00:00-05:00");
  await builder.getByLabel("Sous-jacent minimum simulé").fill("80");
  await builder.getByLabel("Sous-jacent maximum simulé").fill("120");
  const payoff = page.waitForResponse((response) => response.url().includes("/options/strategy/payoff") && response.request().method() === "POST");
  await builder.getByRole("button", { name: "Calculer un scénario" }).click();
  expect((await payoff).status()).toBe(200);
  const first = builder.locator(".op-scenario").first();
  await expect(first).toContainText("Débit théorique: 100");
  await expect(first).toContainText("101");
  await first.getByText("Valeurs simulées").click();
  await expect(first.getByRole("row").last()).toContainText("900");
  await builder.getByLabel("Prime hypothétique par unité").nth(0).fill("3");
  await builder.getByRole("button", { name: "Calculer un scénario" }).click();
  await expect(builder.locator(".op-scenario")).toHaveCount(2);
  await expect(builder.locator(".op-scenario").nth(1)).toContainText("Débit théorique: 200");
  await expect(first).toContainText("Débit théorique: 100");
  await page.screenshot({ path: testInfo.outputPath("strategy-synthetic.png"), fullPage: true });
  await builder.getByLabel("Quantité").nth(1).fill("2");
  await builder.getByRole("button", { name: "Calculer un scénario" }).click();
  await expect(builder.locator(".op-scenario")).toHaveCount(3);
  await expect(builder.locator(".op-scenario").nth(2)).toContainText("Débit théorique: 100");
  await expect(builder.locator(".op-scenario").nth(2)).toContainText("illimitée");
  await builder.getByRole("button", { name: "Retirer", exact: true }).last().click();
  await expect(builder.getByLabel("Quantité")).toHaveCount(1);
  await page.route("**/api/anatole/api/v1/options/chain?**", (route) => route.fulfill({ json: {
    market, symbol: "TD", provider_symbol: "TD", name: "Synthetic TD", category: "Banks", exchange: "TEST",
    underlying_price: null, requested_expiration: null, expirations: [], contracts: [],
    analytics: null, source_statuses: [], generated_at: "2026-10-27T12:00:00Z", refresh_after_seconds: 3600, stale: true,
  } }));
  await page.evaluate(() => window.history.pushState(null, "", "/options?symbol=TD"));
  await expect(page.getByRole("heading", { name: "TD · Synthetic TD" })).toBeVisible();
  await expect(builder.getByLabel("Prime hypothétique par unité").first()).toHaveValue("3");
  await expect(builder.locator(".op-scenario")).toHaveCount(3);
});
