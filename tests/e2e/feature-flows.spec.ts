import { expect, test, type Page } from "@playwright/test";

async function gotoReady(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(
    page.getByRole("button", { name: "Signaler un problème" }),
  ).toHaveAttribute("data-client-ready", "true");
}

test.describe("contrôles fonctionnels Anatole", () => {
  test("la préférence de langue met à jour le document et le hub", async ({ page }) => {
    await gotoReady(page, "/parametres?section=preferences");
    await page.getByRole("button", { name: /English Canadian English interface/i }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en-CA");
    await expect(page.getByRole("heading", { name: "Account & settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Anatole language" })).toBeVisible();
  });

  test("le Cockpit conserve le choix Composite", async ({ page }) => {
    await gotoReady(page, "/cockpit");
    const composite = page.getByRole("radio", { name: /Composite/i });
    await composite.check();
    await expect(composite).toBeChecked();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("anatole-cockpit-universe"))).toBe("composite");
  });

  test("le Screener filtre et ouvre un ticker réel", async ({ page }) => {
    await gotoReady(page, "/screener");
    await page.getByPlaceholder("Ticker ou entreprise").fill("RY");
    const focusLink = page.locator('main a[href="/focus/RY"]').first();
    await expect(focusLink).toBeVisible();
    await focusLink.click();
    await expect(page).toHaveURL(/\/focus\/RY$/);
  });

  test("Actualités et Calendrier acceptent les régions provinciales", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoReady(page, "/actualites");
    const newsRegion = page.getByLabel("Région");
    const qcRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname.endsWith("/api/v1/discovery/provincial-macro")
        && url.searchParams.get("region") === "QC";
    });
    await Promise.all([qcRequest, newsRegion.selectOption("QC")]);

    await gotoReady(page, "/calendrier");
    const calendarRegion = page.getByLabel("Région");
    const onRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname.endsWith("/api/v1/discovery/provincial-calendar")
        && url.searchParams.get("region") === "ON";
    });
    await Promise.all([onRequest, calendarRegion.selectOption("ON")]);
  });

  test("le répertoire ETF recherche et ouvre XIC", async ({ page }) => {
    await gotoReady(page, "/etf");
    await page.getByLabel("Rechercher un ETF").fill("XIC");
    const xic = page.locator('a[href="/etf/XIC"]:visible').first();
    await expect(xic).toBeVisible();
    await xic.click();
    await expect(page).toHaveURL(/\/etf\/XIC$/);
  });

  test("IPO et initiés changent d’onglet sans perdre la route", async ({ page }) => {
    await gotoReady(page, "/ipo-insiders");
    await page.getByRole("button", { name: /Initiés Achats, ventes/i }).click();
    await expect(page.getByPlaceholder("Ex. RY, SHOP, AAPL")).toBeVisible();
    await expect(page).toHaveURL(/\/ipo-insiders$/);
  });

  test("Focus change de période avec des données réelles de démonstration", async ({ page }) => {
    await gotoReady(page, "/focus/RY");
    await page.getByRole("button", { name: "3M", exact: true }).click();
    await expect(page.locator(".status-footer")).toContainText("Période 3M");
  });

  test("le Comparateur ajoute puis retire ENB", async ({ page }) => {
    await gotoReady(page, "/comparateur");
    const composer = page.getByPlaceholder(/Ajouter un ticker/i);
    await composer.fill("ENB");
    await composer.press("Enter");
    const remove = page.getByRole("button", { name: "Retirer ENB" });
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(remove).toHaveCount(0);
  });

  test("la Watchlist persiste un ajout et permet son retrait", async ({ page }) => {
    await gotoReady(page, "/watchlist");
    await page.getByLabel("Symbole à ajouter").fill("RY");
    await page.getByRole("button", { name: "Ajouter" }).click();
    const remove = page.getByRole("button", { name: "Retirer RY" });
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(remove).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retirer TD" })).toBeVisible();
  });

  test("le Portefeuille charge un exemple, analyse et retire une position", async ({ page }) => {
    await gotoReady(page, "/portefeuille");
    await page.getByRole("button", { name: /Charger (un exemple|l’exemple)/i }).first().click();
    const remove = page.getByRole("button", { name: "Supprimer RY" });
    await expect(remove).toBeVisible();
    await expect(page.getByRole("button", { name: "Exporter" })).toBeEnabled();
    await remove.click();
    await expect(remove).toHaveCount(0);
  });

  test("les Alertes créent, évaluent et suppriment une règle", async ({ page }) => {
    await gotoReady(page, "/alertes");
    await page.getByLabel("Symbole").fill("RY");
    await page.getByRole("button", { name: /^RY Royal Bank/i }).click();
    await page.getByLabel("Seuil").fill("1");
    await page.getByRole("button", { name: "Créer" }).click();
    const remove = page.getByRole("button", { name: "Supprimer l’alerte" });
    await expect(remove).toBeVisible();
    await page.getByRole("button", { name: /Vérifier maintenant|Vérification/i }).click();
    await expect(page.getByText(/Déclenchée|Surveillance|Indisponible/).first()).toBeVisible();
    await remove.click();
    await expect(page.getByText("Aucune alerte")).toBeVisible();
  });
});
