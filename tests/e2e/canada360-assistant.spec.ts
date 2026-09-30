import { expect, test } from "@playwright/test";

const metric = (
  key: string,
  label: string,
  value: number,
  unit = "percent",
) => ({
  key,
  label,
  category: "Économie",
  value,
  change: 0.1,
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
  unemployment: number,
  inflation: number,
) => ({
  code,
  name,
  status: "ok",
  source_name: "Statistique Canada",
  source_url: "https://www.statcan.gc.ca/",
  metrics: [
    metric("real_gdp", "PIB réel", 500_000_000_000, "currency"),
    metric("unemployment_rate", "Taux de chômage", unemployment),
    metric("inflation_yoy", "Inflation sur 12 mois", inflation),
    metric("employment", "Emploi", 2_000_000, "persons"),
    metric("retail_sales", "Ventes au détail", 10_000_000, "currency"),
    metric("housing_starts", "Mises en chantier", 40_000, "units"),
    metric("population", "Population", 5_000_000, "persons"),
  ],
});

test("Canada 360 Assistant répond avec statistiques et ressources officielles", async ({ page }) => {
  await page.route("**/api/anatole/api/v1/canada/overview?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        language: "fr",
        status: "ok",
        macro: [
          metric("real_gdp", "PIB réel", 2_400_000_000_000, "currency"),
          metric("inflation_yoy", "Inflation sur 12 mois", 2.1),
          metric("unemployment_rate", "Taux de chômage", 6.4),
        ],
        rates: [],
        markets: [],
        provinces: [
          province("QC", "Québec", 5.4, 2.0),
          province("ON", "Ontario", 6.2, 2.2),
          province("AB", "Alberta", 7.0, 1.8),
          province("BC", "Colombie-Britannique", 5.9, 2.1),
          province("MB", "Manitoba", 5.5, 1.9),
          province("SK", "Saskatchewan", 5.1, 1.7),
          province("NS", "Nouvelle-Écosse", 6.7, 2.4),
          province("NB", "Nouveau-Brunswick", 6.9, 2.3),
          province("NL", "Terre-Neuve-et-Labrador", 8.1, 2.5),
          province("PE", "Île-du-Prince-Édouard", 7.2, 2.6),
        ],
        sources: [
          {
            key: "statcan",
            label: "Statistique Canada",
            status: "ok",
            detail: null,
          },
          {
            key: "provinces",
            label: "Provinces",
            status: "ok",
            detail: null,
          },
        ],
        issues: [],
        generated_at: "2026-09-29T12:00:00Z",
        refresh_after_seconds: 60,
      }),
    });
  });

  await page.goto("/canada", {
    waitUntil: "domcontentloaded",
  });

  const assistant = page.getByTestId("canada360-assistant");
  await expect(assistant).toBeVisible();

  const input = page.getByTestId("canada360-assistant-input");
  await input.fill("Quel est le taux de chômage au Québec ?");
  await input.press("Enter");

  const chat = page.getByTestId("canada360-assistant-chat");
  await expect(chat).toContainText("Québec");
  await expect(chat).toContainText(/5[,.]4 %/);
  await expect(
    chat.getByRole("link", { name: /Statistique Canada/i }).last(),
  ).toHaveAttribute("href", "https://www.statcan.gc.ca/");

  await input.fill("Quelles prestations puis-je chercher au Québec ?");
  await input.press("Enter");

  await expect(chat).toContainText(/admissibilité|eligibility/i);
  await expect(
    chat.getByRole("link", { name: /Chercheur de prestations|Benefits Finder/i }).last(),
  ).toHaveAttribute(
    "href",
    "https://www.canada.ca/en/services/benefits/finder.html",
  );
  await expect(
    chat.getByRole("link", { name: /Gouvernement du Québec|Quebec government/i }).last(),
  ).toHaveAttribute("href", "https://www.quebec.ca/en");
});

test("Canada 360 Assistant compare deux provinces sans inventer de valeur", async ({ page }) => {
  await page.route("**/api/anatole/api/v1/canada/overview?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        language: "fr",
        status: "ok",
        macro: [],
        rates: [],
        markets: [],
        provinces: [
          province("QC", "Québec", 5.4, 2.0),
          province("ON", "Ontario", 6.2, 2.2),
        ],
        sources: [
          {
            key: "statcan",
            label: "Statistique Canada",
            status: "ok",
            detail: null,
          },
          {
            key: "provinces",
            label: "Provinces",
            status: "ok",
            detail: null,
          },
        ],
        issues: [],
        generated_at: "2026-09-29T12:00:00Z",
        refresh_after_seconds: 60,
      }),
    });
  });

  await page.goto("/canada", {
    waitUntil: "domcontentloaded",
  });

  await page
    .getByTestId("canada360-assistant-mode-compare")
    .click();

  const input = page.getByTestId("canada360-assistant-input");
  await input.fill("Compare le chômage au Québec et en Ontario");
  await input.press("Enter");

  const chat = page.getByTestId("canada360-assistant-chat");
  await expect(chat).toContainText(/Québec: 5[,.]4 %/);
  await expect(chat).toContainText(/Ontario: 6[,.]2 %/);
});
