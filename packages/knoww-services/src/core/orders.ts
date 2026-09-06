import Decimal from "decimal.js";
import { z } from "zod";
import { isBoundedDecimal } from "../validation";
import { platformError } from "./errors";
import { PLATFORM_IDS, type PlatformId, parseCanonicalId } from "./ids";
import {
  CANONICAL_SCHEMA_VERSION,
  type CanonicalSchemaVersion,
  type DecimalAmount,
  type DecimalString,
  type IsoTimestamp,
  type MarketStatus,
  type Page,
  type PlatformDetails,
  type TradeSide,
} from "./types";

/**
 * Canonical order model, version 1. Rules follow docs/single-api-layer.md
 * (Order execution contract, Price unit) and the ADR
 * docs/decisions/2026-09-03-aggregator-platform-adapters.md (Trading adapter
 * (M3), Identity).
 *
 * Money and quantities are decimal strings so that no float ever reaches a
 * signer. Prices sit in 0..1 on every platform; the platform folder scales
 * them to its own unit (Kalshi cents, CLOB decimals).
 */

/**
 * Account types a wallet identity can carry. These are Polymarket's account
 * kinds, named here because the CLOB signature type depends on them: the
 * Deposit Wallet is the default, the Safe is legacy, and an EOA signs for
 * itself.
 */
export const WALLET_ACCOUNT_TYPES = ["eoa", "safe", "deposit_wallet"] as const;
export type WalletAccountType = (typeof WALLET_ACCOUNT_TYPES)[number];

const platformIdSchema = z.enum(PLATFORM_IDS);
const evmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, {
  message: "Expected an EVM address",
});

export const walletIdentitySchema = z.strictObject({
  kind: z.literal("wallet"),
  platform: platformIdSchema,
  /** The signing address (the connected EOA). */
  address: evmAddressSchema,
  accountType: z.enum(WALLET_ACCOUNT_TYPES),
  /**
   * The contract wallet that holds funds and positions when `accountType`
   * is not `eoa`.
   */
  tradingAddress: evmAddressSchema.optional(),
});

/** Broker-backed platforms (Kalshi). Declared so the union exists from day one; unimplemented. */
export const brokerIdentitySchema = z.strictObject({
  kind: z.literal("broker"),
  platform: platformIdSchema,
  accountId: z.string().trim().min(1),
});

export const platformIdentitySchema = z.discriminatedUnion("kind", [
  walletIdentitySchema,
  brokerIdentitySchema,
]);

export type WalletIdentity = z.infer<typeof walletIdentitySchema>;
export type BrokerIdentity = z.infer<typeof brokerIdentitySchema>;
export type PlatformIdentity = z.infer<typeof platformIdentitySchema>;

export const ORDER_TYPES = ["limit", "market"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

/**
 * gtc/gtd belong to limit orders (Polymarket GTC/GTD, Kalshi
 * good_till_canceled with or without `expiration_ts`); ioc/fok belong to
 * market orders (Polymarket FAK/FOK, Kalshi immediate_or_cancel/fill_or_kill).
 */
export const TIME_IN_FORCE = ["gtc", "gtd", "ioc", "fok"] as const;
export type TimeInForce = (typeof TIME_IN_FORCE)[number];

const LIMIT_TIME_IN_FORCE: ReadonlySet<TimeInForce> = new Set(["gtc", "gtd"]);
const MARKET_TIME_IN_FORCE: ReadonlySet<TimeInForce> = new Set(["ioc", "fok"]);

const decimalStringSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => isBoundedDecimal(value), "Expected a decimal string");

/** A price as a probability: decimal string in 0..1 inclusive. */
export const priceSchema = decimalStringSchema.refine(
  (value) => isBoundedDecimal(value, { min: "0", max: "1" }),
  "Expected a price in 0..1"
);

const positiveDecimalSchema = decimalStringSchema.refine(
  (value) => isBoundedDecimal(value, { min: "0", minExclusive: true }),
  "Expected a positive decimal"
);

export const decimalAmountSchema = z.strictObject({
  value: positiveDecimalSchema,
  unit: z.string().trim().min(1),
});

/**
 * What the order is sized in. Shares (Polymarket outcome tokens, Kalshi
 * contracts) or collateral (a market BUY on Polymarket spends a notional
 * amount, Kalshi a `buy_max_cost`).
 */
export const orderQuantitySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("shares"), value: positiveDecimalSchema }),
  z.strictObject({ kind: z.literal("notional"), amount: decimalAmountSchema }),
]);
export type OrderQuantity = z.infer<typeof orderQuantitySchema>;

const isoTimestampSchema = z.iso.datetime({ offset: true });

function idOnPlatform(id: string, platform: PlatformId): boolean {
  try {
    return parseCanonicalId(id).platform === platform;
  } catch {
    return false;
  }
}

