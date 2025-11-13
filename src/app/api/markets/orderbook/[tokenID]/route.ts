import { type NextRequest, NextResponse } from "next/server";
import { initPolymarketClient } from "@/lib/polymarket";

/**
 * GET /api/markets/orderbook/:tokenID
 * Get order book for a token
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tokenID: string }> },
) {
  try {
    const { tokenID } = await params;

    // Initialize Polymarket client
    const client = initPolymarketClient();

    // Get order book
    const orderBook = await client.getOrderBook(tokenID);

    return NextResponse.json({
      success: true,
      tokenID,
      orderBook,
    });
  } catch (error) {
    console.error("Error fetching order book:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
