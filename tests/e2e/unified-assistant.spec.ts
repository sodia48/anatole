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

test("Focus RY affiche une analyse profonde lisible et des sources repliées", async ({ page }) => {
  const answer = ["Analyse technique et fondamentale de RY", "", "## Vue d’ensemble", "- Cours : 277.59 CAD.",
    "", "## Analyse fondamentale", "- ROE : 17.00 %.", "", "## Valorisation", "- P/E courant : 15.00 x.",
    "", "## Analyse technique", "- RSI 14 : 39.50.", "", "## Risques", "- Volatilité observée.",
    "", "## Ce qu’il faut surveiller", "- Prochains résultats annoncés : 2026-12-01.",
    "", "## Sources et fraîcheur", "- RBC Investor Relations : delayed, 2026-09-30."].join("\n");
  await page.route("**/api/anatole/api/v1/assistant/chat", async (route) => {
    const response = reply("stock_analysis", "RY", answer,
      [{ label: "Ouvrir l’analyse complète de RY dans Focus", href: "/focus/RY", kind: "navigate" }]);
    response.evidence = [{ sources: [{ label: "RBC Investor Relations", type: "issuer_official_document",
      freshness: "delayed", timestamp: generated }], missing_data: [] }] as typeof response.evidence;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
  });
  await page.goto("/focus/RY", { waitUntil: "domcontentloaded" });
  await openGlobalAssistant(page);
  await page.getByLabel("Votre question").fill("Fais une analyse technique et fondamentale de RY");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  const dialog = page.getByRole("dialog", { name: "Anatole Assistant" });
  for (const heading of ["Vue d’ensemble", "Analyse fondamentale", "Valorisation", "Analyse technique", "Risques", "Ce qu’il faut surveiller"])
    await expect(dialog.getByRole("heading", { name: heading })).toBeVisible();
  await expect(dialog.locator("ul li")).toHaveCount(6);
  await expect(dialog).not.toContainText("## ");
  await expect(dialog.getByText("RBC Investor Relations · delayed")).toBeHidden();
  await expect(dialog.getByRole("link", { name: /Ouvrir l’analyse complète de RY/ })).toBeVisible();
  await expect(dialog.getByLabel("Votre question")).toBeVisible();
  expect((await dialog.textContent())?.toLowerCase()).not.toMatch(/buy the dip|\bdca\b|achète|vends/);
});

test("Le tiroir global partage les titres, listes et labels de Canada 360", async ({ page }) => {
  const answer = ["**Réponse préliminaire :** Une couverture peut être disponible selon votre statut.",
    "", "## Si vous êtes demandeur d’asile", "- **Couverture :** PFSI", "- **À vérifier :** le statut exact",
    "", "### Pour être plus précis", "1. Quel est votre statut ?", "2. Avez-vous une assurance privée ?",
    "", "## Sources", "- Canada.ca"].join("\n");
  await page.route("**/api/anatole/api/v1/assistant/chat", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ...reply("canada360", "Canada 360", answer),
      evidence: [{ sources: [{ label: "Gouvernement du Canada", freshness: "live",
        url: "https://www.canada.ca/fr/services.html" }], missing_data: [] }],
    }) });
  });
  await page.goto("/canada", { waitUntil: "domcontentloaded" });
  await openGlobalAssistant(page);
  await page.getByLabel("Votre question").fill("Quels soins dentaires sont couverts ?");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  const dialog = page.getByRole("dialog", { name: "Anatole Assistant" });
  await expect(dialog.locator('[class*="richText"] p').first()).toHaveText("Une couverture peut être disponible selon votre statut.");
  await expect(dialog.getByRole("heading", { name: "Si vous êtes demandeur d’asile" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Pour être plus précis" })).toBeVisible();
  await expect(dialog.locator("ul li strong").first()).toHaveText("Couverture :");
  await expect(dialog.locator("ol li")).toHaveCount(2);
  await expect(dialog.locator('[class*="richText"]')).not.toContainText(/\*\*|##|Réponse préliminaire|Canada\.ca/);
  await expect(dialog.getByText("Sources officielles (1)")).toBeVisible();
  await expect(dialog.locator("details")).not.toHaveAttribute("open", "");
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
  await expect(page.getByRole("dialog", { name: "Anatole Assistant" }).getByText("Quels sont mes principaux risques ?")).toHaveCount(1);
  await page.getByLabel("Votre question").fill("penses-tu que la repartition est bien faite ?");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  await expect.poll(() => calls.length).toBe(3);
  expect(calls[2].portfolio_consent).toBe(true);
  expect((calls[2].portfolio_positions as unknown[]).length).toBe(1);
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
