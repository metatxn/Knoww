import { createLogger } from "@knoww/logger";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { getCardFeedResponse } from "@/polymarket/card-feed-cache";
import {
  cardFeedQuerySchema,
  decodeCardCursor,
} from "@/polymarket/card-feed-query";

const log = createLogger("api.events.cards");

/**
 * @openapi
 * /api/events/cards:
 *   get:
 *     summary: Fetch bounded event cards with versioned pagination and freshness metadata.
 *     description: Pages may contain fewer cards than the requested limit when upstream responses are large. Follow pagination.nextCursor until it is absent; page length does not indicate the end of the feed.
 *     tags: [Events]
 *     responses:
 *       200:
 *         description: A card batch with its continuation cursor, optionally served from a recent stale snapshot.
 *       400:
 *         description: Invalid filters or card cursor.
 *       429:
 *         description: Rate limit exceeded.
 *       503:
 *         description: No usable feed snapshot. Retry after the indicated delay.
 */
export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, {
    interval: 60_000,
    uniqueTokenPerInterval: 100,
  });
  if (limited) return limited;
  const parsed = cardFeedQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success)
    return Response.json(
      { success: false, error: "Invalid event filters" },
      { status: 400 }
    );
  try {
    decodeCardCursor(parsed.data.after_cursor);
  } catch {
    return Response.json(
      { success: false, error: "Invalid card cursor" },
      { status: 400 }
    );
  }
  try {
    return await getCardFeedResponse(parsed.data);
  } catch (error) {
    log.error("read.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      {
        success: false,
        error: "Markets are temporarily unavailable. Please try again.",
      },
      {
        status: 503,
        headers: { "Retry-After": "15", "Cache-Control": "no-store" },
      }
    );
  }
}
