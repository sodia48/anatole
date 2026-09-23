import { expect, test } from "@playwright/test";

const metric = (
  key: string,
  label: string,
  value: number,
  change: number | null,
  unit = "percent",
) => ({
  key,
  label,
  category: "Économie",
  value,
  change,
  change_kind: "percent",
  unit,
  source_name: "Statistique Canada",
  source_url: "https://www.statcan.gc.ca/",
  reference_period: "août 2026",
  observed_at: "2026-09-20T12:00:00Z",
  freshness: "fresh",
  official: true,
  derived: false,
  delayed: false,
});

const province = (
  code: string,
  name: string,
  gdp: number,
  unemployment: number,
  inflation: number,
) => ({
  code,
  name,
  status: "ok",
  source_name: "Statistique Canada",
  source_url: "https://www.statcan.gc.ca/",
  metrics: [
    metric("real_gdp", "PIB réel", gdp, 1.2, "currency"),
    metric("unemployment_rate", "Taux de chômage", unemployment, 0.2),
    metric("inflation_yoy", "Inflation sur 12 mois", inflation, -0.1),
    metric("employment", "Emploi", 2_000_000, 0.4, "persons"),
    metric("retail_sales", "Ventes au détail", 10_000_000, 0.8, "currency"),
    metric("housing_starts", "Mises en chantier", 40_000, 1.4, "units"),
    metric("population", "Population", 5_000_000, 1.8, "persons"),
  ],
});

test("Canada 360 analytics reuse the loaded snapshot", async ({ page }) => {
  let overviewRequests = 0;

  await page.route("**/api/anatole/api/v1/canada/overview?*", async (route) => {
    overviewRequests += 1;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        language: "fr",
        status: "ok",
        macro: [
          metric("real_gdp", "PIB réel", 2_400_000_000_000, 1.6, "currency"),
          metric("inflation_yoy", "Inflation sur 12 mois", 2.1, -0.2),
          metric("unemployment_rate", "Taux de chômage", 6.4, 0.1),
        ],
        rates: [],
        markets: [
          {
            ...metric("tsx_composite", "S&P/TSX Composite", 31_200, 0.7, "index"),
            official: false,
          },
        ],
        provinces: [
          province("QC", "Québec", 500, 5.7, 2.0),
          province("ON", "Ontario", 900, 6.2, 2.2),
          province("AB", "Alberta", 400, 7.0, 1.8),
          province("BC", "Colombie-Britannique", 350, 5.9, 2.1),
          province("MB", "Manitoba", 90, 5.5, 1.9),
          province("SK", "Saskatchewan", 85, 5.1, 1.7),
          province("NS", "Nouvelle-Écosse", 55, 6.7, 2.4),
          province("NB", "Nouveau-Brunswick", 45, 6.9, 2.3),
          province("NL", "Terre-Neuve-et-Labrador", 40, 8.1, 2.5),
          province("PE", "Île-du-Prince-Édouard", 10, 7.2, 2.6),
        ],
        sources: [
          { key: "statcan", label: "Statistique Canada", status: "ok", detail: null },
          { key: "provinces", label: "Provinces", status: "ok", detail: null },
        ],
        issues: [],
        generated_at: "2026-09-23T12:00:00Z",
        refresh_after_seconds: 60,
      }),
    });
  });

  await page.goto("/canada", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Ce qui change au Canada" }),
  ).toBeVisible();

  await expect(page.getByText("Couverture provinciale")).toBeVisible();
  await expect(page.getByText("100 %")).toBeVisible();

  const selector = page.getByLabel("Indicateur provincial à comparer");
  await expect(selector).toBeVisible();

  await selector.selectOption("unemployment_rate");
  await expect(selector).toHaveValue("unemployment_rate");

  const newfoundland = page.getByTestId("province-comparator-NL");
  await expect(newfoundland).toBeVisible();
  await expect(newfoundland).toContainText(/8[,.]1/);

  await page.waitForTimeout(150);
  expect(overviewRequests).toBe(1);
});
