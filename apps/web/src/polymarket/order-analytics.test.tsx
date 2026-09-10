import type { OrderResult, WalletIdentity } from "@knoww/services/core";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePolymarketOrderAnalytics } from "./order-analytics";

const mocks = vi.hoisted(() => ({
  credentials: {
    apiKey: "test-key",
    apiSecret: "test-secret",
    apiPassphrase: "test-passphrase",
  },
  rememberAcceptedOrder: vi.fn(),
  pollConfirmedOrders: vi.fn(),
  getPolymarketReadOnlyClient: vi.fn(),
}));
vi.mock("@/hooks/use-clob-credentials", () => ({
  useClobCredentials: () => ({ credentials: mocks.credentials }),
}));
vi.mock("@/lib/order-analytics", () => mocks);
vi.mock("./read-only-client", () => mocks);

const identity: WalletIdentity = {
  kind: "wallet",
  platform: "polymarket",
  accountType: "safe",
  address: "0x0000000000000000000000000000000000000001",
  tradingAddress: "0x0000000000000000000000000000000000000002",
};
const order: OrderResult = {
  platform: "polymarket",
  status: "open",
  orderId: "order-1",
  idempotencyKey: "attempt-1",
};
const reader = { fetchOrder: vi.fn(), fetchTrade: vi.fn() };

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.getPolymarketReadOnlyClient.mockResolvedValue(reader);
  mocks.rememberAcceptedOrder.mockResolvedValue(undefined);
  mocks.pollConfirmedOrders.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

it("tracks the canonical id and polls confirmations with a passive wallet reader", async () => {
  const { result, unmount } = renderHook(() =>
    usePolymarketOrderAnalytics(identity, true)
  );
  await act(async () => {
    await result.current(order, { attempt_id: "attempt-1" });
  });
  expect(mocks.rememberAcceptedOrder).toHaveBeenCalledWith(
    order,
    identity.address,
    { attempt_id: "attempt-1" }
  );
  expect(mocks.getPolymarketReadOnlyClient).toHaveBeenCalledWith({
    signerAddress: identity.address,
    walletAddress: identity.tradingAddress,
    credentials: mocks.credentials,
  });
  expect(mocks.pollConfirmedOrders).toHaveBeenCalledWith(
    identity.address,
    reader
  );
  mocks.pollConfirmedOrders.mockClear();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(mocks.pollConfirmedOrders).toHaveBeenCalledTimes(1);
  unmount();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.pollConfirmedOrders).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  "isolates storage failure from placement, synchronous: %s",
  async (synchronous) => {
    if (synchronous)
      mocks.rememberAcceptedOrder.mockImplementation(() => {
        throw new Error("Storage denied");
      });
    else
      mocks.rememberAcceptedOrder.mockRejectedValue(
        new Error("Storage denied")
      );
    const { result } = renderHook(() =>
      usePolymarketOrderAnalytics(identity, true)
    );
    await expect(result.current(order, {})).resolves.toBeUndefined();
  }
);

it("does not poll until trading is ready", async () => {
  renderHook(() => usePolymarketOrderAnalytics(identity, false));
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.getPolymarketReadOnlyClient).not.toHaveBeenCalled();
});

it("ignores confirmation-read failures", async () => {
  mocks.getPolymarketReadOnlyClient.mockRejectedValue(
    new Error("Read unavailable")
  );
  const { result } = renderHook(() =>
    usePolymarketOrderAnalytics(identity, true)
  );
  await expect(result.current(order, {})).resolves.toBeUndefined();
});
