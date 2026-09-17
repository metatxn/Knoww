import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DEFAULT_POLYMARKET_BASE_URLS } from "./base-urls";
import { createPolymarketClient } from "./client";
import { createPolymarketClientContext } from "./context";
import { createDataApi } from "./data-api";

const envelope = (data: unknown[], cursor: string | null = null) =>
  Response.json({ data, pagination: { next_cursor: cursor } });
const position = {
  proxy_wallet: "0xwallet",
  token_id: "123",
  condition_id: "0xcondition",
  current_size: 10,
  avg_price: 0.4,
  entry_cost_usdc: 4,
  current_value: 5,
  current_price: 0.5,
  total_size: 12,
  realized_pnl: 2,
  unrealized_pnl: 1,
  total_pnl: 3,
  percent_pnl: 25,
  percent_realized_pnl: 20,
  redeemable: false,
  mergeable: false,
};
describe("Data API v2", () => {
  it("walks opaque cursors with unchanged filters and never sends offset", async () => {
    const calls: URL[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url);
      return url.searchParams.has("cursor")
        ? envelope([3, 4])
        : envelope([1, 2], "opaque");
    });
    const api = createDataApi(
      createPolymarketClientContext({
        baseUrls: DEFAULT_POLYMARKET_BASE_URLS,
        fetchImpl,
      })
    );
    expect(
      await api.rows("activity", { user: "wallet" }, z.number(), {
        offset: 1,
        limit: 3,
      })
    ).toEqual([2, 3, 4]);
    expect(calls.map((u) => u.pathname)).toEqual([
      "/v2/activity",
      "/v2/activity",
    ]);
    expect(
      calls.every(
        (u) =>
          u.searchParams.get("user") === "wallet" &&
          !u.searchParams.has("offset")
      )
    ).toBe(true);
    expect(calls[1].searchParams.get("cursor")).toBe("opaque");
  });
  it("normalizes fee basis without re-deducting fees and preserves missing fees", async () => {
    const client = createPolymarketClient({
      fetchImpl: vi.fn(async () =>
        envelope([
          { ...position, entry_fees_usdc: 0.1, total_cost_usdc: 4.1 },
          position,
        ])
      ),
    });
    const rows = await client.fetchWalletPositions({
      walletAddress: "0xwallet",
      limit: 10,
      offset: 0,
      includeArchived: true,
    });
    expect(rows[0]).toMatchObject({
      asset: "123",
      size: "10",
      initialValue: "4",
      grossInitialValue: "4.1",
      entryFeesUsdc: "0.1",
      cashPnl: "1",
      realizedPnl: "2",
    });
    expect(rows[1].entryFeesUsdc).toBeUndefined();
    expect(rows[1].grossInitialValue).toBeUndefined();
  });
  it("retains both redemption outcomes and their zero payout", async () => {
    const client = createPolymarketClient({
      fetchImpl: vi.fn(async () =>
        envelope(
          [0, 1].map((index) => ({
            proxy_wallet: "wallet",
            token_id: String(index),
            condition_id: "condition",
            type: "REDEEM",
            timestamp: 1700000000,
            transaction_hash: "0xtx",
            side: "",
            size: 10,
            price: 0,
            usdc_size: index * 10,
            outcome_index: index,
          }))
        )
      ),
    });
    const rows = await client.fetchWalletActivity({
      walletAddress: "wallet",
      limit: 10,
      offset: 0,
    });
    expect(rows.map((row) => [row.asset, row.usdcSize])).toEqual([
      ["0", "0"],
      ["1", "10"],
    ]);
  });
  it("retries rate limits and rejects repeated cursors", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "Retry-After": "0" } })
      )
      .mockImplementation(async () => envelope([1], "same"));
    const api = createDataApi(
      createPolymarketClientContext({
        baseUrls: DEFAULT_POLYMARKET_BASE_URLS,
        fetchImpl,
      })
    );
    await expect(
      api.rows("activity", {}, z.number(), { limit: 10 })
    ).rejects.toThrow(/repeated/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("price history collects terminal points across pages on the data host", async () => {
    const calls: URL[] = [];
    const client = createPolymarketClient({
      fetchImpl: vi.fn(async (input) => {
        const url = new URL(String(input));
        calls.push(url);
        return url.searchParams.has("cursor")
          ? envelope([
              { timestamp: 1700000060, price: 1, resolution_seconds: 0 },
            ])
          : envelope([{ timestamp: 1700000000, price: 0.5 }], "next");
      }),
    });
    expect(
      await client.fetchPriceHistoryByTokenId("123", {
        startTs: 1700000000,
        endTs: 1700000060,
        fidelity: 1,
      })
    ).toEqual([
      { t: 1700000000, p: "0.5" },
      { t: 1700000060, p: "1" },
    ]);
    expect(calls[0].origin).toBe(DEFAULT_POLYMARKET_BASE_URLS.dataApi);
    expect(calls[0].searchParams.get("bucket_seconds")).toBe("60");
  });
});

it("rejects unsupported legacy position sorts before calling upstream", async () => {
  const fetchImpl = vi.fn<typeof fetch>();
  const client = createPolymarketClient({ fetchImpl });
  await expect(
    client.fetchWalletPositions({
      walletAddress: "wallet",
      limit: 1,
      offset: 0,
      sortBy: "AVGPRICE",
    })
  ).rejects.toMatchObject({ status: 400 });
  expect(fetchImpl).not.toHaveBeenCalled();
});