export const orderIntentSchema = z
  .strictObject({
    schemaVersion: z.literal(CANONICAL_SCHEMA_VERSION),
    platform: platformIdSchema,
    identity: platformIdentitySchema,
    /** `platform:sourceMarketId`. */
    marketId: z.string().trim().min(1),
    /** `platform:sourceOutcomeId`. */
    outcomeId: z.string().trim().min(1),
    side: z.enum(["buy", "sell"]),
    orderType: z.enum(ORDER_TYPES),
    timeInForce: z.enum(TIME_IN_FORCE),
    /** Required with `gtd`; the platform folder converts it to its own clock. */
    expiresAt: isoTimestampSchema.optional(),
    /**
     * Limit price, or the worst acceptable price on a market order (the
     * slippage bound). Required on limit orders.
     */
    price: priceSchema.optional(),
    quantity: orderQuantitySchema,
    /** Caller-chosen id echoed back on the draft and the result. */
    clientOrderId: z.string().trim().min(1).max(128).optional(),
  })
  .superRefine((intent, ctx) => {
    if (intent.identity.platform !== intent.platform) {
      ctx.addIssue({
        code: "custom",
        path: ["identity", "platform"],
        message: "Identity platform must match the intent platform",
      });
    }
    for (const key of ["marketId", "outcomeId"] as const) {
      if (!idOnPlatform(intent[key], intent.platform)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `Expected a ${intent.platform} canonical id`,
        });
      }
    }
    const allowed =
      intent.orderType === "limit" ? LIMIT_TIME_IN_FORCE : MARKET_TIME_IN_FORCE;
    if (!allowed.has(intent.timeInForce)) {
      ctx.addIssue({
        code: "custom",
        path: ["timeInForce"],
        message: `${intent.timeInForce} is not valid for ${intent.orderType} orders`,
      });
    }
    if (intent.timeInForce === "gtd" && intent.expiresAt === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "gtd orders need an expiration",
      });
    }
    if (intent.timeInForce !== "gtd" && intent.expiresAt !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Only gtd orders carry an expiration",
      });
    }
    if (intent.orderType === "limit" && intent.price === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["price"],
        message: "Limit orders need a price",
      });
    }
  });

export type CanonicalOrderIntent = z.infer<typeof orderIntentSchema>;

/**
 * Every mutation carries a caller-minted idempotency key so a retried
 * request never places or cancels twice.
 */
export const idempotencyKeySchema = z.string().trim().min(8).max(128);

/**
 * `placeOrder` accepts only the draft id and the idempotency key. It must
 * never accept a second free-form version of the trade, so the object is
 * strict: any trade field alongside the draft id fails validation.
 */
export const placeDraftInputSchema = z.strictObject({
  draftId: z.string().trim().min(1),
  idempotencyKey: idempotencyKeySchema,
});
export type PlaceDraftInput = z.infer<typeof placeDraftInputSchema>;

export const cancelOrderInputSchema = z.strictObject({
  identity: platformIdentitySchema,
  /** The platform order id returned by `placeOrder` or `getAccountOrders`. */
  orderId: z.string().trim().min(1),
  idempotencyKey: idempotencyKeySchema,
});
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>;

/**
 * Money arithmetic. Forty significant digits covers any notional a
 * prediction market can express; the result is always a plain decimal
 * string without exponent notation.
 */
const Money = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_EVEN,
});

function money(value: DecimalString): Decimal {
  return new Money(value);
}

/**
 * The collateral an order commits (BUY) or the proceeds it asks for (SELL),
 * before fees. A shares order needs a price; pass the expected fill price
 * for a market order that carries no bound.
 */
export function orderNotional(
  intent: CanonicalOrderIntent,
  price: DecimalString | undefined = intent.price
): DecimalString {
  if (intent.quantity.kind === "notional") {
    return money(intent.quantity.amount.value).toFixed();
  }
  if (price === undefined) {
    throw new Error("A shares order needs a price to compute its notional");
  }
  return money(price).times(intent.quantity.value).toFixed();
}

