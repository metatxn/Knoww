import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, erc20Abi, erc1155Abi } from "viem";
import {
  buildClobOrderApprovalTransactions,
  buildCtfOperationApprovalTransactions,
  buildTradingApprovalTransactions,
  isClobOrderApproved,
  readClobOrderPusdAllowance,
  readTradingApprovalStatus,
} from "./approvals.ts";
import {
  EXCHANGE_V3_ADDRESS,
  POSITION_MANAGER_ADDRESS,
  PUSD_ADDRESS,
  ROUTER_ADDRESS,
} from "./contracts.ts";

test("CTF approval flags cannot authorize a V2 order", () => {
  const status = { pusdCtfExchange: true, ctfExchangeApproval: true };
  assert.equal(
    isClobOrderApproved(status, { side: "BUY", protocolVersion: "v2" }),
    false
  );
  assert.equal(
    isClobOrderApproved(status, { side: "SELL", protocolVersion: "v2" }),
    false
  );
  assert.equal(
    isClobOrderApproved(
      { pusdExchangeV3: true },
      { side: "BUY", protocolVersion: "v2", negRisk: true }
    ),
    true
  );
});

test("V2 order approvals authorize only the selected exchange and ledger", () => {
  const buy = buildClobOrderApprovalTransactions(
    {},
    { side: "BUY", protocolVersion: "v2", negRisk: true }
  );
  assert.equal(buy.length, 1);
  assert.equal(buy[0].to, PUSD_ADDRESS);
  assert.equal(
    decodeFunctionData({
      abi: erc20Abi,
      data: buy[0].data,
    }).args[0].toLowerCase(),
    EXCHANGE_V3_ADDRESS.toLowerCase()
  );
  const sell = buildClobOrderApprovalTransactions(
    {},
    { side: "SELL", protocolVersion: "v2" }
  );
  assert.equal(sell.length, 1);
  assert.equal(sell[0].to, POSITION_MANAGER_ADDRESS);
  assert.deepEqual(
    decodeFunctionData({ abi: erc1155Abi, data: sell[0].data }).args.map((v) =>
      typeof v === "string" ? v.toLowerCase() : v
    ),
    [EXCHANGE_V3_ADDRESS.toLowerCase(), true]
  );
  assert.deepEqual(
    buildClobOrderApprovalTransactions(
      { positionExchangeApproval: true },
      { side: "SELL", protocolVersion: "v2" }
    ),
    []
  );
});

test("V2 readiness uses V2 multicall results and fails closed for failed reads", async () => {
  const client = {
    multicall: async ({ contracts }) =>
      contracts.map((call) => ({
        status: "success",
        result: call.functionName === "allowance" ? 100n : true,
      })),
  };
  const status = await readTradingApprovalStatus(
    client,
    "0x1111111111111111111111111111111111111111",
    { protocolVersion: "v2", approvalAmountRaw: 101n }
  );
  assert.equal(status.pusdExchangeV3, false);
  assert.equal(status.positionExchangeApproval, true);
  assert.equal(status.allApproved, false);
  const failed = await readTradingApprovalStatus(
    {
      multicall: async ({ contracts }) =>
        contracts.map(() => ({ status: "failure" })),
    },
    "0x1111111111111111111111111111111111111111",
    { protocolVersion: "v2" }
  );
  assert.equal(failed.v2TradingApproved, false);
});

test("V2 neg-risk BUY reads ExchangeV3 allowance without requiring a CTF adapter", async () => {
  const calls = [];
  const result = await readClobOrderPusdAllowance(
    {
      readContract: async (call) => {
        calls.push(call);
        return 777n;
      },
    },
    "0x1111111111111111111111111111111111111111",
    true,
    { protocolVersion: "v2" }
  );
  assert.equal(result, 777n);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[1], EXCHANGE_V3_ADDRESS);
});

test("V2 setup and position-operation approval batches stay on their selected contracts", () => {
  for (const [build, operator] of [
    [buildTradingApprovalTransactions, EXCHANGE_V3_ADDRESS],
    [buildCtfOperationApprovalTransactions, ROUTER_ADDRESS],
  ]) {
    const transactions = build({}, 1n, "v2");
    assert.equal(transactions.length, 2);
    assert.equal(transactions[0].to, PUSD_ADDRESS);
    assert.equal(transactions[1].to, POSITION_MANAGER_ADDRESS);
    assert.equal(
      decodeFunctionData({
        abi: erc20Abi,
        data: transactions[0].data,
      }).args[0].toLowerCase(),
      operator.toLowerCase()
    );
    assert.equal(
      decodeFunctionData({
        abi: erc1155Abi,
        data: transactions[1].data,
      }).args[0].toLowerCase(),
      operator.toLowerCase()
    );
  }
});

test("approval reads keep V1 unchanged and isolate V2 from CTF RPC failures", async () => {
  for (const protocolVersion of [undefined, "v1", "v2"]) {
    const calls = [];
    const status = await readTradingApprovalStatus(
      {
        multicall: async ({ contracts }) => {
          calls.push(...contracts);
          return contracts.map((call) => ({
            status: "success",
            result: call.functionName === "allowance" ? 100n : true,
          }));
        },
      },
      "0x1111111111111111111111111111111111111111",
      { protocolVersion }
    );
    assert.equal(calls.length, protocolVersion === "v2" ? 4 : 10);
    assert.equal(status.allApproved, true);
    if (protocolVersion === "v2")
      assert(
        calls.every(
          (call) =>
            call.address === PUSD_ADDRESS ||
            call.address === POSITION_MANAGER_ADDRESS
        )
      );
    else
      assert(calls.every((call) => call.address !== POSITION_MANAGER_ADDRESS));
  }
});
