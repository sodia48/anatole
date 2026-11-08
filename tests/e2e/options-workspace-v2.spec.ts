import { expect, test } from "@playwright/test";

const expiry = "2027-11-25";
function fixture(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    symbol: `SYNTH-${index}`, underlying: "RY", market: "tsx", contract: null,
    side: index % 2 ? "put" : "call", strike: 50 + Math.floor(index / 2), expiration: expiry,
    exchange: "TEST", bid: 1, ask: 2, last: 1.5, change: null, percent_change: null,
    volume: index + 1, open_interest: index * 2, implied_volatility: 20 + index % 10,
    delta: index % 2 ? -0.25 : 0.25, gamma: 0.01, theta: -0.02, vega: 0.1,
    in_the_money: false, source: "synthetic fixture", delayed: true,
  }));
}

test("Options Pro replaces the main workspace with 526 synthetic contracts", async ({ page }, testInfo) => {
  if (testInfo.project.name === "desktop-chromium") await page.setViewportSize({ width: 1440, height: 900 });
  const contracts = fixture(526);
  let chainRequests = 0;
  await page.route("**/api/anatole/api/v1/options/universe?**", (route) => route.fulfill({ json: {
    market: "tsx", items: [{ symbol: "RY", provider_symbol: "RY", name: "Synthetic RY", category: "Banks" }],
    source_statuses: [], generated_at: "2027-11-20T12:00:00Z", refresh_after_seconds: 3600,
  } }));
  await page.route("**/api/anatole/api/v1/options/chain?**", (route) => {
    chainRequests++;
    return route.fulfill({ json: { market: "tsx", symbol: "RY", provider_symbol: "RY", name: "Synthetic RY",
      category: "Banks", exchange: "TEST", underlying_price: 100, requested_expiration: null,
      expirations: [expiry], contracts, analytics: null, source_statuses: [],
      generated_at: "2027-11-20T12:00:00Z", refresh_after_seconds: 3600, stale: true } });
  });
  await page.goto("/options?symbol=RY");
  const nav = page.getByRole("navigation", { name: "Espaces Options Pro" });
  const chain = page.getByRole("region", { name: "Chaîne d'options" });
  await expect(chain).toBeVisible();
  await expect(chain.locator(".op-row")).toHaveCount(40);
  await expect(page.getByText("526", { exact: true }).first()).toBeVisible();
  const initialRequests = chainRequests;
  await page.screenshot({ path: testInfo.outputPath("workspace-chain-526-synthetic.png") });

  await nav.getByRole("button", { name: "Volatilité" }).click();
  await expect(chain).toBeHidden();
  await expect(page.getByRole("heading", { name: "Volatility Intelligence — RY" })).toBeVisible();
  await expect(page).toHaveURL(/workspace=volatility/);
  await page.screenshot({ path: testInfo.outputPath("workspace-volatility-526-synthetic.png") });

  await nav.getByRole("button", { name: "Portefeuille" }).click();
  await expect(chain).toBeHidden();
  await expect(page.getByRole("region", { name: "Positions d'options" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("workspace-portfolio-526-synthetic.png") });

  await nav.getByRole("button", { name: "Stratégies" }).click();
  const builder = page.getByRole("region", { name: "Constructeur de stratégie" });
  await expect(builder.getByRole("button", { name: "Choisir des contrats" })).toBeVisible();
  await expect(chain).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("workspace-strategies-526-synthetic.png") });
  await builder.getByRole("button", { name: "Choisir des contrats" }).click();
  await chain.getByRole("button", { name: /CALL 50,00/ }).click();
  await page.getByRole("complementary", { name: "Détails du contrat" }).getByRole("button", { name: "Ajouter à la stratégie" }).click();
  await expect(builder.getByLabel("Quantité")).toHaveValue("1");
  await nav.getByRole("button", { name: "Chaîne" }).click();
  await chain.getByRole("button", { name: /CALL 50,00/ }).click();
  await page.getByRole("complementary", { name: "Détails du contrat" }).getByRole("button", { name: "Ajouter à la stratégie" }).click();
  await expect(builder.getByLabel("Quantité")).toHaveCount(1);
  await builder.getByLabel("Quantité").fill("3");

  await nav.getByRole("button", { name: "Chaîne" }).click();
  await page.getByRole("navigation", { name: "Vues de la chaîne" }).getByRole("button", { name: "Screener" }).click();
  await expect(chain).toBeHidden();
  await expect(page.getByRole("region", { name: "Screener de contrats" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("workspace-screener-526-synthetic.png") });
  await nav.getByRole("button", { name: "Stratégies" }).click();
  await expect(builder.getByLabel("Quantité")).toHaveValue("3");
  expect(chainRequests).toBe(initialRequests);
  await page.goBack();
  await expect(page.getByRole("region", { name: "Screener de contrats" })).toBeVisible();

  if (testInfo.project.name === "desktop-chromium") {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.screenshot({ path: testInfo.outputPath("workspace-screener-desktop-1920-synthetic.png") });
    for (const [name, label] of [["chain", "Chaîne"], ["strategies", "Stratégies"], ["volatility", "Volatilité"], ["portfolio", "Portefeuille"]] as const) {
      await nav.getByRole("button", { name: label }).click();
      if (name === "chain") await page.getByRole("navigation", { name: "Vues de la chaîne" }).getByRole("button", { name: "Chaîne" }).click();
      await page.screenshot({ path: testInfo.outputPath(`workspace-${name}-desktop-1920-synthetic.png`) });
    }
  }
});

