import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const candidateRoot = process.argv
  .find((arg) => arg.startsWith("--sdk-root="))
  ?.slice(11);
const strict = process.argv.includes("--require-v2");
const rows = [];
const gaps = [];
const evidence = {};

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) {
      const file = resolve(root, "apps/web/src", specifier.slice(2));
      for (const suffix of [".ts", "/index.ts"]) {
        if (existsSync(`${file}${suffix}`))
          return next(pathToFileURL(`${file}${suffix}`).href, context);
      }
    }
    try {
      return next(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".") || !context.parentURL) throw error;
      for (const suffix of [".ts", "/index.ts"]) {
        const url = new URL(`${specifier}${suffix}`, context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href, context);
      }
      throw error;
    }
  },
});

const moduleAt = (path) => import(pathToFileURL(resolve(root, path)).href);
const shared = await moduleAt("packages/shared-types/src/polymarket.ts");
const ctf = await moduleAt("packages/shared-types/src/ctf.ts");
const approvals = await moduleAt("packages/shared-types/src/approvals.ts");
const mapper = await moduleAt(
  "packages/knoww-services/src/platforms/polymarket/mappers.ts"
);
const detail = await moduleAt(
  "packages/knoww-services/src/platforms/polymarket/gamma-detail.ts"
);
const agentImport = await moduleAt("apps/agent/src/market-import.ts");
const resolutions = await moduleAt("apps/agent/src/resolutions.ts");
const feed = await moduleAt("apps/web/src/lib/gamma-keyset.ts");
const orderbooks = await moduleAt("apps/web/src/hooks/use-orderbook-store.ts");
const mcpReads = await moduleAt("apps/mcp/src/tools/public-read.ts");
const mcpGamma = await moduleAt("apps/mcp/src/tools/gamma.ts");
const requireShared = createRequire(
  resolve(root, "packages/shared-types/package.json")
);
const viem = await import(pathToFileURL(requireShared.resolve("viem")).href);

const v2Condition = `0x01${"11".repeat(17)}${"00".repeat(13)}`;
const v2Ids = [0, 1].map((outcome) =>
  BigInt(`${v2Condition}0${outcome}`).toString()
);
const legacyIds = [`0xff${"11".repeat(31)}`, `0xfe${"22".repeat(31)}`].map(
  (id) => BigInt(id).toString()
);
const owner = `0x${"11".repeat(20)}`;
const v1Market = {
  id: "review-fixture",
  conditionId: `0x${"aa".repeat(32)}`,
  version: "v1",
  slug: "review-fixture",
  outcomes: '["Yes","No"]',
  outcomePrices: '["0.5","0.5"]',
  clobTokenIds: JSON.stringify(legacyIds),
  active: true,
  closed: false,
  acceptingOrders: true,
};
const v2Market = {
  ...v1Market,
  conditionId: v2Condition,
  version: "v2",
  positionIds: v2Ids,
};
const onlyPositions = { ...v2Market, clobTokenIds: undefined };
const context = { fetchedAt: "2026-10-05T00:00:00.000Z", capabilities: {} };

function check(name, passed, observed) {
  const row = { name, satisfied: Boolean(passed), observed };
  rows.push(row);
  if (!passed) gaps.push(name);
}

assert.equal(shared.getGammaTokenIdForOutcome(v1Market, 0), legacyIds[0]);
check("CTF selector retains existing asset ID", true, legacyIds[0]);
check(
  "V2 selector prefers positionIds when both fields exist",
  shared.getGammaTokenIdForOutcome(v2Market, 0) === v2Ids[0],
  shared.getGammaTokenIdForOutcome(v2Market, 0)
);
check(
  "V2 selector supports positionIds without clobTokenIds",
  shared.getGammaTokenIdForOutcome(onlyPositions, 0) === v2Ids[0],
  shared.getGammaTokenIdForOutcome(onlyPositions, 0)
);

