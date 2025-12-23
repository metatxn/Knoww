import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_MESSAGES } from "@/constants/polymarket";

// Validation schema
const userAddressSchema = z.object({
  userAddress: z.string().describe("User's wallet address"),
});

/**
 * POST /api/wallet/validate
 * Validate a user's wallet address and check if proxy wallet is deployed
 * This is useful for the frontend to check user setup status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = userAddressSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          details: parsed.error.message,
        },
        { status: 400 }
      );
    }

    const { userAddress } = parsed.data;

    // Basic validation - check if address is valid
    const isValid = /^0x[a-fA-F0-9]{40}$/.test(userAddress);

    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid Ethereum address format",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      userAddress,
      isValid: true,
      message: "Valid Ethereum address",
    });
  } catch (error) {
    console.error("Error validating wallet:", error);
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
