import { type NextRequest, NextResponse } from "next/server";
import { POLYMARKET_API } from "@/constants/polymarket";
import { checkRateLimit } from "@/lib/api-rate-limit";

/**
 * GET /api/events/breaking
 * Get breaking events - high activity markets sorted by 24hr volume
 * Uses the pagination endpoint for infinite scroll support
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
    const searchParams = request.nextUrl.searchParams;
    const limit = searchParams.get("limit") || "15";
    const offset = searchParams.get("offset") || "0";

    const queryParams = new URLSearchParams();
    queryParams.set("limit", limit);
    queryParams.set("offset", offset);
    queryParams.set("active", "true");
    queryParams.set("archived", "false");
    queryParams.set("closed", "false");
    queryParams.set("order", "volume24hr"); // Sort by 24hr volume (breaking/hot)
    queryParams.set("ascending", "false"); // Highest 24hr volume first
    // Exclude crypto up/down spam markets
    queryParams.append("exclude_tag_id", "100639");
    queryParams.append("exclude_tag_id", "102169");

    const response = await fetch(
      `${POLYMARKET_API.GAMMA.EVENTS_PAGINATION}?${queryParams.toString()}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        next: { revalidate: 60 }, // Cache for 1 minute
      }
    );

    if (!response.ok) {
      throw new Error(`Gamma API error: ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Return the same structure as /api/events/paginated
    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error("Error fetching breaking events:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
