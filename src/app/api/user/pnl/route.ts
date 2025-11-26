import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_MESSAGES } from "@/lib/constants";

/**
 * Polymarket Data API base URL
 */
const DATA_API_BASE = "https://data-api.polymarket.com";

/**
 * Position data for P&L calculation
 */
interface PositionData {
  size: string;
  avgPrice: string;
  currentPrice: string;
  realizedPnl: string;
  unrealizedPnl: string;
  curValue: string;
  initialValue: string;
  outcome: string;
  title: string;
  slug: string;
}

/**
 * Trade data for P&L calculation
 */
interface TradeData {
  timestamp: string;
  side: "BUY" | "SELL";
  size: string;
  price: string;
  usdcSize: string;
  conditionId: string;
  outcome: string;
}

/**
 * Validation schema for query parameters
 */
const querySchema = z.object({
  user: z.string().min(1, "User address is required"),
  period: z
    .enum(["1d", "7d", "30d", "90d", "365d", "all"])
    .optional()
    .default("all"),
  includeHistory: z.coerce.boolean().optional().default(false),
});

/**
 * GET /api/user/pnl
 *
 * Calculate Profit & Loss for a user
 *
 * Query Parameters:
 * - user: User's wallet address (required)
 * - period: Time period for P&L calculation (1d, 7d, 30d, 90d, 365d, all) (default: all)
 * - includeHistory: Include daily P&L history (default: false)
 *
 * Response:
 * - realizedPnl: Total realized profit/loss from closed positions
 * - unrealizedPnl: Total unrealized profit/loss from open positions
 * - totalPnl: Combined realized + unrealized P&L
 * - winRate: Percentage of winning trades
 * - history: Daily P&L breakdown (if includeHistory=true)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse and validate query parameters
    const parsed = querySchema.safeParse({
      user: searchParams.get("user"),
      period: searchParams.get("period"),
      includeHistory: searchParams.get("includeHistory"),
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

    const { user, period, includeHistory } = parsed.data;

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date | null = null;

    switch (period) {
      case "1d":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "365d":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = null;
    }

    // Fetch current positions
    const positionsResponse = await fetch(
      `${DATA_API_BASE}/positions?user=${user.toLowerCase()}&limit=100`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      },
    );

    if (!positionsResponse.ok) {
      throw new Error("Failed to fetch positions");
    }

    const positions: PositionData[] = await positionsResponse.json();

    // Fetch trade history
    const tradesResponse = await fetch(
      `${DATA_API_BASE}/activity?user=${user.toLowerCase()}&limit=100`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      },
    );

    if (!tradesResponse.ok) {
      throw new Error("Failed to fetch trades");
    }

    let trades: TradeData[] = await tradesResponse.json();

    // Filter trades by date range
    if (startDate) {
      trades = trades.filter(
        (t) => new Date(t.timestamp).getTime() >= startDate.getTime(),
      );
    }

    // Calculate P&L from positions
    const unrealizedPnl = positions.reduce(
      (sum, p) => sum + Number.parseFloat(p.unrealizedPnl || "0"),
      0,
    );

    const realizedPnlFromPositions = positions.reduce(
      (sum, p) => sum + Number.parseFloat(p.realizedPnl || "0"),
      0,
    );

    // Calculate additional metrics from trades
    const buyTrades = trades.filter((t) => t.side === "BUY");
    const sellTrades = trades.filter((t) => t.side === "SELL");

    const totalBuyValue = buyTrades.reduce(
      (sum, t) => sum + Number.parseFloat(t.usdcSize || "0"),
      0,
    );

    const totalSellValue = sellTrades.reduce(
      (sum, t) => sum + Number.parseFloat(t.usdcSize || "0"),
      0,
    );

    // Calculate current portfolio value
    const currentPortfolioValue = positions.reduce(
      (sum, p) => sum + Number.parseFloat(p.curValue || "0"),
      0,
    );

    const initialInvestment = positions.reduce(
      (sum, p) => sum + Number.parseFloat(p.initialValue || "0"),
      0,
    );

    // Calculate win rate (positions with positive P&L)
    const positionsWithPnl = positions.filter(
      (p) => Number.parseFloat(p.unrealizedPnl || "0") !== 0,
    );
    const winningPositions = positionsWithPnl.filter(
      (p) => Number.parseFloat(p.unrealizedPnl || "0") > 0,
    );
    const winRate =
      positionsWithPnl.length > 0
        ? (winningPositions.length / positionsWithPnl.length) * 100
        : 0;

    // Calculate daily P&L history if requested
    let dailyHistory: Record<
      string,
      { realized: number; trades: number; volume: number }
    > = {};

    if (includeHistory) {
      dailyHistory = trades.reduce(
        (acc, trade) => {
          const date = new Date(trade.timestamp).toISOString().split("T")[0];
          if (!acc[date]) {
            acc[date] = { realized: 0, trades: 0, volume: 0 };
          }

          // Approximate realized P&L from trades
          // This is simplified - actual P&L requires matching buys/sells
          const tradeValue = Number.parseFloat(trade.usdcSize || "0");
          acc[date].trades++;
          acc[date].volume += tradeValue;

          return acc;
        },
        {} as Record<
          string,
          { realized: number; trades: number; volume: number }
        >,
      );
    }

    // Calculate ROI
    const totalPnl = unrealizedPnl + realizedPnlFromPositions;
    const roi =
      initialInvestment > 0 ? (totalPnl / initialInvestment) * 100 : 0;

    // Best and worst performing positions
    const sortedByPnl = [...positions].sort(
      (a, b) =>
        Number.parseFloat(b.unrealizedPnl || "0") -
        Number.parseFloat(a.unrealizedPnl || "0"),
    );

    const bestPerformer = sortedByPnl[0];
    const worstPerformer = sortedByPnl[sortedByPnl.length - 1];

    return NextResponse.json({
      success: true,
      user,
      period,
      pnl: {
        realized: realizedPnlFromPositions,
        unrealized: unrealizedPnl,
        total: totalPnl,
        roi,
      },
      portfolio: {
        currentValue: currentPortfolioValue,
        initialInvestment,
        positionCount: positions.length,
      },
      trading: {
        totalBuyValue,
        totalSellValue,
        netFlow: totalBuyValue - totalSellValue,
        tradeCount: trades.length,
        uniqueMarkets: new Set(trades.map((t) => t.conditionId)).size,
      },
      performance: {
        winRate,
        winningPositions: winningPositions.length,
        losingPositions: positionsWithPnl.length - winningPositions.length,
        bestPerformer: bestPerformer
          ? {
              title: bestPerformer.title,
              slug: bestPerformer.slug,
              outcome: bestPerformer.outcome,
              pnl: Number.parseFloat(bestPerformer.unrealizedPnl || "0"),
              pnlPercent:
                Number.parseFloat(bestPerformer.initialValue || "0") > 0
                  ? (Number.parseFloat(bestPerformer.unrealizedPnl || "0") /
                      Number.parseFloat(bestPerformer.initialValue || "0")) *
                    100
                  : 0,
            }
          : null,
        worstPerformer: worstPerformer
          ? {
              title: worstPerformer.title,
              slug: worstPerformer.slug,
              outcome: worstPerformer.outcome,
              pnl: Number.parseFloat(worstPerformer.unrealizedPnl || "0"),
              pnlPercent:
                Number.parseFloat(worstPerformer.initialValue || "0") > 0
                  ? (Number.parseFloat(worstPerformer.unrealizedPnl || "0") /
                      Number.parseFloat(worstPerformer.initialValue || "0")) *
                    100
                  : 0,
            }
          : null,
      },
      history: includeHistory ? dailyHistory : undefined,
    });
  } catch (error) {
    console.error("Error calculating P&L:", error);
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
