import { expect, test } from "@playwright/test";

const routes = [
  "/aujourdhui",
  "/cockpit",
  "/actualites",
  "/calendrier",
  "/focus/RY",
];

test.describe("Web iPhone parity", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-iphone-14",
      "iPhone/WebKit-only responsive contract",
    );
  });

  for (const route of routes) {
    test(`${route} utilise le shell mobile Anatole sur iPhone`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status() ?? 200).toBeLessThan(400);

      const appbar = page.locator(".mobile-appbar");
      const dock = page.locator(".mobile-bottom-nav");

      await expect(appbar).toBeVisible();
      await expect(dock).toBeVisible();

      const layout = await page.evaluate(() => {
        const root = document.documentElement;
        const appbar = document.querySelector<HTMLElement>(".mobile-appbar");
        const dock = document.querySelector<HTMLElement>(".mobile-bottom-nav");
        const sidebar = document.querySelector<HTMLElement>(".sidebar");

        return {
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          appbarPosition: appbar ? getComputedStyle(appbar).position : "",
          dockPosition: dock ? getComputedStyle(dock).position : "",
          sidebarPosition: sidebar ? getComputedStyle(sidebar).position : "",
          sidebarHeight: sidebar?.getBoundingClientRect().height ?? 0,
          viewportHeight: window.innerHeight,
        };
      });

      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
      expect(layout.appbarPosition).toBe("fixed");
      expect(layout.dockPosition).toBe("fixed");
      expect(layout.sidebarPosition).toBe("fixed");
      expect(layout.sidebarHeight).toBeGreaterThan(layout.viewportHeight * 0.8);
    });
  }
});