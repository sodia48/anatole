import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const apiURL = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:8000";
const accountDatabaseURL =
  `sqlite:///file:anatole-e2e-${process.pid}` +
  "?mode=memory&cache=shared&uri=true";
const localWindowsPython = resolve(".venv", "Scripts", "python.exe");
const pythonCommand = process.platform === "win32" && existsSync(localWindowsPython)
  ? `"${localWindowsPython}"`
  : "python";
const nextCommand = `"${process.execPath}" "${resolve(
  "apps",
  "web",
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
)}"`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "fr-CA",
  },
  expect: {
    timeout: 15_000,
  },
  timeout: 60_000,
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-pixel-7",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          command:
            `${pythonCommand} -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
          cwd: "apps/api",
          url: `${apiURL}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            MARKET_DATA_PROVIDER: "demo",
            CORS_ORIGINS: "http://127.0.0.1:3000",
            PYTHONUNBUFFERED: "1",
            ACCOUNT_DATABASE_URL: accountDatabaseURL,
            ACCOUNT_REGISTRATION_ENABLED: "true",
            ACCOUNT_INVITE_CODES: "",
            ACCOUNT_ADMIN_EMAILS:
              "admin-e2e-desktop-chromium@example.com,admin-e2e-mobile-pixel-7@example.com",
          },
        },
        {
          command:
            `${nextCommand} dev --hostname 127.0.0.1 --port 3000`,
          cwd: "apps/web",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: {
            ANATOLE_API_URL: apiURL,
            NEXT_PUBLIC_API_URL: apiURL,
            NEXT_PUBLIC_WS_URL: "ws://127.0.0.1:8000",
          },
        },
      ],
});
