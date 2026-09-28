import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cached = vi.hoisted(() => vi.fn());
vi.mock("@knoww/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: () => null }));
vi.mock("@/polymarket/card-feed-cache", () => ({
  getCardFeedResponse: cached,
}));

import { GET } from "./route";

beforeEach(() => {
  cached.mockReset();
});
describe("GET /api/events/cards", () => {
  it.each([
    "limit=21",
    "offset=10",
    "after_cursor=legacy-gamma-cursor",
    "after_cursor=cards-v1.e30=",
    ...[0, -1, 21, 1.5, "2", null].map(
      (batchSize) =>
        `after_cursor=${encodeURIComponent(`cards-v2.${btoa(JSON.stringify({ cursor: "gamma", lastId: "1", batchSize }))}`)}`
    ),
    `after_cursor=${encodeURIComponent(`cards-v2.${btoa(JSON.stringify({ cursor: "gamma", lastId: "1", batchSize: 2, extra: true }))}`)}`,
    "live=maybe",
    "end_date_min=not-a-date",
    "volume24hr_min=-1",
  ])("rejects %s before any cache or upstream read", async (query) => {
    expect(
      (
        await GET(
          new NextRequest(`https://knoww.app/api/events/cards?${query}`)
        )
      ).status
    ).toBe(400);
    expect(cached).not.toHaveBeenCalled();
  });
  it("accepts a validated batch cursor", async () => {
    const cursor = `cards-v2.${btoa(JSON.stringify({ cursor: "gamma", lastId: "2", batchSize: 2 }))}`;
    cached.mockResolvedValue(Response.json({ success: true, data: [] }));
    const response = await GET(
      new NextRequest(
        `https://knoww.app/api/events/cards?after_cursor=${encodeURIComponent(cursor)}`
      )
    );
    expect(response.status).toBe(200);
    expect(cached).toHaveBeenCalledWith(
      expect.objectContaining({ after_cursor: cursor })
    );
  });
  it("normalizes filters before choosing a cache entry", async () => {
    cached.mockResolvedValue(
      Response.json({ success: true, data: [], freshness: { stale: false } })
    );
    const response = await GET(
      new NextRequest(
        "https://knoww.app/api/events/cards?feed=new&limit=20&tag_slug=politics&end_date_min=2026-09-27"
      )
    );
    expect(response.status).toBe(200);
    expect(cached).toHaveBeenCalledWith(
      expect.objectContaining({
        feed: "new",
        limit: 20,
        closed: "false",
        tag_slug: "politics",
        end_date_min: "2026-09-27",
      })
    );
  });
  it("returns a retryable generic error when the cache binding fails", async () => {
    cached.mockRejectedValue(new Error("internal cache details"));
    const response = await GET(
      new NextRequest("https://knoww.app/api/events/cards")
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("15");
    expect(await response.text()).not.toContain("internal cache details");
  });
});
