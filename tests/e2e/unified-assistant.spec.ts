import { expect, test, type Page } from "@playwright/test";

const conversationId = "ba809b54-1d09-4cef-bb4b-bc3afae9175c";
const generated = "2026-10-01T12:00:00Z";

function reply(intent: string, title: string, answer: string, actions: { label: string; href: string; kind: string }[] = [], permission_required = false) {
  return { intent, title, answer, facts: [], links: [], sources: permission_required ? [] : [{ label: "Anatole", detail: "Données observées", status: "internal" }],
    suggestions: [], confidence: "moyenne", disclaimer: "Analyse éducative, sans ordre.", guardrail_triggered: false,
    generated_at: generated, conversation_id: conversationId, context: {}, actions, evidence: [], permission_required };
}

async function openGlobalAssistant(page: Page) {
  await page.waitForFunction(() => Object.keys(document.querySelector('button[aria-label="Ouvrir Anatole Assistant"]') ?? {}).some((key) => key.startsWith("__reactFiber")));
  await page.getByRole("button", { name: "Ouvrir Anatole Assistant" }).click();
  await expect(page.getByRole("dialog", { name: "Anatole Assistant" })).toBeVisible();
}

test("Focus SHOP nourrit le tiroir et le suivi compare SHOP à LSPD", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await page.route("**/api/anatole/api/v1/assistant/chat", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push(body);
    const comparing = String(body.message).includes("LSPD");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(comparing
      ? reply("compare", "Comparaison", "SHOP et LSPD ont des risques différents.", [{ label: "Comparer SHOP et LSPD", href: "/comparateur?symbols=SHOP,LSPD", kind: "navigate" }])
      : reply("stock_analysis", "SHOP", "Analyse sourcée de SHOP.", [{ label: "Ouvrir SHOP dans Focus", href: "/focus/SHOP", kind: "navigate" }])) });
  });
  await page.goto("/focus/SHOP", { waitUntil: "domcontentloaded" });
  await openGlobalAssistant(page);
  await expect(page.getByText("Focus · SHOP")).toBeVisible();
  await page.getByLabel("Votre question").fill("Analyse ce titre");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  await expect(page.getByText("Analyse sourcée de SHOP.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ouvrir SHOP dans Focus" })).toBeVisible();
  await page.getByLabel("Votre question").fill("Compare-le à LSPD");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  await expect(page.getByRole("link", { name: "Comparer SHOP et LSPD" })).toBeVisible();
  expect((calls[0].context as { symbol: string }).symbol).toBe("SHOP");
  expect(calls[1].conversation_id).toBe(conversationId);
  expect(calls.every((call) => (call.portfolio_positions as unknown[]).length === 0)).toBe(true);
});

test("ETF XIC et le Comparateur publient leurs entités sans positions", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await page.route("**/api/anatole/api/v1/assistant/chat", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push(body);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(
      reply("etf_analysis", "XIC", "Les participations vérifiées de XIC."),
    ) });
  });
  await page.goto("/etf/XIC", { waitUntil: "domcontentloaded" });
  await openGlobalAssistant(page);
  await expect(page.getByText("ETF · XIC")).toBeVisible();
  await page.getByLabel("Votre question").fill("Quels sont ses holdings ?");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  await expect(page.getByText("Les participations vérifiées de XIC.")).toBeVisible();
  expect((calls[0].context as { symbol: string }).symbol).toBe("XIC");
  expect(calls[0].portfolio_positions).toEqual([]);
  await page.getByRole("button", { name: "Fermer l’assistant" }).click();
  await page.goto("/comparateur?symbols=SHOP,LSPD", { waitUntil: "domcontentloaded" });
  await openGlobalAssistant(page);
  await expect(page.getByText("Comparateur · SHOP / LSPD")).toBeVisible();
});

test("Portefeuille demande une autorisation par conversation puis transmet les positions", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await page.addInitScript(() => localStorage.setItem("anatole:portfolio:v1", JSON.stringify([{ symbol: "SHOP", quantity: 2, average_cost: 30 }])))
  await page.route("**/api/anatole/api/v1/assistant/chat", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push(body);
    const authorized = body.portfolio_consent === true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(authorized
      ? reply("portfolio_analysis", "Risques", "La position SHOP concentre le portefeuille.")
      : reply("portfolio_analysis", "Autorisation", "Autoriser le portefeuille ?", [], true)) });
  });
  await page.goto("/portefeuille", { waitUntil: "domcontentloaded" });
  await openGlobalAssistant(page);
  await page.getByLabel("Votre question").fill("Quels sont mes principaux risques ?");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  await expect(page.getByText(/Autoriser Anatole Assistant à analyser/)).toBeVisible();
  expect(calls[0].portfolio_positions).toEqual([]);
  await page.getByRole("button", { name: "Autoriser pour cette conversation" }).click();
  await expect(page.getByText("La position SHOP concentre le portefeuille.")).toBeVisible();
  expect((calls[1].portfolio_positions as unknown[]).length).toBe(1);
});

test("Refus du portefeuille et Canada 360 gardent leurs contextes", async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await page.route("**/api/anatole/api/v1/assistant/chat", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push(body);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(
      reply("portfolio_analysis", "Autorisation", "Autoriser le portefeuille ?", [], true),
    ) });
  });
  await page.goto("/portefeuille", { waitUntil: "domcontentloaded" });
  await openGlobalAssistant(page);
  await page.getByLabel("Votre question").fill("Mes risques ?");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  await page.getByRole("button", { name: "Pas maintenant" }).click();
  await expect(page.getByText(/Sans accès aux positions/)).toBeVisible();
  expect(calls[0].portfolio_positions).toEqual([]);
  await page.getByRole("button", { name: "Fermer l’assistant" }).click();
  await page.goto("/canada", { waitUntil: "domcontentloaded" });
  await expect(page.frameLocator('[data-testid="canada360-assistant-frame"]').getByRole("heading", { name: "Que veux-tu savoir sur le Canada ?" })).toBeVisible();
  await openGlobalAssistant(page);
  await expect(page.getByText("Canada 360", { exact: true }).last()).toBeVisible();
});
