/**
 * Harness support for the Polymarket trading adapter tests.
 *
 * Mirrors apps/web/src/polymarket/trading-golden.support.ts: the same
 * throwaway key, pinned entropy, fetch capture and recorded CLOB routes, so
 * the adapter can be checked against the fixtures the pre-migration hook
 * and library code recorded. The services package cannot import from
 * apps/web (the boundary runs one way), so the mechanics live here twice.
 * Nothing reaches the network, and the key has never held funds.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import { DEFAULT_POLYMARKET_BASE_URLS } from "./base-urls";

export const GOLDEN_TRADING_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "..",
  "apps",
  "web",
  "golden",
  "trading"
);

/** Hardhat account #1: a public test key that has never been funded. */
export const THROWAWAY_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
export const THROWAWAY_EOA =
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

/** 2023-11-14T22:13:20Z, pinned for order timestamps and auth headers. */
export const FIXED_NOW_MS = 1_700_000_000_000;
export const FIXED_NOW_SECONDS = 1_700_000_000;

/** Placeholder L2 credentials. The secret only feeds the HMAC in the headers. */
export const FAKE_CLOB_CREDENTIALS = {
  apiKey: "00000000-0000-0000-0000-000000000000",
  apiSecret: "dGVzdC1zZWNyZXQ=",
  apiPassphrase: "test-passphrase",
} as const;

export const CLOB_ORIGIN = "https://clob.polymarket.com";
export const RELAYER_ORIGIN = "https://relayer-v2.polymarket.com";
export const DATA_API_ORIGIN = new URL(DEFAULT_POLYMARKET_BASE_URLS.dataApi)
  .origin;

export type RecordedMarketKind = "negrisk" | "plain";

export interface RecordedMarketByToken {
  condition_id: string;
  primary_token_id: string;
  secondary_token_id: string;
}

export interface RecordedMarket {
  kind: RecordedMarketKind;
  tokenId: string;
  conditionId: string;
  byToken: RecordedMarketByToken;
  /** The compact `/clob-markets/<conditionId>` record the SDK signs against. */
  clobMarket: { mts: number; nr?: boolean } & Record<string, unknown>;
  /** The full `/markets/<conditionId>` record. */
  market: Record<string, unknown>;
  /** The `/book?token_id=` snapshot market orders walk. */
  book: Record<string, unknown>;
}

export function readRecorded<T>(name: string): T {
  return JSON.parse(
    readFileSync(join(GOLDEN_TRADING_ROOT, "recorded", name), "utf8")
  ) as T;
}

export function loadRecordedMarket(kind: RecordedMarketKind): RecordedMarket {
  const byToken = readRecorded<RecordedMarketByToken>(
    `markets-by-token.${kind}.json`
  );
  return {
    kind,
    tokenId: byToken.primary_token_id,
    conditionId: byToken.condition_id,
    byToken,
    clobMarket: readRecorded(`clob-markets.${kind}.json`),
    market: readRecorded(`markets.${kind}.json`),
    book: readRecorded(`book.${kind}.json`),
  };
}

export function loadRecordedMarkets(): Record<
  RecordedMarketKind,
  RecordedMarket
> {
  return {
    negrisk: loadRecordedMarket("negrisk"),
    plain: loadRecordedMarket("plain"),
  };
}

export interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Parsed JSON when the body was JSON, the raw text otherwise, null for none. */
  body: unknown;
}

/** One `apps/web/golden/trading/orders/<mode>.<kind>.json` file. */
export interface RecordedOrdersFixture {
  mode: string;
  market: RecordedMarketKind;
  wallet: string;
  setup: CapturedRequest[];
  cases: Record<string, { requests: CapturedRequest[]; posted: unknown }>;
}

interface RecordedHookFixture {
  cases: Record<string, { requests: CapturedRequest[] }>;
}

/**
 * Every request the legacy hook fixture recorded for one wallet mode and
 * market, across all of its cases. The hook transcripts are the only record
 * of the side requests the pre-migration UI made around an order.
 */
export function loadRecordedHookRequests(
  mode: string,
  kind: RecordedMarketKind
): CapturedRequest[] {
  const fixture = JSON.parse(
    readFileSync(
      join(GOLDEN_TRADING_ROOT, "hook", `${mode}.${kind}.json`),
      "utf8"
    )
  ) as RecordedHookFixture;
  return Object.values(fixture.cases).flatMap(
    (recordedCase) => recordedCase.requests
  );
}

