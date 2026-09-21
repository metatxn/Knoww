import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));

import { GET } from "./route";

/** A Gamma keyset cursor whose last key is the given event id. */
function cursorFor(id: string): string {
  return Buffer.concat([
    Buffer.alloc(32),
    Buffer.from(JSON.stringify({ keys: [{ v: id }] })),
  ]).toString("base64url");
}

function event(id: string) {
  return {
    id,
    slug: `event-${id}`,
    title: `Event ${id}`,
    markets: [
      {
        id: `market-${id}`,
        question: `Will ${id} happen?`,
        outcomes: '["Yes", "No"]',
        outcomePrices: '["0.5", "0.5"]',
      },
    ],
  };
}

function stubGamma(payload: unknown) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /api/events/paginated", () => {
  it("asks Gamma for one extra row after a cursor and drops the cursor's row", async () => {
    const cursor = cursorFor("1");
    const calls = stubGamma({
      events: [event("1"), event("2"), event("3")],
      next_cursor: "next-page",
    });

    const response = await GET(
      new NextRequest(
        `https://knoww.app/api/events/paginated?tag_slug=politics&limit=2&after_cursor=${cursor}&liquidity_min=100`
      )
    );

    expect(calls).toHaveLength(1);
    const upstream = new URL(calls[0]);
    expect(upstream.pathname).toBe("/events/keyset");
    expect(Object.fromEntries(upstream.searchParams)).toEqual({
      limit: "3",
      closed: "false",
      order: "volume24hr",
      ascending: "false",
      after_cursor: cursor,
      tag_slug: "politics",
      liquidity_min: "100",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ id: string }>;
      pagination: unknown;
    };
    expect(body.success).toBe(true);
    expect(body.data.map((item) => item.id)).toEqual(["2", "3"]);
    expect(body.pagination).toEqual({
      hasMore: true,
      nextCursor: "next-page",
    });
  });

  it("prefers series_id over tag_slug and pins the series to active events", async () => {
    const calls = stubGamma({ events: [], next_cursor: null });

    const response = await GET(
      new NextRequest(
        "https://knoww.app/api/events/paginated?tag_slug=nfl&series_id=42&limit=6"
      )
    );

    const upstream = new URL(calls[0]);
    expect(Object.fromEntries(upstream.searchParams)).toEqual({
      limit: "6",
      closed: "false",
      order: "volume24hr",
      ascending: "false",
      series_id: "42",
      active: "true",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [],
      pagination: { hasMore: false, nextCursor: null },
    });
  });
});
