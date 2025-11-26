import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_MESSAGES } from "@/lib/constants";

/**
 * Polymarket Data API base URL
 */
const DATA_API_BASE = "https://data-api.polymarket.com";

/**
 * Position data from Polymarket
 */
interface PolymarketPosition {
  id: string;
  asset: string;
  conditionId: string;
  outcomeIndex: number;
  size: string;
  avgPrice: string;
  currentPrice: string;
  realizedPnl: string;
  unrealizedPnl: string;
  curValue: string;
  initialValue: string;
  cashBalance: string;
  title: string;
  slug: string;
  icon: string;
  outcome: string;
  eventSlug: string;
  endDate: string;
  market: {
    question: string;
    outcomes: string[];
  };
}

/**
 * Validation schema for query parameters
 */
const querySchema = z.object({
  user: z.string().min(1, "User address is required"),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  market: z.string().optional(), // Filter by market/condition ID
  active: z.coerce.boolean().optional().default(true), // Only active positions
});

/**
 * GET /api/user/positions
 *
 * Fetch current positions for a user from Polymarket Data API
 *
 * Query Parameters:
 * - user: User's wallet address (required)
 * - limit: Number of positions to return (default: 50, max: 100)
 * - offset: Pagination offset (default: 0)
 * - market: Filter by market/condition ID (optional)
 * - active: Only return active positions (default: true)
 *
 * Response:
 * - positions: Array of position objects with market details
 * - totalValue: Total value of all positions
 * - totalPnl: Total unrealized P&L
 * - count: Number of positions returned
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
      active: searchParams.get("active"),
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

    const { user, limit, offset, market, active } = parsed.data;

    // Build query URL
    const queryParams = new URLSearchParams({
      user: user.toLowerCase(),
      limit: limit.toString(),
      offset: offset.toString(),
    });

    if (market) {
      queryParams.set("market", market);
    }

    // Fetch positions from Polymarket Data API
    const response = await fetch(
      `${DATA_API_BASE}/positions?${queryParams.toString()}`,
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
          error: "Failed to fetch positions from Polymarket",
          details: response.status,
        },
        { status: response.status },
      );
    }

    const data: PolymarketPosition[] = await response.json();

    // Filter active positions if requested
    let positions = data;
    if (active) {
      positions = data.filter(
        (p) =>
          Number.parseFloat(p.size) > 0 && Number.parseFloat(p.curValue) > 0,
      );
    }

    // Calculate totals
    const totalValue = positions.reduce(
      (sum, p) => sum + Number.parseFloat(p.curValue || "0"),
      0,
    );

    const totalUnrealizedPnl = positions.reduce(
      (sum, p) => sum + Number.parseFloat(p.unrealizedPnl || "0"),
      0,
    );

    const totalRealizedPnl = positions.reduce(
      (sum, p) => sum + Number.parseFloat(p.realizedPnl || "0"),
      0,
    );

    // Transform positions for frontend
    const transformedPositions = positions.map((p) => ({
      id: p.id,
      asset: p.asset,
      conditionId: p.conditionId,
      outcomeIndex: p.outcomeIndex,
      outcome: p.outcome,
      size: Number.parseFloat(p.size),
      avgPrice: Number.parseFloat(p.avgPrice),
      currentPrice: Number.parseFloat(p.currentPrice),
      currentValue: Number.parseFloat(p.curValue),
      initialValue: Number.parseFloat(p.initialValue),
      unrealizedPnl: Number.parseFloat(p.unrealizedPnl),
      unrealizedPnlPercent:
        Number.parseFloat(p.initialValue) > 0
          ? (Number.parseFloat(p.unrealizedPnl) /
              Number.parseFloat(p.initialValue)) *
            100
          : 0,
      realizedPnl: Number.parseFloat(p.realizedPnl),
      market: {
        title: p.title,
        slug: p.slug,
        eventSlug: p.eventSlug,
        icon: p.icon,
        question: p.market?.question,
        outcomes: p.market?.outcomes,
        endDate: p.endDate,
      },
    }));

    return NextResponse.json({
      success: true,
      user,
      positions: transformedPositions,
      summary: {
        totalValue,
        totalUnrealizedPnl,
        totalRealizedPnl,
        totalPnl: totalUnrealizedPnl + totalRealizedPnl,
        positionCount: positions.length,
      },
      pagination: {
        limit,
        offset,
        hasMore: data.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching positions:", error);
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
