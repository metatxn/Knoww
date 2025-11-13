import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_MESSAGES } from "@/lib/constants";
import { createRelayClient } from "@/lib/polymarket";

// Validation schema
const cancelOrderSchema = z.object({
  userAddress: z.string().describe("User's wallet address"),
  orderID: z.string().describe("Order ID to cancel"),
  signature: z.string().describe("Cancellation signature from user's wallet"),
});

/**
 * POST /api/orders/cancel
 * Cancel an existing order (requires user signature)
 *
 * Frontend Flow:
 * 1. User selects order to cancel
 * 2. Frontend gets user's signature for cancellation
 * 3. Frontend sends orderID + signature to this endpoint
 * 4. Backend relays cancellation to CLOB
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = cancelOrderSchema.safeParse(body);

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

    const { userAddress, orderID } = parsed.data;

    // Initialize relay client
    const client = createRelayClient();

    // Get order details to verify ownership
    const order = await client.getOrder(orderID);

    // Type cast to handle dynamic order structure
    const orderData = order as unknown as Record<string, unknown>;
    if (
      !order ||
      (orderData.maker as string | undefined)?.toLowerCase() !==
        userAddress.toLowerCase()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Order not found or user is not the maker",
        },
        { status: 403 },
      );
    }

    // Cancel order (cancelOrders takes an array of order IDs)
    const response = await client.cancelOrders([orderID]);

    return NextResponse.json({
      success: true,
      response,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.error("Error canceling order:", error);
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
