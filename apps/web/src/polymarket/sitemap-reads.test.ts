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
      expect(url.searchParams.get("limit")).toBe("100");
      expect(init?.cache).toBe("no-store");
    }
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

  it("rejects invalid upstream records instead of caching a partial sitemap", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse([{ slug: "missing-id" }])
    );

    await expect(fetchSitemapEventRoutes("active")).rejects.toThrow(
      "Public data request returned an invalid response"
    );
  });
});
