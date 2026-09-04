import { describe, expect, it } from "vitest";
import type { TradingAdapter } from "./adapter";
import {
  PlatformError,
  type PlatformErrorKind,
  type PlatformOperation,
} from "./errors";
import {
  type AccountActivityPage,
  type AccountOrderPage,
  type AccountPositions,
  type AccountReadInput,
  addDecimalAmounts,
  assertDraftPlaceable,
  type CancelOrderInput,
  type CanonicalOrderIntent,
  type ConnectionStatusInput,
  cancelOrderInputSchema,
  canonicalIntentJson,
  hashOrderIntent,
  type OrderDraft,
  type OrderResult,
  orderIntentSchema,
  orderNotional,
  type PlaceDraftInput,
  type PlatformConnectionStatus,
  placeDraftInputSchema,
} from "./orders";

/**
 * Order model rules come from docs/decisions/2026-09-03-aggregator-platform-adapters.md
 * (Adapters and the registry > Trading adapter (M3), Web app > Identity) and
 * docs/single-api-layer.md (Order execution contract): a preview resolves the
 * canonical and source ids, platform and account, side, quantity, price, order
 * type and expiration; prices are decimal strings in 0..1; every monetary
 * value is a decimal string, never a float.
 */
const MARKET_ID =
  "polymarket:0x1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708";
const OUTCOME_ID =
  "polymarket:21742633143463906290569050155826241533067272736897614950488156847949938836455";

const walletIdentity = {
  kind: "wallet",
  platform: "polymarket",
  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  accountType: "deposit_wallet",
  tradingAddress: "0x4Fe2CC4925607a473264FA89e7138075695A5F8e",
} as const;

const limitBuy = {
  schemaVersion: "1",
  platform: "polymarket",
  identity: walletIdentity,
  marketId: MARKET_ID,
  outcomeId: OUTCOME_ID,
  side: "buy",
  orderType: "limit",
  timeInForce: "gtc",
  price: "0.37",
  quantity: { kind: "shares", value: "150" },
} as const;

describe("orderIntentSchema", () => {
  it("accepts a limit buy with a wallet identity and keeps the values as strings", () => {
    const parsed = orderIntentSchema.parse(limitBuy);
    expect(parsed).toEqual(limitBuy);
    expect(typeof parsed.price).toBe("string");
  });

  it("rejects a price outside 0..1", () => {
    expect(
      orderIntentSchema.safeParse({ ...limitBuy, price: "1.01" }).success
    ).toBe(false);
    expect(
      orderIntentSchema.safeParse({ ...limitBuy, price: "-0.1" }).success
    ).toBe(false);
  });

  it("rejects a float price", () => {
    expect(
      orderIntentSchema.safeParse({ ...limitBuy, price: 0.37 }).success
    ).toBe(false);
  });

  it("rejects ids from a platform other than the intent's", () => {
    const result = orderIntentSchema.safeParse({
      ...limitBuy,
      outcomeId: "kalshi:KXELONMARS-99:yes",
    });
    expect(result.success).toBe(false);
  });

  it("requires an expiration for good-till-date and forbids it otherwise", () => {
    expect(
      orderIntentSchema.safeParse({ ...limitBuy, timeInForce: "gtd" }).success
    ).toBe(false);
    expect(
      orderIntentSchema.safeParse({
        ...limitBuy,
        timeInForce: "gtd",
        expiresAt: "2026-09-05T00:00:00Z",
      }).success
    ).toBe(true);
    expect(
      orderIntentSchema.safeParse({
        ...limitBuy,
        expiresAt: "2026-09-05T00:00:00Z",
      }).success
    ).toBe(false);
  });

  it("pairs limit orders with gtc/gtd and market orders with ioc/fok", () => {
    expect(
      orderIntentSchema.safeParse({ ...limitBuy, timeInForce: "fok" }).success
    ).toBe(false);
    const marketBuy = {
      ...limitBuy,
      orderType: "market",
      timeInForce: "fok",
      price: undefined,
      quantity: { kind: "notional", amount: { value: "25", unit: "USD" } },
    };
    expect(orderIntentSchema.safeParse(marketBuy).success).toBe(true);
    expect(
      orderIntentSchema.safeParse({ ...marketBuy, timeInForce: "gtc" }).success
    ).toBe(false);
  });

  it("requires a price on limit orders", () => {
    expect(
      orderIntentSchema.safeParse({ ...limitBuy, price: undefined }).success
    ).toBe(false);
  });
});

