import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function assertWalletRuntimeImport(source) {
  const imports =
    source.match(
      /import\(chrome\.runtime\.getURL\(["']content-(?:trading|wallet)\.js["']\)(?:,[^)]*)?\)/g
    ) ?? [];
  assert.equal(
    imports.length,
    1,
    "expected one wallet runtime import in content.js"
  );
  assert.match(
    imports[0],
    /^import\(chrome\.runtime\.getURL\(["']content-(?:trading|wallet)\.js["']\)\)$/,
    "wallet runtime import must have one argument; a transformed second argument breaks Chromium"
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  assertWalletRuntimeImport(
    readFileSync(new URL("../dist/content.js", import.meta.url), "utf8")
  );
}
