import assert from "node:assert/strict";
import { test } from "vitest";
import { assertWalletRuntimeImport } from "../../scripts/assert-wallet-runtime-import.mjs";

test("built wallet runtime import has one argument", () => {
  assert.doesNotThrow(() =>
    assertWalletRuntimeImport(
      'import(chrome.runtime.getURL("content-trading.js"))'
    )
  );
  assert.throws(
    () =>
      assertWalletRuntimeImport(
        'import(chrome.runtime.getURL("content-trading.js"), "string" == typeof e && e)'
      ),
    /one argument/
  );
});
