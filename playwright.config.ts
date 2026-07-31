import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const apiURL = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:8000";

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
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 14"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          command:
            "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000",
          cwd: "apps/api",
          url: `${apiURL}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            MARKET_DATA_PROVIDER: "demo",
            CORS_ORIGINS: "http://127.0.0.1:3000",
            PYTHONUNBUFFERED: "1",
          },
        },
        {
          command: "pnpm --dir apps/web dev --hostname 127.0.0.1 --port 3000",
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
