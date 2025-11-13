import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { POLYMARKET_API } from "@/lib/constants";

/**
 * GET /api/events/trending
 * Get trending events sorted by volume (closed=false enforced)
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
    const limit = searchParams.get("limit") || "12";

    const queryParams = new URLSearchParams();
    queryParams.set("order", "volume");
    queryParams.set("ascending", "false");
    queryParams.set("closed", "false"); // Always enforce closed=false
    queryParams.set("limit", limit);

    const response = await fetch(
      `${POLYMARKET_API.GAMMA.EVENTS}?${queryParams.toString()}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        next: { revalidate: 60 }, // Cache for 1 minute
      },
    );

    if (!response.ok) {
      throw new Error(`Gamma API error: ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    return NextResponse.json({
      success: true,
      count: Array.isArray(data) ? data.length : 0,
      events: Array.isArray(data) ? data : [],
    });
  } catch (error) {
    console.error("Error fetching trending events:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
