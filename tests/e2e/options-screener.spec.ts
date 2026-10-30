import { expect, test } from "@playwright/test";

test("filters the loaded chain, distinguishes missing liquidity and adds a contract to a strategy", async ({ page }, testInfo) => {
  const make = (symbol: string, side: "call" | "put", strike: number, expiration: string, volume: number | null, open_interest: number | null) => ({
    symbol, side, strike, expiration, volume, open_interest, underlying: "RY", market: "tsx", contract: null,
    exchange: "TEST", bid: 1, ask: 2, last: 1.5, change: null, percent_change: null, implied_volatility: null,
    delta: null, gamma: null, theta: null, vega: null, in_the_money: null, source: "synthetic fixture", delayed: true,
  });
  const contracts = [
    make("SYNTH-CALL-100", "call", 100, "2027-11-25", 100, 0),
    make("SYNTH-PUT-90", "put", 90, "2027-11-25", null, 40),
    make("SYNTH-CALL-110", "call", 110, "2027-12-23", 10, 50),
  ];
  await page.route("**/api/anatole/api/v1/options/universe?**", (route) => route.fulfill({ json: {
    market: "tsx", items: [], source_statuses: [], generated_at: "2026-10-27T12:00:00Z", refresh_after_seconds: 3600,
  } }));
  await page.route("**/api/anatole/api/v1/options/chain?**", (route) => route.fulfill({ json: {
    market: "tsx", symbol: "RY", provider_symbol: "RY", name: "Synthetic RY", category: "Banks", exchange: "TEST",
    underlying_price: 100, requested_expiration: null, expirations: ["2027-11-25", "2027-12-23"], contracts,
    analytics: null, source_statuses: [], generated_at: "2026-10-27T12:00:00Z", refresh_after_seconds: 3600, stale: true,
  } }));
  await page.goto("/options");
  await expect(page.getByRole("heading", { name: "RY · Synthetic RY" })).toBeVisible();
  await page.getByRole("button", { name: "Screener de contrats" }).click();
  const screen = page.getByRole("region", { name: "Screener de contrats" });
  await expect(screen.getByText(/chaîne chargée, pas à tout le marché/i)).toBeVisible();
  await expect(screen.getByText(/instantané récupéré/i)).toContainText("périmé");
  await expect(screen.getByRole("row", { name: /SYNTH-PUT-90/ })).toContainText("N/D");
  const zeroRow = screen.getByRole("row", { name: /SYNTH-CALL-100/ });
  await expect(zeroRow.getByRole("cell").nth(3)).toHaveText("100");
  await expect(zeroRow.getByRole("cell").nth(4)).toHaveText("0");
  await screen.getByLabel("Trier par").selectOption("volume");
  await expect(screen.getByRole("row").nth(1)).toContainText("SYNTH-CALL-100");
  await expect(screen.getByRole("row").last()).toContainText("SYNTH-PUT-90");
  await screen.getByLabel("Volume minimum").fill("5");
  await expect(screen.getByText("2 contrats correspondants")).toBeVisible();
  await expect(screen.getByRole("row", { name: /SYNTH-PUT-90/ })).toHaveCount(0);
  await screen.getByRole("combobox", { name: "Échéance", exact: true }).selectOption("2027-12-23");
  await expect(screen.getByText("1 contrat correspondant")).toBeVisible();
  await screen.getByLabel("Contrat ou strike").fill("110");
  await screen.getByRole("row", { name: /SYNTH-CALL-110/ }).getByRole("button", { name: "Ajouter" }).click();
  await expect(screen.getByText("Contrat ajouté")).toBeVisible();
  await expect(page.getByRole("region", { name: "Constructeur de stratégie" }).getByText(/SYNTH-CALL-110/)).toBeVisible();
  if (testInfo.project.name.startsWith("mobile")) {
    const table = screen.locator(".op-screen-table");
    await expect(screen.getByText(/défiler le tableau horizontalement/)).toBeVisible();
    const dimensions = await table.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
    const button = screen.getByRole("row", { name: /SYNTH-CALL-110/ }).getByRole("button", { name: "Ajouter" });
    expect((await button.boundingBox())!.height).toBeLessThan(70);
  }
  await page.screenshot({ path: testInfo.outputPath("screener-synthetic.png"), fullPage: true });
});
