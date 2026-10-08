import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, erc1155Abi } from "viem";
import {
  CTF_COLLATERAL_ADAPTER_ADDRESS,
  POSITION_MANAGER_ADDRESS,
  ROUTER_ADDRESS,
} from "./contracts.ts";
import * as ctf from "./ctf.ts";

const condition = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
const owner = `0x${"11".repeat(20)}`;
const positions = [0, 1].map((index) =>
  BigInt(`${condition}0${index}`).toString()
);

for (const operation of [
  "splitPosition",
  "mergePositions",
  "redeemPositions",
]) {
  test(`V2 ${operation} encodes the Router ABI with exact base units`, () => {
    const plan = ctf.planCtfOperationTransaction({
      protocolVersion: "v2",
      operation,
      conditionId: `${condition}00`,
      amount: "1.000001",
      outcomeIndex: 1,
      negRisk: true,
    });
    assert.equal(plan.transaction.to, ROUTER_ADDRESS);
    const decoded = decodeFunctionData({
      abi: ctf.ROUTER_JSON_ABI,
      data: plan.transaction.data,
    });
    assert.equal(
      decoded.functionName,
      {
        splitPosition: "split",
        mergePositions: "merge",
        redeemPositions: "redeem",
      }[operation]
    );
    assert.deepEqual(
      decoded.args,
      operation === "redeemPositions"
        ? [condition, 1n, 1_000_001n]
        : [condition, 1_000_001n]
    );
    assert.equal(
      plan.collateralApproval?.spender ?? null,
      operation === "splitPosition" ? ROUTER_ADDRESS : null
    );
  });
}

test("V2 redemption requires an explicit quantity and binary outcome index", () => {
  const base = {
    protocolVersion: "v2",
    operation: "redeemPositions",
    conditionId: condition,
  };
  for (const input of [
    {},
    { amountRaw: 1n },
    { amountRaw: 1n, outcomeIndex: 2 },
    { amountRaw: 0n, outcomeIndex: 0 },
    { amountRaw: -1n, outcomeIndex: 0 },
  ]) {
    assert.throws(() => ctf.planCtfOperationTransaction({ ...base, ...input }));
  }
});

test("V2 condition normalization rejects nonzero padding and invalid byte widths", () => {
  for (const conditionId of [`${condition}01`, "0x1234", `${condition}0000`]) {
    assert.throws(() =>
      ctf.planCtfOperationTransaction({
        protocolVersion: "v2",
        operation: "splitPosition",
        conditionId,
        amountRaw: 1n,
      })
    );
  }
});

test("V2 merge approval uses PositionManager and precedes Router operation", async () => {
  const plan = await ctf.planCtfOperationTransactions({
    protocolVersion: "v2",
    operation: "mergePositions",
    conditionId: condition,
    amountRaw: 1_000_000n,
    collateralOwner: owner,
    client: {
      readContract: async (call) => {
        assert.equal(call.address, POSITION_MANAGER_ADDRESS);
        assert.equal(call.args[1], ROUTER_ADDRESS);
        return false;
      },
    },
  });
  assert.equal(plan.transactions.length, 2);
  assert.equal(plan.transactions[0].to, POSITION_MANAGER_ADDRESS);
  assert.equal(
    decodeFunctionData({
      abi: erc1155Abi,
      data: plan.transactions[0].data,
    }).args[0].toLowerCase(),
    ROUTER_ADDRESS.toLowerCase()
  );
});

test("V2 outcome balance reads preserve exact quantities on PositionManager", async () => {
  const balances = await ctf.readCtfOutcomeBalances(
    {
      readContract: async (call) => {
        assert.equal(call.address, POSITION_MANAGER_ADDRESS);
        assert.deepEqual(call.args[1], positions.map(BigInt));
        return [9_007_199_254_740_993n, 4n];
      },
    },
    owner,
    ...positions,
    "v2"
  );
  assert.equal(balances.yesBalance, 9_007_199_254_740_993n);
  assert.equal(balances.minBalance, 4n);
});

test("V1 split keeps its adapter and rejects negative raw quantities", () => {
  const base = {
    operation: "splitPosition",
    conditionId: `0x${"aa".repeat(32)}`,
  };
  assert.equal(
    ctf.planCtfOperationTransaction({ ...base, amountRaw: 1n }).transaction.to,
    CTF_COLLATERAL_ADAPTER_ADDRESS
  );
  assert.throws(() =>
    ctf.planCtfOperationTransaction({ ...base, amountRaw: -1n })
  );
});

test("position operations reject partial approval context and unsupported versions", async () => {
  const base = {
    protocolVersion: "v2",
    operation: "mergePositions",
    conditionId: condition,
    amountRaw: 1n,
  };
  await assert.rejects(
    ctf.planCtfOperationTransactions({ ...base, collateralOwner: owner })
  );
  await assert.rejects(
    ctf.planCtfOperationTransactions({ ...base, client: {} })
  );
  assert.throws(() =>
    ctf.buildCtfOperationTransaction({ ...base, protocolVersion: "v3" })
  );
});
