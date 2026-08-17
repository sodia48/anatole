import { expect, request as playwrightRequest, test } from "@playwright/test";

import {
  expiredSessionCookie,
  sessionCookie,
  SESSION_COOKIE_NAME,
} from "../../apps/web/lib/session-cookie";

const password = "Anatole2026!";
const newPassword = "Nouveau2027!";

function emailFor(project: string): string {
  return `bff-${project.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}@example.com`;
}

function expectSessionCookieHeader(header: string, cleared = false): void {
  const normalized = header.toLowerCase();
  expect(normalized).toContain(`${SESSION_COOKIE_NAME}=`);
  expect(normalized).toContain("httponly");
  expect(normalized).toContain("samesite=lax");
  expect(normalized).toContain("path=/");
  if (cleared) expect(normalized).toContain("max-age=0");
}

test("les options de cookie de production restent sécurisées sans navigateur HTTP", () => {
  const active = sessionCookie("server-only-token", new Date("2030-01-01T00:00:00Z"), true);
  const expired = expiredSessionCookie(true);

  expect(active).toMatchObject({
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
  });
  expect(expired).toMatchObject({
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });
});

test("le BFF compte protège le jeton et couvre le cycle de vie", async ({ context, page }, testInfo) => {
  const email = emailFor(testInfo.project.name);
  const api = context.request;

  const policy = await api.get("/api/account/registration", {
    headers: { "X-Request-ID": "e2e-policy" },
  });
  expect(policy.status()).toBe(200);
  expect((await policy.json()).enabled).toBe(true);

  const created = await api.post("/api/account/register", {
    data: {
      email,
      password,
      display_name: "BFF Test",
      accepted_terms: true,
      accepted_privacy: true,
    },
    headers: { "X-Request-ID": "e2e-register" },
  });
  expect(created.status()).toBe(201);
  expect(created.headers()["x-request-id"]).toBeTruthy();
  const createdBody = await created.json();
  expect(createdBody.token).toBeUndefined();
  expect(createdBody.token_type).toBeUndefined();
  expect(createdBody.user.email).toBe(email);
  expectSessionCookieHeader(created.headers()["set-cookie"]);
  expect(JSON.stringify(createdBody).toLowerCase()).not.toContain('"token"');
  expect(JSON.stringify(createdBody).toLowerCase()).not.toContain('"token_type"');

  const me = await api.get("/api/account/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).user.email).toBe(email);

  const workspace = await api.get("/api/account/workspace");
  expect(workspace.status()).toBe(200);
  expect((await workspace.json()).revision).toBe(0);

  const saved = await api.put("/api/account/workspace", {
    data: {
      expected_revision: 0,
      data: { watchlist: ["RY", "TD"] },
      client_updated_at: new Date().toISOString(),
    },
  });
  expect(saved.status()).toBe(200);
  expect((await saved.json()).revision).toBe(1);

  const conflict = await api.put("/api/account/workspace", {
    data: {
      expected_revision: 0,
      data: { watchlist: ["RY"] },
      client_updated_at: new Date().toISOString(),
    },
  });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).detail.current_revision).toBe(1);

  const profile = await api.put("/api/account/profile", {
    data: { display_name: "BFF Renommé" },
  });
  expect(profile.status()).toBe(200);

  await page.goto("/parametres?section=account");
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel(/Nom affiché/i)).toHaveValue("BFF Renommé");

  const isolated = await playwrightRequest.newContext({ baseURL: testInfo.project.use.baseURL as string });
  try {
    const duplicate = await isolated.post("/api/account/register", {
      data: {
        email,
        password,
        accepted_terms: true,
        accepted_privacy: true,
      },
    });
    expect(duplicate.status()).toBe(409);
    const wrong = await isolated.post("/api/account/login", {
      data: { email, password: "Incorrect2026" },
    });
    expect(wrong.status()).toBe(401);
  } finally {
    await isolated.dispose();
  }

  const changed = await api.post("/api/account/change-password", {
    data: { current_password: password, new_password: newPassword },
  });
  expect(changed.status()).toBe(204);

  const exported = await api.get("/api/account/export");
  expect(exported.status()).toBe(200);
  expect((await exported.json()).user.email).toBe(email);

  const logoutAll = await api.post("/api/account/logout-all");
  expect(logoutAll.status()).toBe(204);
  expectSessionCookieHeader(logoutAll.headers()["set-cookie"], true);
  expect((await api.get("/api/account/me")).status()).toBe(401);

  const login = await api.post("/api/account/login", {
    data: { email, password: newPassword },
  });
  expect(login.status()).toBe(200);
  const loginBody = await login.json();
  expect(loginBody.token).toBeUndefined();
  expect(loginBody.token_type).toBeUndefined();
  expectSessionCookieHeader(login.headers()["set-cookie"]);
  expect(JSON.stringify(loginBody).toLowerCase()).not.toContain('"token"');
  expect(JSON.stringify(loginBody).toLowerCase()).not.toContain('"token_type"');

  const logout = await api.post("/api/account/logout");
  expect(logout.status()).toBe(204);
  expectSessionCookieHeader(logout.headers()["set-cookie"], true);
  expect((await api.get("/api/account/me")).status()).toBe(401);

  expect((await api.post("/api/account/login", {
    data: { email, password: newPassword },
  })).status()).toBe(200);

  const deleted = await api.delete("/api/account/delete", {
    data: { password: newPassword, confirmation: "SUPPRIMER" },
  });
  expect(deleted.status()).toBe(204);
  expectSessionCookieHeader(deleted.headers()["set-cookie"], true);
  expect((await api.get("/api/account/me")).status()).toBe(401);
});

