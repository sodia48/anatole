import { expect, test } from "@playwright/test";

test("Focus capital shows sourced allocations and refuses invented analyst revisions", async ({ page }) => {
  const measure = (value: number | null) => ({ value, status: value === null ? "unavailable" : "calculated",
    formula: "Explicit annual bridge", missing_inputs: value === null ? ["reported value"] : [] });
  const period = (year: number, ocf: number) => ({ period_end: `${year}-12-31T00:00:00Z`, currency: "CAD",
    source_name: "Issuer annual report", source_url: `https://issuer.example/annual-${year}.pdf`,
    source_confidence: "official", filed_at: `${year + 1}-02-10T00:00:00Z`,
    operating_cash_flow: measure(ocf), capital_expenditure: measure(20), dividends: measure(10), repurchases: measure(5),
    free_cash_flow: measure(ocf - 20), cash_after_allocations: measure(ocf - 35), capex_share_of_known_uses: measure(57.14),
    earnings_cash_conversion: measure(70), debt_change: measure(-10) });
  await page.route("**/stocks/RY/fundamental-intelligence/capital", route => route.fulfill({ json: {
    ticker: "RY.TO", status: "available", financial_currency: "CAD", stale: false,
    periods: [period(2025, 70), period(2024, 60)],
    analysts: { status: "partial", as_of: "2026-02-10T00:00:00Z", source_name: "Secondary analyst snapshot",
      source_confidence: "secondary_snapshot", recommendation_key: "buy", distribution: { strong_buy: 1, buy: 5, hold: 2, sell: 0, strong_sell: 0 },
      target_low: null, target_mean: 150, target_median: null, target_high: null, target_currency: null, estimates: [],
      actual_vs_consensus: [], revision_history_status: "unavailable", revision_history_reason_fr: "Aucun historique daté des révisions n'est fourni.",
      revision_history_reason_en: "No dated revision history is supplied." },
    limitations_fr: ["Calcul illustratif."], limitations_en: ["Illustrative calculation."],
  } }));
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: "Fondamentaux", exact: true }).click();
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("combobox", { name: "Ouvrir un module" }).selectOption("capital");
  const panel = page.getByRole("region", { name: "Allocation du capital" });
  await expect(panel.getByText("Aucun historique daté des révisions n'est fourni.")).toBeVisible();
  await expect(panel.getByRole("link", { name: /Issuer annual report/ }).first()).toHaveAttribute("href", "https://issuer.example/annual-2025.pdf");
  await panel.getByRole("group", { name: "Mode allocation" }).getByRole("button", { name: "Vue tableau" }).click();
  await expect(panel.getByRole("table")).toContainText("35 CAD");
  await panel.getByRole("group", { name: "Mode allocation" }).getByRole("button", { name: "Vue graphiques" }).click();
  await expect(panel.getByText("2025-12-31 · 70 CAD")).toBeVisible();
  await panel.getByRole("checkbox", { name: "Variation de la dette" }).check();
  await expect(panel.getByText("2025-12-31 · -10 CAD")).toBeVisible();
});
