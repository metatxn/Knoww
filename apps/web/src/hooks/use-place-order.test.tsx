import type { CanonicalOrderIntent } from "@knoww/services/core";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const credentials = {
  apiKey: "api-key",
  apiSecret: "api-secret",
  apiPassphrase: "api-passphrase",
};

const fullyApprovedStatus = () => ({
  pusdCtf: true,
  pusdCtfExchange: true,
  pusdNegRiskExchange: true,
  pusdCtfCollateralAdapter: true,
  pusdNegRiskCtfCollateralAdapter: true,
  usdcOnramp: true,
  ctfExchangeApproval: true,
  ctfNegRiskExchangeApproval: true,
  ctfCollateralAdapterApproval: true,
  ctfNegRiskCollateralAdapterApproval: true,
  allApproved: true,
  clobTradingApproved: true,
  autoWrapApproved: true,
  ctfOperationsApproved: true,
  negRiskConversionApproved: true,
});

const wagmiState = vi.hoisted(() => ({
  address: "0x0000000000000000000000000000000000000001",
  isConnected: true,
  walletClient: { request: vi.fn() },
}));

const proxyWalletState = vi.hoisted(() => ({
  proxyAddress: "0x0000000000000000000000000000000000000002",
  isDeployed: true,
  isEoaMode: false,
  walletMode: "safe",
}));

const relayerClientState = vi.hoisted(() => ({
  approveUsdcForTrading: vi.fn(),
}));

const clobCredentialsState = vi.hoisted(() => ({
  credentials: {
    apiKey: "api-key",
    apiSecret: "api-secret",
    apiPassphrase: "api-passphrase",
  },
  hasCredentials: true,
  deriveCredentials: vi.fn(),
  clearCredentials: vi.fn(),
}));

// Stands in for the Polymarket trading adapter. `previewOrder` sizes a draft
// from the intent; `placeOrder` is the seam the placement tests assert on.
const tradingAdapterState = vi.hoisted(() => ({
  previewOrder: vi.fn(),
  placeOrder: vi.fn(),
}));

const placedOrder = {
  platform: "polymarket",
  status: "open",
  orderId: "order-1",
  idempotencyKey: "key-1",
};

const viemWalletClientMock = vi.hoisted(() => ({
  getViemWalletClient: vi.fn(),
  hasViemWalletProvider: vi.fn(),
}));

const approvalsMock = vi.hoisted(() => {
  const readErc20Allowance = vi.fn();
  const readPusdExchangeAllowance = vi.fn();
  return {
    readErc20Allowance,
    readPusdExchangeAllowance,
    readErc1155Approval: vi.fn(),
    readTradingApprovalStatus: vi.fn(),
    // Mirrors the real min(exchange, adapter-if-negrisk) rule on top of the
    // two mock levers above, so tests keep configuring those directly.
    readClobOrderPusdAllowance: vi.fn(
      async (
        client: unknown,
        owner: unknown,
        negRisk?: boolean,
        options?: unknown
      ) => {
        const exchange = await readPusdExchangeAllowance(
          client,
          owner,
          negRisk,
          options
        );
        if (!negRisk) return exchange;
        const adapter = await readErc20Allowance(
          client,
          owner,
          undefined,
          options
        );
        return exchange < adapter ? exchange : adapter;
      }
    ),
  };
});

const appApprovalsMock = vi.hoisted(() => ({
  checkAllApprovals: vi.fn(),
}));

const viemMock = vi.hoisted(() => ({
  createPublicClient: vi.fn(),
  http: vi.fn(() => ({ transport: true })),
  readContract: vi.fn(),
}));

vi.mock("@knoww/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: viemMock.createPublicClient,
    http: viemMock.http,
  };
});

vi.mock("wagmi", () => ({
  useConnection: () => ({
    address: wagmiState.address,
    isConnected: wagmiState.isConnected,
  }),
  useWalletClient: () => ({
    data: wagmiState.walletClient,
  }),
}));

