import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createPublicClient } from "@polymarket/client";
import {
  fetchResolutions,
  prepareLimitOrder,
} from "@polymarket/client/actions";
import {
  CTF_EXCHANGE_ADDRESS,
  EXCHANGE_V3_ADDRESS,
  NEG_RISK_CTF_EXCHANGE_ADDRESS,
} from "./contracts.ts";
import { fetchUnifiedPolymarketResolutions } from "./polymarket-unified.ts";

const sdkRequire = createRequire(import.meta.resolve("@polymarket/client"));
const { ResultAsync } = await import(
  pathToFileURL(sdkRequire.resolve("@polymarket/types")).href
);
const condition = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
const position = BigInt(`${condition}00`).toString();
const ctfToken = BigInt(`0xff${"11".repeat(31)}`).toString();
const wallet = `0x${"11".repeat(20)}`;
const environment = createPublicClient({}).environment;

async function signingRequest(assetId, side, negRisk, alias = "assetId") {
  const client = {
    environment,
    account: { wallet, signer: wallet, walletType: "EOA" },
    clob: {
      get(path) {
        const body = path.startsWith("/markets-by-token/")
          ? {
              condition_id:
                assetId === position ? condition : `0x${"aa".repeat(32)}`,
            }
          : {
              mts: 0.01,
              nr: negRisk,
              t: [{ t: assetId, o: "Yes" }],
              fd: { r: 0, e: 1 },
            };
        return ResultAsync.fromSafePromise(
          Promise.resolve(Response.json(body))
        );
      },
    },
  };
  const workflow = await prepareLimitOrder(client, {
    [alias]: assetId,
    side,
    price: "0.50",
    size: "10",
  });
  try {
    const first = await workflow.next();
    assert.equal(first.value.kind, "signOrder");
    return first.value.payload;
  } finally {
    await workflow.return();
  }
}

for (const side of ["BUY", "SELL"]) {
  for (const [name, assetId, negRisk, address, version] of [
    ["CTF", ctfToken, false, CTF_EXCHANGE_ADDRESS, "2"],
    ["neg-risk CTF", ctfToken, true, NEG_RISK_CTF_EXCHANGE_ADDRESS, "2"],
    ["V2", position, false, EXCHANGE_V3_ADDRESS, "3"],
  ]) {
    test(`installed SDK prepares ${side} ${name} orders for the correct exchange`, async () => {
      const payload = await signingRequest(assetId, side, negRisk);
      assert.equal(payload.domain.version, version);
      assert.equal(
        payload.domain.verifyingContract.toLowerCase(),
        address.toLowerCase()
      );
      assert.equal(String(payload.message.tokenId), assetId);
    });
  }
}

test("installed SDK tokenId alias preserves the same V2 signed message", async () => {
  const canonical = await signingRequest(position, "BUY", false);
  const alias = await signingRequest(position, "BUY", false, "tokenId");
  assert.deepEqual(alias.domain, canonical.domain);
  assert.equal(alias.message.tokenId, canonical.message.tokenId);
  assert.equal(alias.message.makerAmount, canonical.message.makerAmount);
  assert.equal(alias.message.takerAmount, canonical.message.takerAmount);
});

test("installed SDK resolution reads retain resolved zero and fractional payouts", async () => {
  for (const [raw, expected] of [
    [
      [0, 1_000_000],
      ["0", "1"],
    ],
    [
      [500_000, 500_000],
      ["0.5", "0.5"],
    ],
  ]) {
    const client = {
      data: {
        get(path, options) {
          assert.equal(path, "/v2/resolutions");
          assert.equal(options.params.get("condition"), `${condition}00`);
          return ResultAsync.fromSafePromise(
            Promise.resolve(
              Response.json({
                data: [
                  {
                    condition_id: condition,
                    status: "resolved",
                    payouts: raw,
                    extended_review: false,
                    was_disputed: false,
                    new_version_q: false,
                    transaction_hash: null,
                    log_index: null,
                    last_update_timestamp: 1791158400,
                  },
                ],
              })
            )
          );
        },
      },
    };
    const [resolution] = await fetchResolutions(client, {
      conditionIds: [condition],
    });
    assert.equal(resolution.conditionId, condition);
    assert.equal(resolution.status, "resolved");
    assert.deepEqual(resolution.payouts, expected);
  }
});

test("shared resolution wrapper delegates to the injected SDK client", async () => {
  const rows = [
    { conditionId: condition, status: "resolved", payouts: ["0", "1"] },
  ];
  assert.deepEqual(
    await fetchUnifiedPolymarketResolutions([condition], {
      client: {
        fetchResolutions: async (request) => {
          assert.deepEqual(request, { conditionIds: [condition] });
          return rows;
        },
      },
    }),
    rows
  );
  await assert.rejects(
    fetchUnifiedPolymarketResolutions([condition], { client: {} })
  );
});
