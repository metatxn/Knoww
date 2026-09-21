import type { TradingApprovalStatus } from "@knoww/shared-types/approvals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  OrderReadinessInput,
  TradingSlotProps,
} from "@/components/trading/types";
import { checkAllApprovals } from "@/lib/approvals";
import { usePolymarketOrderReadiness } from "./order-readiness";
import { toTradingTarget } from "./trading-target";

const preflightState = vi.hoisted(() => ({
  updateAllowance: vi.fn(),
}));

const balancesMock = vi.hoisted(() => ({
  readPusdAllowance: vi.fn(),
}));

const proxyWalletState = vi.hoisted(() => ({
  proxyAddress: "0x0000000000000000000000000000000000000002",
  isDeployed: true,
  refresh: vi.fn(),
}));

vi.mock("./order-preflight", () => ({
  usePolymarketOrderPreflight: () => preflightState,
}));

vi.mock("./clob/balances", () => balancesMock);

vi.mock("@/hooks/use-proxy-wallet", () => ({
  useProxyWallet: () => proxyWalletState,
}));

vi.mock("@/lib/approvals", () => ({
  checkAllApprovals: vi.fn(),
}));

const checkAllApprovalsMock = vi.mocked(checkAllApprovals);

function approvalStatus(approved: boolean): TradingApprovalStatus {
  return {
    pusdCtf: approved,
    pusdCtfExchange: approved,
    pusdNegRiskExchange: approved,
    pusdCtfCollateralAdapter: approved,
    pusdNegRiskCtfCollateralAdapter: approved,
    usdcOnramp: approved,
    ctfExchangeApproval: approved,
    ctfNegRiskExchangeApproval: approved,
    ctfCollateralAdapterApproval: approved,
    ctfNegRiskCollateralAdapterApproval: approved,
    allApproved: approved,
    clobTradingApproved: approved,
    autoWrapApproved: approved,
    ctfOperationsApproved: approved,
    negRiskConversionApproved: approved,
  };
}

function slotFor(negRisk: boolean): TradingSlotProps {
  const target = toTradingTarget({
    conditionId:
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    title: "Portugal",
    outcomes: [
      { name: "Portugal", tokenId: "12345678901234567890", price: 0.86 },
    ],
    selectedIndex: 0,
    negRisk,
    fetchedAt: "2026-09-05T00:00:00.000Z",
  });
  if (!target) throw new Error("trading target should build");
  return {
    market: target.market,
    outcome: target.outcome,
    details: target.platformDetails,
  };
}

const NEG_RISK_SLOT = slotFor(true);

function renderReadiness(input: Partial<OrderReadinessInput> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    () =>
      usePolymarketOrderReadiness({
        side: "BUY",
        totalUsd: 3.74,
        shares: 4,
        slot: NEG_RISK_SLOT,
        enabled: true,
        ...input,
      }),
    { wrapper }
  );
}

describe("usePolymarketOrderReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    proxyWalletState.proxyAddress =
      "0x0000000000000000000000000000000000000002";
    proxyWalletState.isDeployed = true;
    preflightState.updateAllowance.mockResolvedValue({
      success: true,
      hashes: ["0xapproval"],
      message: "Approved app trading pUSD",
    });
    balancesMock.readPusdAllowance.mockResolvedValue({
      allowance: 0,
      allowanceRaw: "0",
      decimals: 6,
      exchange: "NEG_RISK_CTF_EXCHANGE",
    });
    checkAllApprovalsMock.mockResolvedValue(approvalStatus(false));
  });

  it("approves the ticket amount and order scope instead of a default amount", async () => {
    const { result } = renderReadiness();

    await act(async () => {
      await result.current.prepare();
    });

    expect(preflightState.updateAllowance).toHaveBeenCalledWith("4", {
      side: "BUY",
      negRisk: true,
    });
    expect(proxyWalletState.refresh).toHaveBeenCalled();
  });

  it("asks for setup while the trading approvals are missing", async () => {
    const { result } = renderReadiness();

    await waitFor(() => expect(result.current.requiredStep).toBe("setup"));

    expect(checkAllApprovalsMock).toHaveBeenCalledWith(
      "0x0000000000000000000000000000000000000002",
      BigInt(4_000_000)
    );
    expect(result.current.isChecking).toBe(false);
  });

  it("lets the order through once the approvals are in place", async () => {
    checkAllApprovalsMock.mockResolvedValue(approvalStatus(true));
    const { result } = renderReadiness();

    await waitFor(() => expect(result.current.isChecking).toBe(false));

    expect(result.current.requiredStep).toBe("none");
  });

  it("gates a BUY on the allowance until the approvals read lands", async () => {
    checkAllApprovalsMock.mockReturnValue(new Promise(() => undefined));
    balancesMock.readPusdAllowance.mockResolvedValue({
      allowance: 2,
      allowanceRaw: "2000000",
      decimals: 6,
      exchange: "NEG_RISK_CTF_EXCHANGE",
    });
    const { result } = renderReadiness();

    await waitFor(() => expect(result.current.requiredStep).toBe("limit"));
  });

  it("skips every read while the wallet is not ready", () => {
    const { result } = renderReadiness({ enabled: false });

    expect(result.current.isChecking).toBe(false);
    expect(result.current.requiredStep).toBe("none");
    expect(checkAllApprovalsMock).not.toHaveBeenCalled();
    expect(balancesMock.readPusdAllowance).not.toHaveBeenCalled();
  });
});
