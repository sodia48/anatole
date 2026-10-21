import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
  sector_metrics: [{ key: "cet1", label_fr: "CET1", label_en: "CET1 capital ratio", value: 13.2, unit: "%",
    status: "available", period_end: null, source_name: "Issuer capital report", source_url: "https://issuer.example/capital.pdf",
    source_confidence: "official", filed_at: "2026-02-10T00:00:00Z" }],
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
  await page.getByRole("navigation", { name: "Vues fondamentales" }).getByRole("button", { name: "Vue d’ensemble" }).click();
  const panel = page.getByRole("region", { name: "Diagnostic financier 360°" });
  await expect(panel.getByText("La marge nette s'améliore.")).toBeVisible();
  await expect(panel.getByText(/Dernier instantané disponible/)).toBeVisible();
  await expect(panel.getByText("15 %").first()).toBeVisible();
  await panel.getByText("Détails, sources et méthodes").click();
  await expect(panel.getByRole("heading", { name: "Indicateurs propres au secteur" })).toBeVisible();
  await expect(panel.getByRole("link", { name: /Issuer capital report/ })).toHaveAttribute("href", "https://issuer.example/capital.pdf");
  await expect(panel.getByRole("link", { name: /Issuer 2025/ })).toHaveAttribute("href", "https://issuer.example/reports/2025.pdf");
  const beforeModeChange = requests;
  await panel.getByRole("group", { name: "Mode du diagnostic" }).getByRole("button", { name: "Vue tableau" }).click();
  await expect(panel.getByRole("table")).toBeVisible();
  await panel.getByRole("group", { name: "Mode du diagnostic" }).getByRole("button", { name: "Vue graphiques" }).click();
  await expect(panel.getByText("Historique · pourcentages")).toBeVisible();
  expect(requests).toBe(beforeModeChange);
});

