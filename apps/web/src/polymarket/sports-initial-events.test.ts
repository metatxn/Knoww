import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSportsInitialEvents } from "./sports-initial-events";

afterEach(() => vi.unstubAllGlobals());

describe("sports initial inventory", () => {
  it("retries oversized batches without losing images or changing the tag filter", async () => {
    const calls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        calls.push(url);
        if (Number(url.searchParams.get("limit")) > 1) {
          return new Response("", {
            headers: { "content-length": String(4 * 1024 * 1024 + 1) },
          });
        }
        return Response.json({
          events: [
            {
              id: "1",
              image: "https://example.com/game.png",
              markets: [
                {
                  id: "market-1",
                  outcomes: '["Yes","No"]',
                  clobTokenIds: '["123","456"]',
                },
              ],
            },
          ],
          next_cursor: "next",
        });
      })
    );
    await expect(fetchSportsInitialEvents("nfl")).resolves.toEqual({
      events: [{ id: "1", image: "https://example.com/game.png" }],
    });
    expect(calls.map((url) => url.searchParams.get("limit"))).toEqual([
      "6",
      "3",
      "1",
    ]);
    expect(
      calls.every(
        (url) =>
          url.searchParams.get("tag_slug") === "nfl" &&
          url.searchParams.get("closed") === "false"
      )
    ).toBe(true);
  });

  it("prefers the series filter for configured leagues", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ events: [], next_cursor: null }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSportsInitialEvents("nba", 10345)).resolves.toEqual({
      events: [],
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("series_id")).toBe("10345");
    expect(url.searchParams.get("active")).toBe("true");
    expect(url.searchParams.has("tag_slug")).toBe(false);
  });

  it.each([503, 429])(
    "propagates HTTP %s instead of making the category empty",
    async (status) => {
      const fetchMock = vi
        .fn()
        .mockImplementation(() => new Response("down", { status }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(fetchSportsInitialEvents("golf")).rejects.toThrow(
        String(status)
      );
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

  it("stops when one event still exceeds the response budget", async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response("", {
          headers: { "content-length": String(4 * 1024 * 1024 + 1) },
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSportsInitialEvents("nfl")).rejects.toThrow(
      "exceeded its size limit"
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry malformed payloads", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Response.json({ events: [{ id: null }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSportsInitialEvents("nfl")).rejects.toThrow(
      "invalid response"
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
