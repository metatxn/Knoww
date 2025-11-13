import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_MESSAGES } from "@/lib/constants";
import { createRelayClient } from "@/lib/polymarket";

// Validation schema
const createOrderSchema = z.object({
  userAddress: z.string().describe("User's wallet address"),
  signedOrder: z
    .object({
      salt: z.string(),
      maker: z.string(),
      signer: z.string(),
      taker: z.string(),
      tokenId: z.string(),
      makerAmount: z.string(),
      takerAmount: z.string(),
      expiration: z.string(),
      nonce: z.string(),
      feeRateBps: z.string(),
      side: z.enum(["BUY", "SELL"]),
      signatureType: z.string(),
    })
    .describe("Pre-signed order object from frontend"),
  signature: z.string().describe("Order signature from user's wallet"),
});

/**
 * POST /api/orders/create
 * Relay a pre-signed order to Polymarket CLOB
 *
 * Frontend Flow:
 * 1. User creates order parameters (tokenID, side, price, size)
 * 2. Frontend signs the order with user's wallet
 * 3. Frontend sends signed order + signature to this endpoint
 * 4. Backend relays to CLOB with builder attribution
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          details: parsed.error.message,
        },
        { status: 400 },
      );
    }

    const { userAddress, signedOrder, signature } = parsed.data;

    // Validate user address matches order maker
    if (userAddress.toLowerCase() !== signedOrder.maker.toLowerCase()) {
      return NextResponse.json(
        {
          success: false,
          error: "User address does not match order maker",
        },
        { status: 400 },
      );
    }

    // Initialize relay client (with builder attribution)
    const client = createRelayClient();

    // Relay the pre-signed order to CLOB
    const orderWithSignature = { ...signedOrder, signature };
    const response = await client.postOrder(orderWithSignature as never);

    return NextResponse.json({
      success: true,
      order: response,
      message: "Order relayed successfully with builder attribution",
    });
  } catch (error) {
    console.error("Error relaying order:", error);
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
