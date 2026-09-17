import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const budgets = JSON.parse(
  fs.readFileSync(path.join(root, "performance-budgets.json"), "utf8"),
);

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(resolved));
    else if (entry.isFile()) files.push(resolved);
  }
  return files;
}

function measure(directory, filter = () => true) {
  const sizes = walk(directory)
    .filter(filter)
    .map((file) => fs.statSync(file).size);
  return {
    files: sizes.length,
    total_bytes: sizes.reduce((sum, value) => sum + value, 0),
    largest_bytes: sizes.length ? Math.max(...sizes) : 0,
  };
}

function assertWithin(label, actual, maximum) {
  if (actual > maximum) {
    throw new Error(`${label} exceeded: ${actual} bytes > ${maximum} bytes`);
  }
}

const webJs = measure(
  path.join(root, "apps/web/.next/static/chunks"),
  (file) => file.endsWith(".js"),
);
const webPublic = measure(path.join(root, "apps/web/public"));
const mobileAssets = measure(path.join(root, "apps/mobile/assets"));

if (webJs.files === 0) {
  throw new Error(
    "No Next.js chunks found. Run `pnpm build:web` before check:performance.",
  );
}

assertWithin("Largest web JS chunk", webJs.largest_bytes, budgets.ceilings.web_js_largest_bytes);
assertWithin("Total web JS chunks", webJs.total_bytes, budgets.ceilings.web_js_total_bytes);
assertWithin("Largest web public asset", webPublic.largest_bytes, budgets.ceilings.web_public_largest_bytes);
assertWithin("Total web public assets", webPublic.total_bytes, budgets.ceilings.web_public_total_bytes);
assertWithin("Largest mobile asset", mobileAssets.largest_bytes, budgets.ceilings.mobile_assets_largest_bytes);
assertWithin("Total mobile assets", mobileAssets.total_bytes, budgets.ceilings.mobile_assets_total_bytes);

const resilientFetch = fs.readFileSync(
  path.join(root, "apps/web/lib/resilient-fetch.ts"),
  "utf8",
);
const cacheBlock = resilientFetch.match(
  /const PERSISTENT_PUBLIC_CACHE_PREFIXES = \[([\s\S]*?)\];/,
);
if (!cacheBlock) {
  throw new Error("Persistent public cache contract not found.");
}

for (const forbidden of [
  "/workspace/",
  "/account",
  "/notifications",
  "/portfolio",
  "/alerts",
]) {
  if (cacheBlock[1].includes(forbidden)) {
    throw new Error(`Private endpoint leaked into persistent public cache: ${forbidden}`);
  }
}

console.log("Anatole performance budgets: OK");
console.log(JSON.stringify({ webJs, webPublic, mobileAssets }, null, 2));
