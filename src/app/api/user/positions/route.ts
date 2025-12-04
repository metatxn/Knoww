import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_MESSAGES } from "@/lib/constants";

/**
 * Polymarket Data API base URL
 */
const DATA_API_BASE = "https://data-api.polymarket.com";

/**
 * Position data from Polymarket Data API
 * Based on actual response from: /positions?user={address}&sizeThreshold=.1&redeemable=true
 */
interface PolymarketPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  curPrice: number;
  redeemable: boolean;
  mergeable: boolean;
  title: string;
  slug: string;
  icon: string;
  eventId: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string;
  negativeRisk: boolean;
}

/**
 * Helper to convert null/empty to undefined for optional fields
 */
const optionalString = z
  .string()
  .optional()
  .nullable()
  .transform((val) => (val === null || val === "" ? undefined : val));

const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((val) => {
    if (val === null || val === "" || val === undefined) return undefined;
    return Number(val);
  });

const optionalBoolean = z
  .union([z.string(), z.boolean()])
  .optional()
  .nullable()
  .transform((val) => {
    if (val === null || val === "" || val === undefined) return undefined;
    if (typeof val === "boolean") return val;
    return val === "true";
  });

/**
 * Validation schema for query parameters
 */
const querySchema = z.object({
  user: z.string().min(1, "User address is required"),
  limit: optionalNumber.pipe(
    z.number().min(1).max(100).optional().default(100)
  ),
  offset: optionalNumber.pipe(z.number().min(0).optional().default(0)),
  sizeThreshold: optionalNumber.pipe(z.number().optional().default(0.1)),
  redeemable: optionalBoolean.pipe(z.boolean().optional().default(true)),
  market: optionalString,
});

/**
 * GET /api/user/positions
 *
 * Fetch current positions for a user from Polymarket Data API
 * Uses the exact endpoint format: /positions?user={address}&sizeThreshold=.1&redeemable=true&limit=100&offset=0
 *
 * Query Parameters:
 * - user: User's wallet address (required)
 * - limit: Number of positions to return (default: 100, max: 100)
 * - offset: Pagination offset (default: 0)
 * - sizeThreshold: Minimum position size (default: 0.1)
 * - redeemable: Include redeemable positions (default: true)
 * - market: Filter by market/condition ID (optional)
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
      sizeThreshold: searchParams.get("sizeThreshold"),
      redeemable: searchParams.get("redeemable"),
      market: searchParams.get("market"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query parameters",
          details: parsed.error.message,
        },
        { status: 400 }
      );
    }

    const { user, limit, offset, sizeThreshold, redeemable, market } =
      parsed.data;

    // Build query URL using exact Polymarket format
    const queryParams = new URLSearchParams({
      user: user.toLowerCase(),
      sizeThreshold: sizeThreshold.toString(),
      redeemable: redeemable.toString(),
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
      }
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
        { status: response.status }
      );
    }

    const positions: PolymarketPosition[] = await response.json();

    // Calculate totals using actual field names from API
    const totalValue = positions.reduce(
      (sum, p) => sum + (p.currentValue || 0),
      0
    );

    const totalUnrealizedPnl = positions.reduce(
      (sum, p) => sum + (p.cashPnl || 0),
      0
    );

    const totalRealizedPnl = positions.reduce(
      (sum, p) => sum + (p.realizedPnl || 0),
      0
    );

    // Transform positions for frontend
    const transformedPositions = positions.map((p) => ({
      id: `${p.conditionId}-${p.outcomeIndex}`,
      asset: p.asset,
      conditionId: p.conditionId,
      outcomeIndex: p.outcomeIndex,
      outcome: p.outcome,
      oppositeOutcome: p.oppositeOutcome,
      size: p.size,
      avgPrice: p.avgPrice,
      currentPrice: p.curPrice,
      currentValue: p.currentValue,
      initialValue: p.initialValue,
      unrealizedPnl: p.cashPnl,
      unrealizedPnlPercent: p.percentPnl,
      realizedPnl: p.realizedPnl,
      realizedPnlPercent: p.percentRealizedPnl,
      totalBought: p.totalBought,
      redeemable: p.redeemable,
      mergeable: p.mergeable,
      market: {
        title: p.title,
        slug: p.slug,
        eventSlug: p.eventSlug,
        eventId: p.eventId,
        icon: p.icon,
        endDate: p.endDate,
        negativeRisk: p.negativeRisk,
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
        hasMore: positions.length === limit,
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
      { status: 500 }
    );
  }
}
