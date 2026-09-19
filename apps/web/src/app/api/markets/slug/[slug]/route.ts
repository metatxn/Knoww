import { createLogger } from "@knoww/logger";
import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { getCacheHeaders } from "@/lib/cache-headers";
import { fetchOpenMarketRecordBySlug } from "@/polymarket/market-reads";

const log = createLogger("api.markets.slug");

/**
 * GET /api/markets/slug/:slug
 * Get market details by slug (recommended by Polymarket API team)
 */
/**
 * @openapi
 * /api/markets/slug/{slug}:
 *   get:
 *     summary: Fetch /api/markets/slug/{slug}.
 *     tags: [Markets]
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
  { params }: { params: Promise<{ slug: string }> }
) {
  // Apply rate limiting: 100 requests per minute
  const rateLimitResponse = checkRateLimit(request, {
    interval: 60 * 1000,
    uniqueTokenPerInterval: 100,
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json(
        {
          success: false,
          error: "Market slug is required",
        },
        { status: 400 }
      );
    }

    // The open market behind the slug, as Gamma sent it. A settled market
    // counts as missing. Cached for a minute.
    const market = await fetchOpenMarketRecordBySlug(slug, {
      revalidateSeconds: 60,
    });

    if (market === null) {
      return NextResponse.json(
        {
          success: false,
          error: "Market not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        market,
      },
      { headers: getCacheHeaders("events") }
    );
  } catch (error) {
    log.error("fetch.failed", { error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
