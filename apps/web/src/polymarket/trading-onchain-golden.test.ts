/**
 * M3 golden harness, library level: on-chain calldata and relayer payloads.
 *
 * Pins the transactions the app builds for trading approvals, CTF
 * operations and pUSD wrapping, and the exact relayer submit bodies (with
 * their signatures) for the Safe and deposit-wallet paths. The fixtures
 * under apps/web/golden/trading/ were recorded on the pre-migration code
 * and must stay byte-identical once trading sits behind the aggregator.
 *
 * Nothing here reaches the network or a chain. The key is Hardhat's public
 * account #1 and the relayer transport is an in-memory recorder.
 */
import {
  buildAllApprovalTransactions,
  buildClobOrderApprovalTransactions,
  buildCtfOperationApprovalTransactions,
  buildFullTradingApprovalTransactions,
  buildNegRiskConversionApprovalTransactions,
  buildTradingApprovalTransactions,
  type TradingApprovalStatus,
} from "@knoww/shared-types/approvals";
import { planCtfOperationTransaction } from "@knoww/shared-types/ctf";
import {
  deployDepositWalletRelayerWallet,
  deploySafeRelayerWallet,
  executeDepositWalletRelayerTransaction,
  executeSafeRelayerTransaction,
  type RelayerExecutionTransport,
  type RelayerSigner,
  type RelayerTransaction,
} from "@knoww/shared-types/relayer";
import {
  buildPusdAutoWrapTransactions,
  planPusdAutoWrap,
} from "@knoww/shared-types/trading";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  goldenJson,
  goldenPath,
  loadRecordedMarkets,
  pinEntropy,
  THROWAWAY_EOA,
  THROWAWAY_PRIVATE_KEY,
} from "./trading-golden.support";

const account = privateKeyToAccount(THROWAWAY_PRIVATE_KEY);
const markets = loadRecordedMarkets();

/** 1,000,000 pUSD in raw units: a round number that is not the app's default. */
const APPROVAL_AMOUNT_RAW = BigInt(1_000_000_000_000);
/** 2.5 shares in raw units for merge and split. */
const CTF_AMOUNT_RAW = BigInt(2_500_000);

const UNAPPROVED: TradingApprovalStatus = {
  pusdCtf: false,
  pusdCtfExchange: false,
  pusdNegRiskExchange: false,
  pusdCtfCollateralAdapter: false,
  pusdNegRiskCtfCollateralAdapter: false,
  usdcOnramp: false,
  ctfExchangeApproval: false,
  ctfNegRiskExchangeApproval: false,
  ctfCollateralAdapterApproval: false,
  ctfNegRiskCollateralAdapterApproval: false,
  allApproved: false,
  clobTradingApproved: false,
  autoWrapApproved: false,
  ctfOperationsApproved: false,
  negRiskConversionApproved: false,
};

describe("M3 golden: approval calldata", () => {
  it("pins every approval transaction set the app can build", async () => {
    const clobOrder: Record<string, unknown> = {};
    for (const side of ["BUY", "SELL"] as const) {
      for (const negRisk of [false, true]) {
        clobOrder[`${side.toLowerCase()}-${negRisk ? "negrisk" : "plain"}`] =
          buildClobOrderApprovalTransactions(UNAPPROVED, { side, negRisk });
      }
    }

    await expect(
      goldenJson({
        approvalAmountRaw: APPROVAL_AMOUNT_RAW,
        full: buildFullTradingApprovalTransactions(APPROVAL_AMOUNT_RAW),
        trading: buildTradingApprovalTransactions(
          UNAPPROVED,
          APPROVAL_AMOUNT_RAW
        ),
        ctfOperations: buildCtfOperationApprovalTransactions(
          UNAPPROVED,
          APPROVAL_AMOUNT_RAW
        ),
        negRiskConversion: buildNegRiskConversionApprovalTransactions(
          UNAPPROVED,
          APPROVAL_AMOUNT_RAW
        ),
        all: buildAllApprovalTransactions(UNAPPROVED, APPROVAL_AMOUNT_RAW),
        clobOrder,
      })
    ).toMatchFileSnapshot(goldenPath("onchain", "approvals.json"));
  });
});

describe("M3 golden: CTF calldata", () => {
  it("pins redeem, merge and split for both exchange flavours", async () => {
    const plans: Record<string, unknown> = {};
    for (const market of Object.values(markets)) {
      const negRisk = market.kind === "negrisk";
      plans[`redeem-${market.kind}`] = planCtfOperationTransaction({
        operation: "redeemPositions",
        conditionId: market.conditionId,
        negRisk,
      });
      plans[`merge-${market.kind}`] = planCtfOperationTransaction({
        operation: "mergePositions",
        conditionId: market.conditionId,
        amountRaw: CTF_AMOUNT_RAW,
        negRisk,
      });
      plans[`split-${market.kind}`] = planCtfOperationTransaction({
        operation: "splitPosition",
        conditionId: market.conditionId,
        amountRaw: CTF_AMOUNT_RAW,
        negRisk,
      });
    }

    await expect(goldenJson(plans)).toMatchFileSnapshot(
      goldenPath("onchain", "ctf.json")
    );
  });
});

