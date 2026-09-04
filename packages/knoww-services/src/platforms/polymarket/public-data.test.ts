import { describe, expect, it, vi } from "vitest";
import { UpstreamPublicDataError } from "../../errors";
import { DEFAULT_POLYMARKET_BASE_URLS } from "./base-urls";
import { createPolymarketClientContext } from "./context";
import { createPublicData } from "./public-data";

const WALLET = `0x${"b".repeat(40)}`;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createClient(respond: (url: URL) => Response) {
  const calls: URL[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    return respond(url);
  }) as unknown as typeof fetch;
  const client = createPublicData(
    createPolymarketClientContext({
      baseUrls: DEFAULT_POLYMARKET_BASE_URLS,
      fetchImpl,
    })
  );
  return { client, calls };
}

describe("fetchTraderLeaderboardPage", () => {
  it("returns the validated rows next to the rows as the Data API sent them", async () => {
    const row = {
      rank: 1,
      proxyWallet: WALLET,
      userName: null,
      vol: 1000.5,
      pnl: -12.25,
      profileImage: null,
      xUsername: "alice",
      verifiedBadge: true,
    };
    const { client, calls } = createClient(() => jsonResponse([row]));

    const page = await client.fetchTraderLeaderboardPage({
      category: "OVERALL",
      timePeriod: "DAY",
      orderBy: "PNL",
      limit: 25,
      offset: 0,
    });

    expect(calls[0].pathname).toBe("/v1/leaderboard");
    expect(Object.fromEntries(calls[0].searchParams)).toEqual({
      category: "OVERALL",
      timePeriod: "DAY",
      orderBy: "PNL",
      limit: "25",
      offset: "0",
    });
    expect(page.rawEntries).toEqual([row]);
    expect(page.entries).toMatchObject([
      { rank: "1", volume: "1000.5", pnl: "-12.25", xUsername: "alice" },
    ]);
    expect(page.entries[0]).not.toHaveProperty("vol");
  });
});

describe("fetchTagBySlug", () => {
  it("looks a tag up by slug and returns the record as Gamma sent it", async () => {
    const record = {
      id: 745,
      label: "NBA",
      slug: "nba",
      description: "Basketball markets",
      forceShow: false,
    };
    const { client, calls } = createClient(() => jsonResponse(record));

    const result = await client.fetchTagBySlug("nba");

    expect(calls[0].toString()).toBe(
      `${DEFAULT_POLYMARKET_BASE_URLS.gamma}/tags/slug/nba`
    );
    expect(result).toEqual({
      tag: { ...record, id: "745" },
      rawTag: record,
    });
  });

  it("encodes the slug and surfaces a missing tag as an upstream error with its status", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse({ error: "not found" }, 404)
    );

    await expect(client.fetchTagBySlug("a/b c")).rejects.toMatchObject({
      name: "UpstreamPublicDataError",
      status: 404,
    });
    expect(calls[0].pathname).toBe("/tags/slug/a%2Fb%20c");
    await expect(client.fetchTagBySlug("a/b c")).rejects.toBeInstanceOf(
      UpstreamPublicDataError
    );
  });
});

describe("fetchEventPage", () => {
  it("forwards the volume and liquidity floors as Gamma's volume_min and liquidity_min", async () => {
    const { client, calls } = createClient(() =>
      jsonResponse({ events: [], next_cursor: null })
    );

    await client.fetchEventPage({
      limit: 6,
      tagSlug: "politics",
      volumeMin: "1000",
      liquidityMin: "50.5",
    });

    expect(calls[0].pathname).toBe("/events/keyset");
    expect(Object.fromEntries(calls[0].searchParams)).toEqual({
      limit: "6",
      tag_slug: "politics",
      volume_min: "1000",
      liquidity_min: "50.5",
    });
  });
});
