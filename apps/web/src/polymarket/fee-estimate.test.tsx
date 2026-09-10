import { estimateBuyTakerFeeRaw } from "@knoww/shared-types/trading";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BuyFeeEstimateInput,
  TradingSlotProps,
} from "@/components/trading/types";
import { usePolymarketBuyFeeEstimate } from "./fee-estimate";
import { toTradingTarget } from "./trading-target";

const wagmiState = vi.hoisted(() => ({
  address: "0x0000000000000000000000000000000000000001",
}));

const proxyWalletState = vi.hoisted(() => ({
  proxyAddress: "0x0000000000000000000000000000000000000002",
  isEoaMode: false,
}));

const clobCredentialsState = vi.hoisted(() => ({
  credentials: {
    apiKey: "api-key",
    apiSecret: "api-secret",
    apiPassphrase: "api-passphrase",
  },
  hasCredentials: true,
}));

const readOnlyClientMock = vi.hoisted(() => ({
  getPolymarketReadOnlyClient: vi.fn(),
  forgetPolymarketReadOnlyClient: vi.fn(),
}));

vi.mock("@knoww/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: wagmiState.address }),
}));

vi.mock("@/hooks/use-clob-credentials", () => ({
  useClobCredentials: () => clobCredentialsState,
}));

vi.mock("@/hooks/use-proxy-wallet", () => ({
  useProxyWallet: () => proxyWalletState,
}));

vi.mock("./read-only-client", () => readOnlyClientMock);

vi.mock("@knoww/shared-types/trading", async () => {
  const actual = await vi.importActual<
    typeof import("@knoww/shared-types/trading")
  >("@knoww/shared-types/trading");
  return { ...actual, estimateBuyTakerFeeRaw: vi.fn() };
});

const estimateBuyTakerFeeRawMock = vi.mocked(estimateBuyTakerFeeRaw);
const readOnlyClient = { readOnly: true };

const CONDITION_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

function slot(): TradingSlotProps {
  const target = toTradingTarget({
    conditionId: CONDITION_ID,
    title: "Portugal",
    outcomes: [
      { name: "Portugal", tokenId: "12345678901234567890", price: 0.86 },
    ],
    selectedIndex: 0,
    negRisk: true,
    fetchedAt: "2026-09-05T00:00:00.000Z",
  });
  if (!target) throw new Error("trading target should build");
  return {
    market: target.market,
    outcome: target.outcome,
    details: target.platformDetails,
  };
}

const MARKETABLE_BUY: BuyFeeEstimateInput = {
  side: "BUY",
  slot: slot(),
  shares: 5.81,
  price: 0.86,
  totalUsd: 5,
  isMarketableBuy: true,
  enabled: true,
};

function renderFeeEstimate(input: Partial<BuyFeeEstimateInput> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => usePolymarketBuyFeeEstimate({ ...MARKETABLE_BUY, ...input }),
    { wrapper }
  );
}

describe("usePolymarketBuyFeeEstimate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readOnlyClientMock.getPolymarketReadOnlyClient.mockResolvedValue(
      readOnlyClient
    );
  });

  // The fee is charged on top of the typed amount, so the ticket has to show
  // it for the real debit to be legible.
  it("quotes the taker fee in USD for a marketable BUY", async () => {
    // 6-decimal pUSD base units: 12_500 raw = $0.0125.
    estimateBuyTakerFeeRawMock.mockResolvedValue(BigInt(12_500));
    const { result } = renderFeeEstimate();

    await waitFor(() => expect(result.current.feeUsd).not.toBeNull());

    expect(result.current.feeUsd).toBeCloseTo(0.0125, 6);
    expect(estimateBuyTakerFeeRawMock).toHaveBeenCalledWith(
      readOnlyClient,
      CONDITION_ID,
      5.81,
      0.86,
      5,
      expect.objectContaining({ isMarketableBuy: true })
    );
    expect(readOnlyClientMock.getPolymarketReadOnlyClient).toHaveBeenCalledWith(
      {
        signerAddress: wagmiState.address,
        walletAddress: proxyWalletState.proxyAddress,
        credentials: clobCredentialsState.credentials,
      }
    );
  });

  // A fee we could not read is not a zero fee: the ticket renders nothing
  // rather than a confident "$0.00".
  it("reports no fee when the market fee cannot be read", async () => {
    estimateBuyTakerFeeRawMock.mockResolvedValue(null);
    const { result } = renderFeeEstimate();

    await waitFor(() => expect(estimateBuyTakerFeeRawMock).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(result.current.feeUsd).toBeNull();
  });

  it("quotes nothing for a SELL", async () => {
    const { result } = renderFeeEstimate({ side: "SELL" });

    expect(result.current.feeUsd).toBeNull();
    expect(result.current.isFetching).toBe(false);
    expect(estimateBuyTakerFeeRawMock).not.toHaveBeenCalled();
  });

  // A market BUY the book cannot fill prices at 0; the fee curve is 0 there
  // too, and quoting it would print a confident "$0.00" with no basis.
  it("quotes nothing for a BUY the book cannot price", async () => {
    const { result } = renderFeeEstimate({ price: 0 });

    expect(result.current.feeUsd).toBeNull();
    expect(estimateBuyTakerFeeRawMock).not.toHaveBeenCalled();
  });
});
