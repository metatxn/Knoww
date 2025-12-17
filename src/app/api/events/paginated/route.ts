import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { CACHE_DURATION, POLYMARKET_API } from "@/lib/constants";

/**
 * GET /api/events/paginated
 * Fetches paginated events from Polymarket Gamma API with server-side filtering
 *
 * Query params:
 *  - tag_slug: string (optional) - The tag slug to filter by
 *  - limit: number (default: 20)
 *  - offset: number (default: 0)
 *  - active: boolean (default: true)
 *  - archived: boolean (default: false)
 *  - closed: boolean (default: false)
 *  - order: string (default: volume24hr)
 *  - ascending: boolean (default: false)
 *
 * Server-side filter params (passed directly to Gamma API):
 *  - volume24hr_min: number (optional) - Minimum 24hr volume
 *  - volume1wk_min: number (optional) - Minimum weekly volume
 *  - liquidity_min: number (optional) - Minimum liquidity
 *  - competitive_min: number (optional) - Minimum competitiveness (0-1)
 *  - competitive_max: number (optional) - Maximum competitiveness (0-1)
 *  - live: boolean (optional) - Filter live events
 *  - ended: boolean (optional) - Filter ended events
 *  - start_date_min: string (optional) - Events starting after this date (ISO format)
 *  - start_date_max: string (optional) - Events starting before this date (ISO format)
 *  - end_date_min: string (optional) - Events ending after this date (ISO format)
 *  - end_date_max: string (optional) - Events ending before this date (ISO format)
 */
export async function GET(request: NextRequest) {
  // Apply rate limiting: 100 requests per minute
  const rateLimitResponse = checkRateLimit(request, {
    interval: 60 * 1000,
    uniqueTokenPerInterval: 100,
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { searchParams } = new URL(request.url);

    // Extract base query parameters
    const tagSlug = searchParams.get("tag_slug");
    const limit = searchParams.get("limit") || "20";
    const offset = searchParams.get("offset") || "0";
    const active = searchParams.get("active") || "true";
    const archived = searchParams.get("archived") || "false";
    const closed = searchParams.get("closed") || "false";
    const order = searchParams.get("order") || "volume24hr";
    const ascending = searchParams.get("ascending") || "false";

    // Extract filter parameters
    const volume24hrMin = searchParams.get("volume24hr_min");
    const volume1wkMin = searchParams.get("volume1wk_min");
    const liquidityMin = searchParams.get("liquidity_min");
    const competitiveMin = searchParams.get("competitive_min");
    const _competitiveMax = searchParams.get("competitive_max");
    const live = searchParams.get("live");
    const ended = searchParams.get("ended");

    // Extract date filter parameters
    const startDateMin = searchParams.get("start_date_min");
    const startDateMax = searchParams.get("start_date_max");
    const endDateMin = searchParams.get("end_date_min");
    const endDateMax = searchParams.get("end_date_max");

    // Build the Gamma API URL with pagination
    const params = new URLSearchParams({
      limit,
      active,
      archived,
      closed,
      order,
      ascending,
      offset,
    });

    // Add optional tag filter
    if (tagSlug) {
      params.set("tag_slug", tagSlug);
    }

    // Add volume filters (Gamma API uses these as minimum thresholds)
    if (volume24hrMin) {
      params.set("volume24hr", volume24hrMin);
    }
    if (volume1wkMin) {
      params.set("volume1wk", volume1wkMin);
    }

    // Add liquidity filter
    if (liquidityMin) {
      params.set("liquidity", liquidityMin);
    }

    // Add competitiveness filters
    if (competitiveMin) {
      params.set("competitive", competitiveMin);
    }
    // Note: Gamma API may not support max competitive filter directly
    // We handle max filtering client-side if needed

    // Add live/ended status filters
    if (live === "true") {
      params.set("live", "true");
    }
    if (ended === "true") {
      params.set("ended", "true");
    }

    // Add date filters
    // The Gamma API may support date filtering via startDate/endDate params
    // We try multiple naming conventions that Strapi/Gamma APIs commonly use
    if (startDateMin) {
      // Try Strapi-style filter: startDate_gte (greater than or equal)
      params.set("startDate_gte", startDateMin);
    }
    if (startDateMax) {
      params.set("startDate_lte", startDateMax);
    }
    if (endDateMin) {
      params.set("endDate_gte", endDateMin);
    }
    if (endDateMax) {
      params.set("endDate_lte", endDateMax);
    }

    const url = `${
      POLYMARKET_API.GAMMA.EVENTS_PAGINATION
    }?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
      next: {
        revalidate: CACHE_DURATION.EVENTS,
      },
    });

    if (!response.ok) {
      throw new Error(`Gamma API error: ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error("Error fetching paginated events:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
