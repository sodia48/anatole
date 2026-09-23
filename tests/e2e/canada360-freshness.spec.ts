import { expect, test } from "@playwright/test";

const metric = (
  key: string,
  label: string,
  value: number,
  change: number | null,
  period: string,
  unit = "percent",
) => ({
  key,
  label,
  category: "Economie",
  value,
  change,
  change_kind: "percent",
  unit,
  source_name: "Statistique Canada",
  source_url: "https://www.statcan.gc.ca/",
  reference_period: period,
  observed_at: "2025-11-06T13:30:00Z",
  freshness: "fresh",
  official: true,
  derived: false,
  delayed: false,
});

const province = (code: string, name: string, gdpChange: number) => ({
  code,
  name,
  status: "ok",
  source_name: "Statistique Canada",
  source_url: "https://www.statcan.gc.ca/",
  metrics: [
    metric("real_gdp", "PIB reel", 500_000_000_000, gdpChange, "2024-01-01", "currency"),
    metric("unemployment_rate", "Chomage", 6.2, 0.1, "2026-08-01"),
    metric("inflation_yoy", "Inflation", 2.1, -0.2, "2026-08-01"),
    metric("employment", "Emploi", 2_000_000, 0.4, "2026-08-01", "persons"),
    metric("retail_sales", "Ventes au detail", 10_000_000, 0.8, "2026-07-01", "currency"),
    metric("housing_starts", "Mises en chantier", 40_000, 1.4, "2026-08-01", "units"),
    metric("population", "Population", 5_000_000, 1.8, "2026-07-01", "persons"),
  ],
});

test("Canada 360 clarifies annual GDP and recent data", async ({ page }) => {
  await page.route("**/api/anatole/api/v1/canada/overview?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        language: "fr",
        status: "ok",
        macro: [
          metric("real_gdp", "PIB reel", 2_400_000_000_000, 1.6, "2024-01-01", "currency"),
          metric("inflation_yoy", "Inflation", 2.1, -0.2, "2026-08-01"),
          metric("unemployment_rate", "Chomage", 6.4, 0.1, "2026-08-01"),
          metric("employment", "Emploi", 20_000_000, 0.3, "2026-08-01", "persons"),
          metric("retail_sales", "Ventes au detail", 70_000_000_000, 0.7, "2026-07-01", "currency"),
          metric("housing_starts", "Mises en chantier", 250_000, 1.1, "2026-08-01", "units"),
        ],
        rates: [],
        markets: [metric("tsx_composite", "S&P/TSX Composite", 31_200, 0.7, "2026-09-23", "index")],
        provinces: [
          province("PE", "Ile-du-Prince-Edouard", 3.77),
          province("NS", "Nouvelle-Ecosse", 3.13),
          province("AB", "Alberta", 3.0),
          province("SK", "Saskatchewan", 2.98),
          province("NB", "Nouveau-Brunswick", 2.67),
          province("NL", "Terre-Neuve-et-Labrador", 2.66),
          province("QC", "Quebec", 1.71),
          province("MB", "Manitoba", 1.65),
          province("ON", "Ontario", 1.64),
          province("BC", "Colombie-Britannique", 1.12),
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
  await expect(page.getByTestId("recent-economic-pulse")).toBeVisible();
  await expect(page.getByTestId("annual-gdp-context")).toContainText("2024");
  await expect(page.getByTestId("annual-gdp-context")).not.toContainText("2024-01-01");

  await page.getByRole("tab", { name: /Variation|Change/i }).click();
  const qc = page.getByTestId("province-comparator-QC");
  await expect(qc).toContainText("2024");
  await expect(qc).not.toContainText("2024-01-01");
});
