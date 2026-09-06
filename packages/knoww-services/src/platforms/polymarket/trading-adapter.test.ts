/**
 * The Polymarket trading adapter, checked against the M3 golden fixtures.
 *
 * The fixtures under apps/web/golden/trading were recorded on the
 * pre-migration hook and library code. The adapter has to sign and post the
 * same bytes for the same intent, so each case compares the captured
 * `POST /order` request (headers included) with the recorded one.
 *
 * Nothing here reaches the network. The key is Hardhat's public account #1.
 */
import { createUnifiedPolymarketViemSigner } from "@knoww/shared-types/polymarket-unified";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCanonicalId,
  type CanonicalOrderIntent,
  evaluateRegionTrading,
  PlatformError,
  type WalletIdentity,
} from "../../core";
import { createPolymarketTradingAdapter } from "./trading-adapter";
import {
  type CapturedRequest,
  clobRoutes,
  FAKE_CLOB_CREDENTIALS,
  FIXED_NOW_MS,
  FIXED_NOW_SECONDS,
  installFetchCapture,
  jsonResponse,
  loadRecordedHookRequests,
  loadRecordedMarkets,
  loadRecordedOrders,
  pinEntropy,
  postedOrderRequest,
  RECORDED_ORDER_ID,
  type RecordedMarket,
  THROWAWAY_EOA,
  THROWAWAY_PRIVATE_KEY,
} from "./trading-golden.support";

function isBalanceRefresh(request: CapturedRequest): boolean {
  return (
    request.method === "GET" &&
    request.url.includes("/balance-allowance/update?")
  );
}

function distinctSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * The CLOB balance-cache refreshes a transcript issued before it posted the
 * order. The V2 server validates orders against a per-funder cache, so the
 * legacy hook refreshed the collateral and conditional caches right before
 * every POST /order; the adapter must keep doing so, or orders fail with a
 * misleading 400.
 */
function refreshesBeforeOrder(requests: readonly CapturedRequest[]): string[] {
  const postIndex = requests.findIndex(
    (request) => request.method === "POST" && request.url.endsWith("/order")
  );
  const before = postIndex === -1 ? requests : requests.slice(0, postIndex);
  return distinctSorted(before.filter(isBalanceRefresh).map((r) => r.url));
}

/**
 * The refreshes the legacy hook issued for this identity and market: the
 * collateral cache plus the conditional cache of the token being posted.
 */
function legacyRefreshesFor(
  mode: string,
  kind: RecordedMarket["kind"],
  tokenId: string
): string[] {
  const urls = loadRecordedHookRequests(mode, kind)
    .filter(isBalanceRefresh)
    .map((request) => request.url);
  return distinctSorted(
    urls.filter(
      (url) =>
        url.includes("asset_type=COLLATERAL") ||
        url.includes(`token_id=${tokenId}&`)
    )
  );
}

function postedTokenId(request: CapturedRequest | undefined): string {
  const body = request?.body as { order?: { tokenId?: string } } | undefined;
  const tokenId = body?.order?.tokenId;
  if (!tokenId) throw new Error("posted order carries no tokenId");
  return tokenId;
}

const markets = loadRecordedMarkets();

function openSigner() {
  const walletClient = createWalletClient({
    account: privateKeyToAccount(THROWAWAY_PRIVATE_KEY),
    chain: polygon,
    transport: http("http://127.0.0.1:1"),
  });
  return createUnifiedPolymarketViemSigner(walletClient);
}

const eoaIdentity: WalletIdentity = {
  kind: "wallet",
  platform: "polymarket",
  address: THROWAWAY_EOA,
  accountType: "eoa",
};

/** Fixture mode → the identity the web app trades from in that mode. */
const IDENTITIES: Record<string, WalletIdentity> = {
  eoa: eoaIdentity,
  safe: { ...eoaIdentity, accountType: "safe" },
  deposit: { ...eoaIdentity, accountType: "deposit_wallet" },
};

type OrderShape = Pick<
  CanonicalOrderIntent,
  "side" | "orderType" | "timeInForce" | "price" | "quantity" | "expiresAt"
>;

/** The four recorded cases, as canonical intents. */
const ORDER_CASES: Record<string, OrderShape> = {
  "limit-buy-gtc": {
    side: "buy",
    orderType: "limit",
    timeInForce: "gtc",
    price: "0.5",
    quantity: { kind: "shares", value: "10" },
  },
  "limit-sell-gtd": {
    side: "sell",
    orderType: "limit",
    timeInForce: "gtd",
    price: "0.62",
    quantity: { kind: "shares", value: "7.5" },
    expiresAt: new Date((FIXED_NOW_SECONDS + 86_400) * 1000).toISOString(),
  },
  "market-buy-fak-book-walk": {
    side: "buy",
    orderType: "market",
    timeInForce: "ioc",
    quantity: { kind: "notional", amount: { value: "25", unit: "USD" } },
  },
  "market-sell-fok-min-price": {
    side: "sell",
    orderType: "market",
    timeInForce: "fok",
    price: "0.4",
    quantity: { kind: "shares", value: "12" },
  },
};

