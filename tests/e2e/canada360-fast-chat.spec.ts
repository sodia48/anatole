import { expect, test } from "@playwright/test";

const conversationId = "b70456e1-502f-4621-8072-94ff6c60580f";
const profile = { age: null, family_status: null, employment_status: null,
  children: null, province: "ON", objective: null };
const source = { label: "Programme officiel", url: "https://www.canada.ca/fr/services.html",
  level: "federal", agency: "Gouvernement du Canada", jurisdiction: "CA", updated_at: "2026-09" };

test("Canada 360 affiche le message et l'attente avant la réponse asynchrone", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/canada-assistant", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await gate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      conversation_id: conversationId, profile, failed: false,
      turns: [
        { role: "user", text: "Que propose le Canada ?", links: [], source_line: null },
        { role: "assistant", text: "Voici des services publics du Canada.", links: [source], source_line: "Source officielle" },
      ],
    }) });
  });
  await page.goto("/canada", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  const frame = page.frameLocator('[data-testid="canada360-assistant-frame"]');
  await expect(frame.getByRole("heading", { name: "Que veux-tu savoir sur le Canada ?" })).toBeVisible();
  const input = frame.getByLabel("Question à Canada 360");
  await input.fill("Que propose le Canada ?");
  await frame.getByRole("button", { name: "Envoyer" }).click();
  await expect(frame.locator(".message.user")).toContainText("Que propose le Canada ?");
  await expect(input).toBeEmpty();
  await expect(frame.locator(".message.pending")).toBeVisible();
  await expect(frame.getByRole("button", { name: "Envoyer" })).toBeDisabled();
  await expect(frame.getByRole("heading", { name: "Que veux-tu savoir sur le Canada ?" })).toBeHidden();
  await page.waitForTimeout(1700);
  release();
  await expect(frame.locator(".message.pending")).toHaveCount(0);
  await expect(frame.locator(".message").last()).toContainText("Voici des services publics");
  await expect(frame.getByRole("button", { name: "Envoyer" })).toBeEnabled();
  await expect(frame.locator("details.sources")).not.toHaveAttribute("open", "");
});

test("Canada 360 rend l'analyse RY V10 avec source stale et action Focus", async ({ page }) => {
  const question = "Fais une analyse technique et fondamentale pour RY";
  const answer = ["Analyse technique et fondamentale de RY", "", "## Vue d’ensemble", "- Cours : 277.59 CAD.",
    "", "## Analyse fondamentale", "- ROE : 17.00 %.", "", "## Valorisation", "- P/E courant : 15.",
    "", "## Analyse technique", "- RSI 14 : 39.50.", "- Titre externe : <script>bad()</script>.",
    "", "## Niveaux techniques", "- Support observé : 269.00 CAD.",
    "", "## Données manquantes et limites", "- Fondamentaux en cache périmé; actualisation en cours.",
    "", "## Sources et fraîcheur", "- RBC Investor Relations : stale, 2026-09-30."].join("\n");
  await page.route("**/api/canada-assistant", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      conversation_id: conversationId, profile: null, failed: false, permission_required: false,
      turns: [
        { role: "user", text: question, links: [], source_line: null },
        { role: "assistant", text: answer, skill: "stock_analysis", links: [], source_line: null,
          evidence: [{ sources: [{ label: "RBC Investor Relations", freshness: "stale",
            timestamp: "2026-09-30T12:00:00Z", url: "https://www.rbc.com/investor-relations/report.pdf" }],
            missing_data: [] }],
          actions: [{ label: "Ouvrir l’analyse complète de RY dans Focus", href: "/focus/RY" }] },
      ],
    }) });
  });
  await page.goto("/canada", { waitUntil: "domcontentloaded" });
  const frame = page.frameLocator('[data-testid="canada360-assistant-frame"]');
  const input = frame.getByLabel("Question à Canada 360");
  await input.fill(question);
  await frame.getByRole("button", { name: "Envoyer" }).click();
  await expect(frame.locator(".message.user")).toContainText(question);
  await expect(frame.locator(".message.error")).toHaveCount(0);
  await expect(frame.getByRole("heading", { name: "Analyse fondamentale" })).toBeVisible();
  await expect(frame.getByRole("heading", { name: "Analyse technique" })).toBeVisible();
  await expect(frame.locator(".researchText script")).toHaveCount(0);
  await expect(frame.locator(".researchText")).toContainText("<script>bad()</script>");
  const sources = frame.locator("details.sources");
  await expect(sources).toBeVisible();
  await expect(sources).not.toHaveAttribute("open", "");
  await expect(frame.getByRole("link", { name: /Ouvrir l’analyse complète de RY dans Focus/ })).toBeVisible();
  await expect(input).toBeVisible();
  await expect(frame.getByRole("button", { name: "Envoyer" })).toBeEnabled();
});