const parsed = detail.gammaMarketDetailSchema.parse(v2Market);
check(
  "Gamma detail parser retains protocol version and positionIds",
  parsed.version === "v2" && parsed.positionIds?.[0] === v2Ids[0],
  { version: parsed.version ?? null, positionIds: parsed.positionIds ?? null }
);
const mapped = mapper.mapGammaMarket(onlyPositions, context);
check(
  "Canonical mapper retains V2 outcomes",
  mapped?.outcomes?.[0]?.sourceOutcomeId === v2Ids[0],
  mapped?.outcomes
);
const slimMarket = feed.toSlimGammaEvent(
  { id: "review-event", markets: [v2Market] },
  true
).markets[0];
check(
  "Slim web feed retains V2 identity",
  slimMarket.version === "v2" && slimMarket.positionIds?.[0] === v2Ids[0],
  {
    version: slimMarket.version ?? null,
    positionIds: slimMarket.positionIds ?? null,
    clobTokenIds: slimMarket.clobTokenIds,
  }
);
check(
  "MCP condition validator accepts native V2 bytes31 condition",
  mcpReads.CONDITION_ID_PATTERN.test(v2Condition),
  {
    nativeAccepted: mcpReads.CONDITION_ID_PATTERN.test(v2Condition),
    paddedAccepted: mcpReads.CONDITION_ID_PATTERN.test(`${v2Condition}00`),
  }
);
orderbooks.useOrderBookStore.getState().handleBookEvent({
  event_type: "book",
  asset_id: v2Ids[0],
  market: v2Condition,
  bids: [{ price: "0.4", size: "10" }],
  asks: [{ price: "0.6", size: "10" }],
  timestamp: "1791158400000",
  hash: "review-fixture",
});
assert.equal(
  orderbooks.useOrderBookStore.getState().orderBooks.get(v2Ids[0]).assetId,
  v2Ids[0]
);
check("Web orderbook store preserves V2 decimal ID", true, {
  assetId: v2Ids[0],
});

const eventFor = (market) => ({
  slug: "review-fixture",
  title: "Review fixture",
  markets: [market],
});
assert.equal(
  agentImport.normalizeGammaEventToWatchlistItem(eventFor(v1Market)).tokenId,
  legacyIds[0]
);
let imported;
try {
  imported = agentImport.normalizeGammaEventToWatchlistItem(
    eventFor(onlyPositions)
  );
} catch (error) {
  imported = { error: error.message };
}
check(
  "Agent imports V2 market without legacy token IDs",
  imported.tokenId === v2Ids[0],
  imported
);

const calls = [];
await shared.syncClobBalanceAllowance(
  { updateBalanceAllowance: async (request) => calls.push(request) },
  { tokenId: v2Ids[0], includeCollateral: false }
);
check(
  "CLOB cache refresh selects CONDITIONAL-V2",
  calls[0]?.assetType === "CONDITIONAL-V2",
  calls
);

let balanceTarget;
await ctf.readCtfOutcomeBalances(
  {
    readContract: async (request) => {
      balanceTarget = request.address;
      return [1_000_000n, 1_000_000n];
    },
  },
  owner,
  ...v2Ids
);
const positionManager = "0x006F54F7f9A22e0000CC2AB60031000000ae9fEF";
const exchangeV3 = "0xe3333700cA9d93003F00f0F71f8515005F6c00Aa";
const router = "0x12121212006e4CD160D18e3f00711DA5c3372600";
check(
  "Shared balance reader supports PositionManager",
  balanceTarget.toLowerCase() === positionManager.toLowerCase(),
  balanceTarget
);

const missingStatus = Object.fromEntries(
  [
    "pusdCtf",
    "pusdCtfExchange",
    "pusdNegRiskExchange",
    "pusdCtfCollateralAdapter",
    "pusdNegRiskCtfCollateralAdapter",
    "usdcOnramp",
    "ctfExchangeApproval",
    "ctfNegRiskExchangeApproval",
    "ctfCollateralAdapterApproval",
    "ctfNegRiskCollateralAdapterApproval",
  ].map((key) => [key, false])
);
const buyTransactions = approvals.buildClobOrderApprovalTransactions(
  missingStatus,
  { side: "BUY", protocolVersion: "v2" }
);
const sellTransactions = approvals.buildClobOrderApprovalTransactions(
  missingStatus,
  { side: "SELL", protocolVersion: "v2" }
);
const buySpenders = buyTransactions.map(
  (tx) => viem.decodeFunctionData({ abi: viem.erc20Abi, data: tx.data }).args[0]
);
check(
  "Order approvals support V2 exchange and ledger",
  buySpenders.some(
    (spender) => spender.toLowerCase() === exchangeV3.toLowerCase()
  ) &&
    sellTransactions.some(
      (tx) => tx.to.toLowerCase() === positionManager.toLowerCase()
    ),
  { buySpenders, sellTokenContracts: sellTransactions.map((tx) => tx.to) }
);

const transactionPlans = [
  "splitPosition",
  "mergePositions",
  "redeemPositions",
].map((operation) => {
  let direct;
  try {
    const plan = ctf.planCtfOperationTransaction({
      operation,
      conditionId: v2Condition,
      amountRaw: 1_000_000n,
      outcomeIndex: 0,
      protocolVersion: "v2",
    });
    direct = {
      to: plan.transaction.to,
      selector: plan.transaction.data.slice(0, 10),
    };
  } catch (error) {
    direct = { error: error.shortMessage ?? error.message };
  }
  const padded = ctf.planCtfOperationTransaction({
    operation,
    conditionId: `${v2Condition}00`,
    amountRaw: 1_000_000n,
    outcomeIndex: 0,
    protocolVersion: "v2",
  });
  return {
    operation,
    ...direct,
    paddedCondition: {
      to: padded.transaction.to,
      selector: padded.transaction.data.slice(0, 10),
    },
  };
});
check(
  "Position operations dispatch V2 to Router",
  transactionPlans.every(
    (plan) => plan.to?.toLowerCase() === router.toLowerCase()
  ),
  transactionPlans
);

