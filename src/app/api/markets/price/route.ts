import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { initPolymarketClient } from "@/lib/polymarket";

// Validation schema
const priceSchema = z.object({
  tokenID: z.string().describe("Token ID for the market outcome"),
  side: z.enum(["BUY", "SELL"]).optional().describe("Side to get price for"),
});

/**
 * GET /api/markets/price
 * Get current price for a token
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tokenID = searchParams.get("tokenID");
    const side = searchParams.get("side");

    const parsed = priceSchema.safeParse({ tokenID, side });

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

    // Initialize Polymarket client
    const client = initPolymarketClient();

    // Get price
    const price = parsed.data.side
      ? await client.getPrice(
          parsed.data.tokenID,
          parsed.data.side as "BUY" | "SELL",
        )
      : await client.getMidpoint(parsed.data.tokenID);

    return NextResponse.json({
      success: true,
      tokenID: parsed.data.tokenID,
      side: parsed.data.side || "midpoint",
      price,
    });
  } catch (error) {
    console.error("Error fetching price:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
