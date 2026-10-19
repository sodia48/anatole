import { expect, test } from "@playwright/test";

const value = (ticker: string, amount: number) => ({ ticker: `${ticker}.TO`, value: amount,
  period_end: "2025-12-31T00:00:00Z", source_name: "Issuer annual report",
  source_url: `https://issuer.example/${ticker}.pdf`, source_confidence: "official" });
const comparison = {
  target: "RY.TO", sector: "Financials", sector_family: "bank", universe_source: "BlackRock XIC holdings", universe_as_of: "2026-10-15",
  candidates: [{ ticker: "TD", name: "Toronto-Dominion", sector: "Financials", selection_basis: "Verified snapshot", comparability: "direct", industry: "Banks" },
    { ticker: "BMO", name: "Bank of Montreal", sector: "Financials", selection_basis: "Verified snapshot", comparability: "direct", industry: "Banks" }],
  selected: ["TD.TO"], excluded: {},
  method_fr: "Pairs canadiens comparables et sourcés.", method_en: "Comparable sourced Canadian peers.",
  measures: [{ key: "revenue_growth", label_fr: "Croissance des revenus", label_en: "Revenue growth", basis: "annual",
    unit: "percent", values: [value("RY", 10), value("TD", 8)], median: null, rank: null, sample_size: 2,
    minimum_sample_size: 6, explanation_fr: "Médiane indisponible : échantillon insuffisant.",
    explanation_en: "Median unavailable: insufficient sample." },
    { key: "net_margin", label_fr: "Marge nette", label_en: "Net margin", basis: "annual", unit: "percent",
      values: [value("RY", -15), value("TD", 12)], median: null, rank: null, sample_size: 2,
      minimum_sample_size: 6, explanation_fr: "Médiane indisponible : échantillon insuffisant.",
      explanation_en: "Median unavailable: insufficient sample." }],
};

test("Focus peers explain coverage, preserve provenance and allow replacement", async ({ page }, testInfo) => {
  const requested: string[] = [];
  await page.route("**/stocks/RY/fundamental-intelligence/peers*", route => {
    requested.push(route.request().url());
    return route.fulfill({ json: comparison });
  });
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: "Fondamentaux", exact: true }).click();
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("combobox", { name: "Ouvrir un module" }).selectOption("peers");
  const panel = page.getByRole("region", { name: "Comparateur sectoriel" });
  await panel.getByRole("group", { name: "Mode des comparaisons" }).getByRole("button", { name: "Vue cartes" }).click();
  await expect(panel.getByText("Médiane indisponible : échantillon insuffisant.").first()).toBeVisible();
  await expect(panel.getByText("Écart cible – pair", { exact: true }).last()).toBeVisible();
  await testInfo.attach("comparateur-cartes", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  await panel.getByText("Voir les sources et valeurs exactes").click();
  await expect(panel.getByRole("link", { name: /Issuer annual report/ }).first()).toHaveAttribute("href", "https://issuer.example/RY.pdf");
  await panel.getByText("Choisir ou remplacer les sociétés").click();
  await panel.getByRole("button", { name: /BMO · Bank of Montreal/ }).click();
  await expect.poll(() => requested.some(url => url.includes("TD%2CBMO"))).toBe(true);
  await expect(panel.getByText(/Pairs admissibles/)).toContainText("TD");
  await expect(panel.getByRole("button", { name: /BMO · Bank of Montreal/ })).toHaveAttribute("aria-pressed", "false");
  const beforeModeChange = requested.length;
  await panel.getByRole("group", { name: "Mode des comparaisons" }).getByRole("button", { name: "Vue tableau" }).click();
  await expect(panel.getByRole("table")).toBeVisible();
  await testInfo.attach("comparateur-tableau", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  await panel.getByRole("group", { name: "Mode des comparaisons" }).getByRole("button", { name: "Vue graphiques" }).click();
  await expect(panel.getByRole("img", { name: "RY 10 %" })).toBeVisible();
  await expect(panel.getByRole("img", { name: "RY -15 %" })).toBeVisible();
  await expect(panel.locator('[role="img"][aria-label="RY -15 %"] > div').last()).toHaveCSS("background-color", "rgb(198, 109, 97)");
  await expect.poll(() => panel.evaluate(element => element.getBoundingClientRect().left)).toBeGreaterThanOrEqual(0);
  await testInfo.attach("comparateur-graphiques", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  expect(requested.length).toBe(beforeModeChange);
});
