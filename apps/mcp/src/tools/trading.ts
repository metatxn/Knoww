import {
  type AccountReadInput,
  CANONICAL_SCHEMA_VERSION,
  ORDER_TYPES,
  PLATFORM_IDS,
  type PlatformId,
  type PlatformIdentity,
  TIME_IN_FORCE,
  type TradingAdapter,
  WALLET_ACCOUNT_TYPES,
} from "@knoww/services/core";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  ACCOUNT_READ_SCOPE,
  ORDERS_CANCEL_SCOPE,
  ORDERS_CREATE_SCOPE,
  ORDERS_READ_SCOPE,
} from "../auth/scopes";
import { currentRequestId } from "../context";
import { requireTradingAdapter } from "../platforms";
import type { TradingToolName } from "../tool-catalog";
import {
  resolveTradingIdentity,
  tradingIdentityInputSchema,
} from "../trading-identity";
import { buildToolMeta, READ_ONLY_ANNOTATIONS, toolMetaSchema } from "./meta";
import { executeToolCall } from "./public-read";

/**
 * Account and order tools, one per `TradingAdapter` method. They are complete
 * but registered only when `EXPOSE_TRADING_TOOLS` is on (tool-catalog.ts), and
 * each demands a reserved scope that no grant issues yet, so the public server
 * cannot reach them either way. The registry builds every trading adapter
 * without a signer or credentials, so until caller identity lands (grilling
 * Q1) the order tools answer UNAUTHENTICATED and the reads work from the
 * identity alone. Drafts from `preview_order` sit in the adapter's in-memory
 * map on this isolate (the registry is a per-isolate singleton), so a
 * `place_order` served by another isolate reports NOT_FOUND; exposure also
 * needs a durable draft store.
 */

const ORDER_STATUSES = [
  "pending",
  "open",
  "partially_filled",
  "filled",
  "cancelled",
  "rejected",
  "expired",
] as const;
const MARKET_STATUSES = [
  "unopened",
  "active",
  "paused",
  "closed",
  "resolving",
  "resolved",
  "unknown",
] as const;
const ACTIVITY_KINDS = [
  "trade",
  "deposit",
  "withdrawal",
  "redeem",
  "split",
  "merge",
  "other",
] as const;
const TRADE_SIDES = ["buy", "sell"] as const;

type OrderIntent = Parameters<TradingAdapter["previewOrder"]>[0];

// Input pieces --------------------------------------------------------------

const platformSchema = z
  .enum(PLATFORM_IDS)
  .describe(
    "Prediction-market platform. Required here: account and order tools never default it. Call list_platforms for the enabled set."
  );
const canonicalIdSchema = z.string().min(3).max(200);
const decimalTextSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Expected a decimal string such as "0.42"');
const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .describe(
    "Caller-chosen key, 8 to 128 characters. Repeating a call with the same key returns the first result instead of acting twice."
  );

const accountReadInputSchema = z.object({
  platform: platformSchema,
  identity: tradingIdentityInputSchema,
  marketId: canonicalIdSchema
    .optional()
    .describe(
      "Canonical market id (`<platform>:<conditionId>`) to narrow the result to one market."
    ),
  cursor: z
    .string()
    .min(1)
    .max(4000)
    .optional()
    .describe("Opaque cursor from the previous page's meta.nextCursor."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum items to return."),
});

type AccountReadArgs = z.infer<typeof accountReadInputSchema>;

const quantityInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("shares"),
    value: decimalTextSchema.describe("Outcome shares."),
  }),
  z.object({
    kind: z.literal("notional"),
    amount: z
      .object({
        value: decimalTextSchema,
        unit: z.string().min(1).max(16),
      })
      .describe("Collateral to spend (buy) or proceeds to ask for (sell)."),
  }),
]);