test("Canada 360 garde vingt tours dans un seul défilement et retrouve le dernier message", async ({ page }) => {
  const turns = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    text: `Tour ${index + 1} : ${"Informations gouvernementales. ".repeat(8)}`,
    links: index % 2 ? [source] : [], source_line: null,
  }));
  await page.route("**/api/canada-assistant", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      conversation_id: conversationId, profile, failed: false, turns,
    }) });
  });
  await page.goto("/canada", { waitUntil: "domcontentloaded" });
  const frame = page.frameLocator('[data-testid="canada360-assistant-frame"]');
  await frame.getByLabel("Question à Canada 360").fill("Une longue conversation ?");
  await frame.getByRole("button", { name: "Envoyer" }).click();
  await expect(frame.locator(".message")).toHaveCount(20);
  await expect(frame.getByRole("button", { name: "Envoyer" })).toBeVisible();
  await expect(frame.locator("details.sources").first()).not.toHaveAttribute("open", "");
  const chat = frame.getByTestId("canada360-assistant-chat");
  await expect.poll(() => chat.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await chat.evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event("scroll")); });
  const latest = frame.getByRole("button", { name: "Dernier message" });
  await expect(latest).toBeVisible();
  await latest.click();
  await expect.poll(() => chat.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThan(90);
  await expect(latest).toBeHidden();
  const dimensions = await frame.locator("body").evaluate((body) => ({
    scroll: body.scrollHeight, viewport: window.innerHeight,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 2);
});

test("Canada 360 conserve le formulaire HTML sans JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/api/canada-assistant?lang=fr&jurisdiction=CA`);
  await expect(page.getByRole("heading", { name: "Que veux-tu savoir sur le Canada ?" })).toBeVisible();
  await expect(page.locator('input[name="pdf"]')).toBeVisible();
  await expect(page.locator('input[name="document_consent"]')).toBeVisible();
  await page.getByLabel("Question à Canada 360").fill("Quel est le taux de chômage en Alberta ?");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByTestId("canada360-assistant-chat")).toContainText("Quel est le taux de chômage en Alberta ?");
  await context.close();
});

test("Canada 360 reprend le portefeuille après consentement sans doubler la question", async ({ page }) => {
  const calls: Record<string, string>[] = [];
  await page.addInitScript(() => localStorage.setItem("anatole:portfolio:v1", JSON.stringify([
    { symbol: "SHOP", quantity: 2, average_cost: 30 },
  ])));
  await page.route("**/api/canada-assistant", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const submitted = Object.fromEntries(
      [...(route.request().postData() ?? "").matchAll(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n--/g)]
        .map((match) => [match[1], match[2]]),
    ) as Record<string, string>;
    calls.push(submitted);
    const question = submitted.q;
    const history = JSON.parse(submitted.history || "[]") as Array<{ role: string; text: string; skill?: string }>;
    const resumed = submitted.resume === "on";
    if (!resumed) history.push({ role: "user", text: question });
    const permission = question.includes("portefeuille") && submitted.portfolio_consent !== "on";
    if (!permission) history.push({ role: "assistant", text: "Analyse du portefeuille SHOP.", skill: "portfolio_analysis" });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      conversation_id: conversationId, turns: history, profile: null, failed: false, permission_required: permission,
    }) });
  });
  await page.goto("/canada", { waitUntil: "domcontentloaded" });
  const frame = page.frameLocator('[data-testid="canada360-assistant-frame"]');
  await frame.getByLabel("Question à Canada 360").fill("je parle de mon portefeuille personnel de placement dans anatole");
  await frame.getByRole("button", { name: "Envoyer" }).click();
  await expect(frame.getByRole("button", { name: "Autoriser pour cette conversation" })).toBeVisible();
  expect(JSON.parse(String(calls[0].portfolio_positions))).toEqual([]);
  await frame.getByRole("button", { name: "Autoriser pour cette conversation" }).click();
  await expect(frame.getByText("Analyse du portefeuille SHOP.")).toBeVisible();
  await expect(frame.locator(".message.user")).toHaveCount(1);
  expect(JSON.parse(String(calls[1].portfolio_positions))).toHaveLength(1);
  await frame.getByLabel("Question à Canada 360").fill("penses-tu que la repartition est bien faite ?");
  await frame.getByRole("button", { name: "Envoyer" }).click();
  await expect.poll(() => calls.length).toBe(3);
  expect(JSON.parse(String(calls[2].portfolio_positions))).toHaveLength(1);
  await expect(frame.locator(".message.user")).toHaveCount(2);
});

test("Canada 360 passe réellement par V9 pour une question de portefeuille", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem("anatole:portfolio:v1", JSON.stringify([
    { symbol: "SHOP", quantity: 2, average_cost: 30 },
  ])));
  await page.goto("/canada", { waitUntil: "domcontentloaded" });
  const frame = page.frameLocator('[data-testid="canada360-assistant-frame"]');
  await frame.getByLabel("Question à Canada 360").fill("je parle de mon portefeuille personnel de placement dans anatole");
  await frame.getByRole("button", { name: "Envoyer" }).click();
  await expect(frame.getByRole("button", { name: "Autoriser pour cette conversation" })).toBeVisible();
  await frame.getByRole("button", { name: "Autoriser pour cette conversation" }).click();
  await expect(frame.locator(".skillChip").last()).toContainText("Portefeuille", { timeout: 60_000 });
  await expect(frame.locator(".message.user")).toHaveCount(1);
  await frame.getByLabel("Question à Canada 360").fill("penses-tu que la repartition est bien faite ?");
  await frame.getByRole("button", { name: "Envoyer" }).click();
  await expect(frame.locator(".message").last()).toContainText("horizon", { timeout: 60_000 });
  await expect(frame.locator(".message.user")).toHaveCount(2);
  await expect(frame.getByRole("button", { name: "Autoriser pour cette conversation" })).toHaveCount(0);
});