export function loadRecordedOrders(
  mode: string,
  kind: RecordedMarketKind
): RecordedOrdersFixture {
  return JSON.parse(
    readFileSync(
      join(GOLDEN_TRADING_ROOT, "orders", `${mode}.${kind}.json`),
      "utf8"
    )
  ) as RecordedOrdersFixture;
}

/** The `POST /order` request out of a captured sequence, if one was sent. */
export function postedOrderRequest(
  requests: CapturedRequest[]
): CapturedRequest | undefined {
  return requests.find(
    (request) => request.method === "POST" && request.url.endsWith("/order")
  );
}

/**
 * A route answers with a JSON body, a ready `Response`, or `undefined` to
 * declare the request unrouted. Unrouted requests fail the test, so a new
 * network call introduced by a migration is a visible failure, not a silent
 * default.
 */
export type RouteHandler = (
  request: CapturedRequest,
  url: URL
) => unknown | Response | undefined;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Freezes the clock and every entropy source the signing path draws on. */
export function pinEntropy(): void {
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW_MS);
  vi.spyOn(Math, "random").mockReturnValue(0.123456789);
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((
    array: ArrayBufferView | null
  ) => {
    if (array) {
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(7);
    }
    return array;
  }) as typeof crypto.getRandomValues);
}

function parseBody(text: string | null): unknown {
  if (text === null || text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Replaces `fetch` with a capturing stub. Handles string, `URL` and
 * `Request` inputs (the Polymarket SDK sends `Request` objects) and resolves
 * relative URLs against `origin`.
 */
export function installFetchCapture(
  route: RouteHandler,
  origin = "http://localhost:8000"
): CapturedRequest[] {
  const calls: CapturedRequest[] = [];
  const NativeRequest = Request;
  vi.stubGlobal(
    "Request",
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(
          typeof input === "string" && input.startsWith("/")
            ? new URL(input, origin)
            : input,
          init
        );
      }
    }
  );
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const request =
        input instanceof Request
          ? new Request(input, init)
          : new Request(new URL(String(input), origin), init);
      const url = new URL(request.url);
      const method = request.method;
      const text =
        method === "GET" || method === "HEAD" ? null : await request.text();
      const captured: CapturedRequest = {
        method,
        url: request.url,
        headers: Object.fromEntries(request.headers.entries()),
        body: parseBody(text),
      };
      calls.push(captured);
      const answer = route(captured, url);
      if (answer instanceof Response) return answer;
      if (answer === undefined) {
        throw new Error(`golden harness: unrouted ${method} ${request.url}`);
      }
      return jsonResponse(answer);
    }
  );
  return calls;
}

/** Order id every accepted `POST /order` answers with. */
export const RECORDED_ORDER_ID = `0x${"ab".repeat(32)}`;

/**
 * Account reads the pre-migration hooks made but never recorded. These are
 * hand-built in the Data API and CLOB shapes, on the plain market's ids, so
 * the adapter's read mapping has something concrete to be checked against.
 */
export function recordedOpenOrder(
  market: RecordedMarket,
  makerAddress: string
): Record<string, unknown> {
  return {
    id: RECORDED_ORDER_ID,
    status: "LIVE",
    owner: FAKE_CLOB_CREDENTIALS.apiKey,
    maker_address: makerAddress,
    market: market.conditionId,
    asset_id: market.tokenId,
    side: "BUY",
    original_size: "10",
    size_matched: "0",
    price: "0.5",
    outcome: "Yes",
    expiration: "0",
    order_type: "GTC",
    associate_trades: [],
    created_at: FIXED_NOW_SECONDS,
  };
}

export function recordedPosition(
  market: RecordedMarket,
  proxyWallet: string
): Record<string, unknown> {
  return {
    proxyWallet,
    asset: market.tokenId,
    conditionId: market.conditionId,
    size: "10",
    avgPrice: "0.5",
    initialValue: "5",
    currentValue: "6",
    cashPnl: "1",
    percentPnl: "20",
    totalBought: "10",
    realizedPnl: "0",
    percentRealizedPnl: "0",
    curPrice: "0.6",
    redeemable: false,
    mergeable: false,
    title: "Recorded plain market",
    outcome: "Yes",
    outcomeIndex: 0,
    negativeRisk: false,
  };
}

