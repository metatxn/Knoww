/**
 * Shared fixtures for the M3 trading golden harness.
 *
 * The harness drives the real Polymarket trading driver with a throwaway
 * key and pinned entropy, captures every byte that would leave the process,
 * and pins it as a file snapshot under apps/web/golden/trading/. Nothing in
 * here reaches the network, and the key has never held funds.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";

export const GOLDEN_TRADING_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
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
 * relative URLs against `origin`, which is how the app's own proxy routes
 * are called from the browser.
 */
export function installFetchCapture(
  route: RouteHandler,
  origin = "http://localhost:8000"
): CapturedRequest[] {
  const calls: CapturedRequest[] = [];
  // A browser resolves `new Request("/api/x")` against the page; Node's
  // Request throws on a relative URL. viem builds a Request before it calls
  // fetch, so the app's relative proxy URLs need the browser behaviour here.
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
 * The public CLOB and relayer reads the SDK performs while creating and
 * posting an order, answered from the recorded markets.
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

/** Stable JSON for file snapshots; bigints print with an `n` suffix. */
export function goldenJson(value: unknown): string {
  const json = JSON.stringify(
    value,
    (_key, item: unknown) => (typeof item === "bigint" ? `${item}n` : item),
    2
  );
  return `${json}\n`;
}

export function goldenPath(...parts: string[]): string {
  return join(GOLDEN_TRADING_ROOT, ...parts);
}