test("une panne workspace conserve la session utilisateur", async ({ page }) => {
  let workspaceRequests = 0;
  await page.route("**/api/account/registration", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      enabled: true,
      invite_required: false,
      terms_version: "test",
      privacy_version: "test",
    }),
  }));
  await page.route("**/api/account/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: {
        id: "stable-user",
        email: "stable@example.com",
        display_name: "Session Stable",
        created_at: "2026-08-01T00:00:00Z",
        last_login_at: "2026-08-01T00:00:00Z",
      },
      workspace_revision: 2,
      workspace_updated_at: "2026-08-01T00:00:00Z",
    }),
  }));
  await page.route("**/api/account/workspace", (route) => {
    workspaceRequests += 1;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Workspace temporairement indisponible." }),
    });
  });

  await page.goto("/parametres?section=account");
  await expect.poll(() => workspaceRequests).toBeGreaterThan(0);
  const accountLink = page.getByRole("link", { name: /Compte stable@example.com/i });
  await expect(accountLink).toBeVisible();
  await expect(accountLink).toContainText("À vérifier");
});

test("le centre de notifications utilise son BFF authentifié", async ({ context, page }, testInfo) => {
  const email = `notify-${testInfo.project.name.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}@example.com`;
  const api = context.request;
  const registered = await api.post("/api/account/register", { data: {
    email,
    password,
    display_name: "Notify E2E",
    accepted_terms: true,
    accepted_privacy: true,
  } });
  expect(registered.status(), await registered.text()).toBe(201);

  expect((await api.get("/api/notifications/feed")).status()).toBe(200);
  const preferences = await api.get("/api/notifications/preferences");
  expect(preferences.status()).toBe(200);
  expect((await preferences.json()).preferences.digest_frequency).toBe("off");

  await page.addInitScript(() => {
    localStorage.setItem("anatole.preferences.v0.4", JSON.stringify({
      theme: "dark",
      density: "comfortable",
      decimals: 2,
      defaultRange: "1y",
      defaultUniverse: "tsx60",
      language: "en",
    }));
  });
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: /Tes signaux Anatole|Your Anatole signals/i })).toBeVisible();
  await expect(page.getByText(/Aucune notification|No notifications/i)).toBeVisible();
  await expect(page.getByText(/n’est pas configuré|is not configured/i)).toBeVisible();
  await page.getByRole("button", { name: /Enregistrer|Save/i }).click();
  await expect(page.getByText(/Préférences enregistrées|Preferences saved/i)).toBeVisible();
  await page.getByRole("button", { name: /Prévisualiser|Preview/i }).click();
  await expect(page.getByText(/Anatole Today/)).toBeVisible();
  await expect(page.getByText(/Here are the main items observed/)).toBeVisible();
  await expect(page.getByText(/Information générale seulement/)).toHaveCount(0);

  const deleted = await api.delete("/api/account/delete", {
    data: { password, confirmation: "SUPPRIMER" },
  });
  expect(deleted.status(), await deleted.text()).toBe(204);
});

test("le BFF admin distingue utilisateur normal et administrateur", async ({ context, page }, testInfo) => {
  const api = context.request;
  const regularEmail = `regular-admin-check-${Date.now()}@example.com`;
  const adminEmail = `admin-e2e-${testInfo.project.name}@example.com`;
  expect((await api.post("/api/account/register", { data: {
    email: regularEmail,
    password,
    accepted_terms: true,
    accepted_privacy: true,
  } })).status()).toBe(201);
  expect((await api.get("/api/admin/overview")).status()).toBe(403);
  expect((await api.delete("/api/account/delete", { data: {
    password,
    confirmation: "SUPPRIMER",
  } })).status()).toBe(204);

  expect((await api.post("/api/account/register", { data: {
    email: adminEmail,
    password,
    display_name: "Admin E2E",
    accepted_terms: true,
    accepted_privacy: true,
  } })).status()).toBe(201);
  expect((await api.get("/api/admin/overview")).status()).toBe(200);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /Console de bêta/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Bêta-testeurs/i })).toBeVisible();
  await page.close();
  const deleted = await api.delete("/api/account/delete", { data: {
    password,
    confirmation: "SUPPRIMER",
  } });
  expect(deleted.status(), await deleted.text()).toBe(204);
});