export function recordedActivity(
  market: RecordedMarket,
  proxyWallet: string
): Record<string, unknown> {
  return {
    proxyWallet,
    timestamp: FIXED_NOW_SECONDS,
    conditionId: market.conditionId,
    type: "TRADE",
    size: "10",
    usdcSize: "5",
    transactionHash: `0x${"cd".repeat(32)}`,
    price: "0.5",
    asset: market.tokenId,
    side: "BUY",
    outcomeIndex: 0,
    title: "Recorded plain market",
    outcome: "Yes",
  };
}

/** Conditional balance the CLOB reports, in raw units; enough for every SELL case. */
export const RECORDED_CONDITIONAL_BALANCE_RAW = "1000000000000";

/**
 * The public CLOB and relayer reads the SDK performs while creating and
 * posting an order, answered from the recorded markets, plus the account
 * reads the pre-migration hook made around an order.
 */
export function clobRoutes(
  markets: Record<RecordedMarketKind, RecordedMarket>
): RouteHandler {
  const all = Object.values(markets);
  const byToken = (tokenId: string) =>
    all.find(
      (market) =>
        market.tokenId === tokenId ||
        market.byToken.secondary_token_id === tokenId
    );
  const byCondition = (conditionId: string) =>
    all.find((market) => market.conditionId === conditionId);

  return (request, url) => {
    const path = url.pathname;
    if (url.origin === RELAYER_ORIGIN && path === "/deployed") {
      return { deployed: true };
    }
    if (url.origin === DATA_API_ORIGIN) {
      const user = url.searchParams.get("user") ?? "";
      if (path === "/positions") return [recordedPosition(markets.plain, user)];
      if (path === "/activity") return [recordedActivity(markets.plain, user)];
      return undefined;
    }
    if (url.origin !== CLOB_ORIGIN) return undefined;

    if (path === "/auth/api-keys") {
      return { apiKeys: [FAKE_CLOB_CREDENTIALS.apiKey] };
    }
    const tokenMatch = path.match(/^\/markets-by-token\/(\d+)$/);
    if (tokenMatch) return byToken(tokenMatch[1])?.byToken;
    const clobMarketMatch = path.match(/^\/clob-markets\/(0x[0-9a-f]+)$/);
    if (clobMarketMatch) return byCondition(clobMarketMatch[1])?.clobMarket;
    const marketMatch = path.match(/^\/markets\/(0x[0-9a-f]+)$/);
    if (marketMatch) return byCondition(marketMatch[1])?.market;
    const tokenParam = url.searchParams.get("token_id") ?? "";
    if (path === "/book") return byToken(tokenParam)?.book;
    if (path === "/tick-size") {
      const market = byToken(tokenParam);
      return market
        ? { minimum_tick_size: String(market.clobMarket.mts) }
        : undefined;
    }
    if (path === "/neg-risk") {
      const market = byToken(tokenParam);
      return market ? { neg_risk: Boolean(market.clobMarket.nr) } : undefined;
    }
    if (path === "/balance-allowance") {
      return { balance: RECORDED_CONDITIONAL_BALANCE_RAW, allowances: {} };
    }
    if (path === "/balance-allowance/update") return {};
    if (path === "/data/orders") {
      const maker = request.headers.poly_address ?? "";
      const order = recordedOpenOrder(markets.plain, maker);
      const wanted = url.searchParams.get("market");
      const data =
        wanted && wanted !== markets.plain.conditionId ? [] : [order];
      return { count: data.length, data, limit: 100, next_cursor: "LTE=" };
    }
    if (path === "/order" && request.method === "DELETE") {
      const body = request.body as { orderID?: string } | null;
      return {
        canceled: body?.orderID ? [body.orderID] : [],
        not_canceled: {},
      };
    }
    if (path === "/order" && request.method === "POST") {
      return {
        success: true,
        errorMsg: "",
        orderID: RECORDED_ORDER_ID,
        status: "live",
        takingAmount: "0",
        makingAmount: "0",
        transactionsHashes: [],
      };
    }
    return undefined;
  };
}
