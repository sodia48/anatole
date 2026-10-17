import { expect, test } from "@playwright/test";

const value = (ticker: string, amount: number) => ({ ticker: `${ticker}.TO`, value: amount,
  period_end: "2025-12-31T00:00:00Z", source_name: "Issuer annual report",
  source_url: `https://issuer.example/${ticker}.pdf`, source_confidence: "official" });
const comparison = {
  target: "RY.TO", sector: "Financials", sector_family: "bank", universe_source: "BlackRock XIC holdings", universe_as_of: "2026-10-15",
  candidates: [{ ticker: "TD", name: "Toronto-Dominion", sector: "Financials", selection_basis: "Canadian index constituent; same broad sector" },
    { ticker: "BMO", name: "Bank of Montreal", sector: "Financials", selection_basis: "Canadian index constituent; same broad sector" }],
  selected: ["TD.TO"], excluded: {},
  method_fr: "Pairs canadiens comparables et sourcés.", method_en: "Comparable sourced Canadian peers.",
  measures: [{ key: "revenue_growth", label_fr: "Croissance des revenus", label_en: "Revenue growth", basis: "annual",
    unit: "percent", values: [value("RY", 10), value("TD", 8)], median: null, rank: null, sample_size: 2,
    minimum_sample_size: 6, explanation_fr: "Médiane indisponible : échantillon insuffisant.",
    explanation_en: "Median unavailable: insufficient sample." },
    { key: "net_margin", label_fr: "Marge nette", label_en: "Net margin", basis: "annual", unit: "percent",
      values: [value("RY", 15), value("TD", 12)], median: null, rank: null, sample_size: 2,
      minimum_sample_size: 6, explanation_fr: "Médiane indisponible : échantillon insuffisant.",
      explanation_en: "Median unavailable: insufficient sample." }],
};

test("Focus peers explain coverage, preserve provenance and allow replacement", async ({ page }) => {
  const requested: string[] = [];
  await page.route("**/stocks/RY/fundamental-intelligence/peers*", route => {
    requested.push(route.request().url());
    return route.fulfill({ json: comparison });
  });
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: "Fondamentaux", exact: true }).click();
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Pairs" }).click();
  const panel = page.getByRole("region", { name: "Comparateur sectoriel" });
  await panel.getByRole("group", { name: "Mode des comparaisons" }).getByRole("button", { name: "Vue cartes" }).click();
  await expect(panel.getByText("Médiane indisponible : échantillon insuffisant.").first()).toBeVisible();
  await expect(panel.getByRole("link", { name: /Issuer annual report/ }).first()).toHaveAttribute("href", "https://issuer.example/RY.pdf");
  await panel.getByText("Choisir ou remplacer les sociétés").click();
  await panel.getByRole("button", { name: /BMO · Bank of Montreal/ }).click();
  await expect.poll(() => requested.some(url => url.includes("TD%2CBMO"))).toBe(true);
  const beforeModeChange = requested.length;
  await panel.getByRole("group", { name: "Mode des comparaisons" }).getByRole("button", { name: "Vue tableau" }).click();
  await expect(panel.getByRole("table")).toBeVisible();
  await panel.getByRole("group", { name: "Mode des comparaisons" }).getByRole("button", { name: "Vue graphiques" }).click();
  await expect(panel.getByText("RY · 10 %")).toBeVisible();
  expect(requested.length).toBe(beforeModeChange);
});