export function addDecimalAmounts(
  a: DecimalAmount,
  b: DecimalAmount
): DecimalAmount {
  if (a.unit !== b.unit) {
    throw new Error(`Cannot add ${a.unit} to ${b.unit}: units differ`);
  }
  return { value: money(a.value).plus(b.value).toFixed(), unit: a.unit };
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

function stableStringify(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify(value[key] as JsonValue)}`
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The canonical serialization of an intent: sorted keys, no whitespace, no
 * undefined members. Two intents that mean the same trade produce the same
 * string on every platform, so the draft hash is comparable across them.
 */
export function canonicalIntentJson(intent: CanonicalOrderIntent): string {
  return stableStringify(intent as unknown as JsonValue);
}

/** SHA-256 of `canonicalIntentJson`, lowercase hex. */
export async function hashOrderIntent(
  intent: CanonicalOrderIntent
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalIntentJson(intent));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export interface ConnectionStatusInput {
  identity: PlatformIdentity;
}

export interface PlatformConnectionStatus {
  platform: PlatformId;
  identity: PlatformIdentity;
  /** The platform knows this identity (credentials derived, wallet deployed). */
  connected: boolean;
  /** Connected, eligible and the trading capability is on. */
  canTrade: boolean;
  /** Why `canTrade` is false, as stable machine-readable codes. */
  reasons: string[];
  platformDetails?: PlatformDetails;
}

export interface AccountReadInput {
  identity: PlatformIdentity;
  /** Narrow to one canonical market when the platform supports it. */
  marketId?: string;
  cursor?: string;
  limit?: number;
}

export interface AccountPosition {
  platform: PlatformId;
  marketId: string;
  outcomeId: string;
  /** Shares (outcome tokens, contracts) held. */
  size: DecimalString;
  averagePrice?: DecimalString;
  currentPrice?: DecimalString;
  value?: DecimalAmount;
  unrealizedPnl?: DecimalAmount;
  platformDetails?: PlatformDetails;
}

export interface AccountPositions {
  platform: PlatformId;
  identity: PlatformIdentity;
  items: AccountPosition[];
  fetchedAt: IsoTimestamp;
}

export type AccountActivityKind =
  | "trade"
  | "deposit"
  | "withdrawal"
  | "redeem"
  | "split"
  | "merge"
  | "other";

export interface AccountActivity {
  id: string;
  platform: PlatformId;
  kind: AccountActivityKind;
  time: IsoTimestamp;
  marketId?: string;
  outcomeId?: string;
  side?: TradeSide;
  price?: DecimalString;
  size?: DecimalString;
  amount?: DecimalAmount;
  platformDetails?: PlatformDetails;
}

export type AccountActivityPage = Page<AccountActivity>;

export type OrderStatus =
  | "pending"
  | "open"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected"
  | "expired";

export interface AccountOrder {
  orderId: string;
  platform: PlatformId;
  marketId: string;
  outcomeId: string;
  side: TradeSide;
  orderType: OrderType;
  timeInForce: TimeInForce;
  price?: DecimalString;
  quantity: OrderQuantity;
  /** Shares filled so far. */
  filled: DecimalString;
  status: OrderStatus;
  createdAt: IsoTimestamp;
  expiresAt?: IsoTimestamp;
  platformDetails?: PlatformDetails;
}

export type AccountOrderPage = Page<AccountOrder>;

export interface OrderFees {
  platform: DecimalAmount;
  /** The builder (Knoww) taker fee, when the platform charges one. */
  builder?: DecimalAmount;
  total: DecimalAmount;
}

/** What `previewOrder` resolved from the live book and the account. */
export interface OrderQuote {
  /** Expected average fill price from the current book. */
  expectedPrice?: DecimalString;
  /** Expected slippage from the best level, as a fraction in 0..1. */
  expectedSlippage?: DecimalString;
  /** Collateral committed (BUY) or proceeds asked for (SELL), before fees. */
  notional: DecimalAmount;
  fees: OrderFees;
  availableBalance?: DecimalAmount;
  maxExposure?: DecimalAmount;
}

export interface OrderEligibility {
  eligible: boolean;
  /** Stable codes such as `region_blocked` or `capability_off`. */
  reasons: string[];
}

/**
 * The immutable outcome of `previewOrder`. `placeOrder` refers to it by
 * `draftId` only; the platform reloads the market right before signing and
 * rejects the draft if anything it was priced on has changed.
 */
export interface OrderDraft {
  schemaVersion: CanonicalSchemaVersion;
  draftId: string;
  platform: PlatformId;
  /** The intent as validated and normalized by the preview. */
  intent: CanonicalOrderIntent;
  sourceMarketId: string;
  sourceOutcomeId: string;
  marketStatus: MarketStatus;
  tickSize?: DecimalString;
  /** Minimum order size in shares. */
  minSize?: DecimalString;
  quote: OrderQuote;
  eligibility: OrderEligibility;
  /** `hashOrderIntent(intent)`. */
  draftHash: string;
  createdAt: IsoTimestamp;
  /** Short: a draft outlives its quote by seconds, not minutes. */
  expiresAt: IsoTimestamp;
  /** Neg-risk, approvals and other extras the platform slot renders. */
  platformDetails?: PlatformDetails;
}

export interface OrderResult {
  platform: PlatformId;
  status: OrderStatus;
  /** Absent when the platform rejected the order before assigning one. */
  orderId?: string;
  idempotencyKey: string;
  filledQuantity?: DecimalString;
  averagePrice?: DecimalString;
  message?: string;
  platformDetails?: PlatformDetails;
}

/**
 * The checks every platform runs before signing a draft: the preview must
 * have found the identity eligible, and the draft's short expiration must
 * not have passed. Market drift is the platform's own reload check.
 */
export function assertDraftPlaceable(
  draft: OrderDraft,
  now: Date = new Date()
): void {
  if (!draft.eligibility.eligible) {
    throw platformError(
      `Draft ${draft.draftId} is not eligible: ${draft.eligibility.reasons.join(", ")}`,
      { platform: draft.platform, operation: "placeOrder", kind: "ineligible" }
    );
  }
  if (Date.parse(draft.expiresAt) <= now.getTime()) {
    throw platformError(
      `Draft ${draft.draftId} expired at ${draft.expiresAt}`,
      {
        platform: draft.platform,
        operation: "placeOrder",
        kind: "draft_expired",
      }
    );
  }
}
