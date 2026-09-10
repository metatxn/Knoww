import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLeaderboardRows, fetchTagRecord } from "./profile-reads";

const WALLET = `0x${"b".repeat(40)}`;

function stubFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
  } satisfies Partial<Response>);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchLeaderboardRows", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the Data API rows untouched, under the leaderboard page's cache hint", async () => {
    const row = {
      rank: "1",
      proxyWallet: WALLET,
      userName: null,
      vol: 1000.5,
      pnl: -12.25,
      profileImage: null,
      xUsername: null,
      verifiedBadge: false,
    };
    const fetchMock = stubFetch([row]);

    const rows = await fetchLeaderboardRows(
      {
        category: "OVERALL",
        timePeriod: "DAY",
        orderBy: "PNL",
        limit: 25,
        offset: 0,
      },
      { revalidateSeconds: 60 }
    );

    expect(rows).toEqual([row]);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/v1/leaderboard");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      category: "OVERALL",
      timePeriod: "DAY",
      orderBy: "PNL",
      limit: "25",
      offset: "0",
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      next: { revalidate: 60 },
    });
  });
});

describe("fetchTagRecord", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the Gamma tag record untouched, under the tag page's cache hint", async () => {
    const record = {
      id: 745,
      label: "NBA",
      slug: "nba",
      description: "Basketball markets",
    };
    const fetchMock = stubFetch(record);

    const result = await fetchTagRecord("nba", { revalidateSeconds: 3600 });

    expect(result).toEqual(record);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/tags/slug/nba");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      next: { revalidate: 3600 },
    });
  });

  it("reports a missing tag with the upstream status", async () => {
    stubFetch({ error: "not found" }, 404);

    await expect(
      fetchTagRecord("nope", { revalidateSeconds: 3600 })
    ).rejects.toMatchObject({ status: 404 });
  });
});
