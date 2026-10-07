import assert from "node:assert/strict";
import test from "node:test";
import * as polymarket from "./polymarket.ts";

const condition = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
const positions = [0, 1].map((index) =>
  BigInt(`${condition}0${index}`).toString()
);
const legacy = ["123", "456"];
const market = {
  version: "v2",
  outcomes: '["No","Yes"]',
  positionIds: positions,
  clobTokenIds: JSON.stringify(legacy),
  tokens: [{ outcome: "Yes", token_id: "456" }],
};

test("V2 IDs follow outcome order even when CTF token metadata exists", () => {
  assert.equal(polymarket.getGammaTokenIdForOutcome(market, 1), positions[1]);
  assert.equal(
    polymarket.getGammaYesNoMarketFields(market).yesTokenId,
    positions[1]
  );
  assert.equal(
    polymarket.getGammaYesNoMarketFields(market).noTokenId,
    positions[0]
  );
});

test("V2 selection rejects missing, misaligned and invalid position IDs", () => {
  for (const positionIds of [
    undefined,
    [positions[0]],
    ["1.5", positions[1]],
    [String(1n << 256n), positions[1]],
  ]) {
    assert.throws(() =>
      polymarket.getGammaTokenIdForOutcome({ ...market, positionIds }, 0)
    );
  }
  assert.throws(() => polymarket.getGammaTokenIdForOutcome(market, 2));
});

test("unsupported market versions cannot silently choose CTF", () => {
  assert.throws(() =>
    polymarket.getGammaTokenIdForOutcome({ ...market, version: "v3" }, 0)
  );
  assert.throws(() =>
    polymarket.getGammaTokenIdForOutcome({ ...market, version: undefined }, 0)
  );
});

test("legacy CTF outcome selection remains compatible", () => {
  assert.equal(
    polymarket.getGammaTokenIdForOutcome({ ...market, version: "v1" }, 1),
    "456"
  );
  assert.equal(
    polymarket.getGammaTokenIdForOutcome(
      { outcomes: '["Yes","No"]', clobTokenIds: '["123","456"]' },
      0
    ),
    "123"
  );
});

test("mixed balance cache targets select their own ledger without rounding IDs", () => {
  assert.deepEqual(
    polymarket.buildClobBalanceAllowanceTargets({
      tokenIds: [positions[0], "123", positions[0]],
    }),
    [
      { assetType: "COLLATERAL" },
      { assetType: "CONDITIONAL-V2", tokenId: positions[0] },
      { assetType: "CONDITIONAL", tokenId: "123" },
    ]
  );
});

test("explicit version and structured asset namespace must agree", () => {
  assert.equal(polymarket.resolvePolymarketProtocolVersion(positions[0]), "v2");
  assert.equal(polymarket.resolvePolymarketProtocolVersion("123"), "v1");
  assert.throws(() =>
    polymarket.resolvePolymarketProtocolVersion(positions[0], "v1")
  );
  assert.throws(() =>
    polymarket.resolvePolymarketProtocolVersion("not-an-id", "v2")
  );
});

test("V2 decoding preserves the condition and validates the binary outcome", () => {
  assert.deepEqual(polymarket.decodePolymarketV2AssetId(positions[1]), {
    conditionId: condition,
    outcomeIndex: 1,
  });
  assert.throws(() =>
    polymarket.decodePolymarketV2AssetId(BigInt(`${condition}02`))
  );
  assert.throws(() =>
    polymarket.resolvePolymarketProtocolVersion(BigInt(`${condition}02`))
  );
  assert.throws(() => polymarket.decodePolymarketV2AssetId("123"));
  for (const positionIds of [[positions[0], positions[0]]]) {
    assert.throws(() =>
      polymarket.getGammaTokenIdForOutcome({ ...market, positionIds }, 0)
    );
  }
  assert.equal(
    polymarket.getGammaTokenIdForOutcome(
      { ...market, positionIds: [positions[1], positions[0]] },
      0
    ),
    positions[1]
  );
});
