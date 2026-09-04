import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Platform folders are the registry's business. The web app reaches
// Polymarket through @knoww/services/registry, except in the two folders the
// ADR names as the typed escape hatch. See
// docs/decisions/2026-09-03-aggregator-platform-adapters.md, "Boundary rules".
const SRC_DIR = fileURLToPath(new URL("../", import.meta.url));
const ESCAPE_HATCH_DIRS = ["polymarket/", "app/api/polymarket/"];
const DISALLOWED_IMPORTS = [
  '"@knoww/services/platforms/',
  "'@knoww/services/platforms/",
];
// The escape hatch covers runtime access as well as imports: naming the
// platform when asking the registry for an adapter is how a module reaches
// Polymarket code without importing it. Tests are exempt because they set up
// the platform they stub.
const DISALLOWED_PLATFORM_NAMING = [
  "getPlatformAdapter(",
  'getMarketDataAdapter("polymarket")',
  "getMarketDataAdapter('polymarket')",
];

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (/\.(ts|tsx)$/.test(entry.name)) return [path];
    return [];
  });
}

test("web source reaches platform folders only from the escape-hatch folders", () => {
  const offenders = sourceFiles(SRC_DIR)
    .map((file) => relative(SRC_DIR, file))
    .filter((file) => !ESCAPE_HATCH_DIRS.some((dir) => file.startsWith(dir)))
    .filter((file) => {
      const source = readFileSync(join(SRC_DIR, file), "utf8");
      return DISALLOWED_IMPORTS.some((specifier) => source.includes(specifier));
    });

  assert.deepEqual(offenders.sort(), []);
});

test("web source names a platform only from the escape-hatch folders", () => {
  const offenders = sourceFiles(SRC_DIR)
    .map((file) => relative(SRC_DIR, file))
    .filter((file) => !ESCAPE_HATCH_DIRS.some((dir) => file.startsWith(dir)))
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .filter((file) => {
      const source = readFileSync(join(SRC_DIR, file), "utf8");
      return DISALLOWED_PLATFORM_NAMING.some((text) => source.includes(text));
    });

  assert.deepEqual(offenders.sort(), []);
});
