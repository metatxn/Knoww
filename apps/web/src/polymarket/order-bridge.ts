import {
  buildCanonicalId,
  type CanonicalOrderIntent,
  type OrderDraft,
  type WalletIdentity,
} from "@knoww/services/core";
import { POLYMARKET_PLATFORM } from "@knoww/services/platforms/polymarket";
import {
  CLOB_ORDER_TYPES,
  type ClobOrderType,
  TRADING_SIDES,
  type TradingSide,
} from "@knoww/shared-types/polymarket";
import { z } from "zod";

export { POLYMARKET_PLATFORM };

export const Side = TRADING_SIDES;
export type Side = TradingSide;

/**
 * Order type enum
 * @see https://docs.polymarket.com/developers/CLOB/orders/create-order
 */
export const OrderType = CLOB_ORDER_TYPES;
export type OrderType = ClobOrderType;

/**
 * The order a legacy ticket describes: CLOB vocabulary (BUY/SELL, GTC/GTD/
 * FAK/FOK, floats). `usePlaceOrder().createOrder` takes this shape so the
 * trading form and quick-sell keep working unchanged while the placement
 * itself goes through the platform adapter.
 */
export interface LegacyOrderRequest {
  tokenId: string;
  /** Required to place: the adapter loads the market by condition id. */
  conditionId?: string | undefined;
  price: number;
  size: number;
  /** USD notional for a market BUY. */
  amount?: number | undefined;
  side: "BUY" | "SELL";
  /** Omitted means a resting GTC limit, as the CLOB SDK defaults. */
  orderType?: "GTC" | "GTD" | "FAK" | "FOK" | undefined;
  /** Unix seconds; GTD only. */
  expiration?: number | undefined;
}

/**
 * What the ticket hands `usePlaceOrder().createOrder`. `negRisk` picks the
 * exchange the pre-order approvals and the wrap target; the adapter reads it
 * again from the market when it drafts.
 * @see https://docs.polymarket.com/developers/CLOB/neg-risk
 */
export interface CreateOrderParams extends LegacyOrderRequest {
  side: Side;
  orderType?: OrderType | undefined;
  negRisk?: boolean | undefined;
}

/** Decimal text without exponent notation, which the intent schema rejects. */
function decimal(value: number): string {
  const plain = String(value);
  if (!/e/i.test(plain)) return plain;
  return value.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Maps a legacy ticket onto the canonical intent every platform adapter
 * takes. Market BUYs spend a notional, everything else is sized in shares;
 * a positive price on a market order is the slippage bound.
 */
export function toCanonicalOrderIntent(
  params: LegacyOrderRequest,
  identity: WalletIdentity
): CanonicalOrderIntent {
  if (!params.conditionId) {
    throw new Error(
      "This position is missing its market id. Refresh your portfolio and try again."
    );
  }
  const side = params.side === "BUY" ? "buy" : "sell";
  const orderType = params.orderType ?? "GTC";
  const common = {
    schemaVersion: "1" as const,
    platform: POLYMARKET_PLATFORM,
    identity,
    marketId: buildCanonicalId(POLYMARKET_PLATFORM, params.conditionId),
    outcomeId: buildCanonicalId(POLYMARKET_PLATFORM, params.tokenId),
    side,
  } as const;

  if (orderType === "FAK" || orderType === "FOK") {
    const spendsNotional =
      side === "buy" && params.amount !== undefined && params.amount > 0;
    return {
      ...common,
      orderType: "market",
      timeInForce: orderType === "FAK" ? "ioc" : "fok",
      ...(params.price > 0 ? { price: decimal(params.price) } : {}),
      quantity: spendsNotional
        ? {
            kind: "notional",
            amount: { value: decimal(params.amount as number), unit: "USD" },
          }
        : { kind: "shares", value: decimal(params.size) },
    };
  }

  if (orderType === "GTD") {
    if (params.expiration === undefined || params.expiration <= 0) {
      throw new Error("A good-till-date order needs an expiration.");
    }
    return {
      ...common,
      orderType: "limit",
      timeInForce: "gtd",
      expiresAt: new Date(params.expiration * 1000).toISOString(),
      price: decimal(params.price),
      quantity: { kind: "shares", value: decimal(params.size) },
    };
  }

  return {
    ...common,
    orderType: "limit",
    timeInForce: "gtc",
    price: decimal(params.price),
    quantity: { kind: "shares", value: decimal(params.size) },
  };
}

const rawUnits = z.string().regex(/^\d+$/);

const draftDetailsSchema = z.object({
  platform: z.literal(POLYMARKET_PLATFORM),
  negRisk: z.boolean(),
  requiredCollateralRaw: rawUnits.optional(),
  reservedCollateralRaw: rawUnits.optional(),
  requiredNotionalRaw: rawUnits.optional(),
  estimatedFeeRaw: rawUnits.nullable().optional(),
  requiredConditionalRaw: rawUnits.optional(),
});

export interface PolymarketBuyRequirements {
  /** Notional plus the fee reserve: what the CLOB checks against. */
  requiredCollateralRaw: bigint;
  /** pUSD already locked by this wallet's open BUY orders. */
  reservedCollateralRaw: bigint;
  /** The pUSD the order spends before fees. */
  requiredNotionalRaw: bigint;
  /** Null when the market carries no fee metadata: unknown, not zero. */
  estimatedFeeRaw: bigint | null;
}

export interface PolymarketDraftRequirements {
  negRisk: boolean;
  buy: PolymarketBuyRequirements | null;
  sell: { requiredConditionalRaw: bigint } | null;
}

/**
 * What the on-chain port must satisfy before the adapter places a draft:
 * pUSD to hold or wrap for a BUY, shares to hold for a SELL, and which
 * exchange contract the approvals target.
 */
export function polymarketDraftRequirements(
  draft: OrderDraft
): PolymarketDraftRequirements {
  const parsed = draftDetailsSchema.safeParse(draft.platformDetails);
  if (!parsed.success) {
    throw new Error("Expected a Polymarket order draft.");
  }
  const details = parsed.data;
  const buy =
    details.requiredCollateralRaw !== undefined &&
    details.reservedCollateralRaw !== undefined &&
    details.requiredNotionalRaw !== undefined
      ? {
          requiredCollateralRaw: BigInt(details.requiredCollateralRaw),
          reservedCollateralRaw: BigInt(details.reservedCollateralRaw),
          requiredNotionalRaw: BigInt(details.requiredNotionalRaw),
          estimatedFeeRaw:
            details.estimatedFeeRaw === null ||
            details.estimatedFeeRaw === undefined
              ? null
              : BigInt(details.estimatedFeeRaw),
        }
      : null;
  const sell =
    details.requiredConditionalRaw !== undefined
      ? { requiredConditionalRaw: BigInt(details.requiredConditionalRaw) }
      : null;
  return { negRisk: details.negRisk, buy, sell };
}