describe("placeDraftInputSchema", () => {
  const place = {
    draftId: "polymarket:draft_01J9X0",
    idempotencyKey: "0b7a0f5e-9c2e-4d6c-9c6d-2f0e6b1a9a11",
  };

  it("accepts a draft id with an idempotency key", () => {
    expect(placeDraftInputSchema.parse(place)).toEqual(place);
  });

  it("refuses a free-form trade riding along with the draft", () => {
    expect(
      placeDraftInputSchema.safeParse({ ...place, price: "0.40" }).success
    ).toBe(false);
    expect(
      placeDraftInputSchema.safeParse({
        ...place,
        quantity: { kind: "shares", value: "1" },
      }).success
    ).toBe(false);
  });

  it("requires a non-empty idempotency key", () => {
    expect(
      placeDraftInputSchema.safeParse({ ...place, idempotencyKey: "" }).success
    ).toBe(false);
    expect(
      placeDraftInputSchema.safeParse({ draftId: place.draftId }).success
    ).toBe(false);
  });
});

describe("cancelOrderInputSchema", () => {
  it("needs the identity, the order id and an idempotency key", () => {
    const cancel = {
      identity: walletIdentity,
      orderId: "0xabc123",
      idempotencyKey: "cancel-0b7a0f5e",
    };
    expect(cancelOrderInputSchema.parse(cancel)).toEqual(cancel);
    expect(
      cancelOrderInputSchema.safeParse({ ...cancel, idempotencyKey: undefined })
        .success
    ).toBe(false);
    expect(
      cancelOrderInputSchema.safeParse({ ...cancel, orderId: "" }).success
    ).toBe(false);
  });
});

describe("PlatformError for trading", () => {
  it("names the trading operations and the draft rejection kinds", () => {
    const rejected = new PlatformError("Market changed since preview", {
      platform: "polymarket",
      operation: "placeOrder",
      kind: "draft_rejected",
    });
    expect(rejected.operation).toBe("placeOrder");
    expect(rejected.kind).toBe("draft_rejected");
    const kinds: PlatformErrorKind[] = [
      "draft_expired",
      "draft_rejected",
      "ineligible",
    ];
    const operations: PlatformOperation[] = [
      "connectionStatus",
      "getAccountPositions",
      "getAccountActivity",
      "getAccountOrders",
      "previewOrder",
      "placeOrder",
      "cancelOrder",
    ];
    expect(kinds).toHaveLength(3);
    expect(operations).toHaveLength(7);
  });
});

describe("order money", () => {
  it("computes the notional of a shares order exactly", () => {
    expect(orderNotional(orderIntentSchema.parse(limitBuy))).toBe("55.5");
    // 0.1 * 3 is 0.30000000000000004 in floating point.
    expect(
      orderNotional(
        orderIntentSchema.parse({
          ...limitBuy,
          price: "0.1",
          quantity: { kind: "shares", value: "3" },
        })
      )
    ).toBe("0.3");
  });

  it("uses the collateral amount itself for a notional order", () => {
    expect(
      orderNotional(
        orderIntentSchema.parse({
          ...limitBuy,
          orderType: "market",
          timeInForce: "fok",
          price: undefined,
          quantity: { kind: "notional", amount: { value: "25", unit: "USD" } },
        })
      )
    ).toBe("25");
  });

  it("adds amounts in the same unit and refuses mixed units", () => {
    expect(
      addDecimalAmounts(
        { value: "0.1", unit: "USD" },
        { value: "0.2", unit: "USD" }
      )
    ).toEqual({ value: "0.3", unit: "USD" });
    expect(() =>
      addDecimalAmounts(
        { value: "1", unit: "USD" },
        { value: "1", unit: "contracts" }
      )
    ).toThrow(/unit/);
  });
});

describe("canonical draft hash", () => {
  // Expected values computed independently with Python:
  // json.dumps(intent, sort_keys=True, separators=(",", ":")) and hashlib.sha256.
  const CANONICAL_JSON =
    '{"identity":{"accountType":"deposit_wallet","address":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","kind":"wallet","platform":"polymarket","tradingAddress":"0x4Fe2CC4925607a473264FA89e7138075695A5F8e"},"marketId":"polymarket:0x1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708","orderType":"limit","outcomeId":"polymarket:21742633143463906290569050155826241533067272736897614950488156847949938836455","platform":"polymarket","price":"0.37","quantity":{"kind":"shares","value":"150"},"schemaVersion":"1","side":"buy","timeInForce":"gtc"}';
  const SHA256 =
    "44eef31e87f294e196ce4ae98e267e9c3831c15cfda27dfa693d3bbc24cfefa9";

  it("serializes the intent with sorted keys regardless of input order", () => {
    const reordered = orderIntentSchema.parse({
      quantity: limitBuy.quantity,
      timeInForce: limitBuy.timeInForce,
      side: limitBuy.side,
      price: limitBuy.price,
      outcomeId: limitBuy.outcomeId,
      orderType: limitBuy.orderType,
      marketId: limitBuy.marketId,
      identity: { ...limitBuy.identity },
      platform: limitBuy.platform,
      schemaVersion: limitBuy.schemaVersion,
    });
    expect(canonicalIntentJson(reordered)).toBe(CANONICAL_JSON);
    expect(canonicalIntentJson(orderIntentSchema.parse(limitBuy))).toBe(
      CANONICAL_JSON
    );
  });

  it("hashes the canonical JSON with sha256", async () => {
    await expect(
      hashOrderIntent(orderIntentSchema.parse(limitBuy))
    ).resolves.toBe(SHA256);
  });
});

