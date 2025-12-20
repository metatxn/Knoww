import { NextResponse } from "next/server";

/**
 * POST /api/orders/cancel
 *
 * This endpoint has been deprecated.
 * Order cancellation now happens on the frontend using the useClobClient hook
 * which uses the real user signer for authentication.
 *
 * Use the `cancelOrder()` method from the useClobClient hook instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        "This endpoint has been deprecated. Use the frontend useClobClient hook's cancelOrder() method instead.",
      hint: "Order operations require user wallet authentication which is now handled on the frontend.",
    },
    { status: 410 } // 410 Gone
  );
}
