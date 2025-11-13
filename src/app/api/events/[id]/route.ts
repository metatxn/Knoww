import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { CACHE_DURATION, POLYMARKET_API } from "@/lib/constants";

/**
 * GET /api/events/:id
 * Get event details by ID including all associated markets (closed=false by default)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Event ID is required",
        },
        { status: 400 },
      );
    }

    console.log(`hello api-events-id: ${POLYMARKET_API.GAMMA.EVENTS}/${id}`);

    // Fetch event details from Gamma API
    const eventResponse = await fetch(`${POLYMARKET_API.GAMMA.EVENTS}/${id}`, {
      headers: {
        "Content-Type": "application/json",
      },
      next: { revalidate: CACHE_DURATION.EVENTS },
    });

    if (!eventResponse.ok) {
      if (eventResponse.status === 404) {
        return NextResponse.json(
          {
            success: false,
            error: "Event not found",
          },
          { status: 404 },
        );
      }
      throw new Error(`Gamma API error: ${eventResponse.statusText}`);
    }

    const event = (await eventResponse.json()) as Record<string, unknown>;

    if (!event) {
      return NextResponse.json(
        {
          success: false,
          error: "Event not found",
        },
        { status: 404 },
      );
    }

    // Fetch markets associated with this event
    // Markets are linked to events, so we need to fetch them separately
    let markets = [];

    // If the event has markets array, use it directly
    if (event.markets && Array.isArray(event.markets)) {
      markets = event.markets;
    } else {
      // Otherwise, fetch markets by event slug or ID (always filter closed=false)
      try {
        const marketsResponse = await fetch(
          `${POLYMARKET_API.GAMMA.MARKETS}?events_slug=${
            event.slug || id
          }&closed=false`,
          {
            headers: {
              "Content-Type": "application/json",
            },
            next: { revalidate: CACHE_DURATION.MARKETS },
          },
        );

        if (marketsResponse.ok) {
          markets = (await marketsResponse.json()) as Record<string, unknown>[];
        }
      } catch (err) {
        console.error("Error fetching markets for event:", err);
        // Continue with empty markets array
      }
    }

    return NextResponse.json({
      success: true,
      event: {
        ...event,
        markets,
        marketCount: markets.length,
      },
    });
  } catch (error) {
    console.error("Error fetching event details:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