describe("M3 golden: pUSD auto-wrap", () => {
  it("pins the wrap transactions and the plan for each balance shape", async () => {
    const plans = {
      // Enough pUSD on hand: nothing to wrap.
      covered: planPusdAutoWrap({
        pusdBalanceRaw: BigInt(50_000_000),
        usdcEBalanceRaw: BigInt(0),
        requiredPusdRaw: BigInt(20_000_000),
      }),
      // Short on pUSD, USDC.e covers the gap.
      wrapFromUsdc: planPusdAutoWrap({
        pusdBalanceRaw: BigInt(5_000_000),
        usdcEBalanceRaw: BigInt(100_000_000),
        requiredPusdRaw: BigInt(20_000_000),
      }),
      // Open BUY orders reserve pUSD and the taker fee counts too.
      reservedAndFee: planPusdAutoWrap({
        pusdBalanceRaw: BigInt(30_000_000),
        usdcEBalanceRaw: BigInt(100_000_000),
        requiredPusdRaw: BigInt(20_000_000),
        reservedPusdRaw: BigInt(15_000_000),
        estimatedFeeRaw: BigInt(250_000),
      }),
      // Neither balance covers it.
      insufficient: planPusdAutoWrap({
        pusdBalanceRaw: BigInt(1_000_000),
        usdcEBalanceRaw: BigInt(2_000_000),
        requiredPusdRaw: BigInt(20_000_000),
      }),
    };

    await expect(
      goldenJson({
        transactions: buildPusdAutoWrapTransactions(
          THROWAWAY_EOA,
          BigInt(12_345_678)
        ),
        noop: buildPusdAutoWrapTransactions(THROWAWAY_EOA, BigInt(0)),
        plans,
      })
    ).toMatchFileSnapshot(goldenPath("onchain", "pusd-wrap.json"));
  });
});

/** Records every submit body instead of reaching the relayer. */
function recordingTransport() {
  const submitted: unknown[] = [];
  const transport: RelayerExecutionTransport = {
    getNonce: async () => "0",
    getDeployed: async () => false,
    submit: async (request) => {
      submitted.push(request);
      return { transactionID: "golden-tx-1", state: "STATE_NEW" };
    },
    getTransaction: async (transactionID) => [
      {
        transactionID,
        transactionHash: `0x${"cd".repeat(32)}`,
        state: "STATE_CONFIRMED",
      },
    ],
  };
  return { transport, submitted };
}

const signer: RelayerSigner = {
  signMessage: ({ message }) => account.signMessage({ message }),
  signTypedData: ({ account: _account, ...typedData }) =>
    account.signTypedData(
      typedData as Parameters<typeof account.signTypedData>[0]
    ),
};

const NO_WAITING = { pollIntervalMs: 0, retryDelayMs: 0 } as const;

describe("M3 golden: relayer payloads", () => {
  beforeEach(() => {
    pinEntropy();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const transactions: RelayerTransaction[] =
    buildFullTradingApprovalTransactions(APPROVAL_AMOUNT_RAW).slice(0, 2);

  it("pins the Safe execute and create bodies", async () => {
    const execute = recordingTransport();
    const executed = await executeSafeRelayerTransaction({
      signer,
      transport: execute.transport,
      eoaAddress: THROWAWAY_EOA,
      transactions,
      options: NO_WAITING,
    });

    const deploy = recordingTransport();
    const deployed = await deploySafeRelayerWallet({
      signer,
      transport: deploy.transport,
      eoaAddress: THROWAWAY_EOA,
      options: NO_WAITING,
    });

    await expect(
      goldenJson({
        execute: { submitted: execute.submitted, result: executed },
        deploy: { submitted: deploy.submitted, result: deployed },
      })
    ).toMatchFileSnapshot(goldenPath("relayer", "safe.json"));
  });

  it("pins the deposit wallet batch and create bodies", async () => {
    const execute = recordingTransport();
    const executed = await executeDepositWalletRelayerTransaction({
      signer,
      transport: execute.transport,
      ownerAddress: THROWAWAY_EOA,
      transactions,
      options: NO_WAITING,
    });

    const deploy = recordingTransport();
    const deployed = await deployDepositWalletRelayerWallet({
      transport: deploy.transport,
      ownerAddress: THROWAWAY_EOA,
      options: NO_WAITING,
    });

    await expect(
      goldenJson({
        execute: { submitted: execute.submitted, result: executed },
        deploy: { submitted: deploy.submitted, result: deployed },
      })
    ).toMatchFileSnapshot(goldenPath("relayer", "deposit-wallet.json"));
  });
});
