import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_MESSAGES } from "@/lib/constants";
import { initPolymarketClient } from "@/lib/polymarket";

// Validation schema
const userAddressSchema = z.object({
  userAddress: z.string().describe("User's wallet address"),
});

/**
 * GET /api/wallet/balances
 * Get wallet balance and allowance for a specific user address
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

    // Get balance and allowance for the user
    const balances = await client.getBalanceAllowance();

    return NextResponse.json({
      success: true,
      userAddress: parsed.data.userAddress,
      balances,
    });
  } catch (error) {
    console.error("Error fetching balances:", error);
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
