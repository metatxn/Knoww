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
  it("rejects an oversized response before JSON parsing", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('{"private":"upstream diagnostics"}', {
          headers: { "content-length": String(4 * 1024 * 1024 + 1) },
        })
    );
    const api = createDataApi(
      createPolymarketClientContext({
        baseUrls: DEFAULT_POLYMARKET_BASE_URLS,
        fetchImpl,
      })
    );

    await expect(
      api.rows("activity", {}, z.number(), { limit: 1 })
    ).rejects.toMatchObject({
      name: "UpstreamPublicDataError",
      message: "Data API response exceeded its size limit",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

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

  it("keeps valid price history when bucket-edge points fall outside the requested window", async () => {
    const start = 1700000037;
    const end = 1700003637;
    const calls: URL[] = [];
    const client = createPolymarketClient({
      fetchImpl: vi.fn(async (input) => {
        calls.push(new URL(String(input)));
        return envelope([
          { timestamp: 1700000000, price: 0.4 },
          { timestamp: 1700003600, price: 0.5 },
          { timestamp: 1700007200, price: 0.6 },
        ]);
      }),
    });

    const result = await client.fetchBoundedPriceHistoryByTokenId("123", {
      startTs: start,
      endTs: end,
      fidelity: 60,
    });

    expect(calls[0].searchParams.get("start")).toBe(String(start));
    expect(calls[0].searchParams.get("end")).toBe(String(end));
    expect(result.points).toEqual([{ t: 1700003600, p: "0.5" }]);
    expect(result.truncated).toBe(false);
  });

  it("bounds MCP price-history pages and retained samples", async () => {
    const start = 1700000000;
    const pageSize = 2000;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const cursor = Number(url.searchParams.get("cursor") ?? "0");
      const data = Array.from({ length: pageSize }, (_, index) => ({
        timestamp: start + cursor * pageSize + index,
        price: 0.5,
      }));
      return envelope(data, String(cursor + 1));
    });
    const client = createPolymarketClient({ fetchImpl });

    const result = await client.fetchBoundedPriceHistoryByTokenId("123", {
      startTs: start,
      endTs: start + 20000,
      fidelity: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(8);
    expect(result.points).toHaveLength(1000);
    expect(result.points[0]).toEqual({ t: start, p: "0.5" });
    expect(result.points[result.points.length - 1]).toEqual({
      t: start + 8 * pageSize - 1,
      p: "0.5",
    });
    const quarterCounts = [0, 0, 0, 0];
    for (const point of result.points) {
      const quarter = Math.min(3, Math.floor((point.t - start) / 4000));
      quarterCounts[quarter]++;
    }
    expect(quarterCounts).toEqual([250, 250, 250, 250]);
    expect(
      Math.max(
        ...result.points.slice(1).map((point, index) => {
          return point.t - result.points[index].t;
        })
      )
    ).toBeLessThanOrEqual(32);
    expect(result.observedPoints).toBe(8 * pageSize);
    expect(result.downsampled).toBe(true);
    expect(result.truncated).toBe(true);
  });

  it("samples evenly when upstream points arrive out of timestamp order", async () => {
    const start = 1700000000;
    const timestamps: number[] = [];
    for (let index = 0; index < 1000; index++) {
      timestamps.push(index, index + 2000);
    }
    for (let index = 1000; index < 2000; index++) timestamps.push(index);
    const client = createPolymarketClient({
      fetchImpl: vi.fn(async () =>
        envelope(
          timestamps.map((offset) => ({
            timestamp: start + offset,
            price: 0.5,
          }))
        )
      ),
    });

    const result = await client.fetchBoundedPriceHistoryByTokenId("123", {
      startTs: start,
      endTs: start + 2999,
      fidelity: 1,
    });
    const thirdCounts = [0, 0, 0];
    for (const point of result.points) {
      const third = Math.min(2, Math.floor((point.t - start) / 1000));
      thirdCounts[third]++;
    }

    expect(thirdCounts.every((count) => count >= 320 && count <= 347)).toBe(
      true
    );
    expect(
      Math.max(
        ...result.points.slice(1).map((point, index) => {
          return point.t - result.points[index].t;
        })
      )
    ).toBeLessThanOrEqual(8);
  });

  it("does not give replayed timestamps extra sampling weight", async () => {
    const start = 1700000000;
    const base = Array.from({ length: 3000 }, (_, index) => ({
      timestamp: start + index,
      price: index < 2000 && index % 2 === 1 ? 0.6 : 0.5,
    }));
    const replayed = [
      ...base.map((point) => ({ ...point, price: 0.5 })),
      ...Array.from({ length: 1000 }, (_, index) => ({
        timestamp: start + index * 2 + 1,
        price: 0.6,
      })),
    ];
    const fetchHistory = async (data: unknown[]) => {
      const client = createPolymarketClient({
        fetchImpl: vi.fn(async () => envelope(data)),
      });
      return client.fetchBoundedPriceHistoryByTokenId("123", {
        startTs: start,
        endTs: start + 2999,
        fidelity: 1,
      });
    };

    const deduplicatedResult = await fetchHistory(base);
    const replayedResult = await fetchHistory(replayed);

    expect(replayedResult.points.map((point) => point.t)).toEqual(
      deduplicatedResult.points.map((point) => point.t)
    );
  });

  it("does not report timestamp deduplication as downsampling", async () => {
    const start = 1700000000;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return url.searchParams.has("cursor")
        ? envelope([
            { timestamp: start + 60, price: 0.6 },
            { timestamp: start + 120, price: 0.7 },
          ])
        : envelope(
            [
              { timestamp: start, price: 0.5 },
              { timestamp: start + 60, price: 0.55 },
            ],
            "next"
          );
    });
    const client = createPolymarketClient({ fetchImpl });

    const result = await client.fetchBoundedPriceHistoryByTokenId("123", {
      startTs: start,
      endTs: start + 120,
      fidelity: 1,
    });

    expect(result.points).toEqual([
      { t: start, p: "0.5" },
      { t: start + 60, p: "0.6" },
      { t: start + 120, p: "0.7" },
    ]);
    expect(result.observedPoints).toBe(4);
    expect(result.downsampled).toBe(false);
    expect(result.truncated).toBe(false);
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