for (const count of [100, 500, 1000]) {
  test(`chain bounds DOM rows for ${count} synthetic contracts`, async ({ page }) => {
    await page.route("**/api/anatole/api/v1/options/universe?**", (route) => route.fulfill({ json: {
      market: "tsx", items: [], source_statuses: [], generated_at: "2027-11-20T12:00:00Z", refresh_after_seconds: 3600,
    } }));
    await page.route("**/api/anatole/api/v1/options/chain?**", (route) => route.fulfill({ json: {
      market: "tsx", symbol: "RY", provider_symbol: "RY", name: "Synthetic RY", category: "Banks", exchange: "TEST",
      underlying_price: 100, requested_expiration: null, expirations: [expiry], contracts: fixture(count), analytics: null,
      source_statuses: [], generated_at: "2027-11-20T12:00:00Z", refresh_after_seconds: 3600, stale: true,
    } }));
    await page.goto("/options?symbol=RY");
    const chain = page.getByRole("region", { name: "Chaîne d'options" });
    await expect(chain).toBeVisible();
    expect(await chain.locator(".op-row").count()).toBeLessThanOrEqual(40);
    await expect(chain.getByRole("button", { name: "Suivant" })).toBeVisible();
  });
}

test("English labels and sky theme survive workspace navigation", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({
    theme: "blue", density: "comfortable", decimals: 2, defaultRange: "1y", defaultUniverse: "tsx60", language: "en",
  })));
  await page.route("**/api/anatole/api/v1/options/universe?**", (route) => route.fulfill({ json: {
    market: "tsx", items: [], source_statuses: [], generated_at: "2027-11-20T12:00:00Z", refresh_after_seconds: 3600,
  } }));
  await page.route("**/api/anatole/api/v1/options/chain?**", (route) => route.fulfill({ json: {
    market: "tsx", symbol: "RY", provider_symbol: "RY", name: "Synthetic RY", category: "Banks", exchange: "TEST",
    underlying_price: 100, requested_expiration: null, expirations: [expiry], contracts: fixture(2), analytics: null,
    source_statuses: [], generated_at: "2027-11-20T12:00:00Z", refresh_after_seconds: 3600, stale: true,
  } }));
  await page.goto("/options?symbol=RY");
  const nav = page.getByRole("navigation", { name: "Options Pro workspaces" });
  await expect(nav.getByRole("button", { name: "Chain" })).toBeVisible();
  await nav.getByRole("button", { name: "Strategies" }).click();
  await expect(page.getByRole("region", { name: "Strategy builder" })).toBeVisible();
  await nav.getByRole("button", { name: "Volatility" }).click();
  await expect(page.getByRole("heading", { name: "Volatility Intelligence — RY" })).toBeVisible();
  await nav.getByRole("button", { name: "Portfolio" }).click();
  await expect(page.getByRole("region", { name: "Options positions" })).toBeVisible();
  await nav.getByRole("button", { name: "Chain" }).click();
  await page.getByRole("navigation", { name: "Chain views" }).getByRole("button", { name: "Screener" }).click();
  await expect(page.getByRole("region", { name: "Contract screener" })).toBeVisible();
});