describe("TradingAdapter contract", () => {
  const intent = orderIntentSchema.parse(limitBuy);
  const draft: OrderDraft = {
    schemaVersion: "1",
    draftId: "polymarket:draft_01J9X0",
    platform: "polymarket",
    intent,
    sourceMarketId:
      "0x1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708",
    sourceOutcomeId:
      "21742633143463906290569050155826241533067272736897614950488156847949938836455",
    marketStatus: "active",
    tickSize: "0.01",
    minSize: "5",
    quote: {
      expectedPrice: "0.37",
      notional: { value: "55.5", unit: "USD" },
      fees: {
        platform: { value: "0", unit: "USD" },
        builder: { value: "0.1665", unit: "USD" },
        total: { value: "0.1665", unit: "USD" },
      },
      availableBalance: { value: "120", unit: "USD" },
    },
    eligibility: { eligible: true, reasons: [] },
    draftHash:
      "44eef31e87f294e196ce4ae98e267e9c3831c15cfda27dfa693d3bbc24cfefa9",
    createdAt: "2026-09-04T10:00:00Z",
    expiresAt: "2026-09-04T10:00:30Z",
    platformDetails: { platform: "polymarket", negRisk: false },
  };

  it("is satisfied by an adapter with the seven trading methods", async () => {
    const adapter = {
      platform: "polymarket",
      regionPolicy: () => ({ blocked: [], closeOnly: [] }),
      async connectionStatus(input: ConnectionStatusInput) {
        const status: PlatformConnectionStatus = {
          platform: "polymarket",
          identity: input.identity,
          connected: true,
          canTrade: true,
          reasons: [],
        };
        return status;
      },
      async getAccountPositions(input: AccountReadInput) {
        const positions: AccountPositions = {
          platform: "polymarket",
          identity: input.identity,
          items: [],
          fetchedAt: "2026-09-04T10:00:00Z",
        };
        return positions;
      },
      async getAccountActivity(_input: AccountReadInput) {
        const page: AccountActivityPage = { items: [] };
        return page;
      },
      async getAccountOrders(_input: AccountReadInput) {
        const page: AccountOrderPage = { items: [] };
        return page;
      },
      async previewOrder(_input: CanonicalOrderIntent) {
        return draft;
      },
      async placeOrder(input: PlaceDraftInput) {
        const result: OrderResult = {
          platform: "polymarket",
          status: "open",
          orderId: "0xorder",
          idempotencyKey: input.idempotencyKey,
        };
        return result;
      },
      async cancelOrder(input: CancelOrderInput) {
        const result: OrderResult = {
          platform: "polymarket",
          status: "cancelled",
          orderId: input.orderId,
          idempotencyKey: input.idempotencyKey,
        };
        return result;
      },
    } satisfies TradingAdapter;

    const preview = await adapter.previewOrder(intent);
    expect(preview.quote.fees.total).toEqual({ value: "0.1665", unit: "USD" });
    const placed = await adapter.placeOrder({
      draftId: preview.draftId,
      idempotencyKey: "0b7a0f5e-9c2e-4d6c-9c6d-2f0e6b1a9a11",
    });
    expect(placed.status).toBe("open");
  });

  it("rejects a draft whose short expiration has passed", () => {
    expect(() =>
      assertDraftPlaceable(draft, new Date("2026-09-04T10:00:31Z"))
    ).toThrow(PlatformError);
    try {
      assertDraftPlaceable(draft, new Date("2026-09-04T10:00:31Z"));
    } catch (error) {
      expect(error).toBeInstanceOf(PlatformError);
      expect((error as PlatformError).kind).toBe("draft_expired");
      expect((error as PlatformError).operation).toBe("placeOrder");
    }
    expect(() =>
      assertDraftPlaceable(draft, new Date("2026-09-04T10:00:29Z"))
    ).not.toThrow();
  });

  it("rejects a draft the preview marked ineligible", () => {
    const blocked: OrderDraft = {
      ...draft,
      eligibility: { eligible: false, reasons: ["region_blocked"] },
    };
    try {
      assertDraftPlaceable(blocked, new Date("2026-09-04T10:00:00Z"));
      throw new Error("expected a PlatformError");
    } catch (error) {
      expect((error as PlatformError).kind).toBe("ineligible");
      expect((error as PlatformError).message).toContain("region_blocked");
    }
  });
});
