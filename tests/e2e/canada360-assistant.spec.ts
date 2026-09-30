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

const province = (code: string, name: string) => ({
  code,
  name,
  status: "ok",
  source_name: "Statistique Canada",
  source_url: "https://www.statcan.gc.ca/",
  metrics: [
    metric("unemployment_rate", "Taux de chômage", 5.4),
    metric("inflation_yoy", "Inflation", 2.0),
    metric("population", "Population", 5_000_000, "persons"),
  ],
});

async function mockOverview(page: import("@playwright/test").Page) {
  await page.route("**/api/anatole/api/v1/canada/overview?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        language: "fr",
        status: "ok",
        macro: [
          metric("inflation_yoy", "Inflation sur 12 mois", 2.1),
          metric("unemployment_rate", "Taux de chômage", 6.4),
        ],
        rates: [],
        markets: [],
        provinces: [
          province("QC", "Québec"),
          province("ON", "Ontario"),
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
}

test("Canada 360 Assistant affiche une réponse sourcée", async ({ page }) => {
  await mockOverview(page);

  await page.route(
    "**/api/anatole/api/v1/canada/assistant",
    async (route) => {
      const request = route.request();
      const payload = request.postDataJSON();

      if (String(payload.question).includes("prestations")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            answer:
              "Pour les prestations au Québec, voici les ressources officielles. Canada 360 ne déduit pas automatiquement ton admissibilité.",
            links: [
              {
                label: "Chercheur de prestations",
                url: "https://www.canada.ca/en/services/benefits/finder.html",
                level: "federal",
              },
              {
                label: "Gouvernement du Québec",
                url: "https://www.quebec.ca/en",
                level: "provincial",
              },
            ],
            source_line: "Liens officiels uniquement.",
            mode: payload.mode,
            jurisdiction: payload.jurisdiction,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          answer:
            "Québec — Taux de chômage: 5,4 % pour août 2026.",
          links: [
            {
              label: "Statistique Canada",
              url: "https://www.statcan.gc.ca/",
              level: "statistics",
            },
          ],
          source_line: "Statistique Canada · source officielle.",
          mode: payload.mode,
          jurisdiction: payload.jurisdiction,
        }),
      });
    },
  );

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
  await expect(chat).toContainText("5,4 %");
  await expect(
    chat.getByRole("link", { name: /Statistique Canada/i }),
  ).toHaveAttribute("href", "https://www.statcan.gc.ca/");

  await input.fill("Quelles prestations puis-je chercher au Québec ?");
  await input.press("Enter");

  await expect(chat).toContainText(/admissibilité/i);
  await expect(
    chat.getByRole("link", { name: /Chercheur de prestations/i }),
  ).toHaveAttribute(
    "href",
    "https://www.canada.ca/en/services/benefits/finder.html",
  );
});

test("Canada 360 Assistant envoie le mode Comparer au backend", async ({ page }) => {
  await mockOverview(page);

  let seenMode = "";

  await page.route(
    "**/api/anatole/api/v1/canada/assistant",
    async (route) => {
      const payload = route.request().postDataJSON();
      seenMode = String(payload.mode);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          answer:
            "Comparaison officielle — chômage: Québec: 5,4 % · Ontario: 6,2 %.",
          links: [],
          source_line: "Statistique Canada.",
          mode: payload.mode,
          jurisdiction: payload.jurisdiction,
        }),
      });
    },
  );

  await page.goto("/canada", {
    waitUntil: "domcontentloaded",
  });

  await page
    .getByTestId("canada360-assistant-mode-compare")
    .click();

  const input = page.getByTestId("canada360-assistant-input");
  await input.fill("Compare le chômage au Québec et en Ontario");
  await input.press("Enter");

  await expect(
    page.getByTestId("canada360-assistant-chat"),
  ).toContainText("Ontario: 6,2 %");

  expect(seenMode).toBe("compare");
});
