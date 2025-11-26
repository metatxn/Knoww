import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ERROR_MESSAGES } from "@/lib/constants";
import { createRelayClient } from "@/lib/polymarket";

/**
 * Order types supported by Polymarket CLOB
 * GTC - Good Till Cancelled: Order stays active until filled or cancelled
 * FOK - Fill Or Kill: Order must be filled entirely immediately or cancelled
 * GTD - Good Till Date: Order stays active until expiration time
 */
const OrderTypeEnum = z.enum(["GTC", "FOK", "GTD"]);

// Validation schema for limit orders (pre-signed)
const limitOrderSchema = z.object({
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
  orderType: OrderTypeEnum.optional().default("GTC"),
});

// Validation schema for market orders
const marketOrderSchema = z.object({
  userAddress: z.string().describe("User's wallet address"),
  tokenId: z.string().describe("Token ID for the market"),
  side: z.enum(["BUY", "SELL"]).describe("Order side"),
  amount: z
    .number()
    .positive()
    .describe("Amount in USDC for BUY, shares for SELL"),
  isMarketOrder: z.literal(true),
  negRisk: z.boolean().optional().default(false),
});

// Combined schema that accepts either limit or market orders
const createOrderSchema = z.union([
  limitOrderSchema.extend({ isMarketOrder: z.literal(false).optional() }),
  marketOrderSchema,
]);

/**
 * Error codes for order creation failures
 */
const ORDER_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  ADDRESS_MISMATCH: "ADDRESS_MISMATCH",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  PRICE_OUT_OF_RANGE: "PRICE_OUT_OF_RANGE",
  SIZE_TOO_SMALL: "SIZE_TOO_SMALL",
  ORDER_REJECTED: "ORDER_REJECTED",
  MARKET_CLOSED: "MARKET_CLOSED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

/**
 * POST /api/orders/create
 * Relay a pre-signed order to Polymarket CLOB
 *
 * Supports two order types:
 *
 * 1. Limit Orders (pre-signed):
 *    - Frontend signs the order with user's wallet
 *    - Backend relays to CLOB with builder attribution
 *
 * 2. Market Orders:
 *    - Executes immediately at best available price
 *    - Requires backend to create and sign the order
 *
 * Frontend Flow for Limit Orders:
 * 1. User creates order parameters (tokenID, side, price, size)
 * 2. Frontend signs the order with user's wallet
 * 3. Frontend sends signed order + signature to this endpoint
 * 4. Backend relays to CLOB with builder attribution
 *
 * Frontend Flow for Market Orders:
 * 1. User specifies tokenID, side, and amount
 * 2. Backend creates market order and submits to CLOB
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          errorCode: ORDER_ERROR_CODES.INVALID_REQUEST,
          error: "Invalid request body",
          details: parsed.error.message,
        },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Initialize relay client (with builder attribution)
    const client = createRelayClient();

    // Handle market orders
    if ("isMarketOrder" in data && data.isMarketOrder === true) {
      const { tokenId, side, amount } = data;

      // For market orders, we need to get the current order book
      // and calculate the best price to execute at
      try {
        // Get order book to determine market price
        const orderBook = await client.getOrderBook(tokenId);

        if (!orderBook) {
          return NextResponse.json(
            {
              success: false,
              errorCode: ORDER_ERROR_CODES.MARKET_CLOSED,
              error: "Unable to fetch order book for this market",
            },
            { status: 400 },
          );
        }

        // Market orders execute against the opposite side of the book
        // BUY market order fills against asks (sellers)
        // SELL market order fills against bids (buyers)
        const relevantSide = side === "BUY" ? orderBook.asks : orderBook.bids;

        if (!relevantSide || relevantSide.length === 0) {
          return NextResponse.json(
            {
              success: false,
              errorCode: ORDER_ERROR_CODES.INSUFFICIENT_BALANCE,
              error: `No ${side === "BUY" ? "sellers" : "buyers"} available in the market`,
            },
            { status: 400 },
          );
        }

        // Return market order info - actual execution happens client-side
        // since we need the user's signature
        return NextResponse.json({
          success: true,
          message: "Market order preview generated",
          preview: {
            tokenId,
            side,
            amount,
            bestPrice: relevantSide[0]?.price,
            availableLiquidity: relevantSide.reduce(
              (sum: number, level: { size: string }) =>
                sum + Number.parseFloat(level.size),
              0,
            ),
          },
          note: "Market orders require client-side signing. Use the preview data to create a limit order at market price.",
        });
      } catch (err) {
        console.error("Error processing market order:", err);
        return NextResponse.json(
          {
            success: false,
            errorCode: ORDER_ERROR_CODES.ORDER_REJECTED,
            error:
              err instanceof Error
                ? err.message
                : "Failed to process market order",
          },
          { status: 500 },
        );
      }
    }

    // Handle limit orders (pre-signed)
    const { userAddress, signedOrder, signature, orderType } = data as z.infer<
      typeof limitOrderSchema
    >;

    // Validate user address matches order maker
    if (userAddress.toLowerCase() !== signedOrder.maker.toLowerCase()) {
      return NextResponse.json(
        {
          success: false,
          errorCode: ORDER_ERROR_CODES.ADDRESS_MISMATCH,
          error: "User address does not match order maker",
        },
        { status: 400 },
      );
    }

    // Relay the pre-signed order to CLOB
    const orderWithSignature = { ...signedOrder, signature };

    // Post order with the specified order type
    let response: unknown;
    try {
      response = await client.postOrder(orderWithSignature as never);
    } catch (err) {
      // Parse CLOB-specific errors
      const errorMessage =
        err instanceof Error ? err.message : "Unknown CLOB error";

      // Check for common error patterns
      if (errorMessage.includes("insufficient")) {
        return NextResponse.json(
          {
            success: false,
            errorCode: ORDER_ERROR_CODES.INSUFFICIENT_BALANCE,
            error: "Insufficient balance to place this order",
          },
          { status: 400 },
        );
      }

      if (
        errorMessage.includes("price") ||
        errorMessage.includes("out of range")
      ) {
        return NextResponse.json(
          {
            success: false,
            errorCode: ORDER_ERROR_CODES.PRICE_OUT_OF_RANGE,
            error: "Price is out of valid range (0.01 - 0.99)",
          },
          { status: 400 },
        );
      }

      if (errorMessage.includes("size") || errorMessage.includes("minimum")) {
        return NextResponse.json(
          {
            success: false,
            errorCode: ORDER_ERROR_CODES.SIZE_TOO_SMALL,
            error: "Order size is below minimum",
          },
          { status: 400 },
        );
      }

      throw err;
    }

    return NextResponse.json({
      success: true,
      order: response,
      orderType,
      message: "Order relayed successfully with builder attribution",
    });
  } catch (error) {
    console.error("Error relaying order:", error);
    return NextResponse.json(
      {
        success: false,
        errorCode: ORDER_ERROR_CODES.UNKNOWN_ERROR,
        error:
          error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR,
      },
      { status: 500 },
    );
  }
}
