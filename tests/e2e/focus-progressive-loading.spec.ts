import { test, expect } from "@playwright/test";

test("Legacy analyst and capital links reach the same sourced consensus", async ({ page }) => {
  let available = false;
  await page.route("**/stocks/RY/fundamental-intelligence/capital", route => route.fulfill({ json: {
    ticker: "RY.TO", status: "partial", financial_currency: "CAD", stale: false, periods: [],
    analysts: { status: available ? "partial" : "unavailable", as_of: "2026-10-12T00:00:00Z",
      source_name: "Verified analyst fixture", source_confidence: "secondary_snapshot",
      recommendation_key: available ? "hold" : null,
      distribution: available ? { strong_buy: 1, buy: 2, hold: 5, sell: 0, strong_sell: 0 }
        : { strong_buy: null, buy: null, hold: null, sell: null, strong_sell: null },
      target_low: null, target_mean: available ? 42 : null, target_median: null, target_high: null,
      target_currency: "CAD", estimates: [], actual_vs_consensus: [], revision_history_status: "unavailable",
      revision_history_reason_fr: "Aucun historique daté des révisions.", revision_history_reason_en: "No dated revisions." },
    limitations_fr: [], limitations_en: [],
  } }));
  await page.goto("/focus/RY?view=analysts");
  const explorer = page.getByRole("combobox", { name: "Contenu à explorer" });
  await expect(explorer).toHaveValue("capital");
  await expect(page.getByText("Consensus indisponible.")).toBeVisible();
  available = true;
  await page.goto("/focus/RY?view=capital");
  await expect(explorer).toHaveValue("capital");
  await expect(page.getByText("Conserver", { exact: true })).toBeVisible();
  await expect(page.getByText("42", { exact: true })).toBeVisible();
  await expect(page.getByText("Aucun historique daté des révisions.")).toBeVisible();
});
