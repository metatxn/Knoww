import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Platform folders are the registry's business. The web app reaches
// Polymarket through @knoww/services/registry, except in the two folders the
// ADR names as the typed escape hatch. See
// docs/decisions/2026-09-03-aggregator-platform-adapters.md, "Boundary rules".
const SRC_DIR = fileURLToPath(new URL("../", import.meta.url));
const ESCAPE_HATCH_DIRS = ["polymarket/", "app/api/polymarket/"];
// The Polymarket SDK is wrapped by the platform folder and shared-types; the
// ADR's M3 row bans a direct SDK import from anywhere else in the web app.
const DISALLOWED_IMPORTS = [
  '"@knoww/services/platforms/',
  "'@knoww/services/platforms/",
  '"@polymarket/',
  "'@polymarket/",
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

// Polymarket-only handlers live under app/api/polymarket/. Each move is a
// pure cutover: the old directory is deleted, and no caller in the web app or
// the extension may still name the old path. The harness support under
// src/polymarket/ is exempt because it records the relayer proxy under the
// normalised pre-move path on purpose. See the ADR, "Route moves".
const EXTENSION_SRC_DIR = join(SRC_DIR, "../../extension/src");
const MOVED_ROUTES = [
  [
    "app/api/polymarket/relayer/[...path]/route.ts",
    "app/api/relayer",
    "/api/relayer",
  ],
  [
    "app/api/polymarket/auth/derive-api-key/route.ts",
    "app/api/auth",
    "/api/auth/derive-api-key",
  ],
  ["app/api/polymarket/comments/route.ts", "app/api/comments", "/api/comments"],
  [
    "app/api/polymarket/markets/info/[conditionID]/route.ts",
    "app/api/markets/info",
    "/api/markets/info",
  ],
  [
    "app/api/polymarket/markets/orderbook/[tokenID]/route.ts",
    "app/api/markets/orderbook",
    "/api/markets/orderbook",
  ],
  [
    "app/api/polymarket/markets/price/route.ts",
    "app/api/markets/price",
    "/api/markets/price",
  ],
  [
    "app/api/polymarket/markets/price-history/batch/route.ts",
    "app/api/markets/price-history",
    "/api/markets/price-history",
  ],
  [
    "app/api/polymarket/markets/trades/[tokenID]/route.ts",
    "app/api/markets/trades",
    "/api/markets/trades",
  ],
  ["app/api/polymarket/user/pnl/route.ts", "app/api/user", "/api/user/pnl"],
  [
    "app/api/polymarket/user/pnl-history/route.ts",
    "app/api/user",
    "/api/user/pnl-history",
  ],
  [
    "app/api/polymarket/user/portfolio-value/route.ts",
    "app/api/user",
    "/api/user/portfolio-value",
  ],
  [
    "app/api/polymarket/user/public-profile/route.ts",
    "app/api/user",
    "/api/user/public-profile",
  ],
].map(([file, oldDir, oldPath]) => ({ file, oldDir, oldPath }));
// Deleted outright, with no replacement: the deprecated positions stub.
const DELETED_ROUTE_DIRS = ["app/api/wallet/positions"];

function oldPathOffenders(root) {
  const oldPaths = MOVED_ROUTES.map((route) => route.oldPath);
  return sourceFiles(root)
    .map((file) => relative(root, file))
    .filter((file) => !ESCAPE_HATCH_DIRS.some((dir) => file.startsWith(dir)))
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .filter((file) => {
      const source = readFileSync(join(root, file), "utf8");
      return oldPaths.some((path) => source.includes(path));
    });
}

test("Polymarket-only handlers live under app/api/polymarket and nothing names the old paths", () => {
  for (const route of MOVED_ROUTES) {
    assert.equal(existsSync(join(SRC_DIR, route.file)), true, route.file);
    assert.equal(existsSync(join(SRC_DIR, route.oldDir)), false, route.oldDir);
  }
  for (const dir of DELETED_ROUTE_DIRS) {
    assert.equal(existsSync(join(SRC_DIR, dir)), false, dir);
  }
  assert.deepEqual(
    [
      ...oldPathOffenders(SRC_DIR).map((file) => `web/${file}`),
      ...oldPathOffenders(EXTENSION_SRC_DIR).map((file) => `extension/${file}`),
    ].sort(),
    []
  );
});
