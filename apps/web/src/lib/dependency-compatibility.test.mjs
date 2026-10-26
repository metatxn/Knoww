import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const appkitRequire = createRequire(require.resolve("@reown/appkit"));
const utilsRequire = createRequire(
  appkitRequire.resolve("@reown/appkit-utils")
);
const accountRequire = createRequire(utilsRequire.resolve("@base-org/account"));
const cdpEntry = pathToFileURL(accountRequire.resolve("@coinbase/cdp-sdk"));
const walletEntry = pathToFileURL(
  appkitRequire.resolve("@reown/appkit-wallet")
);

for (const [name, entry] of [
  ["Coinbase", cdpEntry],
  ["Reown", walletEntry],
]) {
  test(`${name} rejects oversized collections before validating their elements`, () => {
    const { z } = createRequire(entry)("zod");
    let parsed = 0;
    const schema = z
      .array(
        z.number().refine(() => {
          parsed += 1;
          return true;
        })
      )
      .max(1);
    const result = schema.safeParse([1, 2]);
    assert.equal(result.success, false);
    assert.equal(result.error.issues.length, 1);
    assert.equal(parsed, 0);
    assert.deepEqual(schema.parse([1]), [1]);
  });
}

test("wallet theme records accept string keys and reject invalid values with Zod 4", async () => {
  const { AppSyncThemeRequest } = await import(
    new URL("../src/W3mFrameSchema.js", walletEntry).href
  );
  assert.equal(
    AppSyncThemeRequest.safeParse({
      themeMode: "light",
      themeVariables: { "--w3m-accent": "#5f7d66", "--w3m-z-index": 10 },
    }).success,
    true
  );
  assert.equal(
    AppSyncThemeRequest.safeParse({ themeVariables: { invalid: {} } }).success,
    false
  );
});

for (const format of ["_cjs", "_esm"]) {
  test(`Coinbase ${format} typed-data records validate with Zod 4`, async () => {
    const { SignEvmTypedDataFieldCriterionSchema: schema } = await import(
      new URL(`../${format}/policies/evmSchema.js`, cdpEntry).href
    );
    const input = {
      type: "evmTypedDataField",
      types: {
        types: { Message: [{ name: "contents", type: "string" }] },
        primaryType: "Message",
      },
      conditions: [{ path: "contents", match: "^hello$" }],
    };
    assert.deepEqual(schema.parse(input), input);
    assert.equal(
      schema.safeParse({
        ...input,
        types: { ...input.types, types: { Message: 42 } },
      }).success,
      false
    );
  });
}
