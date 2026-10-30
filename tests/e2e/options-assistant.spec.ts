import { expect, test } from "@playwright/test";

test("opens the options assistant without sending local positions", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("anatole:portfolio:v1", JSON.stringify([{ symbol: "SHOP", quantity: 2, average_cost: 30 }]));
    localStorage.setItem("anatole:options-positions:v1", JSON.stringify({ version: 1, positions: [{ symbol: "PRIVATE-OPTION", quantity: 3 }] }));
  });
  await page.route("**/api/anatole/api/v1/options/universe?**", (route) => route.fulfill({ json: {
    market: "tsx", items: [], source_statuses: [], generated_at: "2027-11-20T12:00:00Z", refresh_after_seconds: 3600,
  } }));
  await page.route("**/api/anatole/api/v1/options/chain?**", (route) => route.fulfill({ json: {
    market: "tsx", symbol: "RY", provider_symbol: "RY", name: "Synthetic RY", category: "Banks", exchange: "TEST",
    underlying_price: 100, requested_expiration: null, expirations: [], contracts: [], analytics: null,
    source_statuses: [], generated_at: "2027-11-20T12:00:00Z", refresh_after_seconds: 3600, stale: true,
  } }));
  const calls: Record<string, unknown>[] = [];
  await page.route("**/api/anatole/api/v1/assistant/chat", async (route) => {
    calls.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.continue();
  });
  await page.goto("/options");
  await expect(page.getByRole("heading", { name: "RY · Synthetic RY" })).toBeVisible();
  const spaces = page.getByRole("region", { name: "Assistant et autres espaces" });
  await expect(spaces.getByRole("link", { name: "Voir RY dans Focus" })).toHaveAttribute("href", "/focus/RY");
  await expect(spaces.getByRole("link", { name: "Ouvrir Portefeuille" })).toHaveAttribute("href", "/portefeuille");
  await page.getByRole("button", { name: "Ouvrir Anatole Assistant" }).click();
  const dialog = page.getByRole("dialog", { name: "Anatole Assistant" });
  await expect(dialog).toBeVisible();
  await page.getByLabel("Votre question").fill("Explique le delta de mes positions d'options");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  await expect(dialog.getByText(/ne lis pas vos positions/)).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0].portfolio_consent).toBe(false);
  expect(calls[0].portfolio_positions).toEqual([]);
  expect(JSON.stringify(calls[0])).not.toContain("PRIVATE-OPTION");
  expect(JSON.stringify(calls[0])).not.toContain("SHOP");
  expect((calls[0].context as Record<string, unknown>).surface).toBe("options");
  await page.screenshot({ path: testInfo.outputPath("options-assistant-synthetic.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Retirer le contexte" }).click();
  await page.getByLabel("Votre question").fill("Analyse mon portefeuille");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  await expect(dialog.getByText(/Depuis Options, je ne transmets pas les positions/)).toBeVisible();
  expect(calls[1].portfolio_consent).toBe(false);
  expect(calls[1].portfolio_positions).toEqual([]);
  await expect(dialog.getByRole("button", { name: /autoriser/i })).toHaveCount(0);
});
