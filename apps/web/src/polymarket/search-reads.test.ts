import { afterEach, describe, expect, it, vi } from "vitest";
import { searchPolymarket } from "./search-reads";

describe("searchPolymarket", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("merges Gamma's public search with the tag-scoped lists through the web registry", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = new URL(String(input));
        const body = url.pathname.includes("keyset")
          ? { events: [] }
          : {
              events: [],
              tags: [],
              profiles: [],
              pagination: { hasMore: false, totalResults: 0 },
            };
        return {
          ok: true,
          status: 200,
          json: async () => body,
        } satisfies Partial<Response>;
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPolymarket("fed", 5, ["economy"]);

    expect(result).toMatchObject({
      events: [],
      pagination: { hasMore: false, totalResults: 0 },
    });
    expect(result.degraded).toBeFalsy();
    const urls = fetchMock.mock.calls.map((call) => new URL(String(call[0])));
    expect(urls.some((url) => url.searchParams.get("q") === "fed")).toBe(true);
    expect(
      urls.some((url) => url.searchParams.get("tag_slug") === "economy")
    ).toBe(true);
    // Route reads stay out of Next's data cache; the route keeps its own.
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ cache: "no-store" });
    }
  });
});
