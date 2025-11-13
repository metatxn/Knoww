import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_MESSAGES } from "@/lib/constants";
import { createRelayClient } from "@/lib/polymarket";

// Validation schema
const listOrdersSchema = z.object({
  userAddress: z.string().describe("User's wallet address"),
});

/**
 * GET /api/orders/list
 * Get all open orders for a specific user address
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userAddress = searchParams.get("userAddress");

    const parsed = listOrdersSchema.safeParse({ userAddress });

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

    // Initialize relay client
    const client = createRelayClient();

    // Get open orders for the user
    const allOrders = await client.getOpenOrders();

    // Filter orders by user address
    const userOrders =
      allOrders?.filter(
        (order) =>
          (
            (order as unknown as Record<string, unknown>).maker as
              | string
              | undefined
          )?.toLowerCase() === parsed.data.userAddress.toLowerCase(),
      ) || [];

    return NextResponse.json({
      success: true,
      count: userOrders.length,
      orders: userOrders,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
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