const clientForResolution = (conditionId, status, payouts) => ({
  fetchResolutions: async () => [{ conditionId, status, payouts }],
});
const mcpClosed = {
  ...v2Market,
  closed: true,
  umaResolutionStatus: "resolved",
  outcomePrices: '["1","0"]',
};
check(
  "MCP V2 resolution ignores Gamma-only settlement claims",
  mcpGamma.projectMarketResolution(mcpClosed).status === "closed",
  mcpGamma.projectMarketResolution(mcpClosed)
);
const mcpConfirmed = mcpGamma.projectMarketResolution(mcpClosed, [
  { conditionId: `${v2Condition}00`, status: "resolved", payouts: ["0", "1"] },
]);
check(
  "MCP V2 resolution publishes confirmed SDK payouts including zero",
  mcpConfirmed.status === "resolved" && mcpConfirmed.payouts?.[0] === "0",
  mcpConfirmed
);
const v2Resolution = await resolutions.fetchMarketResolution(
  {
    tokenId: v2Ids[0],
    conditionId: v2Condition,
    protocolVersion: "v2",
    outcomeIndex: 0,
  },
  clientForResolution(`${v2Condition}00`, "resolved", ["1", "0"])
);
check(
  "Agent resolution finds V2 position ID",
  v2Resolution?.settlementPrice === "1",
  v2Resolution
);
const v1Resolution = await resolutions.fetchMarketResolution(
  {
    tokenId: legacyIds[0],
    conditionId: v1Market.conditionId,
    protocolVersion: "v1",
    outcomeIndex: 0,
  },
  clientForResolution(v1Market.conditionId, "resolved", ["1", "0"])
);
check(
  "Existing CTF resolution remains supported",
  v1Resolution?.settlementPrice === "1",
  v1Resolution
);
const unresolved = await resolutions.fetchMarketResolution(
  {
    tokenId: v2Ids[0],
    conditionId: v2Condition,
    protocolVersion: "v2",
    outcomeIndex: 0,
  },
  clientForResolution(v2Condition, "proposed", ["1", "0"])
);
check(
  "Unresolved V2 payout cannot settle a position",
  unresolved === null,
  unresolved
);
const fractional = await resolutions.fetchMarketResolution(
  {
    tokenId: v2Ids[1],
    conditionId: v2Condition,
    protocolVersion: "v2",
    outcomeIndex: 1,
  },
  clientForResolution(v2Condition, "resolved", ["0.5", "0.5"])
);
check(
  "Fractional resolved V2 payouts remain exact",
  fractional?.settlementPrice === "0.5",
  fractional
);

