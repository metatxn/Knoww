import { type AccountOrder, buildCanonicalId } from "@knoww/services/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "@/lib/query-keys";

const wagmiState = vi.hoisted(() => ({
  address: "0x0000000000000000000000000000000000000001",
  isConnected: true,
}));

const proxyWalletState = vi.hoisted(() => ({
  proxyAddress: "0x0000000000000000000000000000000000000002",
  isDeployed: true,
  isEoaMode: false,
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

// Stands in for the Polymarket trading adapter: the list and the cancel are
// the two seams these hooks reach the venue through.
const tradingAdapterState = vi.hoisted(() => ({
  getAccountOrders: vi.fn(),
  cancelOrder: vi.fn(),
}));

// The scoring read stays a passive CLOB read on the read-only client.
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
  useConnection: () => ({
    address: wagmiState.address,
    isConnected: wagmiState.isConnected,
  }),
}));

vi.mock("./use-clob-credentials", () => ({
  useClobCredentials: () => clobCredentialsState,
}));

vi.mock("./use-proxy-wallet", () => ({
  useProxyWallet: () => proxyWalletState,
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

vi.mock("@/polymarket/read-only-client", () => readOnlyClientMock);

import {
  useCancelAllOrders,
  useCancelOrder,
  useOpenOrders,
} from "./use-open-orders";

const TOKEN_ID = "12345678901234567890";
const OTHER_TOKEN_ID = "98765432109876543210";
const CONDITION_ID =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

function accountOrder(overrides: Partial<AccountOrder> = {}): AccountOrder {
  return {
    orderId: "order-1",
    platform: "polymarket",
    marketId: buildCanonicalId("polymarket", CONDITION_ID),
    outcomeId: buildCanonicalId("polymarket", TOKEN_ID),
    side: "buy",
    orderType: "limit",
    timeInForce: "gtc",
    price: "0.5",
    quantity: { kind: "shares", value: "10" },
    filled: "2",
    status: "open",
    createdAt: "2026-09-05T00:00:00.000Z",
    platformDetails: {
      platform: "polymarket",
      outcome: "Yes",
      owner: proxyWalletState.proxyAddress,
      makerAddress: proxyWalletState.proxyAddress,
      clobStatus: "LIVE",
      clobOrderType: "GTC",
    },
    ...overrides,
  };
}

// What the shim raises when the CLOB rejects the stored credentials during a
// passive read; the adapter rethrows it inside `cause`.
function freshAuthenticationFailure(): Error {
  return new Error("Polymarket read failed", {
    cause: Object.assign(
      new Error(
        "Stored Polymarket API credentials require explicit re-authentication."
      ),
      { name: "PolymarketFreshAuthenticationRequiredError" }
    ),
  });
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useOpenOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tradingAdapterState.getAccountOrders.mockReset();
    wagmiState.address = "0x0000000000000000000000000000000000000001";
    wagmiState.isConnected = true;
    proxyWalletState.proxyAddress =
      "0x0000000000000000000000000000000000000002";
    proxyWalletState.isDeployed = true;
    clobCredentialsState.hasCredentials = true;
    tradingAdapterState.getAccountOrders.mockResolvedValue({
      items: [accountOrder()],
    });
    readOnlyClientMock.getPolymarketReadOnlyClient.mockResolvedValue({
      areOrdersScoring: vi.fn().mockResolvedValue({ "order-1": true }),
    });
    // The market lookup is app-local and not under test here.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the wallet's orders through the trading adapter in the CLOB's vocabulary", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useOpenOrders(), { wrapper });

    await waitFor(() => expect(result.current.data?.success).toBe(true));

    expect(tradingAdapterState.getAccountOrders).toHaveBeenCalledWith({
      identity: expect.objectContaining({
        platform: "polymarket",
        tradingAddress: proxyWalletState.proxyAddress,
      }),
    });
    expect(result.current.data?.count).toBe(1);
    expect(result.current.data?.orders[0]).toMatchObject({
      id: "order-1",
      maker: proxyWalletState.proxyAddress,
      tokenId: TOKEN_ID,
      side: "BUY",
      price: 0.5,
      size: 10,
      filledSize: 2,
      remainingSize: 8,
      status: "LIVE",
      createdAt: "2026-09-05T00:00:00.000Z",
      expiration: "",
      scoring: true,
    });
  });

  it("filters the list to the requested token locally", async () => {
    tradingAdapterState.getAccountOrders.mockResolvedValue({
      items: [
        accountOrder(),
        accountOrder({
          orderId: "order-2",
          outcomeId: buildCanonicalId("polymarket", OTHER_TOKEN_ID),
        }),
      ],
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useOpenOrders({ market: TOKEN_ID }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data?.success).toBe(true));

    expect(result.current.data?.count).toBe(1);
    expect(result.current.data?.orders.map((order) => order.id)).toEqual([
      "order-1",
    ]);
  });

  it("includes orders from every page before filtering by token", async () => {
    tradingAdapterState.getAccountOrders
      .mockResolvedValueOnce({
        items: [
          accountOrder({
            outcomeId: buildCanonicalId("polymarket", OTHER_TOKEN_ID),
          }),
        ],
        nextCursor: "page-2",
      })
      .mockResolvedValueOnce({ items: [accountOrder({ orderId: "order-2" })] });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useOpenOrders({ market: TOKEN_ID }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data?.success).toBe(true));

    expect(result.current.data?.orders.map((order) => order.id)).toEqual([
      "order-2",
    ]);
    expect(result.current.data?.count).toBe(1);
    expect(tradingAdapterState.getAccountOrders).toHaveBeenLastCalledWith({
      identity: expect.objectContaining({ platform: "polymarket" }),
      cursor: "page-2",
    });
  });

  it("cancels orders from every page", async () => {
    tradingAdapterState.getAccountOrders
      .mockResolvedValueOnce({ items: [accountOrder()], nextCursor: "page-2" })
      .mockResolvedValueOnce({ items: [accountOrder({ orderId: "order-2" })] });
    tradingAdapterState.cancelOrder.mockResolvedValue({ status: "cancelled" });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelAllOrders(), { wrapper });

    const outcome = await result.current.mutateAsync();

    expect(outcome).toEqual({ cancelled: 2, total: 2 });
    expect(
      tradingAdapterState.cancelOrder.mock.calls.map(([input]) => input.orderId)
    ).toEqual(["order-1", "order-2"]);
  });

  it("does not start cancelling if a later page fails", async () => {
    tradingAdapterState.getAccountOrders
      .mockResolvedValueOnce({ items: [accountOrder()], nextCursor: "page-2" })
      .mockRejectedValueOnce(new Error("Could not load orders"));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelAllOrders(), { wrapper });

    await expect(result.current.mutateAsync()).rejects.toThrow(
      "Could not load orders"
    );
    expect(tradingAdapterState.cancelOrder).not.toHaveBeenCalled();
  });

  it("stops without cancelling when the adapter repeats a cursor", async () => {
    tradingAdapterState.getAccountOrders.mockResolvedValue({
      items: [accountOrder()],
      nextCursor: "same-page",
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelAllOrders(), { wrapper });

    await expect(result.current.mutateAsync()).rejects.toThrow(
      "Order pagination did not advance"
    );
    expect(tradingAdapterState.getAccountOrders).toHaveBeenCalledTimes(2);
    expect(tradingAdapterState.cancelOrder).not.toHaveBeenCalled();
  });

  it("clears the stored credentials when the venue rejects them on a passive read", async () => {
    tradingAdapterState.getAccountOrders.mockRejectedValue(
      freshAuthenticationFailure()
    );
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useOpenOrders(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toMatchObject({
      success: false,
      count: 0,
      orders: [],
    });
    expect(clobCredentialsState.clearCredentials).toHaveBeenCalledTimes(1);
  });
});

