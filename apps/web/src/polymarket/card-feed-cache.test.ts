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

import { getCardFeedResponse } from "./card-feed-cache";
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
  it("coordinates a fixed first page", async () => {
    const response = await getCardFeedResponse(cardFeedQuerySchema.parse({}));
    expect(await response.json()).toEqual({ coordinated: true });
    expect(mock.getByName).toHaveBeenCalledOnce();
    expect(mock.read).not.toHaveBeenCalled();
  });

  it.each([
    { after_cursor: encodeCardCursor("arbitrary-unique-cursor", "1") },
    { tag_slug: "politics" },
    { end_date_min: "2026-09-27" },
    { limit: 10 },
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
