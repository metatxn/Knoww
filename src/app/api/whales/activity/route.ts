import { type NextRequest, NextResponse } from "next/server";
import { POLYMARKET_API } from "@/constants/polymarket";
import { checkRateLimit } from "@/lib/api-rate-limit";

/**
 * Whale Activity API Route
 *
 * Aggregates recent large trades from top traders (whales) across all markets.
 * Uses the leaderboard to identify whales, then fetches their recent activity.
 */

export interface WhaleActivity {
  id: string;
  timestamp: string;
  trader: {
    address: string;
    name: string | null;
    profileImage: string | null;
    rank: number;
    totalPnl: number;
    totalVolume: number;
  };
  trade: {
    side: "BUY" | "SELL";
    size: number;
    price: number;
    usdcAmount: number;
    outcome: string;
    outcomeIndex: number;
  };
  market: {
    conditionId: string;
    title: string;
    slug: string;
    eventSlug: string;
    image?: string;
  };
}

export interface WhaleActivityResponse {
  success: boolean;
  activities: WhaleActivity[];
  whaleCount: number;
  totalTrades: number;
  lastUpdated: string;
  error?: string;
}

interface LeaderboardTrader {
  rank: string;
  proxyWallet: string;
  userName: string | null;
  vol: number;
  pnl: number;
  profileImage: string | null;
}

interface TradeActivity {
  id?: string;
  timestamp: number; // Unix timestamp in seconds
  type: string;
  side: "BUY" | "SELL";
  size: number;
  price: number;
  usdcSize: number;
  outcomeIndex: number;
  outcome: string;
  transactionHash?: string;
  conditionId?: string;
  title?: string;
  slug?: string;
  eventSlug?: string;
  icon?: string;
  asset?: string;
}

/**
 * Fetch top traders from leaderboard
 * @param limit - Number of traders to fetch
 * @param timePeriod - Time period: DAY, WEEK, MONTH, ALL
 */
