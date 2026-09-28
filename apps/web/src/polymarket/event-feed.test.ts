import { describe, expect, it, vi } from "vitest";
import {
  cardFeedQuerySchema,
  decodeCardCursor,
  encodeCardCursor,
} from "./card-feed-query";
import { readCardFeed, readFullEventFeed } from "./event-feed";

function gammaSource(count: number, maxRows = 100, latencyMs = 0) {
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
      if (latencyMs) {
        await new Promise<void>((resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) return reject(signal.reason);
          const abort = () => {
            clearTimeout(timer);
            reject(signal?.reason);
          };
          const timer = setTimeout(() => {
            signal?.removeEventListener("abort", abort);
            resolve();
          }, latencyMs);
          signal?.addEventListener("abort", abort, { once: true });
        });
      }
      const limit = Number(url.searchParams.get("limit"));
      if (limit > maxRows)
        return new Response("", {
          headers: { "content-length": String(6 * 1024 * 1024) },
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
  it.each([
    { limit: 20, latencyMs: 500 },
    { limit: 10, latencyMs: 900 },
  ])(
    "returns cards before the deadline after downsizing $limit rows at $latencyMs ms per request",
    async ({ limit, latencyMs }) => {
      vi.useFakeTimers();
      try {
        const source = gammaSource(40, 2, latencyMs);
        const startedAt = Date.now();
        const pending = readCardFeed(
          cardFeedQuerySchema.parse({ limit }),
          source
        ).then(
          (page) => ({ page, elapsedMs: Date.now() - startedAt }),
          (error) => ({ error })
        );
        await vi.advanceTimersByTimeAsync(8500);
        const result = await pending;
        expect(result).not.toHaveProperty("error");
        if (!("page" in result)) throw result.error;
        expect(result.elapsedMs).toBeLessThan(4000);
        expect(result.page.events.map((event) => event.id)).toEqual(["1", "2"]);
        expect(result.page.nextCursor).toBeTruthy();

        const before = source.calls.length;
        const continuation = readCardFeed(
          cardFeedQuerySchema.parse({
            limit,
            after_cursor: result.page.nextCursor,
          }),
          source
        );
        await vi.advanceTimersByTimeAsync(8500);
        expect((await continuation).events.map((event) => event.id)).toEqual([
          "3",
        ]);
        expect(
          source.calls
            .slice(before)
            .map((call) => call.url.searchParams.get("limit"))
        ).toEqual(["2"]);
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it("returns one upstream batch per page without gaps, duplicate boundaries, or raw caching", async () => {
    const source = gammaSource(40);
    const first = await readCardFeed(
      cardFeedQuerySchema.parse({ limit: 20 }),
      source
    );
    expect(first.events.map((e) => e.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1))
    );
    expect(decodeCardCursor(first.nextCursor ?? undefined)).toEqual({
      cursor: "gamma-20",
      lastId: "20",
      batchSize: 20,
    });
    expect(source.calls).toHaveLength(1);
    const second = await readCardFeed(
      cardFeedQuerySchema.parse({ limit: 20, after_cursor: first.nextCursor }),
      source
    );
    expect(second.events.map((e) => e.id)).toEqual(
      Array.from({ length: 19 }, (_, i) => String(i + 21))
    );
    const third = await readCardFeed(
      cardFeedQuerySchema.parse({ limit: 20, after_cursor: second.nextCursor }),
      source
    );
    expect(third.events.map((event) => event.id)).toEqual(["40"]);
    expect(third.nextCursor).toBeNull();
    expect(source.calls).toHaveLength(3);
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

  it("returns a short page and remembers its batch size after a size fallback", async () => {
    const source = gammaSource(8, 2);
    const page = await readCardFeed(
      cardFeedQuerySchema.parse({ limit: 4 }),
      source
    );
    expect(page.events.map((e) => e.id)).toEqual(["1", "2"]);
    expect(decodeCardCursor(page.nextCursor ?? undefined)).toEqual({
      cursor: "gamma-2",
      lastId: "2",
      batchSize: 2,
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

  it.each([10, 20])(
    "keeps every event reachable with limit %i after shrinking to two-event batches",
    async (limit) => {
      const source = gammaSource(limit * 2, 2);
      const ids: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        expect(++pages).toBeLessThanOrEqual(limit * 2);
        const before = source.calls.length;
        const page = await readCardFeed(
          cardFeedQuerySchema.parse({
            limit,
            after_cursor: cursor ?? undefined,
          }),
          source
        );
        expect(page.events.length).toBeGreaterThan(0);
        expect(page.events.length).toBeLessThanOrEqual(limit);
        if (cursor) expect(source.calls.length - before).toBe(1);
        ids.push(...page.events.map((event) => event.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(ids).toEqual(
        Array.from({ length: limit * 2 }, (_, i) => String(i + 1))
      );
    }
  );

  it("accepts a card-source response between four and five MiB while returning a small projection", async () => {
    const page = await readCardFeed(cardFeedQuerySchema.parse({ limit: 1 }), {
      fetchImpl: async () =>
        Response.json({
          events: [
            {
              id: "1",
              description: "x".repeat(4.5 * 1024 * 1024),
              markets: [],
            },
          ],
          next_cursor: null,
        }),
    });
    expect(page.events).toHaveLength(1);
    expect(JSON.stringify(page)).not.toContain("description");
    expect(
      new TextEncoder().encode(JSON.stringify(page)).byteLength
    ).toBeLessThan(1024);
  });

  it("still rejects a single event above the five MiB source limit", async () => {
    await expect(
      readCardFeed(cardFeedQuerySchema.parse({ limit: 1 }), {
        fetchImpl: async () =>
          new Response("", {
            headers: { "content-length": String(5 * 1024 * 1024 + 1) },
          }),
      })
    ).rejects.toMatchObject({ cause: { reason: "too_large" } });
  });

  it("rejects a stalled continuation instead of publishing duplicate cards", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        events: [{ id: "1", title: "One", markets: [] }],
        next_cursor: "same",
      })
    );
    const first = await readCardFeed(cardFeedQuerySchema.parse({}), {
      fetchImpl,
    });
    await expect(
      readCardFeed(
        cardFeedQuerySchema.parse({ after_cursor: first.nextCursor }),
        { fetchImpl }
      )
    ).rejects.toThrow("did not advance");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("continues cached legacy cursors", async () => {
    const page = await readCardFeed(
      cardFeedQuerySchema.parse({
        limit: 2,
        after_cursor: encodeCardCursor("gamma-2", "2"),
      }),
      gammaSource(4)
    );
    expect(page.events.map((event) => event.id)).toEqual(["3"]);
    expect(page.nextCursor).toMatch(/^cards-v2\./);
  });

  it("probes one-card inclusive continuations without skipping a boundary", async () => {
    const source = gammaSource(3);
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await readCardFeed(
        cardFeedQuerySchema.parse({
          limit: 1,
          after_cursor: cursor ?? undefined,
        }),
        source
      );
      expect(page.events).toHaveLength(1);
      ids.push(page.events[0].id);
      cursor = page.nextCursor;
      expect(source.calls.length).toBeLessThanOrEqual(5);
    } while (cursor);
    expect(ids).toEqual(["1", "2", "3"]);
    expect(
      source.calls.map((call) => call.url.searchParams.get("limit"))
    ).toEqual(["1", "1", "2", "1", "2"]);
  });

  it("keeps one-card exclusive continuations to one unseen row", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("limit")).toBe("1");
      const id = Number(url.searchParams.get("after_cursor") ?? 0) + 1;
      return Response.json({
        events: [{ id: String(id), markets: [] }],
        next_cursor: id < 3 ? String(id) : null,
      });
    });
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await readCardFeed(
        cardFeedQuerySchema.parse({
          limit: 1,
          after_cursor: cursor ?? undefined,
        }),
        { fetchImpl }
      );
      expect(page.events).toHaveLength(1);
      ids.push(page.events[0].id);
      cursor = page.nextCursor;
      expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(3);
    } while (cursor);
    expect(ids).toEqual(["1", "2", "3"]);
  });

  it("ends an inclusive continuation containing only the last seen event", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        events: [{ id: "last", markets: [] }],
        next_cursor: null,
      })
    );
    const page = await readCardFeed(
      cardFeedQuerySchema.parse({
        limit: 1,
        after_cursor: encodeCardCursor("end", "last", 1),
      }),
      { fetchImpl }
    );
    expect(page.events).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects an overfilled one-card page if the boundary shifts during its probe", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          events: [{ id: "1", markets: [] }],
          next_cursor: "gamma-1",
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          events: [
            { id: "2", markets: [] },
            { id: "3", markets: [] },
          ],
          next_cursor: "gamma-3",
        })
      );
    await expect(
      readCardFeed(
        cardFeedQuerySchema.parse({
          limit: 1,
          after_cursor: encodeCardCursor("gamma-1", "1", 1),
        }),
        { fetchImpl }
      )
    ).rejects.toThrow("card count");
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
