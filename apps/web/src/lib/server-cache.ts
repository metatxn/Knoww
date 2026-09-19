import type { ServiceCacheHint } from "@knoww/services/registry";
import { cache } from "react";
import { CACHE_DURATION } from "@/constants/polymarket";
import type { Event } from "@/hooks/use-event-detail";
import type { LeaderboardTrader } from "@/hooks/use-leaderboard";
import { logger } from "@/lib/logger";
import {
  formatTagLabel,
  getKnownTagDefinition,
  normalizeTagRecord,
  normalizeTagSlug,
} from "@/lib/tag-slugs";
import {
  fetchEventDetail,
  fetchSeriesEventPage,
  fetchTagEventPage,
} from "@/polymarket/event-reads";
import {
  fetchLeaderboardRows,
  fetchTagRecord,
  upstreamStatus,
} from "@/polymarket/profile-reads";

/**
 * Server-side Cache Utilities using React.cache()
 *
 * React.cache() provides per-request memoization on the server.
 * This is critical for Cloudflare Workers to avoid duplicate fetches
 * within a single request (e.g., same data needed for metadata + page).
 *
 * Benefits:
 * 1. Deduplicates identical requests within the same render
 * 2. Works with React Server Components streaming
 * 3. Zero configuration, automatic cleanup per request
 */

// Types for initial home data
export interface InitialMarket {
  id: string;
  question?: string;
  outcomes?: string;
  outcomePrices?: string;
  groupItemTitle?: string;
  image?: string;
  icon?: string;
  clobTokenIds?: string[];
  conditionId?: string;
  gameStartTime?: string;
  sportsMarketType?: string;
  umaResolutionStatus?: string;
  umaResolutionStatuses?: string;
  parentEventId?: number | string;
  parentEventTitle?: string;
}

export interface InitialEvent {
  id: string;
  slug: string;
  title: string;
  description?: string;
  image?: string;
  startDate?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  volume?: string;
  volume24hr?: number | string;
  volume1wk?: number | string;
  volume1mo?: number | string;
  volume1yr?: number | string;
  liquidity?: number | string;
  liquidityClob?: number | string;
  competitive?: number;
  live?: boolean;
  ended?: boolean;
  markets?: InitialMarket[];
  tags?: Array<string | { id?: string; slug?: string; label?: string }>;
  negRisk?: boolean;
}

export interface InitialHomeData {
  events: InitialEvent[];
  totalResults: number;
  hasMore: boolean;
}

export interface InitialLeaderboardData {
  traders: LeaderboardTrader[];
  category: string;
  timePeriod: string;
  orderBy: string;
  total: number;
}

export interface InitialTagData {
  slug: string;
  label: string;
  description?: string;
}

// Full event type for server-side fetching
export interface GammaEventFull extends Event {
  title: string;
  description?: string;
  image?: string;
}

const INITIAL_HOME_EVENT_LIMIT = 6;
const RELATED_EVENT_LIMIT = 6;

interface InitialEventPageOptions {
  /** `no-store` bypasses Next's data cache; the default revalidates. */
  cache?: "no-store";
}

async function fetchInitialEventPage(
  tagSlug?: string,
  seriesId?: number,
  limit = 20,
  options: InitialEventPageOptions = {}
): Promise<InitialHomeData> {
  const cacheHint: ServiceCacheHint = {
    revalidateSeconds: options.cache === "no-store" ? 0 : CACHE_DURATION.EVENTS,
  };

  if (seriesId) {
    return fetchSeriesEventPage({ seriesId, limit, cache: cacheHint });
  }

  return fetchTagEventPage({
    tagSlug: tagSlug ? normalizeTagSlug(tagSlug) : undefined,
    limit,
    cache: cacheHint,
  });
}

/**
 * Cached fetch for initial events data
 * Uses React.cache() for per-request deduplication
 */
