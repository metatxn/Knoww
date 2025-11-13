import { type NextRequest, NextResponse } from "next/server";
import { initPolymarketClient } from "@/lib/polymarket";

/**
 * GET /api/markets/info/:conditionID
 * Get market information by condition ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conditionID: string }> },
) {
  try {
    const { conditionID } = await params;

    // Initialize Polymarket client
    const client = initPolymarketClient();

    // Get market info
    const market = await client.getMarket(conditionID);

    return NextResponse.json({
      success: true,
      market,
    });
  } catch (error) {
    console.error("Error fetching market info:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
