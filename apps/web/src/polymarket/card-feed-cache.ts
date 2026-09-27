import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  type CardFeedQuery,
  canRefreshCardFeed,
  cardFeedQuerySchema,
} from "./card-feed-query";
import { readCardFeed } from "./event-feed";
import type { MarketFeedCache } from "./market-feed-cache";
import { withProjectedFeedCache } from "./projected-feed-cache";

export interface CardFeedEnv {
  MARKET_FEED_CACHE: DurableObjectNamespace<MarketFeedCache>;
}

export async function cardFeedCacheKey(query: CardFeedQuery) {
  const normalized = JSON.stringify(cardFeedQuerySchema.parse(query));
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized)
  );
  return `cards-v1:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function getCardFeedResponse(
  query: CardFeedQuery
): Promise<Response> {
  const normalized = cardFeedQuerySchema.parse(query);
  // next dev cannot instantiate a Durable Object exported by the same script.
  if (process.env.NODE_ENV === "development")
    return readUncoordinatedPage(normalized);
  if (!canRefreshCardFeed(normalized)) {
    return withProjectedFeedCache(await cardFeedCacheKey(normalized), () =>
      readUncoordinatedPage(normalized)
    );
  }
  let binding: CardFeedEnv["MARKET_FEED_CACHE"] | undefined;
  try {
    const { env } = getCloudflareContext();
    binding = (env as CloudflareEnv & Partial<CardFeedEnv>).MARKET_FEED_CACHE;
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
  }
  if (binding)
    return binding
      .getByName(await cardFeedCacheKey(normalized))
      .getPage(normalized);
  if (process.env.NODE_ENV === "production")
    throw new Error("Market feed cache binding is unavailable");
  // Plain Next development has no Worker bindings. Production first pages require the coordinator.
  return readUncoordinatedPage(normalized);
}

async function readUncoordinatedPage(query: CardFeedQuery) {
  const page = await readCardFeed(query);
  return cardPageResponse(page);
}

function cardPageResponse(page: Awaited<ReturnType<typeof readCardFeed>>) {
  return Response.json({
    success: true,
    data: page.events,
    pagination: {
      hasMore: Boolean(page.nextCursor),
      nextCursor: page.nextCursor,
      totalResults: page.totalResults,
    },
    freshness: { generatedAt: Date.now(), stale: false },
  });
}
