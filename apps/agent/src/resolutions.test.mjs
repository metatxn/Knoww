import assert from "node:assert/strict";
import test from "node:test";
import { fetchMarketResolution } from "./resolutions.ts";

const v2Condition = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
const v2Assets = [0n, 1n].map((index) =>
  BigInt(`${v2Condition}${index.toString(16).padStart(2, "0")}`).toString()
);
const v1Condition = `0x${"ab".repeat(32)}`;
const v1Item = {
  tokenId: "101",
  conditionId: v1Condition,
  marketSlug: "v1-market",
  protocolVersion: "v1",
  outcomeIndex: 0,
};

function makeClient(rows) {
  const calls = [];
  return {
    calls,
    client: {
      fetchResolutions: async (request) => {
        calls.push(request);
        return rows;
      },
    },
  };
}

function v2Item(outcomeIndex = 0) {
  return {
    tokenId: v2Assets[outcomeIndex],
    protocolVersion: "v2",
    conditionId: v2Condition,
    marketSlug: "v2-market",
    outcomeIndex,
  };
}

function gammaFetcher(payload) {
  const urls = [];
  return {
    urls,
    fetcher: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => payload };
    },
  };
}

test("V2 resolution waits for the SDK resolved status", async () => {
  const { client, calls } = makeClient([
    { conditionId: v2Condition, status: "proposed", payouts: ["1", "0"] },
  ]);
  assert.equal(await fetchMarketResolution(v2Item(), client), null);
  assert.deepEqual(calls, [{ conditionIds: [v2Condition] }]);
});

test("V2 accepts zero payout as a valid losing outcome", async () => {
  const { client } = makeClient([
    { conditionId: v2Condition, status: "resolved", payouts: ["0", "1"] },
  ]);
  const resolution = await fetchMarketResolution(v2Item(), client);
  assert.equal(resolution?.settlementPrice, "0");
  assert.equal(resolution?.outcomeYes, 0);
});

test("V2 accepts resolved fractional payouts", async () => {
  const { client } = makeClient([
    { conditionId: v2Condition, status: "resolved", payouts: ["0.5", "0.5"] },
  ]);
  assert.equal(
    (await fetchMarketResolution(v2Item(), client))?.settlementPrice,
    "0.5"
  );
});

test("V2 uses the stored outcome index and rejects an incongruent asset index", async () => {
  const { client } = makeClient([
    { conditionId: v2Condition, status: "resolved", payouts: ["0", "1"] },
  ]);
  assert.equal(
    (await fetchMarketResolution(v2Item(1), client))?.settlementPrice,
    "1"
  );
  assert.equal(
    await fetchMarketResolution({ ...v2Item(1), tokenId: v2Assets[0] }, client),
    null
  );
});

test("infers V2 protocol, condition, and outcome index for legacy manual rows", async () => {
  const { client } = makeClient([
    { conditionId: v2Condition, status: "resolved", payouts: ["0", "1"] },
  ]);
  const resolution = await fetchMarketResolution(
    {
      tokenId: v2Assets[1],
      protocolVersion: undefined,
      conditionId: undefined,
    },
    client
  );
  assert.equal(resolution?.protocolVersion, "v2");
  assert.equal(resolution?.conditionId, v2Condition);
  assert.equal(resolution?.settlementPrice, "1");
});

test("rejects persisted protocol metadata that conflicts with the asset ID", async () => {
  const { client, calls } = makeClient([
    { conditionId: v2Condition, status: "resolved", payouts: ["1", "0"] },
  ]);
  assert.equal(
    await fetchMarketResolution(
      {
        tokenId: v2Assets[0],
        protocolVersion: "v1",
        conditionId: v2Condition,
        outcomeIndex: 0,
      },
      client
    ),
    null
  );
  assert.equal(calls.length, 0);
});

test("V2 rejects condition mismatch and missing condition identity", async (t) => {
  for (const conditionId of [`0x01${"34".repeat(30)}`, undefined]) {
    await t.test(String(conditionId), async () => {
      const { client } = makeClient([
        { conditionId, status: "resolved", payouts: ["1", "0"] },
      ]);
      assert.equal(await fetchMarketResolution(v2Item(), client), null);
    });
  }
});

test("V2 rejects malformed payouts and derives a missing selected index", async () => {
  const { client } = makeClient([
    {
      conditionId: v2Condition,
      status: "resolved",
      payouts: ["0", "not-a-number"],
    },
  ]);
  assert.equal(await fetchMarketResolution(v2Item(), client), null);
  const goodClient = makeClient([
    { conditionId: v2Condition, status: "resolved", payouts: ["1", "0"] },
  ]).client;
  assert.equal(
    (
      await fetchMarketResolution(
        { ...v2Item(1), outcomeIndex: undefined },
        goodClient
      )
    )?.settlementPrice,
    "0"
  );
});

test("V1 closed Gamma prices do not settle before the SDK reports resolved", async () => {
  const { client } = makeClient([
    { conditionId: v1Condition, status: "proposed", payouts: ["1", "0"] },
  ]);
  const gamma = gammaFetcher([
    {
      conditionId: v1Condition,
      closed: true,
      clobTokenIds: ["101"],
      outcomePrices: ["1", "0"],
    },
  ]);
  assert.equal(
    await fetchMarketResolution(v1Item, client, gamma.fetcher),
    null
  );
  assert.equal(gamma.urls.length, 0);
});

test("V1 reads settled payouts from SDK and accepts losing and fractional payouts", async (t) => {
  for (const payout of ["0", "1", "0.5"]) {
    await t.test(payout, async () => {
      const { client } = makeClient([
        {
          conditionId: v1Condition,
          status: "resolved",
          payouts: [payout, "1"],
        },
      ]);
      const resolution = await fetchMarketResolution(v1Item, client);
      assert.equal(resolution?.settlementPrice, payout);
      assert.equal(resolution?.protocolVersion, "v1");
    });
  }
});

test("legacy V1 uses Gamma token ordering only to recover the outcome index", async () => {
  const { client } = makeClient([
    { conditionId: v1Condition, status: "resolved", payouts: ["1", "0"] },
  ]);
  const gamma = gammaFetcher([
    {
      conditionId: v1Condition,
      closed: false,
      clobTokenIds: ["other", "101"],
      outcomePrices: ["0", "1"],
    },
  ]);
  const resolution = await fetchMarketResolution(
    { ...v1Item, outcomeIndex: undefined },
    client,
    gamma.fetcher
  );
  assert.equal(resolution?.settlementPrice, "0");
  assert.equal(gamma.urls.length, 1);
});