describe("useCancelOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wagmiState.address = "0x0000000000000000000000000000000000000001";
    proxyWalletState.proxyAddress =
      "0x0000000000000000000000000000000000000002";
  });

  it("reports the cancelled order once the venue confirms it", async () => {
    const cancelled = { orderId: "order-1", status: "cancelled" };
    tradingAdapterState.cancelOrder.mockResolvedValue(cancelled);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCancelOrder(), { wrapper });

    const outcome = await result.current.mutateAsync("order-1");

    expect(outcome).toEqual({ success: true, order: cancelled });
    expect(tradingAdapterState.cancelOrder).toHaveBeenCalledWith({
      identity: expect.objectContaining({ platform: "polymarket" }),
      orderId: "order-1",
      idempotencyKey: expect.any(String),
    });
  });

  // The old CLOB path answered `{ success: true }` even when the venue
  // refused. The adapter throws, so the ticket sees the refusal and the
  // optimistic removal is rolled back.
  it("surfaces a refused cancel and restores the order in the cache", async () => {
    tradingAdapterState.cancelOrder.mockRejectedValue(
      new Error("Polymarket refused the cancel")
    );
    const { queryClient, wrapper } = createWrapper();
    const listKey = qk.orders.list(wagmiState.address);
    const cached = {
      success: true,
      userAddress: wagmiState.address,
      count: 1,
      orders: [{ id: "order-1", tokenId: TOKEN_ID }],
    };
    queryClient.setQueryData(listKey, cached);
    const { result } = renderHook(() => useCancelOrder(), { wrapper });

    await expect(result.current.mutateAsync("order-1")).rejects.toThrow(
      "Polymarket refused the cancel"
    );

    expect(queryClient.getQueryData(listKey)).toEqual(cached);
  });
});