async function fetchTopTraders(
  limit = 20,
  timePeriod: "DAY" | "WEEK" | "MONTH" | "ALL" = "WEEK"
): Promise<LeaderboardTrader[]> {
  try {
    const response = await fetch(
      `${POLYMARKET_API.DATA.BASE}/v1/leaderboard?category=OVERALL&timePeriod=${timePeriod}&orderBy=VOL&limit=${limit}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    );

    if (!response.ok) return [];
    const data: LeaderboardTrader[] = await response.json();
    return data;
  } catch {
    return [];
  }
}

/**
 * Fetch recent activity for a specific trader
 */
async function fetchTraderActivity(
  address: string,
  limit = 50
): Promise<TradeActivity[]> {
  try {
    // Fetch more activities to ensure we have enough data for all time periods
    const response = await fetch(
      `${
        POLYMARKET_API.DATA.BASE
      }/activity?user=${address.toLowerCase()}&limit=${Math.min(limit, 100)}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 }, // Cache for 1 minute
      }
    );

    if (!response.ok) return [];
    const data: TradeActivity[] = await response.json();
    return data;
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  // Rate limit: 15 requests per minute (expensive endpoint — many upstream API calls)
  const rateLimitResponse = checkRateLimit(request, {
    uniqueTokenPerInterval: 15,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const whaleCount = Math.min(
      Math.max(Number.parseInt(searchParams.get("whaleCount") || "25", 10), 5),
      100
    );
    const parsedMinTradeSize = Number.parseFloat(
      searchParams.get("minTradeSize") || "100"
    );
    const minTradeSize =
      Number.isNaN(parsedMinTradeSize) || parsedMinTradeSize < 0
        ? 100
        : parsedMinTradeSize;
    const tradesPerWhale = Math.min(
      Math.max(
        Number.parseInt(searchParams.get("tradesPerWhale") || "50", 10),
        1
      ),
      100
    );

    // Get time period from query params (DAY, WEEK, MONTH, ALL)
    const timePeriodParam = searchParams.get("timePeriod") || "WEEK";
    const validTimePeriods = ["DAY", "WEEK", "MONTH", "ALL"] as const;
    const timePeriod = validTimePeriods.includes(
      timePeriodParam as (typeof validTimePeriods)[number]
    )
      ? (timePeriodParam as "DAY" | "WEEK" | "MONTH" | "ALL")
      : "WEEK";

    // Step 1: ALWAYS fetch top traders from the SELECTED time period leaderboard
    // This ensures we show "who's active in this period" - which is the correct behavior
    // The time period filter on activities ensures we only count trades within that period
    const topTraders = await fetchTopTraders(whaleCount, timePeriod);

    if (topTraders.length === 0) {
      return NextResponse.json({
        success: true,
        activities: [],
        whaleCount: 0,
        totalTrades: 0,
        lastUpdated: new Date().toISOString(),
      });
    }

    // Step 2: Fetch recent activity for each whale in parallel
    // For longer time periods, fetch more trades to capture historical data
    const tradesMultiplier: Record<string, number> = {
      DAY: 1,
      WEEK: 1,
      MONTH: 2, // Fetch 2x more trades for monthly data
      ALL: 2, // Fetch 2x more trades for all-time data
    };
    const adjustedTradesPerWhale = Math.min(
      tradesPerWhale * (tradesMultiplier[timePeriod] || 1),
      100 // API limit
    );

    const activityPromises = topTraders.map(async (trader) => {
      const activities = await fetchTraderActivity(
        trader.proxyWallet,
        adjustedTradesPerWhale
      );
      return { trader, activities };
    });

    const results = await Promise.all(activityPromises);

    // Step 3: Transform and filter activities
    const allActivities: WhaleActivity[] = [];

    for (const { trader, activities } of results) {
      for (const activity of activities) {
        // Only include TRADE type activities
        if (activity.type !== "TRADE") continue;

        const usdcAmount = activity.usdcSize || 0;

        // Filter by minimum trade size
        if (usdcAmount < minTradeSize) continue;

        // Convert Unix timestamp (seconds) to ISO string
        const timestampISO = new Date(activity.timestamp * 1000).toISOString();

        allActivities.push({
          id:
            activity.transactionHash ||
            `${trader.proxyWallet}-${activity.timestamp}-${activity.outcomeIndex}-${activity.size}`,
          timestamp: timestampISO,
          trader: {
            address: trader.proxyWallet,
            name: trader.userName,
            profileImage: trader.profileImage,
            rank: Number.parseInt(trader.rank, 10),
            totalPnl: trader.pnl,
            totalVolume: trader.vol,
          },
          trade: {
            side: activity.side,
            size: activity.size || 0,
            price: activity.price || 0,
            usdcAmount,
            outcome: activity.outcome,
            outcomeIndex: activity.outcomeIndex,
          },
          market: {
            conditionId: activity.conditionId || activity.asset || "",
            title: activity.title || "Unknown Market",
            slug: activity.slug || "",
            eventSlug: activity.eventSlug || "",
            image: activity.icon,
          },
        });
      }
    }

    // Step 4: Filter activities by time period
    const now = Date.now();
    const timePeriodMs: Record<string, number> = {
      DAY: 24 * 60 * 60 * 1000, // 24 hours
      WEEK: 7 * 24 * 60 * 60 * 1000, // 7 days
      MONTH: 30 * 24 * 60 * 60 * 1000, // 30 days
      ALL: Infinity,
    };
    const cutoffMs = timePeriodMs[timePeriod] || timePeriodMs.WEEK;
    const cutoffTime = cutoffMs === Infinity ? 0 : now - cutoffMs;

    // Filter activities within the time period
    const filteredByTime = allActivities.filter((activity) => {
      const activityTime = new Date(activity.timestamp).getTime();
      return activityTime >= cutoffTime;
    });

    // Sort by timestamp (most recent first)
    filteredByTime.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Limit total results - use higher limits for longer time periods
    const resultLimit: Record<string, number> = {
      DAY: 500,
      WEEK: 500,
      MONTH: 1500,
      ALL: 2000,
    };
    const maxResults = resultLimit[timePeriod] || 500;
    const limitedActivities = filteredByTime.slice(0, maxResults);

    return NextResponse.json({
      success: true,
      activities: limitedActivities,
      whaleCount: topTraders.length,
      totalTrades: limitedActivities.length,
      lastUpdated: new Date().toISOString(),
    } satisfies WhaleActivityResponse);
  } catch (error) {
    console.error("Whale activity API error:", error);
    return NextResponse.json(
      {
        success: false,
        activities: [],
        whaleCount: 0,
        totalTrades: 0,
        lastUpdated: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      } satisfies WhaleActivityResponse,
      { status: 500 }
    );
  }
}
