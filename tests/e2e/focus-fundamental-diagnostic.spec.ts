import { expect, test } from "@playwright/test";

const observation = (value: number, year: number) => ({
  value, period_end: `${year}-12-31T00:00:00Z`, period_type: "annual", unit: "percent",
  currency: null, nature: "calculated", formula: "net income / revenue × 100",
  inputs: ["net_income", "total_revenue"], source_name: `Issuer ${year}`,
  source_url: `https://issuer.example/reports/${year}.pdf`, source_type: "issuer_official_document",
  source_confidence: "official", filed_at: `${year + 1}-02-10T00:00:00Z`,
});

const diagnostic = {
  ticker: "RY.TO", name: "Royal Bank fixture", sector: "Financials", industry: "Bank", sector_family: "bank",
  generated_at: "2026-02-11T00:00:00Z", source_generated_at: "2026-02-10T00:00:00Z", stale: true,
  financial_currency: "CAD", status: "partial", global_score: null,
  methodology_fr: "Calculs déterministes. Aucun score global ni conseil d'investissement.",
  methodology_en: "Deterministic calculations. No global score or investment advice.",
  missing_data: [],
  findings: [{ kind: "observation", text_fr: "La marge nette s'améliore.", text_en: "Net margin improved.", measure_keys: ["net_margin"] }],
  measures: [{ key: "net_margin", label_fr: "Marge nette", label_en: "Net margin", dimension: "profitability", unit: "percent",
    observations: [observation(15, 2025), observation(12, 2024)], status: "available",
    reason_fr: null, reason_en: null, method_fr: "Bénéfice net / revenus × 100.", method_en: "Net income / revenue × 100." }],
  dimensions: [{ key: "profitability", label_fr: "Rentabilité", label_en: "Profitability", measure_keys: ["net_margin"],
    available_count: 1, score: null, score_status: "insufficient", contributions: [],
    explanation_fr: "Deux ratios comparables requis.", explanation_en: "Two comparable ratios required." }],
};

test("Focus diagnostic retains sources, stale status, bilingual modes and avoids refetch", async ({ page }) => {
  let requests = 0;
  await page.route("**/stocks/RY/fundamental-intelligence/diagnostic", route => {
    requests++;
    return route.fulfill({ json: diagnostic });
  });
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: "Fondamentaux", exact: true }).click();
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Diagnostic 360°" }).click();
  const panel = page.getByRole("region", { name: "Diagnostic financier 360°" });
  await expect(panel.getByText("La marge nette s'améliore.")).toBeVisible();
  await expect(panel.getByText(/Dernier instantané disponible/)).toBeVisible();
  await expect(panel.getByText("15 %").first()).toBeVisible();
  await expect(panel.getByRole("link", { name: /Issuer 2025/ })).toHaveAttribute("href", "https://issuer.example/reports/2025.pdf");
  const beforeModeChange = requests;
  await panel.getByRole("group", { name: "Mode du diagnostic" }).getByRole("button", { name: "Vue tableau" }).click();
  await expect(panel.getByRole("table")).toBeVisible();
  await panel.getByRole("group", { name: "Mode du diagnostic" }).getByRole("button", { name: "Vue graphiques" }).click();
  await expect(panel.getByText("Historique · pourcentages")).toBeVisible();
  expect(requests).toBe(beforeModeChange);
});