export const getInitialEvents = cache(
  async (): Promise<InitialHomeData | null> => {
    try {
      return await fetchInitialEventPage(
        undefined,
        undefined,
        INITIAL_HOME_EVENT_LIMIT
      );
    } catch (error) {
      logger.error("server_cache.events.fetch_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
);

export const getInitialEventsByTag = cache(
  async (
    tagSlug: string,
    seriesId?: number
  ): Promise<InitialHomeData | null> => {
    try {
      return await fetchInitialEventPage(tagSlug, seriesId);
    } catch (error) {
      logger.error("server_cache.events_by_tag.fetch_failed", {
        tagSlug: normalizeTagSlug(tagSlug),
        seriesId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
);

/**
 * Authoritative category inventory for indexable route rendering. Unlike the
 * best-effort helper above, upstream failures are rethrown so Next serves a
 * retryable 5xx instead of a misleading 200/noindex empty page.
 */
export const getInitialEventsByTagStrict = cache(
  async (tagSlug: string, seriesId?: number): Promise<InitialHomeData> => {
    try {
      return await fetchInitialEventPage(tagSlug, seriesId);
    } catch (error) {
      logger.error("server_cache.events_by_tag.strict_fetch_failed", {
        tagSlug: normalizeTagSlug(tagSlug),
        seriesId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
);

/** Small best-effort payload for the event detail page's related links. */
export const getRelatedEventsByTag = cache(
  async (tagSlug: string): Promise<InitialHomeData | null> => {
    try {
      return await fetchInitialEventPage(
        tagSlug,
        undefined,
        RELATED_EVENT_LIMIT,
        { cache: "no-store" }
      );
    } catch (error) {
      logger.warn("server_cache.related_events.fetch_failed", {
        tagSlug: normalizeTagSlug(tagSlug),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
);

export const getTagDetails = cache(
  async (tagSlug: string): Promise<InitialTagData | null> => {
    const canonicalSlug = normalizeTagSlug(tagSlug);
    const fallback = getKnownTagDefinition(canonicalSlug);

    try {
      const record = await fetchTagRecord(canonicalSlug, {
        revalidateSeconds: CACHE_DURATION.SPORTS_LIST,
      });
      const normalizedTag = normalizeTagRecord(record);

      if (normalizedTag) {
        return {
          slug: normalizedTag.slug,
          label: normalizedTag.label,
          description: normalizedTag.description,
        };
      }
    } catch (error) {
      // Gamma answering with an error status (usually a 404 for a slug it
      // doesn't know) keeps a known category's definition and reports any
      // other slug as missing. A read that never got a usable response
      // falls through to the fallbacks below.
      const status = upstreamStatus(error);
      if (status !== undefined) {
        if (fallback) {
          return fallback;
        }

        logger.warn("server_cache.tag.fetch_failed", {
          tagSlug: canonicalSlug,
          status,
        });
        return null;
      }

      logger.error("server_cache.tag.fetch_failed", {
        tagSlug: canonicalSlug,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (fallback) {
      return fallback;
    }

    return {
      slug: canonicalSlug,
      label: formatTagLabel(canonicalSlug),
    };
  }
);

/**
 * Cached fetch for leaderboard data
 * Uses React.cache() for per-request deduplication
 */
export const getInitialLeaderboard = cache(
  async (): Promise<InitialLeaderboardData | null> => {
    try {
      const rows = await fetchLeaderboardRows(
        {
          category: "OVERALL",
          timePeriod: "DAY",
          orderBy: "PNL",
          limit: 25,
          offset: 0,
        },
        { revalidateSeconds: CACHE_DURATION.EVENTS }
      );
      // The rows are served as the Data API sent them. The services schema
      // only validates the fields it needs, so the hook's type is the shape
      // the leaderboard page documents for the rest.
      const traders = rows as unknown as LeaderboardTrader[];

      return {
        traders,
        category: "OVERALL",
        timePeriod: "DAY",
        orderBy: "PNL",
        total: traders.length,
      };
    } catch (error) {
      const status = upstreamStatus(error);
      if (status !== undefined) {
        logger.warn("server_cache.leaderboard.fetch_failed", { status });
        return null;
      }

      logger.error("server_cache.leaderboard.fetch_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
);

/**
 * Cached fetch for event detail data
 * Uses React.cache() for per-request deduplication
 *
 * This is critical for event detail pages where the same data
 * is needed for both generateMetadata() and the page component
 */
export const getEvent = cache(
  async (slugOrId: string): Promise<GammaEventFull | null> => {
    try {
      // Detail reads bypass Next's data cache so a freshly resolved market
      // never renders from a stale entry.
      const event = await fetchEventDetail(slugOrId, {
        cache: { revalidateSeconds: 0 },
      });
      if (event === null) {
        // A missing event (Gamma's 404, or its 422 for a malformed slug)
        // maps to notFound()/noindex. Other failures (5xx, rate limit,
        // network) throw so the page renders a retryable 5xx instead of a
        // misleading 404.
        logger.warn("server_cache.event.not_found", { slugOrId });
        return null;
      }
      return event;
    } catch (error) {
      logger.error("server_cache.event.fetch_failed", {
        slugOrId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Transient failures (network, parse, non-404 upstream) propagate so the
      // route errors with a 5xx rather than serving a not-found page.
      throw error;
    }
  }
);
