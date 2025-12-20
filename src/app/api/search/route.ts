import { type NextRequest, NextResponse } from "next/server";

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

/**
 * Search markets, events, and profiles using Polymarket's public search API
 * @see https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || searchParams.get("query") || "";
    const limit = searchParams.get("limit") || "10";

    if (!query.trim()) {
      return NextResponse.json({
        events: [],
        tags: [],
        profiles: [],
        pagination: { hasMore: false, totalResults: 0 },
      });
    }

    // Build search URL with query parameters
    // Note: Polymarket API expects 'q' parameter, not 'query'
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("limit", limit);
    params.set("optimized", "true");

    const url = `${GAMMA_API_BASE}/public-search?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 30 }, // Cache for 30 seconds
    });

    if (!response.ok) {
      console.error("Search API error:", response.status, response.statusText);
      return NextResponse.json(
        { error: "Failed to search" },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
