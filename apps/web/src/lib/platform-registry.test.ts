// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPlatformRegistry, nextAwareFetch } from "./platform-registry";

const jsonResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => jsonResponse({}));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("nextAwareFetch", () => {
  it("maps a cache hint onto Next's revalidate and tags", async () => {
    await nextAwareFetch("https://example.test/a", {
      knowwCache: { revalidateSeconds: 60, tags: ["events"] },
    } as RequestInit);

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/a", {
      next: { revalidate: 60, tags: ["events"] },
    });
  });

  it("lets the caller's hint replace the platform client's cache mode", async () => {
    await nextAwareFetch("https://example.test/b", {
      cache: "no-store",
      knowwCache: { revalidateSeconds: 60 },
    } as RequestInit);

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/b", {
      next: { revalidate: 60 },
    });
  });

  it("passes the init through untouched when there is no hint", async () => {
    const init = { cache: "no-store" as const, headers: { accept: "*/*" } };

    await nextAwareFetch("https://example.test/c", init);

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/c", init);
  });

  it("treats revalidateSeconds 0 as no-store", async () => {
    await nextAwareFetch("https://example.test/d", {
      knowwCache: { revalidateSeconds: 0 },
    } as RequestInit);

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/d", {
      cache: "no-store",
    });
  });
});

describe("getPlatformRegistry", () => {
  it("returns one shared instance", () => {
    expect(getPlatformRegistry()).toBe(getPlatformRegistry());
  });

  it("routes adapter reads through the Next-aware fetch", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        id: "481717",
        slug: "fed-decision-in-september-762",
        title: "Fed Decision in September?",
        active: true,
        closed: false,
        markets: [],
      })
    );

    const event = await getPlatformRegistry()
      .getMarketDataAdapter("polymarket")
      .getEvent("481717", { cache: { revalidateSeconds: 30 } });

    expect(event.sourceEventId).toBe("481717");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(input)).toContain("/events/481717");
    expect(init).toMatchObject({ next: { revalidate: 30 } });
    expect(init).not.toHaveProperty("knowwCache");
  });
});