/** Worked by hand from ORDER_CASES: price times shares, or the notional itself. */
const EXPECTED_NOTIONAL: Record<string, string> = {
  "limit-buy-gtc": "5",
  "limit-sell-gtd": "4.65",
  "market-buy-fak-book-walk": "25",
  "market-sell-fok-min-price": "4.8",
};

function intentFor(
  market: RecordedMarket,
  order: Pick<
    CanonicalOrderIntent,
    "side" | "orderType" | "timeInForce" | "price" | "quantity" | "expiresAt"
  >,
  identity: WalletIdentity = eoaIdentity
): CanonicalOrderIntent {
  return {
    schemaVersion: "1",
    platform: "polymarket",
    identity,
    marketId: buildCanonicalId("polymarket", market.conditionId),
    outcomeId: buildCanonicalId("polymarket", market.tokenId),
    ...order,
  };
}

describe("createPolymarketTradingAdapter", () => {
  beforeEach(() => {
    pinEntropy();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  for (const [mode, identity] of Object.entries(IDENTITIES)) {
    for (const market of Object.values(markets)) {
      it(`signs every recorded order from a ${mode} identity on the ${market.kind} market`, async () => {
        const calls = installFetchCapture(clobRoutes(markets));
        const adapter = createPolymarketTradingAdapter({
          signer: openSigner(),
          credentials: FAKE_CLOB_CREDENTIALS,
        });
        const recorded = loadRecordedOrders(mode, market.kind);
        expect(adapter.platform).toBe("polymarket");

        for (const [label, order] of Object.entries(ORDER_CASES)) {
          const draft = await adapter.previewOrder(
            intentFor(market, order, identity)
          );
          expect(draft.platform, label).toBe("polymarket");
          expect(draft.sourceMarketId, label).toBe(market.conditionId);
          expect(draft.sourceOutcomeId, label).toBe(market.tokenId);
          expect(draft.marketStatus, label).toBe("active");
          expect(draft.eligibility, label).toEqual({
            eligible: true,
            reasons: [],
          });
          expect(draft.quote.notional, label).toEqual({
            value: EXPECTED_NOTIONAL[label],
            unit: "USD",
          });
          expect(draft.platformDetails?.tradingAddress, label).toBe(
            recorded.wallet
          );

          calls.splice(0);
          const result = await adapter.placeOrder({
            draftId: draft.draftId,
            idempotencyKey: `golden-${mode}-${market.kind}-${label}`,
          });
          expect(postedOrderRequest(calls), label).toEqual(
            postedOrderRequest(recorded.cases[label].requests)
          );
          expect(
            refreshesBeforeOrder(calls),
            `${label} balance refresh before POST /order`
          ).toEqual(
            legacyRefreshesFor(
              mode,
              market.kind,
              postedTokenId(postedOrderRequest(calls))
            )
          );
          expect(result, label).toEqual({
            platform: "polymarket",
            status: "open",
            orderId: RECORDED_ORDER_ID,
            idempotencyKey: `golden-${mode}-${market.kind}-${label}`,
          });
        }
      });
    }
  }
});

const GTC_BUY: OrderShape = ORDER_CASES["limit-buy-gtc"];

function openAdapter(
  overrides: Parameters<typeof createPolymarketTradingAdapter>[0] = {}
) {
  return createPolymarketTradingAdapter({
    signer: openSigner(),
    credentials: FAKE_CLOB_CREDENTIALS,
    ...overrides,
  });
}

async function platformErrorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PlatformError) return error;
    throw error;
  }
  throw new Error("expected a PlatformError");
}

