import { type NextRequest, NextResponse } from "next/server";
import { initPolymarketClient } from "@/lib/polymarket";

/**
 * GET /api/markets/trades/:tokenID
 * Get recent trades for a token
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tokenID: string }> },
) {
  try {
    const { tokenID } = await params;

    // Initialize Polymarket client
    const client = initPolymarketClient();

    // Get trades
    const trades = await client.getTrades({ market: tokenID });

    return NextResponse.json({
      success: true,
      tokenID,
      trades,
    });
  } catch (error) {
    console.error("Error fetching trades:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