const previewOrderInputSchema = z.object({
  platform: platformSchema,
  identity: tradingIdentityInputSchema,
  marketId: canonicalIdSchema.describe(
    "Canonical market id (`<platform>:<conditionId>`)."
  ),
  outcomeId: canonicalIdSchema.describe(
    "Canonical outcome id (`<platform>:<tokenId>`)."
  ),
  side: z.enum(TRADE_SIDES),
  orderType: z.enum(ORDER_TYPES),
  timeInForce: z
    .enum(TIME_IN_FORCE)
    .describe("limit orders take gtc or gtd; market orders take ioc or fok."),
  expiresAt: z
    .string()
    .min(1)
    .max(40)
    .optional()
    .describe("ISO 8601 expiry; required for gtd, refused otherwise."),
  price: decimalTextSchema
    .optional()
    .describe(
      "Limit price in 0..1 as a decimal string; required for limit orders."
    ),
  quantity: quantityInputSchema,
  clientOrderId: z.string().min(1).max(128).optional(),
});

type PreviewOrderArgs = z.infer<typeof previewOrderInputSchema>;

const placeOrderInputSchema = z.object({
  platform: platformSchema,
  draftId: z.string().min(1).max(128).describe("From preview_order."),
  idempotencyKey: idempotencyKeySchema,
});

const cancelOrderInputSchema = z.object({
  platform: platformSchema,
  identity: tradingIdentityInputSchema,
  orderId: z.string().min(1).max(256),
  idempotencyKey: idempotencyKeySchema,
});

// Output pieces -------------------------------------------------------------

const platformOutputSchema = z.enum(PLATFORM_IDS);
const identityOutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("wallet"),
    platform: platformOutputSchema,
    address: z.string(),
    accountType: z.enum(WALLET_ACCOUNT_TYPES),
    tradingAddress: z.string().optional(),
  }),
  z.object({
    kind: z.literal("broker"),
    platform: platformOutputSchema,
    accountId: z.string(),
  }),
]);
const platformDetailsSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    "Platform-specific fields; never needed to read the canonical ones."
  );
const decimalAmountSchema = z.object({ value: z.string(), unit: z.string() });
const quantityOutputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("shares"), value: z.string() }),
  z.object({ kind: z.literal("notional"), amount: decimalAmountSchema }),
]);

const connectionOutputSchema = z.object({
  connection: z.object({
    platform: platformOutputSchema,
    identity: identityOutputSchema,
    connected: z.boolean(),
    canTrade: z.boolean(),
    reasons: z
      .array(z.string())
      .describe(
        "Stable codes such as no_signer or no_credentials; empty when canTrade."
      ),
    platformDetails: platformDetailsSchema,
  }),
  regionPolicy: z.object({
    blocked: z.array(z.string()),
    closeOnly: z.array(z.string()),
  }),
  meta: toolMetaSchema,
});

const positionSchema = z.object({
  platform: platformOutputSchema,
  marketId: z.string(),
  outcomeId: z.string(),
  size: z.string(),
  averagePrice: z.string().optional(),
  currentPrice: z.string().optional(),
  value: decimalAmountSchema.optional(),
  unrealizedPnl: decimalAmountSchema.optional(),
  platformDetails: platformDetailsSchema,
});

const positionsOutputSchema = z.object({
  platform: platformOutputSchema,
  identity: identityOutputSchema,
  positions: z.array(positionSchema),
  fetchedAt: z.string(),
  meta: toolMetaSchema,
});

const activitySchema = z.object({
  id: z.string(),
  platform: platformOutputSchema,
  kind: z.enum(ACTIVITY_KINDS),
  time: z.string(),
  marketId: z.string().optional(),
  outcomeId: z.string().optional(),
  side: z.enum(TRADE_SIDES).optional(),
  price: z.string().optional(),
  size: z.string().optional(),
  amount: decimalAmountSchema.optional(),
  platformDetails: platformDetailsSchema,
});

const activityOutputSchema = z.object({
  platform: platformOutputSchema,
  activity: z.array(activitySchema),
  meta: toolMetaSchema,
});

