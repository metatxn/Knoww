import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Backstop for the boundary rules in
// docs/decisions/2026-09-03-aggregator-platform-adapters.md. Biome enforces
// the same rules through root biome.json overrides; this scan catches what a
// linter exemption or a new file pattern might let through.
const SRC_DIR = fileURLToPath(new URL("./", import.meta.url));
const SPECIFIER = /\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (/\.ts$/.test(entry.name)) return [path];
    return [];
  });
}

function importsOf(file) {
  const source = readFileSync(join(SRC_DIR, file), "utf8");
  return [...source.matchAll(SPECIFIER)].map((match) => match[1]);
}

const files = sourceFiles(SRC_DIR).map((file) => relative(SRC_DIR, file));
const isTest = (file) => file.endsWith(".test.ts");
const inPlatforms = (file) => file.startsWith("platforms/");

function offenders(predicate) {
  return files
    .filter((file) =>
      importsOf(file).some((specifier) => predicate(specifier, file))
    )
    .sort();
}

test("only the registry and the platform folders import a platform folder", () => {
  const allowed = (file) => file === "registry.ts" || inPlatforms(file);
  assert.deepEqual(
    offenders(
      (specifier, file) =>
        !allowed(file) &&
        (specifier.includes("/platforms/") || specifier.endsWith("/platforms"))
    ),
    []
  );
});

test("vendor API types and SDKs stay inside the platform folders", () => {
  assert.deepEqual(
    offenders(
      (specifier, file) =>
        !inPlatforms(file) &&
        (specifier.startsWith("@knoww/shared-types/polymarket") ||
          specifier.startsWith("@polymarket/"))
    ),
    []
  );
});

test("the services package imports neither Next nor React", () => {
  const ui = /^(next|react|react-dom)(\/|$)/;
  assert.deepEqual(
    offenders((specifier) => ui.test(specifier)),
    []
  );
});

test("legacy markets and profiles modules reach Polymarket only through the registry", () => {
  const legacy = (file) =>
    (file.startsWith("markets/") || file.startsWith("profiles/")) &&
    !isTest(file);
  assert.deepEqual(
    offenders((specifier, file) => legacy(file) && specifier !== "../registry"),
    []
  );
});
