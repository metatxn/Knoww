import assert from "node:assert/strict";
import { test } from "vitest";
import { mapTradingError } from "../../src/content/trading/error-mapping";

test("undeployed trading wallet errors direct users to the setup flow", () => {
  const mapped = mapTradingError(
    "Your deposit wallet is not deployed. Complete trading wallet setup first."
  );

  assert.equal(mapped.title, "Trading wallet not set up");
  assert.equal(
    mapped.body,
    "Create your trading vault in the Knoww setup flow, then retry."
  );
  assert.doesNotMatch(mapped.body, /knoww\.app/i);
});

test("relayer infrastructure rejections are not mapped as user cancellations", () => {
  const mapped = mapTradingError(
    'Relayer 400: {"success":false,"error":"Relayer create request rejected"}'
  );

  assert.notEqual(mapped.title, "Signing cancelled");
});

test("account connection mismatch explains how to continue without reporting an order rejection", () => {
  const message =
    "Select 0x000000000000000000000000000000000000cafe in MetaMask's connection prompt for https://knoww.app, then retry.";
  const mapped = mapTradingError(message);
  assert.equal(mapped.title, "Connect the same account");
  assert.equal(
    mapped.body,
    "In your wallet's connection prompt, select the same account as in the trading panel, then retry."
  );
});

test.each([
  ["Unexpected provider failure: diagnostic-marker", "Request failed"],
  ["clob rejected order: diagnostic-marker", "Order rejected by exchange"],
  ['Relayer 500: {"error":"diagnostic-marker"}', "Relayer error"],
  [
    "User rejected the request. Details: diagnostic-marker",
    "Signing cancelled",
  ],
  [
    "Select 0x000000000000000000000000000000000000cafe in MetaMask. diagnostic-marker",
    "Connect the same account",
  ],
])("does not expose raw diagnostics for %s", (message, title) => {
  const mapped = mapTradingError(message);
  assert.doesNotMatch(JSON.stringify(mapped), /diagnostic-marker/);
  assert.equal(Object.hasOwn(mapped, "raw"), false);
  assert.equal(mapped.title, title);
  assert.ok(mapped.body.length > 0);
});
