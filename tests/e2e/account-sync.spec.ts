import { expect, test } from "@playwright/test";

test.describe("Compte Anatole", () => {
  test("ferme les inscriptions si la politique est indisponible", async ({ page }) => {
    await page.route("**/api/account/registration", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Politique indisponible." }),
    }));
    await page.route("**/api/account/me", (route) => route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Connexion requise." }),
    }));

    await page.goto("/parametres?section=account");
    await page.getByRole("button", { name: /Créer un compte/i }).click();
    await expect(page.getByText(/La politique d’inscription est indisponible/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Créer et synchroniser/i })).toBeDisabled();
    await page.getByRole("button", { name: /Connexion/i }).click();
    await expect(page.getByRole("button", { name: /Me connecter/i })).toBeEnabled();
  });

  test("reste optionnel et lisible sur mobile", async ({ page }) => {
    await page.goto("/compte");
    await expect(page.getByRole("heading", { name: /Compte et paramètres/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Créer un compte/i })).toBeVisible();
    await expect(page.getByText(/Continue sans compte/i)).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  });

  test("importe les données locales lors de la création", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("anatole.watchlist.v1", JSON.stringify(["RY", "TD"]));
      localStorage.setItem(
        "anatole:portfolio:v1",
        JSON.stringify([{ symbol: "RY", quantity: 10, average_cost: 120 }]),
      );
    });

    await page.route("**/api/account/register", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          expires_at: "2030-01-01T00:00:00Z",
          user: {
            id: "user-1",
            email: "beta@example.com",
            display_name: "Beta",
            created_at: "2026-07-30T00:00:00Z",
            last_login_at: "2026-07-30T00:00:00Z",
          },
          workspace: {
            revision: 0,
            updated_at: null,
            data: {
              watchlist: [],
              portfolio: [],
              alerts: [],
              preferences: {
                theme: "dark",
                density: "comfortable",
                decimals: 2,
                default_range: "1y",
                default_universe: "tsx60",
              },
              advisor_profile: null,
              cockpit_universe: "tsx60",
              comparator_symbols: [],
            },
          },
        }),
      });
    });

    await page.route("**/api/account/workspace", async (route) => {
      if (route.request().method() === "PUT") {
        const payload = route.request().postDataJSON();
        expect(payload.data.watchlist).toEqual(["RY", "TD"]);
        expect(payload.data.portfolio).toHaveLength(1);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            revision: 1,
            updated_at: "2026-07-30T01:00:00Z",
            data: payload.data,
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/parametres?section=account");
    await expect(page.getByRole("button", { name: /Créer un compte/i })).toBeVisible();
    await page.getByRole("button", { name: /Créer un compte/i }).click();
    await page.getByLabel(/Courriel/i).fill("beta@example.com");
    await page.getByLabel(/Mot de passe/i).fill("Anatole2026!");
    for (const checkbox of await page.getByRole("checkbox").all()) {
      await checkbox.check();
    }
    await page.getByRole("button", { name: /Créer et synchroniser/i }).click();

    await expect(page.getByLabel(/Nom affiché/i)).toHaveValue("Beta");
    await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
  });
});
