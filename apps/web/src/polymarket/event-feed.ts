import { createLogger } from "@knoww/logger";
import {
  createPolymarketClient,
  type EventPageParams,
  isUpstreamPublicDataError,
} from "@knoww/services/platforms/polymarket";
import {
  BoundedJsonError,
  DEFAULT_UPSTREAM_JSON_MAX_BYTES,
} from "@knoww/shared-types/bounded-json";
import { toSlimGammaEvent } from "@/lib/gamma-keyset";
import type { GammaEvent } from "@/types/gamma-api";
import {
  type CardFeedQuery,
  decodeCardCursor,
  encodeCardCursor,
} from "./card-feed-query";
import { toEventCard } from "./event-card-projection";

const log = createLogger("event-feed");
export const CARD_PAGE_MAX_BYTES = 512 * 1024;
const CARD_UPSTREAM_MAX_BYTES = 5 * 1024 * 1024;
export const FEED_TIMEOUT_MS = 8500;

interface ReadOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function assemblePage<T>(
  params: EventPageParams,
  project: (event: GammaEvent) => T,
  previousId: string | undefined,
  initialBatchSize: number,
  maxAttempts: number,
  maxBytes: number,
  options: ReadOptions,
  upstreamMaxBytes = DEFAULT_UPSTREAM_JSON_MAX_BYTES,
  singleBatch = false
) {
  const client = createPolymarketClient({ fetchImpl: options.fetchImpl });
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? FEED_TIMEOUT_MS
  );
  let cursor = params.cursor;
  let batchSize = initialBatchSize;
  let attempts = 0;
  let resultBytes = 0;
  let lastId = previousId;
  let totalResults: number | undefined;
  const events: T[] = [];
  const seen = new Set(previousId ? [previousId] : []);
  const startedAt = Date.now();
  try {
    while (true) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (++attempts > maxAttempts)
        throw new Error("Event feed request budget exceeded");
      const limit = Math.min(
        batchSize,
        params.limit - events.length + (cursor ? 1 : 0)
      );
      let page: Awaited<ReturnType<typeof client.fetchEventPage>>;
      try {
        page = await client.fetchEventPage(
          { ...params, cursor, limit },
          {
            signal: controller.signal,
            cache: { revalidateSeconds: 0 },
            maxResponseBytes: upstreamMaxBytes,
          }
        );
      } catch (error) {
        const minimum = cursor ? 2 : 1;
        if (
          !controller.signal.aborted &&
          limit > minimum &&
          isUpstreamPublicDataError(error) &&
          error.cause instanceof BoundedJsonError &&
          error.cause.reason === "too_large"
        ) {
          batchSize = Math.max(minimum, Math.floor(limit / 2));
          continue;
        }
        throw error;
      }
      totalResults ??= page.totalResults;
      if (page.rawEvents.length > limit)
        throw new Error("Upstream exceeded the requested event count");
      const before = events.length;
      for (const event of page.rawEvents) {
        const id = String(event.id);
        lastId = id;
        if (seen.has(id)) continue;
        seen.add(id);
        const projected = project(event as GammaEvent);
        resultBytes +=
          new TextEncoder().encode(JSON.stringify(projected)).byteLength + 1;
        if (resultBytes > maxBytes - 8192)
          throw new Error("Event feed output budget exceeded");
        events.push(projected);
      }
      if (singleBatch && events.length > params.limit)
        throw new Error("Event feed exceeded the requested card count");
      // A one-card request must first probe the cursor boundary: Gamma can
      // include it or start after it. Only grow when the row was already seen.
      if (
        singleBatch &&
        cursor &&
        limit === 1 &&
        page.rawEvents.length === 1 &&
        events.length === before &&
        page.nextCursor
      ) {
        batchSize = 2;
        continue;
      }
      if (
        page.nextCursor &&
        (page.nextCursor === cursor || events.length === before)
      ) {
        throw new Error("Event feed cursor did not advance");
      }
      cursor = page.nextCursor ?? undefined;
      // The raw page and its validated clone leave scope before the next fetch.
      if (singleBatch || events.length >= params.limit || !cursor) break;
    }
    log.info("read.finished", {
      attempts,
      count: events.length,
      outputBytes: resultBytes,
      durationMs: Date.now() - startedAt,
    });
    return {
      events,
      nextCursor: cursor ?? null,
      lastId,
      totalResults,
      batchSize,
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

export async function readCardFeed(
  query: CardFeedQuery,
  options: ReadOptions = {}
) {
  const continuation = decodeCardCursor(query.after_cursor);
  const batchSize = Math.min(
    query.limit,
    continuation?.batchSize ?? query.limit
  );
  const page = await assemblePage(
    {
      limit: query.limit,
      cursor: continuation?.cursor,
      closed: query.closed === "true",
      ascending: query.feed === "categories" && query.ascending === "true",
      order:
        query.feed === "new"
          ? "startDate"
          : query.feed === "trending"
            ? "volume"
            : query.feed === "breaking"
              ? "volume24hr"
              : query.order,
      tagSlug: query.tag_slug,
      excludeTagIds: query.feed === "categories" ? undefined : [100639, 102169],
      volumeMin: query.volume1wk_min ?? query.volume24hr_min,
      liquidityMin: query.liquidity_min,
      live: query.live === "true" ? true : undefined,
      startDateMin: query.start_date_min,
      startDateMax: query.start_date_max,
      endDateMin: query.end_date_min,
      endDateMax: query.end_date_max,
    },
    toEventCard,
    continuation?.lastId,
    batchSize,
    // Only size reductions and a possible one-row cursor probe may add reads.
    // Return the first successful batch; never fill a page with serial reads.
    1 +
      Math.floor(Math.log2(batchSize)) +
      (continuation && batchSize === 1 ? 1 : 0),
    CARD_PAGE_MAX_BYTES,
    options,
    CARD_UPSTREAM_MAX_BYTES,
    true
  );
  return {
    events: page.events,
    nextCursor:
      page.nextCursor && page.lastId
        ? encodeCardCursor(page.nextCursor, page.lastId, page.batchSize)
        : null,
    totalResults: page.totalResults,
  };
}

/** Full-mode callers keep every market and either get a complete page or an error. */
export async function readFullEventFeed(
  params: EventPageParams,
  previousId?: string,
  options: ReadOptions = {}
) {
  const { batchSize: _batchSize, ...page } = await assemblePage(
    params,
    (event) => toSlimGammaEvent(event, true),
    previousId,
    params.limit + (params.cursor ? 1 : 0),
    8,
    4 * 1024 * 1024,
    options
  );
  return page;
}
