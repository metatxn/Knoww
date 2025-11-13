import { type NextRequest, NextResponse } from "next/server";
import { ERROR_MESSAGES } from "@/lib/constants";
import { createRelayClient } from "@/lib/polymarket";

/**
 * GET /api/orders/:orderID
 * Get order details by ID
 * Public endpoint - no authentication needed
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderID: string }> },
) {
  try {
    const { orderID } = await params;

    // Initialize relay client for querying
    const client = createRelayClient();

    // Get order details
    const order = await client.getOrder(orderID);

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Error fetching order:", error);
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