const orderSchema = z.object({
  orderId: z.string(),
  platform: platformOutputSchema,
  marketId: z.string(),
  outcomeId: z.string(),
  side: z.enum(TRADE_SIDES),
  orderType: z.enum(ORDER_TYPES),
  timeInForce: z.enum(TIME_IN_FORCE),
  price: z.string().optional(),
  quantity: quantityOutputSchema,
  filled: z.string(),
  status: z.enum(ORDER_STATUSES),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  platformDetails: platformDetailsSchema,
});

const ordersOutputSchema = z.object({
  platform: platformOutputSchema,
  orders: z.array(orderSchema),
  meta: toolMetaSchema,
});

const intentOutputSchema = z.object({
  schemaVersion: z.string(),
  platform: platformOutputSchema,
  identity: identityOutputSchema,
  marketId: z.string(),
  outcomeId: z.string(),
  side: z.enum(TRADE_SIDES),
  orderType: z.enum(ORDER_TYPES),
  timeInForce: z.enum(TIME_IN_FORCE),
  expiresAt: z.string().optional(),
  price: z.string().optional(),
  quantity: quantityOutputSchema,
  clientOrderId: z.string().optional(),
});

const draftSchema = z.object({
  schemaVersion: z.string(),
  draftId: z.string(),
  platform: platformOutputSchema,
  intent: intentOutputSchema,
  sourceMarketId: z.string(),
  sourceOutcomeId: z.string(),
  marketStatus: z.enum(MARKET_STATUSES),
  tickSize: z.string().optional(),
  minSize: z.string().optional(),
  quote: z.object({
    expectedPrice: z.string().optional(),
    expectedSlippage: z.string().optional(),
    notional: decimalAmountSchema,
    fees: z.object({
      platform: decimalAmountSchema,
      builder: decimalAmountSchema.optional(),
      total: decimalAmountSchema,
    }),
    availableBalance: decimalAmountSchema.optional(),
    maxExposure: decimalAmountSchema.optional(),
  }),
  eligibility: z.object({
    eligible: z.boolean(),
    reasons: z.array(z.string()),
  }),
  draftHash: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  platformDetails: platformDetailsSchema,
});

const previewOrderOutputSchema = z.object({
  draft: draftSchema,
  meta: toolMetaSchema,
});

const orderResultSchema = z.object({
  platform: platformOutputSchema,
  status: z.enum(ORDER_STATUSES),
  orderId: z.string().optional(),
  idempotencyKey: z.string(),
  filledQuantity: z.string().optional(),
  averagePrice: z.string().optional(),
  message: z.string().optional(),
  platformDetails: platformDetailsSchema,
});

const orderResultOutputSchema = z.object({
  result: orderResultSchema,
  meta: toolMetaSchema,
});

// Annotations ---------------------------------------------------------------

/** Creates a server-side draft, never touches the platform. */
const PREVIEW_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/** Commits funds; the idempotency key makes a retry safe. */
const PLACE_ORDER_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const CANCEL_ORDER_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

// Helpers -------------------------------------------------------------------

function tradingSources(platform: PlatformId) {
  return [{ name: `${platform}-trading` }];
}

function accountReadInput(
  identity: PlatformIdentity,
  args: AccountReadArgs
): AccountReadInput {
  return {
    identity,
    ...(args.marketId !== undefined ? { marketId: args.marketId } : {}),
    ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  };
}

function pageMeta(platform: PlatformId, nextCursor: string | undefined) {
  return buildToolMeta({
    requestId: currentRequestId(),
    sources: tradingSources(platform),
    ...(nextCursor !== undefined ? { nextCursor, truncated: true } : {}),
  });
}