describe("createPolymarketTradingAdapter connection status", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports a bound EOA as connected and tradable", async () => {
    installFetchCapture(clobRoutes(markets));
    const status = await openAdapter().connectionStatus({
      identity: eoaIdentity,
    });
    expect(status).toEqual({
      platform: "polymarket",
      identity: eoaIdentity,
      connected: true,
      canTrade: true,
      reasons: [],
      platformDetails: {
        platform: "polymarket",
        tradingAddress: THROWAWAY_EOA,
        signatureType: 0,
      },
    });
  });

  it("reports the derived Safe as the trading address", async () => {
    installFetchCapture(clobRoutes(markets));
    const status = await openAdapter().connectionStatus({
      identity: IDENTITIES.safe,
    });
    expect(status.platformDetails).toEqual({
      platform: "polymarket",
      tradingAddress: "0x8ac5D4Bd2752AFc9F5CA531f19D617647216B893",
      signatureType: 2,
    });
  });

  it("names what is missing instead of throwing", async () => {
    installFetchCapture(clobRoutes(markets));
    const bare = createPolymarketTradingAdapter();
    expect(
      (await bare.connectionStatus({ identity: eoaIdentity })).reasons
    ).toEqual(["no_signer", "no_credentials"]);

    const stranger = { ...eoaIdentity, address: `0x${"11".repeat(20)}` };
    const mismatch = await openAdapter().connectionStatus({
      identity: stranger,
    });
    expect(mismatch.connected).toBe(false);
    expect(mismatch.reasons).toEqual(["signer_mismatch"]);

    const broker = await openAdapter().connectionStatus({
      identity: {
        kind: "broker",
        platform: "polymarket",
        accountId: "someone",
      },
    });
    expect(broker.canTrade).toBe(false);
    expect(broker.reasons).toEqual(["unsupported_identity"]);
  });
});

describe("createPolymarketTradingAdapter account reads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps the CLOB open orders to canonical orders", async () => {
    installFetchCapture(clobRoutes(markets));
    const page = await openAdapter().getAccountOrders({
      identity: eoaIdentity,
    });
    const market = markets.plain;
    expect(page.nextCursor).toBeUndefined();
    expect(page.items).toEqual([
      {
        orderId: RECORDED_ORDER_ID,
        platform: "polymarket",
        marketId: buildCanonicalId("polymarket", market.conditionId),
        outcomeId: buildCanonicalId("polymarket", market.tokenId),
        side: "buy",
        orderType: "limit",
        timeInForce: "gtc",
        price: "0.5",
        quantity: { kind: "shares", value: "10" },
        filled: "0",
        status: "open",
        createdAt: new Date(FIXED_NOW_MS).toISOString(),
        platformDetails: {
          platform: "polymarket",
          outcome: "Yes",
          owner: FAKE_CLOB_CREDENTIALS.apiKey,
          makerAddress: THROWAWAY_EOA,
          clobStatus: "LIVE",
          clobOrderType: "GTC",
        },
      },
    ]);
  });

  it("narrows open orders to one canonical market", async () => {
    installFetchCapture(clobRoutes(markets));
    const page = await openAdapter().getAccountOrders({
      identity: eoaIdentity,
      marketId: buildCanonicalId("polymarket", markets.negrisk.conditionId),
    });
    expect(page.items).toEqual([]);
  });

  it("maps Data API positions for the trading address", async () => {
    const calls = installFetchCapture(clobRoutes(markets));
    const positions = await openAdapter().getAccountPositions({
      identity: IDENTITIES.safe,
    });
    const read = calls.find((call) => call.url.includes("/positions"));
    expect(new URL(read?.url ?? "").searchParams.get("user")).toBe(
      "0x8ac5D4Bd2752AFc9F5CA531f19D617647216B893"
    );
    const market = markets.plain;
    expect(positions.platform).toBe("polymarket");
    expect(positions.identity).toEqual(IDENTITIES.safe);
    expect(positions.items).toEqual([
      {
        platform: "polymarket",
        marketId: buildCanonicalId("polymarket", market.conditionId),
        outcomeId: buildCanonicalId("polymarket", market.tokenId),
        size: "10",
        averagePrice: "0.5",
        currentPrice: "0.6",
        value: { value: "6", unit: "USD" },
        unrealizedPnl: { value: "1", unit: "USD" },
        platformDetails: {
          platform: "polymarket",
          title: "Recorded plain market",
          outcome: "Yes",
          outcomeIndex: 0,
          redeemable: false,
          mergeable: false,
          negRisk: false,
        },
      },
    ]);
  });

  it("maps Data API activity to canonical activity", async () => {
    installFetchCapture(clobRoutes(markets));
    const page = await openAdapter().getAccountActivity({
      identity: eoaIdentity,
      limit: 20,
    });
    const market = markets.plain;
    expect(page.nextCursor).toBeUndefined();
    expect(page.items).toEqual([
      {
        id: `0x${"cd".repeat(32)}:${FIXED_NOW_SECONDS}:${market.tokenId}:BUY`,
        platform: "polymarket",
        kind: "trade",
        time: new Date(FIXED_NOW_MS).toISOString(),
        marketId: buildCanonicalId("polymarket", market.conditionId),
        outcomeId: buildCanonicalId("polymarket", market.tokenId),
        side: "buy",
        price: "0.5",
        size: "10",
        amount: { value: "5", unit: "USD" },
        platformDetails: {
          platform: "polymarket",
          type: "TRADE",
          transactionHash: `0x${"cd".repeat(32)}`,
          title: "Recorded plain market",
          outcome: "Yes",
          outcomeIndex: 0,
        },
      },
    ]);
  });
});

