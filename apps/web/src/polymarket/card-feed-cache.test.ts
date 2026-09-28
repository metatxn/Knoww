import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  getByName: vi.fn(),
  getPage: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { MARKET_FEED_CACHE: mock } }),
}));
vi.mock("./event-feed", () => ({ readCardFeed: mock.read }));

import { cardFeedCacheKey, getCardFeedResponse } from "./card-feed-cache";
import { cardFeedQuerySchema, encodeCardCursor } from "./card-feed-query";

beforeEach(() => {
  vi.clearAllMocks();
  mock.getByName.mockReturnValue(mock);
  mock.getPage.mockImplementation(() => Response.json({ coordinated: true }));
  mock.read.mockResolvedValue({ events: [{ id: "1" }], nextCursor: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("card feed cache routing", () => {
  it("preserves the deployed twenty-event cache key", async () => {
    expect(
      await cardFeedCacheKey(cardFeedQuerySchema.parse({ limit: 20 }))
    ).toBe(
      "cards-v1:857272c90f69c57af15cfef0aa96e1ae54ed288e8cde5fb513451a6aa7d493c4"
    );
  });
  it.each([10, 20])(
    "coordinates a fixed %i-event first page",
    async (limit) => {
      const response = await getCardFeedResponse(
        cardFeedQuerySchema.parse({ limit })
      );
      expect(await response.json()).toEqual({ coordinated: true });
      expect(mock.getByName).toHaveBeenCalledOnce();
      expect(mock.read).not.toHaveBeenCalled();
    }
  );

  it("uses ten events by default and isolates the old twenty-event cache", async () => {
    const query = cardFeedQuerySchema.parse({});
    expect(query.limit).toBe(10);
    await getCardFeedResponse(query);
    await getCardFeedResponse(cardFeedQuerySchema.parse({ limit: 20 }));
    expect(mock.getByName).toHaveBeenCalledTimes(2);
    expect(mock.getByName.mock.calls[0][0]).not.toBe(
      mock.getByName.mock.calls[1][0]
    );
  });

  it.each([
    { after_cursor: encodeCardCursor("arbitrary-unique-cursor", "1") },
    { tag_slug: "politics" },
    { end_date_min: "2026-09-27" },
    { limit: 9 },
  ])("does not allocate durable state for %j", async (input) => {
    const query = cardFeedQuerySchema.parse(input);
    const entries = new Map<string, Response>();
    const put = vi.fn(async (request: Request, response: Response) => {
      entries.set(request.url, response);
    });
    vi.stubGlobal("caches", {
      default: {
        match: async (request: Request) => entries.get(request.url)?.clone(),
        put,
      },
    });
    const first = await getCardFeedResponse(query);
    const second = await getCardFeedResponse(query);
    expect(await first.json()).toEqual(await second.json());
    expect(mock.getByName).not.toHaveBeenCalled();
    expect(mock.read).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
  });
});