vi.mock("@knoww/shared-types/approvals", async () => {
  const actual = await vi.importActual<
    typeof import("@knoww/shared-types/approvals")
  >("@knoww/shared-types/approvals");
  return {
    ...actual,
    readErc20Allowance: approvalsMock.readErc20Allowance,
    readPusdExchangeAllowance: approvalsMock.readPusdExchangeAllowance,
    readErc1155Approval: approvalsMock.readErc1155Approval,
    readTradingApprovalStatus: approvalsMock.readTradingApprovalStatus,
    readClobOrderPusdAllowance: approvalsMock.readClobOrderPusdAllowance,
  };
});

vi.mock("@/lib/approvals", () => appApprovalsMock);

vi.mock("./use-clob-credentials", () => ({
  useClobCredentials: () => clobCredentialsState,
}));

vi.mock("./use-proxy-wallet", () => ({
  useProxyWallet: () => proxyWalletState,
}));

vi.mock("./use-relayer-client", () => ({
  useRelayerClient: () => relayerClientState,
}));

vi.mock("./use-trading-adapter", () => ({
  useTradingAdapter: () => ({
    identity: {
      kind: "wallet",
      platform: "polymarket",
      address: wagmiState.address,
      accountType: "safe",
      tradingAddress: proxyWalletState.proxyAddress,
    },
    isReady: true,
    getAdapter: async () => tradingAdapterState,
  }),
}));

vi.mock("@/lib/viem-wallet-client", () => viemWalletClientMock);

import { usePolymarketOrderPreflight } from "@/polymarket/order-preflight";
import { usePlaceOrder } from "./use-place-order";

// What the adapter's preview would carry for these intents: six-decimal raw
// units, nothing reserved by open orders, no fee metadata on the market.
function draftFor(intent: CanonicalOrderIntent) {
  const shares =
    intent.quantity.kind === "shares" ? Number(intent.quantity.value) : 0;
  const notionalRaw = String(
    Math.round(Number(intent.price ?? 0) * shares * 1_000_000)
  );
  const platformDetails =
    intent.side === "buy"
      ? {
          platform: "polymarket",
          negRisk: false,
          requiredNotionalRaw: notionalRaw,
          estimatedFeeRaw: null,
          reservedCollateralRaw: "0",
          requiredCollateralRaw: notionalRaw,
        }
      : {
          platform: "polymarket",
          negRisk: false,
          requiredConditionalRaw: String(shares * 1_000_000),
        };
  return {
    schemaVersion: "1",
    draftId: "draft-1",
    platform: "polymarket",
    intent,
    platformDetails,
  };
}

function resetTradingState() {
  vi.clearAllMocks();
  wagmiState.address = "0x0000000000000000000000000000000000000001";
  wagmiState.isConnected = true;
  wagmiState.walletClient = { request: vi.fn() };
  proxyWalletState.proxyAddress = "0x0000000000000000000000000000000000000002";
  proxyWalletState.isDeployed = true;
  proxyWalletState.isEoaMode = false;
  proxyWalletState.walletMode = "safe";
  clobCredentialsState.credentials = credentials;
  clobCredentialsState.hasCredentials = true;
  clobCredentialsState.clearCredentials.mockReset();
  relayerClientState.approveUsdcForTrading.mockResolvedValue({
    success: true,
    transactionHash: "0xapproval",
  });

  viemWalletClientMock.hasViemWalletProvider.mockReturnValue(true);
  viemWalletClientMock.getViemWalletClient.mockResolvedValue({
    requestAddresses: vi.fn().mockResolvedValue([]),
  });
  tradingAdapterState.previewOrder.mockImplementation(
    async (intent: CanonicalOrderIntent) => draftFor(intent)
  );
  tradingAdapterState.placeOrder.mockResolvedValue(placedOrder);
  appApprovalsMock.checkAllApprovals.mockResolvedValue(fullyApprovedStatus());
  approvalsMock.readPusdExchangeAllowance.mockResolvedValue(BigInt(2_000_000));
  approvalsMock.readErc20Allowance.mockResolvedValue(BigInt(2_000_000));
  approvalsMock.readErc1155Approval.mockResolvedValue(true);
  approvalsMock.readTradingApprovalStatus.mockResolvedValue({});
  viemMock.readContract.mockReset();
  viemMock.createPublicClient.mockReturnValue({
    readContract: viemMock.readContract,
  });
}

