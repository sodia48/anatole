import { expect, test } from "@playwright/test";

test("fundamental alerts keep a sourced filing, threshold and reminder", async ({ page }) => {
  let submitted: unknown = null;
  await page.route("**/api/v1/workspace/alerts/evaluate", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: {
      items: [{ id: (submitted as { rules: Array<{ id: string }> }).rules[0].id, symbol: "RY", name: "Royal Bank",
        metric: null, event_type: "fundamental_margin_drop", alert_type: "price_level", metric_label: "Marge opérationnelle",
        operator: null, threshold: 4, current_value: 5.5, unit: "points", triggered: true, status: "triggered",
        message: "Marge opérationnelle : baisse de 5.50 points entre 2024-12-31 et 2025-12-31 · Rapport annuel officiel.",
        source: "https://issuer.example/annual-2025.pdf", event_fingerprint: "RY:margin:2025:filing", event_value: "2025-12-31",
        evaluated_at: "2026-10-16T12:00:00Z" }],
      triggered_count: 1, monitored_count: 1, unavailable_count: 0, generated_at: "2026-10-16T12:00:00Z", refresh_after_seconds: 30,
    } });
  });
  await page.goto("/alertes");
  await expect(page.getByRole("button", { name: "Signaler un problème" })).toHaveAttribute("data-client-ready", "true");
  await page.getByLabel("Symbole").fill("RY");
  const symbolSuggestions = page.locator('[class*="searchField"] [class*="suggestions"]');
  await expect(symbolSuggestions).toBeVisible();
  await page.getByLabel("Type de règle").selectOption("event");
  await page.getByLabel("Changement minimal").fill("4");
  await expect(symbolSuggestions).toBeHidden();
  await page.getByLabel("Rappel minimal").selectOption("10080");
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText("Baisse de marge opérationnelle (points) · 10080 min")).toBeVisible();
  await expect(page.getByText(/baisse de 5.50 points/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Document source" })).toHaveAttribute("href", "https://issuer.example/annual-2025.pdf");
  expect((submitted as { rules: Array<{ event_type: string; threshold: number; cooldown_minutes: number }> }).rules[0]).toMatchObject({
    event_type: "fundamental_margin_drop", threshold: 4, cooldown_minutes: 10080,
  });
});
