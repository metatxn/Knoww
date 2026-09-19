import { type CanonicalEvent, isPlatformError } from "@knoww/services/core";
import type {
  EventPageParams,
  GammaEventLike,
} from "@knoww/services/platforms/polymarket";
import type {
  ServiceCacheHint,
  ServiceFetchOptions,
} from "@knoww/services/registry";
import { logger } from "@/lib/logger";
import { getPlatformRegistry } from "@/lib/platform-registry";
import type { GammaEventFull, InitialHomeData } from "@/lib/server-cache";
import {
  mergeChildMarkets,
  toGammaEventFull,
  toInitialHomeData,
  toInitialHomeDataFromGamma,
} from "./event-view-model";

/**
 * Polymarket event reads for apps/web, served in the Gamma shapes the pages
 * and routes always rendered.
 *
 * Listing and event detail are canonical reads through the registry's
 * market-data adapter; every canonical Polymarket event carries the record
 * Gamma sent, and the view-models hand that record back. Gamma's series
 * filter and keyset paging have no canonical counterpart yet, so those talk
 * to the platform client directly, which is what this folder is for.
 */

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface TagEventPageInput {
  /** A Gamma tag slug; omitted lists every active event. */
  tagSlug?: string;
  limit: number;
  cache: ServiceCacheHint;
}

/** The home and category listing: active events, busiest first. */
export async function fetchTagEventPage(
  input: TagEventPageInput
): Promise<InitialHomeData> {
  const page = await getPlatformRegistry()
    .getMarketDataAdapter("polymarket")
    .listEvents(
      {
        tag: input.tagSlug,
        sort: "volume24h",
        limit: input.limit,
        status: "active",
      },
      { cache: input.cache }
    );
  return toInitialHomeData(page);
}

export interface SeriesEventPageInput {
  seriesId: number;
  limit: number;
  cache: ServiceCacheHint;
}

/** The sports category listing, which Gamma filters by `series_id`. */
export async function fetchSeriesEventPage(
  input: SeriesEventPageInput
): Promise<InitialHomeData> {
  const { client } = getPlatformRegistry().getPlatformAdapter("polymarket");
  const page = await client.fetchEventPage(
    {
      limit: input.limit,
      closed: false,
      seriesIds: [input.seriesId],
      active: true,
      order: "volume24hr",
      ascending: false,
    },
    { cache: input.cache }
  );
  return toInitialHomeDataFromGamma(page);
}

/** One Gamma keyset page, as the platform client returns it. */
export interface KeysetEventPage {
  rawEvents: readonly GammaEventLike[];
  nextCursor: string | null;
}

/**
 * A Gamma keyset page with the caller's filters sent verbatim. This is the
 * `/api/events/paginated` read, whose clients walk Gamma's cursor themselves.
 */
export async function fetchKeysetEventPage(
  params: EventPageParams,
  cache: ServiceCacheHint
): Promise<KeysetEventPage> {
  const { client } = getPlatformRegistry().getPlatformAdapter("polymarket");
  const page = await client.fetchEventPage(params, { cache });
  return { rawEvents: page.rawEvents, nextCursor: page.nextCursor };
}

export interface EventDetailInput {
  /** How the event and its child events may be cached. */
  cache: ServiceCacheHint;
  /** How the open-markets fallback may be cached; defaults to `cache`. */
  marketsCache?: ServiceCacheHint;
}

type EventMarket = NonNullable<GammaEventFull["markets"]>[number];

/**
 * One event with its market list as `/api/events/[id]` serves it: the Gamma
 * record, the event's open markets when the record embeds none, and the
 * markets of its negRisk child events folded in.
 *
 * Null when Polymarket has no such event (Gamma's 404, or its 422 for a
 * malformed slug). Every other failure of the event read throws so the caller
 * serves a retryable 5xx rather than a misleading not-found. The markets
 * fallback and the child fan-out are best-effort: a failure there is logged
 * and the event is served without it.
 */
export async function fetchEventDetail(
  slugOrId: string,
  input: EventDetailInput
): Promise<GammaEventFull | null> {
  const registry = getPlatformRegistry();
  const adapter = registry.getMarketDataAdapter("polymarket");
  const options: ServiceFetchOptions = { cache: input.cache };

  let canonical: CanonicalEvent;
  try {
    canonical = /^\d+$/.test(slugOrId)
      ? await adapter.getEvent(slugOrId, options)
      : await adapter.getEventBySlug(slugOrId, options);
  } catch (error) {
    if (isPlatformError(error) && error.kind === "not_found") {
      return null;
    }
    throw error;
  }
  const event = toGammaEventFull(canonical);
  const { client } = registry.getPlatformAdapter("polymarket");

  async function fetchOpenMarkets(): Promise<EventMarket[]> {
    // Gamma embeds the markets on the event record; the lookup only covers
    // the rare record that arrives without them.
    if (Array.isArray(event.markets)) {
      return event.markets;
    }
    try {
      const markets = await client.fetchOpenMarketsByEventSlug(
        event.slug || slugOrId,
        { cache: input.marketsCache ?? input.cache }
      );
      // Gamma market records; the page renders them like the embedded ones.
      return markets as unknown as EventMarket[];
    } catch (error) {
      logger.warn("event_reads.markets_fetch_failed", {
        slugOrId,
        error: errorMessage(error),
      });
      return [];
    }
  }

  async function fetchChildren(): Promise<readonly GammaEventLike[]> {
    try {
      const children = await client.fetchChildEvents(event.id, options);
      return children.rawEvents;
    } catch (error) {
      logger.warn("event_reads.children_fetch_failed", {
        slugOrId,
        error: errorMessage(error),
      });
      return [];
    }
  }

  const [markets, children] = await Promise.all([
    fetchOpenMarkets(),
    fetchChildren(),
  ]);
  return mergeChildMarkets({ ...event, markets }, children);
}