describe("createPolymarketTradingAdapter order lifecycle", () => {
  beforeEach(() => {
    pinEntropy();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("tells the on-chain port what a BUY needs: the notional and the fee on top", async () => {
    installFetchCapture(clobRoutes(markets));
    const adapter = openAdapter();
    const draft = await adapter.previewOrder(intentFor(markets.plain, GTC_BUY));
    // 10 shares at 0.50 is $5.00 of pUSD. The recorded market carries a fee
    // rate, so the estimate is a number here; the on-chain port needs the two
    // parts separately because it wraps the notional and reserves the fee.
    expect(draft.platformDetails).toMatchObject({
      requiredNotionalRaw: "5000000",
      estimatedFeeRaw: "125000",
      requiredCollateralRaw: "5125000",
    });
    expect(draft.quote.fees.platform.value).toBe("0.125");
  });

  it("refuses a SELL the CLOB has not indexed yet, without posting", async () => {
    // The CLOB's balance-allowance read lags the on-chain transfer. Until it
    // shows the shares, posting would fail with a misleading 400, so the
    // adapter walks the refresh ladder and gives up with a plain message.
    const base = clobRoutes(markets);
    const calls = installFetchCapture((request, url) =>
      url.pathname === "/balance-allowance"
        ? { balance: "0", allowances: {} }
        : base(request, url)
    );
    const adapter = openAdapter({ sleep: async () => {} });
    const draft = await adapter.previewOrder(
      intentFor(markets.plain, ORDER_CASES["limit-sell-gtd"])
    );
    const error = await platformErrorOf(
      adapter.placeOrder({
        draftId: draft.draftId,
        idempotencyKey: "sell-not-indexed",
      })
    );
    expect(error.message).toContain("has not indexed these shares");
    expect(
      calls.some(
        (call) => call.method === "POST" && call.url.endsWith("/order")
      )
    ).toBe(false);
  });

  it("rides out one failed balance refresh and still posts the order", async () => {
    const base = clobRoutes(markets);
    let failingRefreshes = 1;
    const calls = installFetchCapture((request, url) => {
      if (
        url.pathname === "/balance-allowance/update" &&
        failingRefreshes > 0
      ) {
        failingRefreshes -= 1;
        return jsonResponse({ error: "Bad Gateway" }, 502);
      }
      return base(request, url);
    });
    const adapter = openAdapter({ sleep: async () => {} });
    const draft = await adapter.previewOrder(intentFor(markets.plain, GTC_BUY));
    const result = await adapter.placeOrder({
      draftId: draft.draftId,
      idempotencyKey: "one-bad-refresh",
    });
    expect(failingRefreshes).toBe(0);
    expect(result.orderId).toBe(RECORDED_ORDER_ID);
    expect(
      calls.filter(
        (call) => call.method === "POST" && call.url.endsWith("/order")
      )
    ).toHaveLength(1);
  });

  it("cancels through the CLOB and replays the result for the same key", async () => {
    const calls = installFetchCapture(clobRoutes(markets));
    const adapter = openAdapter();
    const input = {
      identity: eoaIdentity,
      orderId: RECORDED_ORDER_ID,
      idempotencyKey: "golden-cancel-1",
    };
    const result = await adapter.cancelOrder(input);
    expect(result).toEqual({
      platform: "polymarket",
      status: "cancelled",
      orderId: RECORDED_ORDER_ID,
      idempotencyKey: "golden-cancel-1",
    });
    const cancels = () =>
      calls.filter(
        (call: CapturedRequest) =>
          call.method === "DELETE" && call.url.endsWith("/order")
      );
    expect(cancels()).toHaveLength(1);
    expect(cancels()[0].body).toEqual({ orderID: RECORDED_ORDER_ID });

    await expect(adapter.cancelOrder(input)).resolves.toBe(result);
    expect(cancels()).toHaveLength(1);
  });

  it("replays a placement for the same idempotency key without posting twice", async () => {
    const calls = installFetchCapture(clobRoutes(markets));
    const adapter = openAdapter();
    const draft = await adapter.previewOrder(intentFor(markets.plain, GTC_BUY));
    const input = { draftId: draft.draftId, idempotencyKey: "golden-replay" };
    const first = await adapter.placeOrder(input);
    const posts = () => calls.filter((call) => postedOrderRequest([call]));
    expect(posts()).toHaveLength(1);
    await expect(adapter.placeOrder(input)).resolves.toBe(first);
    expect(posts()).toHaveLength(1);
  });

  it("previews without a signer and refuses to place", async () => {
    installFetchCapture(clobRoutes(markets));
    const adapter = createPolymarketTradingAdapter();
    const draft = await adapter.previewOrder(intentFor(markets.plain, GTC_BUY));
    expect(draft.eligibility.eligible).toBe(true);
    const error = await platformErrorOf(
      adapter.placeOrder({
        draftId: draft.draftId,
        idempotencyKey: "no-signer",
      })
    );
    expect(error.kind).toBe("unauthenticated");
  });

  it("rejects a draft whose market changed since preview", async () => {
    const base = clobRoutes(markets);
    let paused = false;
    installFetchCapture((request, url) => {
      if (paused && /^\/markets\/0x/.test(url.pathname)) {
        return { ...markets.plain.market, accepting_orders: false };
      }
      return base(request, url);
    });
    const adapter = openAdapter();
    const draft = await adapter.previewOrder(intentFor(markets.plain, GTC_BUY));
    paused = true;
    const error = await platformErrorOf(
      adapter.placeOrder({
        draftId: draft.draftId,
        idempotencyKey: "golden-drift",
      })
    );
    expect(error.kind).toBe("draft_rejected");
    expect(error.message).toContain("status");
  });

  it("expires drafts and forgets unknown ones", async () => {
    installFetchCapture(clobRoutes(markets));
    let nowMs = FIXED_NOW_MS;
    const adapter = openAdapter({
      now: () => new Date(nowMs),
      draftTtlMs: 1000,
    });
    const draft = await adapter.previewOrder(intentFor(markets.plain, GTC_BUY));
    expect(draft.expiresAt).toBe(new Date(FIXED_NOW_MS + 1000).toISOString());
    nowMs += 1000;
    const expired = await platformErrorOf(
      adapter.placeOrder({
        draftId: draft.draftId,
        idempotencyKey: "golden-expired",
      })
    );
    expect(expired.kind).toBe("draft_expired");

    const unknown = await platformErrorOf(
      adapter.placeOrder({ draftId: "nope", idempotencyKey: "golden-unknown" })
    );
    expect(unknown.kind).toBe("not_found");
  });

  it("flags an ineligible draft at preview and refuses it at place", async () => {
    installFetchCapture(clobRoutes(markets));
    const adapter = openAdapter();
    const draft = await adapter.previewOrder(
      intentFor(markets.plain, {
        ...GTC_BUY,
        price: "0.505",
        quantity: { kind: "shares", value: "2" },
      })
    );
    expect(draft.eligibility).toEqual({
      eligible: false,
      reasons: ["off_tick", "below_min_size"],
    });
    const error = await platformErrorOf(
      adapter.placeOrder({
        draftId: draft.draftId,
        idempotencyKey: "golden-ineligible",
      })
    );
    expect(error.kind).toBe("ineligible");
  });
});

describe("createPolymarketTradingAdapter region policy", () => {
  it("declares Polymarket's published block and close-only lists", () => {
    const policy = createPolymarketTradingAdapter().regionPolicy();

    expect(policy.blocked).toEqual(
      expect.arrayContaining(["IR", "SY", "CU", "KP", "UA-43"])
    );
    expect(policy.closeOnly).toEqual(
      expect.arrayContaining(["US", "GB", "FR", "CA-ON", "AU", "SG"])
    );
    // KP sits in both published lists; the blocked list wins on evaluation.
    expect(evaluateRegionTrading(policy, { country: "KP" })).toBe("blocked");
  });

  it("evaluates a visitor against that policy", () => {
    const policy = createPolymarketTradingAdapter().regionPolicy();

    expect(evaluateRegionTrading(policy, { country: "IN" })).toBe("open");
    expect(evaluateRegionTrading(policy, { country: "US" })).toBe("close_only");
    expect(
      evaluateRegionTrading(policy, { country: "CA", subdivision: "NS" })
    ).toBe("open");
    expect(evaluateRegionTrading(policy, { country: "CA" })).toBe("close_only");
    expect(
      evaluateRegionTrading(policy, { country: "UA", subdivision: "43" })
    ).toBe("blocked");
    // Polymarket applies IE, JP, MT and NL on its own frontend only; the API
    // Knoww trades through does not restrict them.
    expect(evaluateRegionTrading(policy, { country: "IE" })).toBe("open");
  });
});
