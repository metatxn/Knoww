import { NextResponse } from "next/server";

/**
 * POST /api/orders/create
 *
 * This endpoint has been deprecated.
 * Order creation now happens on the frontend using the useClobClient hook
 * which uses the real user signer for authentication and the ClobClient SDK.
 *
 * Use the `createOrder()` method from the useClobClient hook instead.
 *
 * Benefits of frontend order creation:
 * - Real user signer from MetaMask (no dummy wallet)
 * - Direct ClobClient SDK integration
 * - Proper builder attribution via BuilderConfig
 * - Better security (user's private key never leaves their browser)
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        "This endpoint has been deprecated. Use the frontend useClobClient hook's createOrder() method instead.",
      hint: "Order creation requires user wallet signing which is now handled on the frontend with the ClobClient SDK.",
    },
    { status: 410 } // 410 Gone
  );
}
