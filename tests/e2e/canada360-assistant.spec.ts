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
  "Canada 360 garde l'historique et enrichit une demande d'aide",
  async ({ page }) => {
    await mockOverview(page);

    await page.goto("/canada", {
      waitUntil: "domcontentloaded",
    });

    const frame = page.frameLocator(
      '[data-testid="canada360-assistant-frame"]',
    );

    let input = frame.getByLabel(
      "Question à Canada 360",
    );

    await input.fill(
      "Quelles prestations existent au Québec ?",
    );
    await frame
      .getByRole("button", { name: "Envoyer" })
      .click();

    await expect(
      frame.getByTestId("canada360-assistant-chat"),
    ).toContainText(/aide sociale|prestations/i);

    input = frame.getByLabel("Question à Canada 360");
    await input.fill(
      "J'ai 25 ans, je suis célibataire, je suis sans emploi et je cherche une aide financière",
    );
    await frame
      .getByRole("button", { name: "Envoyer" })
      .click();

    const chat = frame.getByTestId(
      "canada360-assistant-chat",
    );

    await expect(chat).toContainText(
      "Quelles prestations existent au Québec ?",
    );
    await expect(chat).toContainText(
      /25 ans|Assurance-emploi/i,
    );
    await expect(chat).toContainText(
      /Programme d’aide sociale/i,
    );
    await expect(chat).not.toContainText(
      /Canada — Emploi: 21 173 100/i,
    );

    const memory = frame.getByTestId(
      "canada360-conversation-memory",
    );

    await expect(memory).toContainText(
      /Contexte retenu pour cette conversation/i,
    );
    await expect(memory).toContainText(/25 ans/i);
    await expect(memory).toContainText(/célibataire/i);
    await expect(memory).toContainText(/sans emploi/i);
    await expect(memory).toContainText(/QC/i);
  },
);

test(
  "Canada 360 peut démarrer une nouvelle conversation",
  async ({ page }) => {
    await mockOverview(page);

    await page.goto("/canada", {
      waitUntil: "domcontentloaded",
    });

    const frame = page.frameLocator(
      '[data-testid="canada360-assistant-frame"]',
    );

    const input = frame.getByLabel(
      "Question à Canada 360",
    );

    await input.fill(
      "Quelles prestations existent en Ontario ?",
    );
    await frame
      .getByRole("button", { name: "Envoyer" })
      .click();

    await expect(
      frame.getByTestId("canada360-assistant-chat"),
    ).toContainText(/Ontario/i);

    await frame
      .getByTestId("canada360-new-conversation")
      .click();

    await expect(
      frame.getByTestId("canada360-assistant-chat"),
    ).not.toContainText(
      "Quelles prestations existent en Ontario ?",
    );
  },
);