describe("usePolymarketOrderPreflight", () => {
  beforeEach(resetTradingState);

  it("passes scoped approval requests through to the relayer client", async () => {
    const approvalScope = {
      side: "BUY" as const,
      negRisk: true,
    };
    const { result } = renderHook(() => usePolymarketOrderPreflight());

    let response: unknown;
    await act(async () => {
      response = await result.current.updateAllowance("4", approvalScope);
    });

    expect(relayerClientState.approveUsdcForTrading).toHaveBeenCalledWith("4", {
      approvalScope,
    });
    expect(response).toEqual({
      success: true,
      hashes: ["0xapproval"],
      message:
        "Approved app trading pUSD, USDC.e Onramp, and outcome-token operators",
    });
  });
});

describe("usePlaceOrder", () => {
  beforeEach(resetTradingState);

  it("throws a clear insufficient-collateral error before placing when no USDC.e can cover a BUY shortfall", async () => {
    viemMock.readContract
      .mockResolvedValueOnce(BigInt(0)) // pUSD balance
      .mockResolvedValueOnce(BigInt(0)); // USDC.e balance
    const { result } = renderHook(() => usePlaceOrder());

    await expect(
      act(async () => {
        await result.current.createOrder({
          tokenId: "token-1",
          conditionId: "condition-1",
          price: 0.5,
          size: 2,
          side: "BUY",
          orderType: "GTC",
        });
      })
    ).rejects.toThrow(/Insufficient collateral/);

    expect(tradingAdapterState.placeOrder).not.toHaveBeenCalled();
  });

  it("tops up a finite neg-risk adapter allowance below the buy notional", async () => {
    approvalsMock.readPusdExchangeAllowance.mockResolvedValue(
      BigInt(2_000_000)
    );
    approvalsMock.readErc20Allowance.mockResolvedValue(BigInt(500_000));
    viemMock.readContract
      .mockResolvedValueOnce(BigInt(2_000_000)) // pUSD balance
      .mockResolvedValueOnce(BigInt(0)); // USDC.e balance
    const { result } = renderHook(() => usePlaceOrder());

    await act(async () => {
      await result.current.createOrder({
        tokenId: "token-1",
        conditionId: "condition-1",
        price: 0.5,
        size: 2,
        side: "BUY",
        orderType: "GTC",
        negRisk: true,
      });
    });

    expect(relayerClientState.approveUsdcForTrading).toHaveBeenCalledWith(
      "100"
    );
    expect(tradingAdapterState.placeOrder).toHaveBeenCalledWith({
      draftId: "draft-1",
      idempotencyKey: expect.any(String),
    });
  });

  it("repairs a missing neg-risk adapter operator approval before placing a neg-risk SELL", async () => {
    // Exchange operator approved, adapter operator missing: the state the
    // old single-operator read waved through, leaving the CLOB to reject the
    // posted order with its generic balance/allowance error.
    appApprovalsMock.checkAllApprovals.mockResolvedValue({
      ...fullyApprovedStatus(),
      ctfNegRiskCollateralAdapterApproval: false,
      clobTradingApproved: false,
      allApproved: false,
      negRiskConversionApproved: false,
    });
    viemMock.readContract.mockResolvedValueOnce([BigInt(5_000_000)]); // CTF balanceOfBatch

    const { result } = renderHook(() => usePlaceOrder());

    await act(async () => {
      await result.current.createOrder({
        tokenId: "123",
        conditionId: "condition-1",
        price: 0.5,
        size: 2,
        side: "SELL",
        orderType: "GTC",
        negRisk: true,
      });
    });

    expect(relayerClientState.approveUsdcForTrading).toHaveBeenCalledWith(
      undefined,
      { approvalScope: { side: "SELL", negRisk: true } }
    );
    expect(tradingAdapterState.placeOrder).toHaveBeenCalled();
  });

  it("places a neg-risk SELL without approval repair when both operators are approved", async () => {
    viemMock.readContract.mockResolvedValueOnce([BigInt(5_000_000)]); // CTF balanceOfBatch

    const { result } = renderHook(() => usePlaceOrder());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.createOrder({
        tokenId: "123",
        conditionId: "condition-1",
        price: 0.5,
        size: 2,
        side: "SELL",
        orderType: "GTC",
        negRisk: true,
      });
    });

    expect(relayerClientState.approveUsdcForTrading).not.toHaveBeenCalled();
    expect(tradingAdapterState.placeOrder).toHaveBeenCalled();
    expect(outcome).toEqual({ success: true, order: placedOrder });
  });

  it("repairs a missing exchange operator approval before placing a standard SELL", async () => {
    appApprovalsMock.checkAllApprovals.mockResolvedValue({
      ...fullyApprovedStatus(),
      ctfExchangeApproval: false,
      clobTradingApproved: false,
      allApproved: false,
    });
    viemMock.readContract.mockResolvedValueOnce([BigInt(5_000_000)]); // CTF balanceOfBatch

    const { result } = renderHook(() => usePlaceOrder());

    await act(async () => {
      await result.current.createOrder({
        tokenId: "123",
        conditionId: "condition-1",
        price: 0.5,
        size: 2,
        side: "SELL",
        orderType: "GTC",
        negRisk: false,
      });
    });

    expect(relayerClientState.approveUsdcForTrading).toHaveBeenCalledWith(
      undefined,
      { approvalScope: { side: "SELL", negRisk: false } }
    );
    expect(tradingAdapterState.placeOrder).toHaveBeenCalled();
  });

  // The draft says how many shares the sell needs; the wallet's on-chain
  // balance is the preflight's own check, before any approval or placement.
  it("blocks a SELL for more shares than the trading wallet holds", async () => {
    viemMock.readContract.mockResolvedValueOnce([BigInt(1_000_000)]); // CTF balanceOfBatch

    const { result } = renderHook(() => usePlaceOrder());

    await act(async () => {
      await expect(
        result.current.createOrder({
          tokenId: "123",
          conditionId: "condition-1",
          price: 0.5,
          size: 2,
          side: "SELL",
          orderType: "GTC",
          negRisk: false,
        })
      ).rejects.toThrow(/Insufficient shares: this wallet holds 1/);
    });

    expect(relayerClientState.approveUsdcForTrading).not.toHaveBeenCalled();
    expect(tradingAdapterState.placeOrder).not.toHaveBeenCalled();
  });

  // The adapter rethrows what the CLOB said with the original in `cause`.
  // A balance error after the shares left the wallet means the order
  // matched before the CLOB's cache caught up, not that placement failed.
  it("treats a balance error the adapter wraps after a fill as a matched SELL", async () => {
    viemMock.readContract
      .mockResolvedValueOnce([BigInt(5_000_000)]) // CTF balanceOfBatch before
      .mockResolvedValueOnce([BigInt(3_000_000)]); // CTF balanceOfBatch after
    tradingAdapterState.placeOrder.mockRejectedValue(
      new Error("Polymarket rejected the order", {
        cause: new Error("not enough balance / allowance"),
      })
    );

    const { result } = renderHook(() => usePlaceOrder());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.createOrder({
        tokenId: "123",
        conditionId: "condition-1",
        price: 0.5,
        size: 2,
        side: "SELL",
        orderType: "GTC",
        negRisk: false,
      });
    });

    expect(outcome).toEqual({
      success: true,
      order: {
        status: "matched_with_stale_balance_error",
        error: "Polymarket rejected the order",
      },
    });
  });

  it("maps a wallet rejection inside the adapter's error chain to a no-order message", async () => {
    viemMock.readContract.mockResolvedValueOnce([BigInt(5_000_000)]); // CTF balanceOfBatch
    tradingAdapterState.placeOrder.mockRejectedValue(
      new Error("Signing failed", {
        cause: Object.assign(new Error("User rejected the request"), {
          code: 4001,
        }),
      })
    );

    const { result } = renderHook(() => usePlaceOrder());

    await act(async () => {
      await expect(
        result.current.createOrder({
          tokenId: "123",
          conditionId: "condition-1",
          price: 0.5,
          size: 2,
          side: "SELL",
          orderType: "GTC",
          negRisk: false,
        })
      ).rejects.toThrow("Wallet request was rejected. No order was placed.");
    });
  });
});
