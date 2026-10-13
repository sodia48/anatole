import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

test("every app icon resolves to a local SVG symbol", () => {
  const exports = readFileSync(join(root, "components/layout/AppIcons.tsx"), "utf8");
  const sprite = readFileSync(join(root, "public/focus-icons.svg"), "utf8");
  const names = [...exports.matchAll(/export const (\w+) = icon\("(\w+)"\)/g)];
  assert.ok(names.length > 80);
  for (const [, exported, symbol] of names) {
    assert.equal(exported, symbol);
    assert.match(sprite, new RegExp(`<symbol id="${symbol}" viewBox="0 0 24 24">`));
  }
});
