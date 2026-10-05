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
