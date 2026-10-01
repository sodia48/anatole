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
  "Canada 360 traite une question statistique et garde le contexte du suivi",
  async ({ page }) => {
    test.setTimeout(90_000);
    await mockOverview(page);

    await page.goto("/canada", {
      waitUntil: "domcontentloaded",
    });

    const frame = page.frameLocator(
      '[data-testid="canada360-assistant-frame"]',
    );

    await expect(frame.getByRole("heading", {
      name: "Une conversation, pas une série de recherches isolées.",
    })).toHaveCount(0);
    await expect(frame.locator("form select")).toHaveCount(0);
    await expect(frame.locator("form input:not([type=hidden])")).toHaveCount(1);
    await expect(frame.getByTestId("canada360-new-conversation")).toBeVisible();

    let input = frame.getByLabel("Question à Canada 360");
    await expect(input).toHaveAttribute(
      "placeholder", "Pose ta question à Canada 360…",
    );

    await input.fill(
      "Quel est le taux de chômage actuel en Alberta ?",
    );
    await frame
      .getByRole("button", { name: "Envoyer" })
      .click();

    const firstAnswer = frame.locator(".message").last();
    await expect(firstAnswer).toContainText(
      /Alberta|Je ne peux pas vérifier cette réponse en profondeur/,
    );
    if ((await firstAnswer.innerText()).includes("Alberta")) {
      await expect(firstAnswer).toContainText(/\d[,.]\d\s*%/);
      await expect(firstAnswer).toContainText(/pour .*20\d{2}/i);
      await expect(firstAnswer).toContainText(/Statistique Canada/i);
    }

    input = frame.getByLabel("Question à Canada 360");
    await input.fill(
      "Et l'Ontario ?",
    );
    await frame
      .getByRole("button", { name: "Envoyer" })
      .click();

    const chat = frame.getByTestId(
      "canada360-assistant-chat",
    );

    await expect(chat).toContainText(
      "Quel est le taux de chômage actuel en Alberta ?",
    );
    await expect(chat).toContainText("Et l'Ontario ?");
    const followupAnswer = frame.locator(".message").last();
    await expect(followupAnswer).toContainText(
      /Ontario|Je ne peux pas vérifier cette réponse en profondeur/,
    );
    if ((await followupAnswer.innerText()).includes("Ontario")) {
      await expect(followupAnswer).toContainText(/\d[,.]\d\s*%/);
    }
    await expect(chat).not.toContainText("Précise le service");
    await expect(chat).not.toContainText("Je peux répondre directement sur ce sujet");

    const memory = frame.getByTestId(
      "canada360-conversation-memory",
    );

    await expect(memory).toContainText(
      /Contexte retenu pour cette conversation/i,
    );
    await expect(memory).toContainText(/ON/i);
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
