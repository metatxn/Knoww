import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { CACHE_DURATION, POLYMARKET_API } from "@/lib/constants";

/**
 * GET /api/events/paginated
 * Fetches paginated events from Polymarket Gamma API with optional tag slug support
 * Query params:
 *  - tag_slug: string (optional) - The tag slug to filter by (if omitted, returns all events)
 *  - limit: number (default: 20)
 *  - offset: number (default: 0)
 *  - active: boolean (default: true)
 *  - archived: boolean (default: false)
 *  - closed: boolean (always false unless explicitly set to true for historical data)
 *  - order: string (default: volume24hr)
 *  - ascending: boolean (default: false)
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

    // Extract query parameters
    const tagSlug = searchParams.get("tag_slug");
    const limit = searchParams.get("limit") || "20";
    const offset = searchParams.get("offset") || "0";
    const active = searchParams.get("active") || "true";
    const archived = searchParams.get("archived") || "false";
    // Always enforce closed=false unless explicitly requesting historical data
    const closed = searchParams.get("closed") || "false";
    const order = searchParams.get("order") || "volume24hr";
    const ascending = searchParams.get("ascending") || "false";

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

    // Only add tag_slug if provided
    if (tagSlug) {
      params.set("tag_slug", tagSlug);
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