{
  const sdkEntry = candidateRoot
    ? resolve(candidateRoot, "node_modules/@polymarket/client/dist/index.js")
    : requireShared.resolve("@polymarket/client");
  const base = resolve(dirname(sdkEntry), "../..");
  const sdk = await import(
    pathToFileURL(resolve(base, "client/dist/index.js")).href
  );
  const sdkActions = await import(
    pathToFileURL(resolve(base, "client/dist/actions/index.js")).href
  );
  const sdkRequire = createRequire(sdkEntry);
  const { ResultAsync } = await import(
    pathToFileURL(sdkRequire.resolve("@polymarket/types")).href
  );
  const environment = sdk.createPublicClient({}).environment;
  const sdkVersion = JSON.parse(
    readFileSync(resolve(base, "client/package.json"), "utf8")
  ).version;
  assert.equal(sdkVersion, "0.12.0");
  const account = { wallet: owner, signer: owner, walletType: "EOA" };

  async function prepare(asset, field, negRisk = false) {
    const condition = asset === v2Ids[0] ? v2Condition : v1Market.conditionId;
    const client = {
      environment,
      account,
      clob: {
        get(path) {
          const body = path.startsWith("/markets-by-token/")
            ? { condition_id: condition }
            : {
                mts: 0.01,
                nr: negRisk,
                t: [{ t: asset, o: "Yes" }],
                fd: { r: 0, e: 1 },
              };
          return ResultAsync.fromSafePromise(
            Promise.resolve(Response.json(body))
          );
        },
      },
    };
    const workflow = await sdkActions.prepareLimitOrder(client, {
      [field]: asset,
      side: "BUY",
      price: "0.50",
      size: "10",
    });
    const result = await workflow.next();
    assert.equal(result.value.kind, "signOrder");
    await workflow.return();
    return {
      domain: result.value.payload.domain,
      wireAsset: String(result.value.payload.message.tokenId),
      hasWireAssetId: Object.hasOwn(result.value.payload.message, "assetId"),
    };
  }
  const ctfSigning = await prepare(legacyIds[0], "tokenId");
  const negRiskSigning = await prepare(legacyIds[0], "tokenId", true);
  const v2AliasSigning = await prepare(v2Ids[0], "tokenId");
  const v2Signing = await prepare(v2Ids[0], "assetId");
  assert.equal(ctfSigning.domain.version, "2");
  assert.equal(
    ctfSigning.domain.verifyingContract,
    environment.contracts.standardExchange
  );
  assert.equal(
    negRiskSigning.domain.verifyingContract,
    environment.contracts.negRiskExchange
  );
  assert.equal(v2Signing.domain.version, "3");
  assert.equal(
    v2Signing.domain.verifyingContract,
    environment.contracts.exchangeV3
  );
  assert.equal(v2Signing.wireAsset, v2Ids[0]);
  assert.equal(v2Signing.hasWireAssetId, false);
  assert.deepEqual(v2AliasSigning, v2Signing);
  evidence.sdkSigning = {
    version: sdkVersion,
    ctfSigning,
    negRiskSigning,
    v2Signing,
    tokenIdAliasEquivalent: true,
  };
  check(
    "SDK 0.12 preserves CTF signing and routes V2 with either request alias",
    true,
    evidence.sdkSigning
  );

  async function transportRequest(action, request) {
    const marker = new Error("Intercepted before network");
    let captured;
    const transport = {
      get(path, options) {
        captured = { path, params: Object.fromEntries(options.params) };
        throw marker;
      },
    };
    await assert.rejects(
      action(
        { environment, account, clob: transport, secureClob: transport },
        request
      ),
      (error) => error === marker
    );
    return captured;
  }
  const oldBook = await transportRequest(sdkActions.fetchOrderBook, {
    tokenId: v2Ids[0],
  });
  const newBook = await transportRequest(sdkActions.fetchOrderBook, {
    assetId: v2Ids[0],
  });
  const oldBalance = await transportRequest(sdkActions.fetchBalanceAllowance, {
    tokenId: v2Ids[0],
    assetType: "CONDITIONAL-V2",
  });
  const newBalance = await transportRequest(sdkActions.fetchBalanceAllowance, {
    assetId: v2Ids[0],
    assetType: "CONDITIONAL-V2",
  });
  assert.deepEqual(oldBook, newBook);
  assert.deepEqual(oldBalance, newBalance);
  evidence.sdkWireAliases = { orderbook: oldBook, balance: oldBalance };
  check(
    "SDK aliases preserve orderbook and balance HTTP query parameters",
    true,
    evidence.sdkWireAliases
  );

  const state = await sdkActions.fetchTradingApprovalsState(
    {
      environment,
      rpc: {
        ethCallBatch: async (requests) =>
          requests.map(() => `0x${"00".repeat(32)}`),
      },
    },
    { user: owner }
  );
  const sdkApprovals = {
    erc20: state.missing.erc20.map(({ tokenAddress, spenderAddress }) => ({
      tokenAddress,
      spenderAddress,
    })),
    erc1155: state.missing.erc1155,
  };
  assert(
    sdkApprovals.erc20.some(
      ({ spenderAddress }) =>
        spenderAddress === environment.contracts.exchangeV3
    )
  );
  assert(
    sdkApprovals.erc20.some(
      ({ spenderAddress }) =>
        spenderAddress === environment.contracts.perpsDepositContract
    )
  );
  assert(
    sdkApprovals.erc1155.some(
      ({ operatorAddress, tokenAddress }) =>
        operatorAddress === environment.contracts.exchangeV3 &&
        tokenAddress === environment.contracts.positionManager
    )
  );
  evidence.sdkSetup = sdkApprovals;
  check(
    "SDK setup includes V2 approvals and additional product permissions",
    true,
    {
      erc20Count: sdkApprovals.erc20.length,
      erc1155Count: sdkApprovals.erc1155.length,
      includesPerpsAllowance: true,
    }
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      fixture: { v2Condition, v2Ids, legacyIds },
      rows,
      evidence,
      summary: {
        checks: rows.length,
        satisfied: rows.length - gaps.length,
        migrationGaps: gaps.length,
        strict,
      },
    },
    null,
    2
  )}\n`
);
if (strict && gaps.length) {
  process.stderr.write(
    `Migration gate failed: ${gaps.length} V2 checks are unsatisfied.\n`
  );
  process.exitCode = 1;
}
