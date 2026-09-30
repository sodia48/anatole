import { expect, test } from "@playwright/test";

async function mockOverview(
  page: import("@playwright/test").Page,
) {
  await page.route(
    "**/api/anatole/api/v1/canada/overview?*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          language: "fr",
          status: "ok",
          macro: [],
          rates: [],
          markets: [],
          provinces: [],
          sources: [],
          issues: [],
          generated_at: "2026-09-30T12:00:00Z",
          refresh_after_seconds: 60,
        }),
      });
    },
  );
}

test(
  "Canada 360 Assistant répond sans JS client dédié",
  async ({ page }) => {
    await mockOverview(page);

    await page.goto("/canada", {
      waitUntil: "domcontentloaded",
    });

    const frame = page.frameLocator(
      '[data-testid="canada360-assistant-frame"]',
    );

    await expect(
      frame.getByTestId("canada360-assistant-shell"),
    ).toBeVisible();

    const input = frame.getByLabel(
      "Question à Canada 360",
    );
    await input.fill(
      "Quelles prestations puis-je chercher au Québec ?",
    );
    await frame
      .getByRole("button", { name: "Envoyer" })
      .click();

    const chat = frame.getByTestId(
      "canada360-assistant-chat",
    );
    await expect(chat).toContainText(/admissibilité/i);

    await expect(
      chat.getByRole("link", {
        name: /Chercheur de prestations/i,
      }),
    ).toHaveAttribute(
      "href",
      "https://www.canada.ca/en/services/benefits/finder.html",
    );
  },
);

test(
  "Canada 360 Assistant conserve le mode Comparer côté serveur",
  async ({ page }) => {
    await mockOverview(page);

    await page.goto("/canada", {
      waitUntil: "domcontentloaded",
    });

    const frame = page.frameLocator(
      '[data-testid="canada360-assistant-frame"]',
    );

    const mode = frame.getByLabel("Mode");
    await mode.selectOption("compare");

    const input = frame.getByLabel(
      "Question à Canada 360",
    );
    await input.fill(
      "Quelles prestations existent au Québec ?",
    );
    await frame
      .getByRole("button", { name: "Envoyer" })
      .click();

    await expect(
      frame.getByLabel("Mode"),
    ).toHaveValue("compare");
  },
);
