// @vitest-environment node
import { createPlatformRegistry } from "@knoww/services/registry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as platformRegistry from "@/lib/platform-registry";
import { fetchSitemapEventRoutes } from "@/lib/sitemap-routes";
import { readSitemapEventPages } from "./sitemap-reads";

const fetchMock = vi.fn<typeof fetch>();
const jsonResponse = (events: unknown[], cursor: string | null = null) =>
  new Response(JSON.stringify({ events, next_cursor: cursor }));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(platformRegistry, "getPlatformRegistry").mockReturnValue(
    createPlatformRegistry({
      enabledPlatforms: ["polymarket"],
      fetchImpl: platformRegistry.nextAwareFetch,
      polymarket: { baseUrls: { gamma: "https://catalog.example.test" } },
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("sitemap platform reads", () => {
  it.each(["declared", "streamed"])(
    "retries a %s oversized page at the same cursor without losing earlier or later events",
    async (sizeSource) => {
      const oversizedCursors: Array<string | null> = [];
      fetchMock.mockImplementation(async (input) => {
        const url = new URL(String(input));
        if (url.searchParams.get("order") !== "volume") return jsonResponse([]);
        const cursor = url.searchParams.get("after_cursor");
        const limit = Number(url.searchParams.get("limit"));
        if (cursor === "second" && limit > 2) {
          oversizedCursors.push(cursor);
          return sizeSource === "declared"
            ? new Response("", {
                headers: { "content-length": String(4 * 1024 * 1024 + 1) },
              })
            : new Response("x".repeat(4 * 1024 * 1024 + 1));
        }
        if (!cursor) return jsonResponse([{ id: "1" }, { id: "2" }], "second");
        if (cursor === "second") {
          return jsonResponse([{ id: "3" }, { id: "4" }], "third");
        }
        return jsonResponse([{ id: "5" }]);
      });

      const events = await readSitemapEventPages("evergreen", (page) => page);

      expect(events).toEqual([1, 2, 3, 4, 5].map((id) => ({ id: String(id) })));
      expect(oversizedCursors.length).toBeGreaterThan(0);
      expect(new Set(oversizedCursors)).toEqual(new Set(["second"]));
    }
  );

  it("fails instead of returning a partial sitemap when one event exceeds the byte limit", async () => {
    const attemptedLimits: number[] = [];
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("order") !== "volume") return jsonResponse([]);
      if (!url.searchParams.has("after_cursor")) {
        return jsonResponse([{ id: "1" }], "oversized-event");
      }
      attemptedLimits.push(Number(url.searchParams.get("limit")));
      return new Response("", {
        headers: { "content-length": String(4 * 1024 * 1024 + 1) },
      });
    });

    await expect(
      readSitemapEventPages("evergreen", (page) => page)
    ).rejects.toThrow("Public data response exceeded its size limit");
    expect(attemptedLimits.at(-1)).toBe(1);
    expect(attemptedLimits.length).toBeLessThanOrEqual(8);
    expect(new Set(attemptedLimits).size).toBe(attemptedLimits.length);
  });

  it("uses the registry host, follows cursors, and preserves filters without caching raw pages", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const order = url.searchParams.get("order");
      const cursor = url.searchParams.get("after_cursor");
      return jsonResponse(
        [
          {
            id: `${order}-${cursor ?? "first"}`,
            slug: `${order}-${cursor ?? "first"}`,
          },
        ],
        cursor ? null : "second"
      );
    });

    const events = await readSitemapEventPages("evergreen", (page) => page);

    expect(events).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [input, init] of fetchMock.mock.calls) {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://catalog.example.test");
      expect(url.pathname).toBe("/events/keyset");
      expect(url.searchParams.get("closed")).toBe("true");
      expect(url.searchParams.get("archived")).toBe("false");
      expect(url.searchParams.get("ascending")).toBe("false");
      expect(url.searchParams.get("limit")).toBe(
        url.searchParams.has("after_cursor") ? "20" : "10"
      );
      expect(init?.cache).toBe("no-store");
    }
  });

  it("grows small successful pages so a full catalog scan does not need hundreds of requests", async () => {
    const limits: number[] = [];
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("order") !== "volume24hr")
        return jsonResponse([]);
      const offset = Number(url.searchParams.get("after_cursor") ?? 0);
      const limit = Number(url.searchParams.get("limit"));
      limits.push(limit);
      return jsonResponse(
        Array.from({ length: limit }, (_, index) => ({
          id: String(offset + index),
        })),
        String(offset + limit)
      );
    });

    const events = await readSitemapEventPages("active", (page) => page);

    expect(events).toHaveLength(1000);
    expect(limits.slice(0, 5)).toEqual([10, 20, 40, 80, 100]);
    expect(limits).toHaveLength(13);
    expect(limits.at(-1)).toBe(50);
  });

  it("bounds each catalog pass by source records even when all pages are filtered out", async () => {
    let nextCursor = 0;
    fetchMock.mockImplementation(async () =>
      jsonResponse(
        Array.from({ length: 120 }, (_, index) => ({ id: String(index) })),
        String(++nextCursor)
      )
    );
    const pageSizes: number[] = [];

    expect(
      await readSitemapEventPages("active", (page) => {
        pageSizes.push(page.length);
        return [];
      })
    ).toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(14);
    expect(pageSizes.reduce((sum, size) => sum + size, 0)).toBe(1500);
    expect(pageSizes).toContain(40);
    expect(pageSizes).toContain(20);
  });

  it("stops repeated cursors and empty pages", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      return url.searchParams.get("order") === "volume"
        ? jsonResponse([{ id: "1" }], "repeated")
        : jsonResponse([], "unused");
    });

    expect(
      await readSitemapEventPages("evergreen", (page) => page)
    ).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("omits a disabled platform without fetching its catalog", async () => {
    vi.mocked(platformRegistry.getPlatformRegistry).mockReturnValue(
      createPlatformRegistry({ enabledPlatforms: [] })
    );

    expect(await fetchSitemapEventRoutes("active")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves slim events and excludes archived and child records", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse([
        { id: "1", slug: "slim", title: "Slim event", marketCount: 1 },
        { id: "2", slug: "archived", title: "Archived event", archived: true },
        { id: "3", slug: "child", title: "Child event", parentEventId: "1" },
      ])
    );

    expect(await fetchSitemapEventRoutes("active")).toEqual([
      { url: "https://knoww.app/events/detail/slim" },
    ]);
  });

  it("builds historical routes despite obsolete quote fields that sitemap policy does not use", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse([
        {
          id: "1",
          slug: "historical-result",
          title: "Historical result",
          closed: true,
          markets: [
            {
              id: "1",
              closed: true,
              umaResolutionStatus: "resolved",
              outcomePrices: '["1", "0"]',
              bestAsk: 1.01,
            },
          ],
        },
      ])
    );
    expect(await fetchSitemapEventRoutes("evergreen")).toEqual([
      { url: "https://knoww.app/events/detail/historical-result" },
    ]);
  });

  it("rejects invalid upstream records instead of caching a partial sitemap", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse([{ slug: "missing-id" }])
    );

    await expect(fetchSitemapEventRoutes("active")).rejects.toThrow(
      "Public data request returned an invalid response"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([403, 429, 503])(
    "does not retry HTTP %s errors as oversized pages",
    async (status) => {
      fetchMock.mockImplementation(async () => new Response("", { status }));
      await expect(
        readSitemapEventPages("active", (page) => page)
      ).rejects.toThrow(`Public data request failed with ${status}`);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  );
});