test("Four-space overview keeps sourced details available on desktop and mobile", async ({ page }, testInfo) => {
  await page.route("**/stocks/RY/fundamental-intelligence/diagnostic", route => route.fulfill({ json: {
    ...diagnostic,
    measures: [...diagnostic.measures, { key: "cash_conversion", label_fr: "Conversion de trésorerie", label_en: "Cash conversion",
      dimension: "profitability", unit: "percent", observations: [observation(82, 2025), observation(75, 2024)],
      status: "available", reason_fr: null, reason_en: null, method_fr: "Flux / bénéfice", method_en: "Cash flow / income" }],
    sector_metrics: [...diagnostic.sector_metrics, { key: "reserve", label_fr: "Réserves", label_en: "Reserves",
      value: null, unit: "money", status: "unavailable", period_end: null, source_name: null,
      source_url: null, source_confidence: "unclassified", filed_at: null }],
    dimensions: [{ ...diagnostic.dimensions[0], measure_keys: ["net_margin", "cash_conversion"], available_count: 2,
      score: 70, score_status: "directional", contributions: [
        { measure_key: "net_margin", previous: 12, current: 15, direction: "improving", points: 35 },
        { measure_key: "cash_conversion", previous: 75, current: 82, direction: "improving", points: 35 },
      ], explanation_fr: "Deux ratios historiques comparables.", explanation_en: "Two comparable historical ratios." }, ...["growth", "liquidity", "leverage", "cash_flow", "earnings_quality"].map(key => ({
      key, label_fr: ({ growth: "Croissance", liquidity: "Liquidité", leverage: "Endettement", cash_flow: "Flux de trésorerie", earnings_quality: "Qualité des résultats" } as Record<string, string>)[key],
      label_en: ({ growth: "Growth", liquidity: "Liquidity", leverage: "Leverage", cash_flow: "Cash flow", earnings_quality: "Earnings quality" } as Record<string, string>)[key],
      measure_keys: [], available_count: 0, score: null, score_status: "insufficient", contributions: [],
      explanation_fr: "Données insuffisantes", explanation_en: "Insufficient data",
    }))],
  } }));
  await page.goto("/focus/RY");
  await expect(page.locator('[data-focus-ready="true"]')).toBeVisible();
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: "Fondamentaux", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Vues fondamentales" });
  await expect(nav.getByRole("button")).toHaveCount(4);
  await expect(nav.getByRole("button", { name: "Vue d’ensemble" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "Créer une alerte" })).toHaveAttribute("href", "/alertes?symbol=RY");
  await expect(page.getByRole("button", { name: "Interroger Anatole" })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include('[aria-label="Vues fondamentales"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await nav.getByRole("button", { name: "Comparer" }).click();
  await expect(nav.getByRole("button", { name: "Comparer" })).toHaveAttribute("aria-pressed", "true");
  await nav.getByRole("button", { name: "Simuler" }).click();
  await expect(nav.getByRole("button", { name: "Simuler" })).toHaveAttribute("aria-pressed", "true");
  await nav.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("combobox", { name: "Contenu à explorer" })).toHaveValue("financials");
  await nav.getByRole("button", { name: "Vue d’ensemble" }).click();
  const panel = page.getByRole("region", { name: "Diagnostic financier 360°" });
  await expect(panel.locator('[class*="overviewCard"]')).toHaveCount(2);
  await expect(panel.getByText(/Indice directionnel 70/)).toBeHidden();
  await expect(panel.getByText("Réserves")).toBeHidden();
  await panel.getByText("Détails, sources et méthodes").click();
  await expect(panel.getByText(/Indice directionnel 70/)).toBeVisible();
  await panel.getByText(/indicateur sans publication vérifiable/).click();
  await expect(panel.getByText("Réserves")).toBeVisible();
  await panel.getByText("Détails, sources et méthodes").click();
  await page.screenshot({ path: testInfo.outputPath("after-overview.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("Four-space navigation preserves English and sky theme", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({
    theme: "blue", density: "comfortable", decimals: 2, defaultRange: "1y", defaultUniverse: "tsx60", language: "en",
  })));
  await page.goto("/focus/RY");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "blue");
  await page.getByRole("navigation", { name: "Focus sections" }).getByRole("button", { name: "Fundamentals", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Fundamental views" });
  await expect(nav.getByRole("button", { name: "Overview" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Compare" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Simulate" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Explore" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("after-blue-en.png"), fullPage: true });
});

test("VNP overview shows four available measures and traceable details", async ({ page }, testInfo) => {
  const measure = (key: string, label: string, latest: number, previous: number, unit: "percent" | "money" = "percent") => ({
    key, label_fr: label, label_en: label, dimension: "profitability", unit,
    observations: [observation(latest, 2025), observation(previous, 2024)].map(point => ({ ...point, unit, currency: unit === "money" ? "CAD" : null })), status: "available",
    reason_fr: null, reason_en: null, method_fr: `${label} : calcul vérifiable.`, method_en: `${label}: verifiable calculation.`,
  });
  await page.route("**/stocks/VNP/fundamental-intelligence/diagnostic", route => route.fulfill({ json: {
    ...diagnostic, ticker: "VNP.TO", name: "VNP fixture", stale: false, sector_family: "industrial",
    measures: [measure("revenue_growth", "Croissance des revenus", 12, 9),
      measure("operating_margin", "Marge opérationnelle", 18, 16),
      measure("free_cash_flow", "Flux disponible", 8, 7, "money"),
      measure("cash_conversion", "Conversion de trésorerie", 80, 76)],
    findings: [
      { kind: "strength", text_fr: "Les revenus progressent.", text_en: "Revenue grows.", measure_keys: ["revenue_growth"] },
      { kind: "observation", text_fr: "La marge opérationnelle progresse.", text_en: "Operating margin improves.", measure_keys: ["operating_margin"] },
    ], sector_metrics: [], missing_data: [],
    dimensions: [{ ...diagnostic.dimensions[0], measure_keys: ["revenue_growth", "operating_margin", "free_cash_flow", "cash_conversion"], available_count: 4 }],
  } }));
  await page.goto("/focus/VNP?view=diagnostic");
  const panel = page.getByRole("region", { name: "Diagnostic financier 360°" });
  await expect(panel.getByText("VNP fixture · VNP.TO · 2025-12-31")).toBeVisible();
  await expect(panel.locator('[class*="overviewCard"]')).toHaveCount(4);
  await expect(panel.getByText("Les revenus progressent.")).toBeVisible();
  await panel.getByRole("link", { name: "Voir la source et la méthode" }).first().click();
  await expect(panel.getByRole("link", { name: /Issuer 2025/ }).first()).toHaveAttribute("href", "https://issuer.example/reports/2025.pdf");
  await panel.getByText("Détails, sources et méthodes").click();
  await page.screenshot({ path: testInfo.outputPath("after-complete.png"), fullPage: true });
});
