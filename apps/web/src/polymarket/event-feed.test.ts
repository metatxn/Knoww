import { describe, expect, it, vi } from "vitest";
import { cardFeedQuerySchema, decodeCardCursor } from "./card-feed-query";
import { readCardFeed, readFullEventFeed } from "./event-feed";

function gammaSource(count: number, maxRows = 100) {
  const events = Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    slug: `event-${i + 1}`,
    title: `Event ${i + 1}`,
    markets: [],
  }));
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      const limit = Number(url.searchParams.get("limit"));
      if (limit > maxRows)
        return new Response("", {
          headers: { "content-length": String(4 * 1024 * 1024 + 1) },
        });
      const cursor = url.searchParams.get("after_cursor");
      const start = cursor ? Number(cursor.slice(6)) - 1 : 0;
      const page = events.slice(start, start + limit);
      return Response.json({
        events: page,
        next_cursor: start + limit < count ? `gamma-${page.at(-1)?.id}` : null,
      });
    }
  );
  return { fetchImpl, calls };
}

describe("bounded event feed", () => {
  it("returns two complete 20-card pages with no gaps, duplicate boundaries, or raw caching", async () => {
    const source = gammaSource(40);
    const first = await readCardFeed(cardFeedQuerySchema.parse({}), source);
    expect(first.events.map((e) => e.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1))
    );
    expect(decodeCardCursor(first.nextCursor ?? undefined)).toEqual({
      cursor: "gamma-20",
      lastId: "20",
    });
    expect(source.calls).toHaveLength(5);
    const second = await readCardFeed(
      cardFeedQuerySchema.parse({ after_cursor: first.nextCursor }),
      source
    );
    expect(second.events.map((e) => e.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 21))
    );
    expect(second.nextCursor).toBeNull();
    expect(source.calls).toHaveLength(10);
    for (const { init } of source.calls) {
      expect(init).toMatchObject({
        cache: "no-store",
        knowwCache: { revalidateSeconds: 0 },
      });
      expect(init).not.toHaveProperty("next");
    }
  });

  it("preserves a 50-event sports response when oversized batches need splitting", async () => {
    const source = gammaSource(60, 12);
    const page = await readFullEventFeed(
      { limit: 50, closed: false, seriesIds: [42], active: true },
      undefined,
      source
    );
    expect(page.events).toHaveLength(50);
    expect(page.events.map((e) => e.id)).toEqual(
      Array.from({ length: 50 }, (_, i) => String(i + 1))
    );
    expect(page.nextCursor).toBe("gamma-50");
    expect(
      source.calls.map((call) => call.url.searchParams.get("limit"))
    ).toEqual(["50", "25", "12", "12", "12", "12", "6"]);
    expect(
      source.calls.every(
        (call) => call.url.searchParams.get("series_id") === "42"
      )
    ).toBe(true);
  });

  it("fills a small page after a size fallback", async () => {
    const source = gammaSource(8, 2);
    const page = await readCardFeed(
      cardFeedQuerySchema.parse({ limit: 4 }),
      source
    );
    expect(page.events.map((e) => e.id)).toEqual(["1", "2", "3", "4"]);
    expect(decodeCardCursor(page.nextCursor ?? undefined)).toEqual({
      cursor: "gamma-4",
      lastId: "4",
    });
  });

  it.each([50, 100])(
    "preserves every nested market in a large %i-event full page",
    async (limit) => {
      const events = Array.from({ length: limit + 10 }, (_, i) => ({
        id: String(i + 1),
        title: `Game ${i + 1}`,
        markets: Array.from({ length: 8 }, (_, j) => ({
          id: `${i}-${j}`,
          question: `Outcome ${j}`,
          description: "x".repeat(12_000),
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.4","0.6"]',
          clobTokenIds: '["123","456"]',
        })),
      }));
      const calls: number[] = [];
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const size = Number(url.searchParams.get("limit"));
        calls.push(size);
        const start = Number(url.searchParams.get("after_cursor") ?? 0);
        return Response.json({
          events: events.slice(start, start + size),
          next_cursor:
            start + size < events.length ? String(start + size - 1) : null,
        });
      });
      const page = await readFullEventFeed(
        { limit, closed: false },
        undefined,
        { fetchImpl }
      );
      expect(page.events.map((event) => event.id)).toEqual(
        events.slice(0, limit).map((event) => event.id)
      );
      expect(page.events.every((event) => event.markets?.length === 8)).toBe(
        true
      );
      expect(page.events[0]?.markets?.[0]).toMatchObject({
        id: "0-0",
        question: "Outcome 0",
        outcomePrices: '["0.4","0.6"]',
      });
      expect(calls.length).toBeLessThanOrEqual(8);
      expect(calls).toContain(25);
      expect(page.nextCursor).toBe(String(limit - 1));
    }
  );

  it("never trims an unseen tail when Gamma omits the inclusive boundary", async () => {
    const ids: string[] = [];
    let cursor: string | null = null;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const start = Number(url.searchParams.get("after_cursor") ?? 0);
      const size = Number(url.searchParams.get("limit"));
      const end = Math.min(45, start + size);
      return Response.json({
        events: Array.from({ length: end - start }, (_, i) => ({
          id: String(start + i + 1),
          markets: [],
        })),
        next_cursor: end < 45 ? String(end) : null,
      });
    });
    do {
      const page = await readCardFeed(
        cardFeedQuerySchema.parse({ after_cursor: cursor ?? undefined }),
        { fetchImpl }
      );
      ids.push(...page.events.map((event) => event.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toEqual(Array.from({ length: 45 }, (_, i) => String(i + 1)));
  });

  it("fails explicitly when the request budget cannot fill the page", async () => {
    const source = gammaSource(40, 2);
    await expect(
      readCardFeed(cardFeedQuerySchema.parse({}), source)
    ).rejects.toThrow("budget exceeded");
    expect(source.calls).toHaveLength(6);
  });

  it("rejects a stalled cursor instead of publishing a short complete page", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        events: [{ id: "1", title: "One", markets: [] }],
        next_cursor: "same",
      })
    );
    await expect(
      readCardFeed(cardFeedQuerySchema.parse({}), { fetchImpl })
    ).rejects.toThrow("did not advance");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry HTTP or schema failures", async () => {
    for (const response of [
      new Response("down", { status: 503 }),
      Response.json({ events: [{ markets: [] }] }),
    ]) {
      const fetchImpl = vi.fn(async () => response);
      await expect(
        readCardFeed(cardFeedQuerySchema.parse({}), { fetchImpl })
      ).rejects.toThrow();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("aborts the upstream read at the overall deadline", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true }
          );
        })
    );
    try {
      const pending = readCardFeed(cardFeedQuerySchema.parse({}), {
        fetchImpl,
        timeoutMs: 100,
      });
      const rejected = expect(pending).rejects.toMatchObject({
        name: "AbortError",
      });
      await vi.advanceTimersByTimeAsync(100);
      await rejected;
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects an oversized projected page instead of caching it", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        events: Array.from({ length: 5 }, (_, i) => ({
          id: String(i),
          title: "x".repeat(150_000),
          markets: [],
        })),
        next_cursor: null,
      })
    );
    await expect(
      readCardFeed(cardFeedQuerySchema.parse({}), { fetchImpl })
    ).rejects.toThrow("output budget exceeded");
  });

  it("keeps tab exclusions and validated filters on every raw request", async () => {
    const source = gammaSource(20);
    await readCardFeed(
      cardFeedQuerySchema.parse({
        feed: "new",
        volume24hr_min: "10",
        volume1wk_min: "100",
        tag_slug: "politics",
        end_date_min: "2026-09-27",
      }),
      source
    );
    for (const { url } of source.calls) {
      expect(url.searchParams.getAll("exclude_tag_id")).toEqual([
        "100639",
        "102169",
      ]);
      expect(url.searchParams.get("order")).toBe("startDate");
      expect(url.searchParams.get("volume_min")).toBe("100");
      expect(url.searchParams.get("tag_slug")).toBe("politics");
      expect(url.searchParams.get("end_date_min")).toBe("2026-09-27");
    }
  });
});
