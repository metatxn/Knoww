import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_MESSAGES } from "@/lib/constants";

/**
 * Polymarket Data API base URL
 */
const DATA_API_BASE = "https://data-api.polymarket.com";

/**
 * Trade/Activity data from Polymarket
 */
interface PolymarketActivity {
  id: string;
  proxyWallet: string;
  timestamp: string;
  conditionId: string;
  type: "TRADE" | "REDEEM" | "MERGE" | "SPLIT";
  size: string;
  usdcSize: string;
  transactionHash: string;
  price: string;
  asset: string;
  side: "BUY" | "SELL";
  outcomeIndex: number;
  title: string;
  slug: string;
  icon: string;
  eventSlug: string;
  outcome: string;
  name: string;
  pseudonym: string;
  bio: string;
  profileImage: string;
  profileImageOptimized: string;
}

/**
 * Validation schema for query parameters
 */
const querySchema = z.object({
  user: z.string().min(1, "User address is required"),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  market: z.string().optional(), // Filter by market/condition ID
  type: z
    .enum(["TRADE", "REDEEM", "MERGE", "SPLIT", "ALL"])
    .optional()
    .default("ALL"),
  startDate: z.string().optional(), // ISO date string
  endDate: z.string().optional(), // ISO date string
});

/**
 * GET /api/user/trades
 *
 * Fetch trade history for a user from Polymarket Data API
 *
 * Query Parameters:
 * - user: User's wallet address (required)
 * - limit: Number of trades to return (default: 50, max: 100)
 * - offset: Pagination offset (default: 0)
 * - market: Filter by market/condition ID (optional)
 * - type: Filter by activity type (TRADE, REDEEM, MERGE, SPLIT, ALL) (default: ALL)
 * - startDate: Filter trades after this date (ISO string)
 * - endDate: Filter trades before this date (ISO string)
 *
 * Response:
 * - trades: Array of trade objects with market details
 * - totalVolume: Total trading volume
 * - count: Number of trades returned
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse and validate query parameters
    const parsed = querySchema.safeParse({
      user: searchParams.get("user"),
      limit: searchParams.get("limit"),
      offset: searchParams.get("offset"),
      market: searchParams.get("market"),
      type: searchParams.get("type"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query parameters",
          details: parsed.error.message,
        },
        { status: 400 },
      );
    }

    const { user, limit, offset, market, type, startDate, endDate } =
      parsed.data;

    // Build query URL
    const queryParams = new URLSearchParams({
      user: user.toLowerCase(),
      limit: limit.toString(),
      offset: offset.toString(),
    });

    if (market) {
      queryParams.set("market", market);
    }

    // Fetch activity from Polymarket Data API
    const response = await fetch(
      `${DATA_API_BASE}/activity?${queryParams.toString()}`,
      {
        headers: {
          Accept: "application/json",
        },
        next: { revalidate: 30 }, // Cache for 30 seconds
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Polymarket API error:", errorText);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch trades from Polymarket",
          details: response.status,
        },
        { status: response.status },
      );
    }

    let data: PolymarketActivity[] = await response.json();

    // Filter by type if specified
    if (type !== "ALL") {
      data = data.filter((t) => t.type === type);
    }

    // Filter by date range if specified
    if (startDate) {
      const start = new Date(startDate).getTime();
      data = data.filter((t) => new Date(t.timestamp).getTime() >= start);
    }

    if (endDate) {
      const end = new Date(endDate).getTime();
      data = data.filter((t) => new Date(t.timestamp).getTime() <= end);
    }

    // Calculate totals
    const totalVolume = data.reduce(
      (sum, t) => sum + Number.parseFloat(t.usdcSize || "0"),
      0,
    );

    const buyVolume = data
      .filter((t) => t.side === "BUY")
      .reduce((sum, t) => sum + Number.parseFloat(t.usdcSize || "0"), 0);

    const sellVolume = data
      .filter((t) => t.side === "SELL")
      .reduce((sum, t) => sum + Number.parseFloat(t.usdcSize || "0"), 0);

    // Transform trades for frontend
    const transformedTrades = data.map((t) => ({
      id: t.id,
      timestamp: t.timestamp,
      type: t.type,
      side: t.side,
      size: Number.parseFloat(t.size),
      price: Number.parseFloat(t.price),
      usdcAmount: Number.parseFloat(t.usdcSize),
      outcomeIndex: t.outcomeIndex,
      outcome: t.outcome,
      transactionHash: t.transactionHash,
      market: {
        conditionId: t.conditionId,
        title: t.title,
        slug: t.slug,
        eventSlug: t.eventSlug,
        icon: t.icon,
        asset: t.asset,
      },
    }));

    // Group by date for summary
    const tradesByDate = transformedTrades.reduce(
      (acc, trade) => {
        const date = new Date(trade.timestamp).toISOString().split("T")[0];
        if (!acc[date]) {
          acc[date] = { count: 0, volume: 0 };
        }
        acc[date].count++;
        acc[date].volume += trade.usdcAmount;
        return acc;
      },
      {} as Record<string, { count: number; volume: number }>,
    );

    return NextResponse.json({
      success: true,
      user,
      trades: transformedTrades,
      summary: {
        totalVolume,
        buyVolume,
        sellVolume,
        tradeCount: data.length,
        uniqueMarkets: new Set(data.map((t) => t.conditionId)).size,
      },
      dailySummary: tradesByDate,
      pagination: {
        limit,
        offset,
        hasMore: data.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching trades:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR,
      },
      { status: 500 },
    );
  }
}
