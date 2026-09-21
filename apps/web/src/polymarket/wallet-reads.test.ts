import { afterEach, expect, it, vi } from "vitest";
import { fetchWalletDataResponse } from "./wallet-reads";

afterEach(() => vi.unstubAllGlobals());
it("serves web positions through the registry using Data API v2 and includes fee basis", async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL) =>
    Response.json({
      data: [
        {
          proxy_wallet: "wallet",
          token_id: "123",
          condition_id: "condition",
          current_size: 10,
          avg_price: 0.4,
          entry_cost_usdc: 4,
          total_cost_usdc: 4.1,
          entry_fees_usdc: 0.1,
          current_value: 5,
          current_price: 0.5,
          total_size: 10,
          unrealized_pnl: 1,
          realized_pnl: 0,
          percent_pnl: 25,
          percent_realized_pnl: 0,
          redeemable: false,
          mergeable: false,
        },
      ],
      pagination: { next_cursor: null },
    })
  );
  vi.stubGlobal("fetch", fetcher);
  const response = await fetchWalletDataResponse(
    "positions",
    new URLSearchParams({
      user: "wallet",
      sortBy: "CURRENT",
      includeArchived: "true",
    })
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject([
    {
      size: 10,
      initialValue: 4,
      grossInitialValue: 4.1,
      entryFeesUsdc: 0.1,
      cashPnl: 1,
    },
  ]);
  const url = new URL(String(fetcher.mock.calls[0]?.[0]));
  expect(url.pathname).toBe("/v2/positions");
  expect(url.searchParams.get("sort_by")).toBe("CURRENT_VALUE");
  expect(url.searchParams.get("include_archived")).toBe("true");
  expect(url.searchParams.has("offset")).toBe(false);
});
it("maps a wallet standing and preserves an unknown rank", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: {
          user_id: "wallet",
          pnl: 2,
          volume: 10,
          rank_pnl: null,
          rank_volume: 2,
          verified: true,
          user_name: "Trader",
        },
      })
    )
  );
  const response = await fetchWalletDataResponse(
    "leaderboard",
    new URLSearchParams({ user: "wallet" })
  );
  expect(await response.json()).toMatchObject([
    { proxyWallet: "wallet", rank: "", pnl: 2, vol: 10, userName: "Trader" },
  ]);
});
it("returns sanitized upstream failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response("private upstream diagnostic", { status: 400 })
    )
  );
  const response = await fetchWalletDataResponse(
    "positions",
    new URLSearchParams({ user: "wallet" })
  );
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain("diagnostic");
});
it("normalizes v2 trades for web consumers", async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL) =>
    Response.json({
      data: [
        {
          proxy_wallet: "wallet",
          token_id: "123",
          condition_id: "condition",
          side: "BUY",
          price: 0.4,
          size: 10,
          timestamp: 1700000000,
        },
      ],
      pagination: { next_cursor: null },
    })
  );
  vi.stubGlobal("fetch", fetcher);
  const response = await fetchWalletDataResponse(
    "trades",
    new URLSearchParams({ market: "condition", limit: "5" })
  );
  expect(await response.json()).toMatchObject([
    { asset: "123", conditionId: "condition", price: 0.4, size: 10 },
  ]);
  const url = new URL(String(fetcher.mock.calls[0]?.[0]));
  expect(url.pathname).toBe("/v2/trades");
  expect(url.searchParams.get("condition")).toBe("condition");
});
it("returns top holders per outcome without scanning every holder", async () => {
  const holder = (token: string) => ({
    token_id: token,
    holders: [{ proxy_wallet: "wallet", token_id: token, amount: 10 }],
  });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        data: [holder("123"), holder("456")],
        pagination: { next_cursor: "next-token" },
      })
    )
    .mockResolvedValueOnce(
      Response.json({
        data: [holder("456")],
        pagination: { next_cursor: null },
      })
    );
  vi.stubGlobal("fetch", fetcher);
  const response = await fetchWalletDataResponse(
    "holders",
    new URLSearchParams({ market: "condition", limit: "1" })
  );
  expect(await response.json()).toMatchObject([
    { token: "123", holders: [{ amount: 10 }] },
    { token: "456", holders: [{ amount: 10 }] },
  ]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
