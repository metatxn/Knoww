import { type NextRequest, NextResponse } from "next/server";
import { fetchTrades } from "@/lib/polymarket";

/**
 * GET /api/markets/trades/:tokenID
 * Get recent trades for a token
 *
 * This is a read-only operation that calls the CLOB API directly
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tokenID: string }> }
) {
  try {
    const { tokenID } = await params;

    // Fetch trades directly from CLOB API
    const trades = await fetchTrades(tokenID);

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
      { status: 500 }
    );
  }
}