function orderIntent(
  args: PreviewOrderArgs,
  identity: PlatformIdentity
): OrderIntent {
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    platform: args.platform,
    identity,
    marketId: args.marketId,
    outcomeId: args.outcomeId,
    side: args.side,
    orderType: args.orderType,
    timeInForce: args.timeInForce,
    ...(args.expiresAt !== undefined ? { expiresAt: args.expiresAt } : {}),
    ...(args.price !== undefined ? { price: args.price } : {}),
    quantity: args.quantity,
    ...(args.clientOrderId !== undefined
      ? { clientOrderId: args.clientOrderId }
      : {}),
  };
}

function text(value: string) {
  return [{ type: "text" as const, text: value }];
}

// Registration --------------------------------------------------------------

export function registerTradingTools(server: McpServer): void {
  const name = (toolName: TradingToolName) => toolName;

  server.registerTool(
    name("get_trading_connection"),
    {
      title: "Get trading connection",
      description:
        "Report whether an account can trade on a platform through this server: signer and credential binding, the address that holds funds, and the platform's region policy. Makes no upstream call.",
      inputSchema: z.object({
        platform: platformSchema,
        identity: tradingIdentityInputSchema,
      }),
      outputSchema: connectionOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) =>
      executeToolCall(
        "get_trading_connection",
        ACCOUNT_READ_SCOPE,
        async () => {
          const adapter = requireTradingAdapter(args.platform);
          const identity = resolveTradingIdentity(args.platform, args.identity);
          const connection = await adapter.connectionStatus({ identity });
          const policy = adapter.regionPolicy();
          const summary = connection.canTrade
            ? `${args.platform}: connected and able to trade.`
            : `${args.platform}: not ready to trade (${connection.reasons.join(", ") || "no reason reported"}).`;
          return {
            content: text(summary),
            structuredContent: {
              connection,
              regionPolicy: {
                blocked: [...policy.blocked],
                closeOnly: [...policy.closeOnly],
              },
              meta: buildToolMeta({
                requestId: currentRequestId(),
                sources: tradingSources(args.platform),
              }),
            },
          };
        }
      )
  );

  server.registerTool(
    name("get_account_positions"),
    {
      title: "Get account positions",
      description:
        "Open positions held by an account, as canonical ids and decimal strings. Reads the platform's position records for the account's trading address.",
      inputSchema: accountReadInputSchema,
      outputSchema: positionsOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) =>
      executeToolCall("get_account_positions", ACCOUNT_READ_SCOPE, async () => {
        const adapter = requireTradingAdapter(args.platform);
        const identity = resolveTradingIdentity(args.platform, args.identity);
        const positions = await adapter.getAccountPositions(
          accountReadInput(identity, args)
        );
        return {
          content: text(
            `${positions.items.length} open position(s) on ${args.platform}.`
          ),
          structuredContent: {
            platform: positions.platform,
            identity: positions.identity,
            positions: positions.items,
            fetchedAt: positions.fetchedAt,
            meta: buildToolMeta({
              requestId: currentRequestId(),
              sources: tradingSources(args.platform),
              asOf: positions.fetchedAt,
            }),
          },
        };
      })
  );

  server.registerTool(
    name("get_account_activity"),
    {
      title: "Get account activity",
      description:
        "Trades, deposits, withdrawals, redemptions and other account events, newest first, with cursor paging.",
      inputSchema: accountReadInputSchema,
      outputSchema: activityOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) =>
      executeToolCall("get_account_activity", ACCOUNT_READ_SCOPE, async () => {
        const adapter = requireTradingAdapter(args.platform);
        const identity = resolveTradingIdentity(args.platform, args.identity);
        const page = await adapter.getAccountActivity(
          accountReadInput(identity, args)
        );
        return {
          content: text(
            `${page.items.length} activity item(s) on ${args.platform}${page.nextCursor ? "; more available" : ""}.`
          ),
          structuredContent: {
            platform: args.platform,
            activity: page.items,
            meta: pageMeta(args.platform, page.nextCursor),
          },
        };
      })
  );

  server.registerTool(
    name("get_account_orders"),
    {
      title: "Get account orders",
      description:
        "Open orders for an account. Needs a signer and API credentials bound to this server; an unbound account gets UNAUTHENTICATED.",
      inputSchema: accountReadInputSchema,
      outputSchema: ordersOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) =>
      executeToolCall("get_account_orders", ORDERS_READ_SCOPE, async () => {
        const adapter = requireTradingAdapter(args.platform);
        const identity = resolveTradingIdentity(args.platform, args.identity);
        const page = await adapter.getAccountOrders(
          accountReadInput(identity, args)
        );
        return {
          content: text(
            `${page.items.length} open order(s) on ${args.platform}${page.nextCursor ? "; more available" : ""}.`
          ),
          structuredContent: {
            platform: args.platform,
            orders: page.items,
            meta: pageMeta(args.platform, page.nextCursor),
          },
        };
      })
  );

  server.registerTool(
    name("preview_order"),
    {
      title: "Preview order",
      description:
        "Price and validate an order without placing it. Returns a short-lived draft with the quote, fees and eligibility; pass its draftId to place_order before it expires.",
      inputSchema: previewOrderInputSchema,
      outputSchema: previewOrderOutputSchema,
      annotations: PREVIEW_ANNOTATIONS,
    },
    (args) =>
      executeToolCall("preview_order", ORDERS_CREATE_SCOPE, async () => {
        const adapter = requireTradingAdapter(args.platform);
        const identity = resolveTradingIdentity(args.platform, args.identity);
        const draft = await adapter.previewOrder(orderIntent(args, identity));
        const verdict = draft.eligibility.eligible
          ? "is eligible"
          : `is not eligible (${draft.eligibility.reasons.join(", ")})`;
        return {
          content: text(
            `Draft ${draft.draftId} ${verdict}; it expires at ${draft.expiresAt}.`
          ),
          structuredContent: {
            draft,
            meta: buildToolMeta({
              requestId: currentRequestId(),
              sources: tradingSources(args.platform),
              asOf: draft.createdAt,
            }),
          },
        };
      })
  );

  server.registerTool(
    name("place_order"),
    {
      title: "Place order",
      description:
        "Place a previewed order by draftId. The draft is re-checked against the live market before signing. Idempotent on idempotencyKey; needs a bound signer.",
      inputSchema: placeOrderInputSchema,
      outputSchema: orderResultOutputSchema,
      annotations: PLACE_ORDER_ANNOTATIONS,
    },
    (args) =>
      executeToolCall("place_order", ORDERS_CREATE_SCOPE, async () => {
        const adapter = requireTradingAdapter(args.platform);
        const result = await adapter.placeOrder({
          draftId: args.draftId,
          idempotencyKey: args.idempotencyKey,
        });
        return {
          content: text(
            `Order ${result.status}${result.orderId ? ` (${result.orderId})` : ""} on ${args.platform}.`
          ),
          structuredContent: {
            result,
            meta: buildToolMeta({
              requestId: currentRequestId(),
              sources: tradingSources(args.platform),
            }),
          },
        };
      })
  );

  server.registerTool(
    name("cancel_order"),
    {
      title: "Cancel order",
      description:
        "Cancel one open order by id. Idempotent on idempotencyKey; needs a bound signer.",
      inputSchema: cancelOrderInputSchema,
      outputSchema: orderResultOutputSchema,
      annotations: CANCEL_ORDER_ANNOTATIONS,
    },
    (args) =>
      executeToolCall("cancel_order", ORDERS_CANCEL_SCOPE, async () => {
        const adapter = requireTradingAdapter(args.platform);
        const identity = resolveTradingIdentity(args.platform, args.identity);
        const result = await adapter.cancelOrder({
          identity,
          orderId: args.orderId,
          idempotencyKey: args.idempotencyKey,
        });
        return {
          content: text(
            `Order ${args.orderId} ${result.status} on ${args.platform}.`
          ),
          structuredContent: {
            result,
            meta: buildToolMeta({
              requestId: currentRequestId(),
              sources: tradingSources(args.platform),
            }),
          },
        };
      })
  );
}
