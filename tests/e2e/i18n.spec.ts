import { expect, test } from "@playwright/test";

const ROUTES: ReadonlyArray<readonly [string, RegExp]> = [
  ["/aujourdhui", /Today in the markets/],
  ["/cockpit", /Market universe/],
  ["/screener", /Preparing the Screener|Focused view of 60 Canadian large caps/],
  ["/actualites", /Synchronizing news|Canadian macro feed/],
  ["/calendrier", /Preparing calendar|Economic events/],
  ["/etf", /Canadian ETF map/],
  ["/ipo-insiders", /IPOs & insider transactions/],
  ["/focus/RY", /PROFESSIONAL CHART|Overview/],
  ["/comparateur", /Comparator/],
  ["/psychologie", /Calculating market psychology|Anatole Canada Index/],
  ["/terminal", /Initializing Pro Terminal|MARKET FLOW/],
  ["/watchlist", /Loading the watchlist|Tracked securities/],
  ["/portefeuille", /^Portfolio$/],
  ["/alertes", /^Alerts$/],
  ["/notifications", /Sign in to view your notifications/],
  ["/assistant", /Build your plan in 4 steps/],
  ["/compte", /Account & settings/],
  ["/parametres", /Account & settings/],
  ["/qualite", /Data & reliability/],
  ["/admin", /Beta console/],
  ["/conditions", /Terms of use/],
  ["/confidentialite", /Privacy policy/],
  ["/avis-financier", /Financial notice/],
];

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "La langue ne dépend pas du viewport.");
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
});

for (const [route, expectedEnglishCopy] of ROUTES) {
  test(`${route} suit la préférence anglaise globale`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "en-CA");
    await expect(page.getByText(expectedEnglishCopy).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Report a problem" })).toBeVisible();
  });
}
