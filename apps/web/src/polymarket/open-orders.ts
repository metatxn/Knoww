import { type AccountOrder, parseCanonicalId } from "@knoww/services/core";
import type { OpenOrder } from "@/hooks/use-open-orders";
import { checkOrdersScoring } from "./clob/market-data";
import { isFreshAuthenticationRequired } from "./errors";
import {
  forgetPolymarketReadOnlyClient,
  getPolymarketReadOnlyClient,
  type ReadOnlyClientInput,
} from "./read-only-client";

function polymarketOrderDetails(order: AccountOrder): {
  makerAddress?: string;
  clobStatus?: string;
} {
  const details = order.platformDetails as Record<string, unknown> | undefined;
  if (details?.platform !== "polymarket") return {};
  return {
    makerAddress:
      typeof details.makerAddress === "string"
        ? details.makerAddress
        : undefined,
    clobStatus:
      typeof details.clobStatus === "string" ? details.clobStatus : undefined,
  };
}

function toClobStatus(
  order: AccountOrder,
  clobStatus: string | undefined
): OpenOrder["status"] {
  const upper = clobStatus?.toUpperCase();
  if (upper === "LIVE" || upper === "MATCHED" || upper === "CANCELLED") {
    return upper;
  }
  switch (order.status) {
    case "filled":
      return "MATCHED";
    case "cancelled":
    case "rejected":
    case "expired":
      return "CANCELLED";
    default:
      return "LIVE";
  }
}

/**
 * The CLOB lists every resting order in shares. A notional quantity only
 * reaches this list if a venue sizes orders in collateral; the shares it
 * bought are then the filled count, and nothing is left resting.
 */
function orderShares(order: AccountOrder, filledSize: number): number {
  return order.quantity.kind === "shares"
    ? Number(order.quantity.value)
    : filledSize;
}

function toIsoOrEmpty(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * The open-orders list keeps the CLOB's vocabulary (token id, LIVE/MATCHED/
 * CANCELLED, floats) because the portfolio and the outcomes table read it
 * that way. The adapter's canonical order carries the same facts; this
 * unwraps them. `fallbackMaker` stands in when the venue omits the maker.
 */
export function toOpenOrder(
  order: AccountOrder,
  fallbackMaker: string
): OpenOrder {
  const details = polymarketOrderDetails(order);
  const filledSize = Number(order.filled);
  const size = orderShares(order, filledSize);
  return {
    id: order.orderId,
    maker: details.makerAddress || fallbackMaker,
    tokenId: parseCanonicalId(order.outcomeId).sourceId,
    side: order.side === "sell" ? "SELL" : "BUY",
    price: Number(order.price ?? 0),
    size,
    filledSize,
    remainingSize: size - filledSize,
    status: toClobStatus(order, details.clobStatus),
    createdAt: order.createdAt,
    expiration: toIsoOrEmpty(order.expiresAt),
  };
}

/**
 * Which of the wallet's orders count towards liquidity rewards. A passive
 * read: rejected credentials surface as the fresh-authentication error and
 * drop the cached client, so the caller can clear the stored credentials
 * instead of retrying against them.
 */
export async function readPolymarketOrderScoring(
  input: ReadOnlyClientInput,
  orderIds: string[]
): Promise<Record<string, boolean>> {
  if (orderIds.length === 0) return {};
  try {
    const client = await getPolymarketReadOnlyClient(input);
    return await checkOrdersScoring(client, orderIds);
  } catch (error) {
    if (isFreshAuthenticationRequired(error)) {
      forgetPolymarketReadOnlyClient(input);
    }
    throw error;
  }
}
