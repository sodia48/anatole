import { expect, test } from "@playwright/test";

test("creates and removes an account expiry reminder without sending position amounts", async ({ page }, testInfo) => {
  const expires = new Date(Date.now() + 2 * 86400000);
  const expiry = expires.toISOString().replace(/\.\d{3}Z$/, "Z");
  const date = expiry.slice(0, 10);
  const email = `options-reminder-${Date.now()}-${testInfo.project.name}@example.test`;
  const registered = await page.request.post("/api/account/register", { data: {
    email, password: "Anatole2026!", display_name: "Synthetic test", accepted_terms: true, accepted_privacy: true,
  } });
  expect(registered.status(), await registered.text()).toBe(201);
  const preferences = (await (await page.request.get("/api/notifications/preferences")).json()).preferences;
  expect((await page.request.put("/api/notifications/preferences", { data: { ...preferences, include_calendar: false, include_watchlist: false } })).status()).toBe(200);
  await page.addInitScript(({ expiry, date }) => {
    localStorage.setItem("anatole:options-positions:v1", JSON.stringify({ version: 1, positions: [{
      id: "4712c957-f377-431e-8f0f-05eb6545b203", symbol: "SYNTH-RY-CALL", underlying: "RY", market: "tsx", contract: null,
      side: "call", strike: 100, expiration: date, expiry_at: expiry, direction: "long", quantity: 4,
      multiplier: 100, premium: 3, currency: "CAD", reminder_days: 7,
    }] }));
  }, { expiry, date });
  await page.route("**/api/anatole/api/v1/options/universe?**", (route) => route.fulfill({ json: {
    market: "tsx", items: [], source_statuses: [], generated_at: expiry, refresh_after_seconds: 3600,
  } }));
  await page.route("**/api/anatole/api/v1/options/chain?**", (route) => route.fulfill({ json: {
    market: "tsx", symbol: "RY", provider_symbol: "RY", name: "Synthetic RY", category: "Banks", exchange: "TEST",
    underlying_price: null, requested_expiration: null, expirations: [], contracts: [], analytics: null,
    source_statuses: [], generated_at: expiry, refresh_after_seconds: 3600, stale: false,
  } }));
  await page.goto("/options");
  await page.getByRole("button", { name: "Positions d'options" }).click();
  const panel = page.getByRole("region", { name: "Positions d'options" });
  await expect(panel.getByText("Rappels d'échéance du compte")).toBeVisible();
  const submit = page.waitForRequest((request) => request.url().endsWith("/api/notifications/option-reminders") && request.method() === "POST");
  await panel.getByRole("button", { name: "Activer le rappel SYNTH-RY-CALL" }).click();
  const payload = (await submit).postDataJSON() as Record<string, unknown>;
  expect(Object.keys(payload).sort()).toEqual(["expected_account_id", "expires_at", "position_id", "reminder_days", "underlying"]);
  await expect(panel.getByRole("button", { name: "Supprimer ce rappel" })).toBeVisible();
  const feed = await page.request.post("/api/notifications/refresh");
  expect(feed.status(), await feed.text()).toBe(200);
  expect((await feed.json()).items.some((item: { title: string }) => item.title.includes("RY"))).toBe(true);
  await panel.getByRole("button", { name: "Actualiser les rappels" }).click();
  await expect(panel.getByText("Notification créée")).toBeVisible();
  await expect(panel.getByRole("link", { name: "Ouvrir Notifications" })).toHaveAttribute("href", "/notifications");
  await page.screenshot({ path: testInfo.outputPath("account-reminder-synthetic.png"), fullPage: true });
  await page.reload();
  await page.getByRole("button", { name: "Positions d'options" }).click();
  await panel.getByRole("button", { name: "Supprimer ce rappel" }).click();
  await expect(panel.getByRole("button", { name: "Activer le rappel SYNTH-RY-CALL" })).toBeVisible();
  expect((await (await page.request.get("/api/notifications/option-reminders")).json())).toEqual([]);
  expect((await page.request.delete("/api/account/delete", { data: { password: "Anatole2026!", confirmation: "SUPPRIMER" } })).status()).toBe(204);
});
