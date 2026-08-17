import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("chaque href actif de la sidebar répond", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Inventaire identique sur tous les viewports.");
  const source = fs.readFileSync(
    path.join(process.cwd(), "apps/web/components/layout/AppSidebar.tsx"),
    "utf8",
  );
  const activeHrefs = [...source.matchAll(
    /\{\s*href:\s*"([^"]+)"[\s\S]*?available:\s*true,?[\s\S]*?\}/g,
  )].map((match) => match[1]);

  expect(activeHrefs.length).toBeGreaterThanOrEqual(15);
  expect(new Set(activeHrefs).size).toBe(activeHrefs.length);
  for (const href of activeHrefs) {
    const response = await request.get(href, { timeout: 35_000 });
    expect(response.status(), href).toBeLessThan(400);
  }
});
