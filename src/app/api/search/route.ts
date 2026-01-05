import { type NextRequest, NextResponse } from "next/server";

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

interface TopOutcome {
  name: string;
  price: number;
}

interface Market {
  id: string;
  question?: string;
  outcomes?: string; // JSON string like '["Yes","No"]' or '["Barcelona","Real Madrid",...]'
  outcomePrices?: string; // JSON string like '[0.61, 0.39]'
  groupItemTitle?: string;
}

interface SearchEvent {
  id: string;
  slug?: string;
  title: string;
  description?: string;
  image?: string;
  icon?: string;
  volume?: number;
  volume24hr?: number;
  liquidity?: number;
  active?: boolean;
  closed?: boolean;
  live?: boolean;
  ended?: boolean;
  competitive?: number;
  markets?: Market[];
  topOutcome?: TopOutcome;
}

/**
 * Extract the top outcome (leading position) from an event's markets
 * For multi-outcome markets (like "La Liga Winner"), finds the highest priced outcome
 * For Yes/No markets, returns the "Yes" outcome price
 */
function getTopOutcome(markets: Market[]): TopOutcome | undefined {
  if (!markets || markets.length === 0) return undefined;

  let topOutcome: TopOutcome | undefined;
  let highestPrice = 0;

  for (const market of markets) {
    try {
      // Parse outcomes and prices from JSON strings
      const outcomes: string[] = market.outcomes
        ? JSON.parse(market.outcomes)
        : [];
      const prices: number[] = market.outcomePrices
        ? JSON.parse(market.outcomePrices)
        : [];

      if (outcomes.length === 0 || prices.length === 0) continue;

      // For Yes/No markets, we want the "Yes" price
      const isYesNoMarket =
        outcomes.length === 2 &&
        outcomes.some((o) => o.toLowerCase() === "yes") &&
        outcomes.some((o) => o.toLowerCase() === "no");

      for (let i = 0; i < outcomes.length && i < prices.length; i++) {
        const price = prices[i];
        const outcomeName = outcomes[i];

        // Skip "No" outcomes for Yes/No markets
        if (isYesNoMarket && outcomeName.toLowerCase() === "no") {
          continue;
        }

        if (price > highestPrice) {
          highestPrice = price;
          // Use groupItemTitle if available (for grouped markets like team names)
          topOutcome = {
            name: market.groupItemTitle || outcomeName,
            price: price,
          };
        }
      }
    } catch {}
  }

  return topOutcome;
}

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
    // The search API already returns markets with outcomes and outcomePrices
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("limit", limit);

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

    const data = (await response.json()) as {
      events?: SearchEvent[];
      tags?: unknown[];
      profiles?: unknown[];
      pagination?: { hasMore: boolean; totalResults: number };
    };

    // Process events to extract top outcome from the markets array
    // The search API already returns markets with outcomes and outcomePrices
    if (data.events && data.events.length > 0) {
      data.events = data.events.map((event: SearchEvent) => {
        // Extract top outcome from the event's markets
        if (event.markets && event.markets.length > 0) {
          const topOutcome = getTopOutcome(event.markets);
          if (topOutcome) {
            return { ...event, topOutcome };
          }
        }
        return event;
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
