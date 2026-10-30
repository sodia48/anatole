import { expect, test } from "@playwright/test";

test("tracks a verified option locally with an expiry reminder", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2027-11-20T12:00:00Z"));
  const contract = { symbol: "SYNTH-CALL-100", underlying: "RY", market: "tsx", contract: null, side: "call", strike: 100,
    expiration: "2027-11-25", exchange: "TEST", bid: 1, ask: 2, last: 1.5, change: null, percent_change: null,
    volume: 10, open_interest: 20, implied_volatility: null, delta: null, gamma: null, theta: null, vega: null,
    in_the_money: null, source: "synthetic fixture", delayed: true };
  await page.route("**/api/anatole/api/v1/options/universe?**", (route) => route.fulfill({ json: {
    market: "tsx", items: [], source_statuses: [], generated_at: "2027-11-20T12:00:00Z", refresh_after_seconds: 3600,
  } }));
  await page.route("**/api/anatole/api/v1/options/chain?**", (route) => route.fulfill({ json: {
    market: "tsx", symbol: "RY", provider_symbol: "RY", name: "Synthetic RY", category: "Banks", exchange: "TEST",
    underlying_price: 100, requested_expiration: null, expirations: ["2027-11-25"], contracts: [contract],
    analytics: null, source_statuses: [], generated_at: "2027-11-20T12:00:00Z", refresh_after_seconds: 3600, stale: true,
  } }));
  await page.goto("/options");
  await expect(page.getByRole("heading", { name: "RY · Synthetic RY" })).toBeVisible();
  await page.getByRole("button", { name: "Screener de contrats" }).click();
  await page.getByRole("region", { name: "Screener de contrats" }).getByRole("button", { name: "Suivre" }).click();
  await expect(page.getByRole("link", { name: "Voir les positions" })).toHaveAttribute("href", "#options-positions");
  const panel = page.getByRole("region", { name: "Positions d'options" });
  await expect(panel.getByText(/aucune notification en arrière-plan/i)).toBeVisible();
  await panel.getByLabel("Nombre de contrats").fill("2");
  await panel.getByLabel("Multiplicateur vérifié").fill("100");
  await panel.getByLabel("Prime initiale par unité").fill("3");
  await panel.getByLabel("Devise ISO vérifiée").fill("CAD");
  await panel.getByLabel("Échéance vérifiée avec fuseau").fill("2027-11-25T16:00:00-05:00");
  await panel.getByLabel(/J'ai vérifié les spécifications/).check();
  await panel.getByRole("button", { name: "Enregistrer la position" }).click();
  await expect(panel.getByText("Rappel : échéance proche.")).toBeVisible();
  await expect(panel.getByText(/flux initial estimé/)).toContainText("600 CAD");
  await expect(panel.getByText(/Chaîne chargée/)).toContainText("instantané périmé");
  await panel.getByRole("button", { name: "Analyser dans le constructeur" }).click();
  const builder = page.getByRole("region", { name: "Constructeur de stratégie" });
  await expect(builder.getByLabel("Quantité")).toHaveValue("2");
  await expect(builder.getByLabel("Prime hypothétique par unité")).toHaveValue("3");
  await expect(builder.getByLabel("Multiplicateur vérifié")).toHaveValue("100");
  await builder.getByLabel("Devise commune vérifiée (ISO)").fill("USD");
  await builder.getByLabel("Échéance avec fuseau").fill("2027-11-25T16:00:00-05:00");
  await builder.getByLabel("Sous-jacent minimum simulé").fill("80");
  await builder.getByLabel("Sous-jacent maximum simulé").fill("120");
  await builder.getByRole("button", { name: "Calculer un scénario" }).click();
  await expect(builder.getByText(/Vérifiez les jambes/)).toBeVisible();
  await expect(builder.locator(".op-scenario")).toHaveCount(0);
  await builder.getByLabel("Devise commune vérifiée (ISO)").fill("CAD");
  await builder.getByRole("button", { name: "Calculer un scénario" }).click();
  await expect(builder.locator(".op-scenario").first()).toContainText("Débit théorique: 600");
  await page.screenshot({ path: testInfo.outputPath("options-position-synthetic.png"), fullPage: true });
  await page.reload();
  await page.getByRole("button", { name: "Positions d'options" }).click();
  const restored = page.getByRole("region", { name: "Positions d'options" });
  await expect(restored.getByText("Rappel : échéance proche.")).toBeVisible();
  await restored.getByRole("button", { name: "Retirer du suivi" }).click();
  await expect(restored.getByText("Aucune position suivie.")).toBeVisible();
});
