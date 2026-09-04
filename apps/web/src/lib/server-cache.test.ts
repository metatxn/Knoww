import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getEvent,
  getInitialEvents,
  getInitialEventsByTagStrict,
  getInitialLeaderboard,
  getRelatedEventsByTag,
  getTagDetails,
} from "./server-cache";

describe("getInitialEvents", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps market outcome fields in initial events for stable card SSR", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [
          {
            id: "event-1",
            slug: "event-one",
            title: "Event one",
            markets: [
              {
                id: "market-1",
                question: "Will it happen?",
                outcomes: JSON.stringify(["Yes", "No"]),
                outcomePrices: JSON.stringify(["0.61", "0.39"]),
                groupItemTitle: "Yes",
                clobTokenIds: JSON.stringify(["token-yes", "token-no"]),
              },
            ],
          },
        ],
        next_cursor: "next",
        total_results: "1",
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const result = await getInitialEvents();

    expect(result?.events[0]?.markets?.[0]).toMatchObject({
      id: "market-1",
      question: "Will it happen?",
      outcomes: JSON.stringify(["Yes", "No"]),
      outcomePrices: JSON.stringify(["0.61", "0.39"]),
      groupItemTitle: "Yes",
    });
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("limit")).toBe("6");
  });
});

describe("tag event fetch policies", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws on a transient category fetch failure instead of returning an empty state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Gamma down")));

    await expect(
      getInitialEventsByTagStrict("strict-failure-test")
    ).rejects.toThrow("Gamma down");
  });

  it("limits related-event requests to a small payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [],
        next_cursor: null,
        total_results: 0,
      }),
    } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    await getRelatedEventsByTag("related-payload-test");

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("limit")).toBe("6");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
    });
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("next");
  });
});

describe("getEvent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null only when the event genuinely does not exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } satisfies Partial<Response>)
    );

    await expect(getEvent("missing-event-slug")).resolves.toBeNull();
  });

  it("treats an invalid upstream slug as not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
      } satisfies Partial<Response>)
    );

    await expect(getEvent("esportsworldcup.com")).resolves.toBeNull();
  });

  // A 404 lets the route call notFound(), which drops the URL from Google's
  // index. Transient upstream failures must NOT do that — they throw so the
  // route renders a 5xx that Googlebot retries instead.
  it("throws instead of reporting not-found when upstream fails transiently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      } satisfies Partial<Response>)
    );

    await expect(getEvent("upstream-unavailable-slug")).rejects.toThrow(/503/);
  });

  it("throws when the upstream request fails at the network level", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("socket hang up"))
    );

    await expect(getEvent("network-failure-slug")).rejects.toThrow(
      "socket hang up"
    );
  });

  it("still resolves the event when only the child-event fan-out fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            id: "event-9",
            slug: "event-nine",
            markets: [],
          }),
        } satisfies Partial<Response>)
        .mockRejectedValueOnce(new Error("children unavailable"))
    );

    await expect(getEvent("event-nine")).resolves.toMatchObject({
      id: "event-9",
      slug: "event-nine",
    });
  });

  it("bypasses Next's R2-backed data cache for event detail reads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "event-cache",
          slug: "event-cache",
          markets: [],
        }),
      } satisfies Partial<Response>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    await getEvent("event-cache");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ cache: "no-store" });
      expect(init).not.toHaveProperty("next");
    }
  });

  it("folds open negRisk child markets into the parent's market list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "event-1",
          slug: "event-one",
          markets: [{ id: "m1", conditionId: "0xa", question: "Parent?" }],
        }),
      } satisfies Partial<Response>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "41001",
            title: "Most Sixes",
            markets: [
              { id: "m2", conditionId: "0xb", question: "Child?" },
              { id: "m1", conditionId: "0xa", question: "Already listed" },
            ],
          },
        ],
      } satisfies Partial<Response>);
    vi.stubGlobal("fetch", fetchMock);

    const event = await getEvent("event-one");

    expect(event?.markets).toEqual([
      { id: "m1", conditionId: "0xa", question: "Parent?" },
      {
        id: "m2",
        conditionId: "0xb",
        question: "Child?",
        parentEventId: "41001",
        parentEventTitle: "Most Sixes",
      },
    ]);
    const childUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(childUrl.searchParams.get("parent_event_id")).toBe("event-1");
    expect(childUrl.searchParams.get("closed")).toBe("false");
  });
});

function stubJsonFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
  } satisfies Partial<Response>);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("getTagDetails", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves Gamma's label and description under the sports-list cache hint", async () => {
    const fetchMock = stubJsonFetch({
      id: 745,
      label: "NBA",
      slug: "nba",
      description: "Basketball markets",
    });

    await expect(getTagDetails("nba")).resolves.toEqual({
      slug: "nba",
      label: "NBA",
      description: "Basketball markets",
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/tags/slug/nba");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      next: { revalidate: 3600 },
    });
  });

  it("falls back to the known definition when Gamma has no record for a category", async () => {
    stubJsonFetch({ error: "not found" }, 404);

    await expect(getTagDetails("politics")).resolves.toEqual({
      slug: "politics",
      label: "Politics",
      description: "Political events, elections, and government decisions",
    });
  });

  it("reports an unknown tag Gamma rejects as missing", async () => {
    stubJsonFetch({ error: "not found" }, 404);

    await expect(getTagDetails("unknown-thing")).resolves.toBeNull();
  });

  it("formats the slug as the label when the lookup fails outright", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Gamma down")));

    await expect(getTagDetails("made-up")).resolves.toEqual({
      slug: "made-up",
      label: "Made Up",
    });
  });
});

describe("getInitialLeaderboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const row = {
    rank: "1",
    proxyWallet: `0x${"b".repeat(40)}`,
    userName: "alice",
    vol: 1000.5,
    pnl: -12.25,
    profileImage: null,
    xUsername: null,
    verifiedBadge: true,
  };

  it("serves the daily overall P&L leaderboard rows as the Data API sent them", async () => {
    const fetchMock = stubJsonFetch([row]);

    await expect(getInitialLeaderboard()).resolves.toEqual({
      traders: [row],
      category: "OVERALL",
      timePeriod: "DAY",
      orderBy: "PNL",
      total: 1,
    });
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

  it("returns null when the Data API answers with an error status", async () => {
    stubJsonFetch({ error: "unavailable" }, 503);

    await expect(getInitialLeaderboard()).resolves.toBeNull();
  });

  it("returns null when the Data API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("socket hang up"))
    );

    await expect(getInitialLeaderboard()).resolves.toBeNull();
  });
});
