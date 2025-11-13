import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_MESSAGES } from "@/lib/constants";
import { initPolymarketClient } from "@/lib/polymarket";

// Validation schema
const userAddressSchema = z.object({
  userAddress: z.string().describe("User's wallet address"),
});

/**
 * GET /api/wallet/positions
 * Get open positions for a specific user address
 *
 * Query params: ?userAddress=0x...
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userAddress = searchParams.get("userAddress");

    const parsed = userAddressSchema.safeParse({ userAddress });

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

    // Initialize Polymarket client with user's address
    const client = initPolymarketClient(parsed.data.userAddress);

    // Get positions (open orders) for the user
    const allPositions = await client.getOpenOrders();

    // Filter positions by user address
    const userPositions =
      allPositions?.filter(
        (position) =>
          (
            (position as unknown as Record<string, unknown>).maker as
              | string
              | undefined
          )?.toLowerCase() === parsed.data.userAddress.toLowerCase(),
      ) || [];

    return NextResponse.json({
      success: true,
      userAddress: parsed.data.userAddress,
      count: userPositions.length,
      positions: userPositions,
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
