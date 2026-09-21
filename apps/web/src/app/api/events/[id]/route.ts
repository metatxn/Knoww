import { isPlatformError } from "@knoww/services/core";
import { type NextRequest, NextResponse } from "next/server";
import { CACHE_DURATION } from "@/constants/polymarket";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { getCacheHeaders } from "@/lib/cache-headers";
import { logger } from "@/lib/logger";
import { fetchEventDetail } from "@/polymarket/event-reads";

/**
 * GET /api/events/:id
 * Get event details by ID or slug including all associated markets (closed=false by default)
 *
 * Supports both:
 * - Numeric ID (e.g., 35908): Uses https://gamma-api.polymarket.com/events/{id}
 * - Event slug: Uses https://gamma-api.polymarket.com/events/slug/{slug}
 */
/**
 * @openapi
 * /api/events/{id}:
 *   get:
 *     summary: Fetch /api/events/{id}.
 *     tags: [Events]
 *     responses:
 *       200:
 *         description: Successful response.
 *       400:
 *         description: Invalid request.
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: Request forbidden.
 *       404:
 *         description: Resource not found.
 *       429:
 *         description: Rate limit exceeded.
 *       500:
 *         description: Request failed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Apply rate limiting: 100 requests per minute
  const rateLimitResponse = checkRateLimit(request, {
    interval: 60 * 1000,
    uniqueTokenPerInterval: 100,
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  const { id } = await params;
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Event ID or slug is required",
        },
        { status: 400 }
      );
    }

    // A numeric id (e.g. 35908) is looked up by id, anything else by slug.
    // `fresh=1` bypasses Next's data cache for every read behind the event.
    const event = await fetchEventDetail(id, {
      cache: { revalidateSeconds: fresh ? 0 : CACHE_DURATION.EVENTS },
      marketsCache: { revalidateSeconds: fresh ? 0 : CACHE_DURATION.MARKETS },
    });

    if (event === null) {
      return NextResponse.json(
        {
          success: false,
          error: "Event not found",
        },
        { status: 404 }
      );
    }

    const markets = event.markets ?? [];
    return NextResponse.json(
      {
        success: true,
        event: {
          ...event,
          markets,
          marketCount: markets.length,
        },
      },
      {
        headers: fresh
          ? { "Cache-Control": "no-store" }
          : getCacheHeaders("events"),
      }
    );
  } catch (error) {
    // Gamma answered with an error status: the failure is upstream, so the
    // route reports a bad gateway rather than an error of its own.
    if (
      isPlatformError(error) &&
      error.kind === "upstream" &&
      error.upstreamStatus !== undefined
    ) {
      logger.warn("events.detail.gamma_failed", {
        id,
        status: error.upstreamStatus,
        error: error.message,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch event details",
        },
        { status: 502 }
      );
    }

    logger.error("events.detail.fetch_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch event details",
      },
      { status: 500 }
    );
  }
}
