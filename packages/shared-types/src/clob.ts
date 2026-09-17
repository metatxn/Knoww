import {
  normalizePriceHistoryPoint,
  type PriceHistoryClient,
  priceHistoryRequests,
  readSdkPriceHistory,
} from "./price-history.ts";

export {
  normalizePriceHistoryPoint,
  priceHistoryRequests,
} from "./price-history.ts";

import { POLYMARKET_API, type TradingSide } from "./polymarket.ts";

export type ClobHeaders = Record<string, string>;

export interface ClobFetchInit {
  method?: string;
  headers?: ClobHeaders;
  body?: string;
  [key: string]: unknown;
}

export interface ClobFetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json(): Promise<unknown>;
}

export type ClobFetch = (
  input: string,
  init?: ClobFetchInit
) => Promise<ClobFetchResponse>;

export interface UnifiedClobOrderBookClient extends PriceHistoryClient {
  fetchOrderBook(request: { tokenId: string }): Promise<unknown>;
  fetchOrderBooks?(request: Array<{ tokenId: string }>): Promise<unknown>;
  fetchMarketInfo?(request: { conditionId: string }): Promise<unknown>;
  fetchPrice?(request: {
    tokenId: string;
    side: TradingSide;
  }): Promise<unknown>;
  fetchBuilderFeeRates?(request: { builderCode: string }): Promise<unknown>;
}

export interface ClobRequestOptions {
  host?: string;
  dataApiHost?: string;
  fetchImpl?: ClobFetch;
  headers?: ClobHeaders;
  requestInit?: ClobFetchInit;
  unifiedClient?: UnifiedClobOrderBookClient;
  useUnifiedSdk?: boolean;
  priceSide?: TradingSide;
}

export interface ClobOrderBookLevel {
  price: string;
  size: string;
}

export interface ClobOrderBook {
  market?: string;
  asset_id?: string;
  hash?: string;
  timestamp?: string;
  bids: ClobOrderBookLevel[];
  asks: ClobOrderBookLevel[];
  min_order_size?: string;
  tick_size?: string;
  spread?: number;
  midpoint?: number;
}

export interface ClobPriceHistoryPoint {
  t: number;
  p: number;
}

export interface ClobPriceHistoryResponse {
  history?: ClobPriceHistoryPoint[];
}

export interface ClobPriceHistoryParams {
  startTs?: string | number;
  endTs?: string | number;
  fidelity?: string | number;
}

/**
 * A CLOB request that came back with a non-OK status. A plain `Error` tagged
 * with `name: "ClobRequestError"`; narrow with `isClobRequestError`, never
 * `instanceof`.
 */
export interface ClobRequestError extends Error {
  readonly name: "ClobRequestError";
  readonly status: number;
  readonly statusText: string | undefined;
}

export function clobRequestError(
  message: string,
  response: ClobFetchResponse
): ClobRequestError {
  const error = new Error(message) as Error & {
    name: "ClobRequestError";
    status: number;
    statusText: string | undefined;
  };
  error.name = "ClobRequestError";
  error.status = response.status;
  error.statusText = response.statusText;
  return error;
}

export function isClobRequestError(value: unknown): value is ClobRequestError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { name?: unknown; status?: unknown };
  return (
    candidate.name === "ClobRequestError" &&
    typeof candidate.status === "number"
  );
}

type ClobQueryValue = string | number | boolean | bigint | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeClobHost(host?: string): string {
  return (host || POLYMARKET_API.CLOB.BASE).replace(/\/+$/, "");
}

function canUseUnifiedSdkForPublicRead(options?: ClobRequestOptions): boolean {
  if (options?.useUnifiedSdk === false) return false;
  if (options?.fetchImpl || options?.headers || options?.requestInit) {
    return false;
  }

  return (
    normalizeClobHost(options?.host) ===
    normalizeClobHost(POLYMARKET_API.CLOB.BASE)
  );
}

function encodeQuery(params?: Record<string, ClobQueryValue>): string {
  if (!params) return "";

  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    )
    .join("&");
}

function getFetch(options?: ClobRequestOptions): ClobFetch {
  const fetchImpl =
    options?.fetchImpl ?? (globalThis as { fetch?: ClobFetch }).fetch;

  if (!fetchImpl) {
    throw new Error("CLOB fetch implementation unavailable");
  }

  return fetchImpl;
}

function buildFetchInit(
  options: ClobRequestOptions | undefined,
  overrides: ClobFetchInit = {}
): ClobFetchInit {
  return {
    ...(options?.requestInit ?? {}),
    ...overrides,
    headers: {
      Accept: "application/json",
      ...(options?.headers ?? {}),
      ...(options?.requestInit?.headers ?? {}),
      ...(overrides.headers ?? {}),
    },
  };
}

async function readClobError(
  response: ClobFetchResponse,
  fallback: string
): Promise<string> {
  const data = await response.json().catch(() => null);

  if (isRecord(data)) {
    if (typeof data.error === "string" && data.error) return data.error;
    if (typeof data.message === "string" && data.message) return data.message;
  }

  return fallback;
}

function normalizeLevel(level: unknown): ClobOrderBookLevel | null {
  if (!isRecord(level)) return null;

  const { price, size } = level;
  const validPrice = typeof price === "string" || typeof price === "number";
  const validSize = typeof size === "string" || typeof size === "number";
  if (!validPrice || !validSize) return null;

  const priceString = String(price);
  const sizeString = String(size);
  if (!priceString || !sizeString) return null;

  return { price: priceString, size: sizeString };
}

function normalizeLevels(value: unknown): ClobOrderBookLevel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeLevel)
    .filter((level): level is ClobOrderBookLevel => level !== null);
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function buildClobPublicUrl(
  path: string,
  params?: Record<string, ClobQueryValue>,
  options?: Pick<ClobRequestOptions, "host">
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const [pathOnly, existingQuery] = normalizedPath.split("?", 2);
  const query = [existingQuery, encodeQuery(params)].filter(Boolean).join("&");

  return `${normalizeClobHost(options?.host)}${pathOnly}${
    query ? `?${query}` : ""
  }`;
}

export function normalizeClobOrderBook(raw: unknown): ClobOrderBook {
  const data = isRecord(raw) ? raw : {};

  return {
    market: optionalString(data.market),
    asset_id: optionalString(data.asset_id ?? data.tokenId),
    hash: optionalString(data.hash),
    timestamp: optionalString(data.timestamp),
    bids: normalizeLevels(data.bids),
    asks: normalizeLevels(data.asks),
    min_order_size: optionalString(data.min_order_size ?? data.minOrderSize),
    tick_size: optionalString(data.tick_size ?? data.tickSize),
    spread: optionalNumber(data.spread),
    midpoint: optionalNumber(data.midpoint),
  };
}

export async function fetchClobJson<T = unknown>(
  path: string,
  params?: Record<string, ClobQueryValue>,
  options?: ClobRequestOptions,
  init?: ClobFetchInit
): Promise<T> {
  const response = await getFetch(options)(
    buildClobPublicUrl(path, params, options),
    buildFetchInit(options, init)
  );

  if (!response.ok) {
    throw clobRequestError(
      await readClobError(
        response,
        `CLOB request failed: ${response.statusText || response.status}`
      ),
      response
    );
  }

  return (await response.json()) as T;
}

export async function fetchClobOrderBook(
  tokenId: string,
  options?: ClobRequestOptions
): Promise<ClobOrderBook> {
  if (canUseUnifiedSdkForPublicRead(options)) {
    if (options?.unifiedClient) {
      const data = await options.unifiedClient.fetchOrderBook({ tokenId });
      return normalizeClobOrderBook(data);
    }

    const { fetchUnifiedClobOrderBook } = await import(
      "./polymarket-unified.ts"
    );
    return fetchUnifiedClobOrderBook(tokenId);
  }

  const data = await fetchClobJson("book", { token_id: tokenId }, options);
  return normalizeClobOrderBook(data);
}

export async function fetchClobOrderBooks(
  tokenIds: readonly string[],
  options?: ClobRequestOptions
): Promise<ClobOrderBook[]> {
  if (tokenIds.length === 0) return [];

  if (canUseUnifiedSdkForPublicRead(options)) {
    if (options?.unifiedClient?.fetchOrderBooks) {
      const data = await options.unifiedClient.fetchOrderBooks(
        tokenIds.map((tokenId) => ({ tokenId }))
      );
      return Array.isArray(data) ? data.map(normalizeClobOrderBook) : [];
    }

    const { fetchUnifiedClobOrderBooks } = await import(
      "./polymarket-unified.ts"
    );
    return fetchUnifiedClobOrderBooks(tokenIds);
  }

  const data = await fetchClobJson<unknown>(
    "books?token_ids",
    undefined,
    options,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokenIds.map((token_id) => ({ token_id }))),
    }
  );

  if (!Array.isArray(data)) return [];
  return data.map(normalizeClobOrderBook);
}

/**
 * The human-facing market record: `GET /markets/{conditionId}` — question,
 * slug, images, tags, end date, `maker_base_fee`/`taker_base_fee`, tokens.
 *
 * Deliberately has no unified-SDK branch. The SDK's `fetchMarketInfo` reads a
 * *different* endpoint (`/clob-markets/{conditionId}`) with a different, much
 * smaller payload, so routing this through it would silently strip every field
 * the API routes serve. Use `fetchClobMarketInfo` when you want the fee curve.
 */
export function fetchClobMarket<T = unknown>(
  conditionId: string,
  options?: ClobRequestOptions
): Promise<T> {
  return fetchClobJson<T>(
    `markets/${encodeURIComponent(conditionId)}`,
    undefined,
    options
  );
}

/**
 * The trading-side view of a condition: `GET /clob-markets/{conditionId}`.
 *
 * This is the only endpoint that carries the protocol fee curve (`fd.r` rate,
 * `fd.e` exponent) that `estimateBuyTakerFeeRaw` needs — `/markets` does not.
 * The raw response is the compact wire form; the unified SDK returns it parsed
 * as `{feeInfo: {rate, exponent}, tokens}`. `parseProtocolFeeDetails` reads both
 * spellings, so either path is a valid input to fee estimation.
 */
export function fetchClobMarketInfo<T = unknown>(
  conditionId: string,
  options?: ClobRequestOptions
): Promise<T> {
  if (canUseUnifiedSdkForPublicRead(options)) {
    if (options?.unifiedClient?.fetchMarketInfo) {
      return options.unifiedClient.fetchMarketInfo({
        conditionId,
      }) as Promise<T>;
    }

    return import("./polymarket-unified.ts").then(
      ({ fetchUnifiedClobMarket }) => fetchUnifiedClobMarket<T>(conditionId)
    );
  }

  return fetchClobJson<T>(
    `clob-markets/${encodeURIComponent(conditionId)}`,
    undefined,
    options
  );
}

export function fetchClobTrades<T = unknown>(
  tokenId: string,
  options?: ClobRequestOptions
): Promise<T> {
  return fetchClobJson<T>("trades", { token_id: tokenId }, options);
}

export function fetchClobPrice<T = unknown>(
  tokenId: string,
  options?: ClobRequestOptions
): Promise<T> {
  if (options?.priceSide && canUseUnifiedSdkForPublicRead(options)) {
    if (options?.unifiedClient?.fetchPrice) {
      return options.unifiedClient.fetchPrice({
        tokenId,
        side: options.priceSide,
      }) as Promise<T>;
    }

    return import("./polymarket-unified.ts").then(({ fetchUnifiedClobPrice }) =>
      fetchUnifiedClobPrice<T>(tokenId, options.priceSide as TradingSide)
    );
  }

  return fetchClobJson<T>("price", { token_id: tokenId }, options);
}

export async function fetchClobPriceHistory<T = ClobPriceHistoryResponse>(
  tokenId: string,
  params: ClobPriceHistoryParams = {},
  options?: ClobRequestOptions
): Promise<T> {
  if (canUseUnifiedSdkForPublicRead(options)) {
    if (options?.unifiedClient) {
      const history = await readSdkPriceHistory(
        options.unifiedClient,
        tokenId,
        params
      );
      return { history: history.map(({ t, p }) => ({ t, p: Number(p) })) } as T;
    }
    const { fetchUnifiedClobPriceHistory } = await import(
      "./polymarket-unified.ts"
    );
    return fetchUnifiedClobPriceHistory<T>(tokenId, params);
  }
  const history = new Map<number, { t: number; p: number }>();
  for (const request of priceHistoryRequests(tokenId, params)) {
    const query: Record<string, string | number | undefined> = {
      token_id: tokenId,
      start: request.start,
      end: request.end,
      interval: request.interval,
      bucket_seconds: request.bucketSeconds,
    };
    const seen = new Set<string>();
    for (let pages = 0; ; pages++) {
      if (pages >= 1000)
        throw new Error("Price history pagination exceeded limit");
      const result = await fetchClobJson<{
        data: unknown[];
        pagination: { next_cursor: string | null };
      }>("v2/prices-history", query, {
        ...options,
        host: options?.dataApiHost ?? POLYMARKET_API.DATA.BASE,
      });
      if (
        !Array.isArray(result.data) ||
        !result.pagination ||
        !(
          result.pagination.next_cursor === null ||
          typeof result.pagination.next_cursor === "string"
        )
      )
        throw new Error("Malformed price history page");
      for (const raw of result.data) {
        const point = normalizePriceHistoryPoint(raw);
        if (
          request.start !== undefined &&
          (point.t < request.start ||
            (request.end !== undefined && point.t > request.end))
        )
          throw new Error("Price history point outside requested window");
        history.set(point.t, { t: point.t, p: Number(point.p) });
      }
      const cursor = result.pagination.next_cursor;
      if (cursor === null) break;
      if (!cursor || seen.has(cursor))
        throw new Error("Price history repeated pagination cursor");
      seen.add(cursor);
      query.cursor = cursor;
    }
  }
  return {
    history: [...history.values()]
      .filter(
        (point) => params.endTs === undefined || point.t <= Number(params.endTs)
      )
      .sort((a, b) => a.t - b.t),
  } as T;
}

/**
 * Bytes32 zero used by CLOB for "no builder" orders. Matches the SDK's
 * isBuilderOrder check (any builder code equal to this is treated as absent).
 */
const CLOB_BUILDER_CODE_ZERO =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/** CLOB returns builder fees in basis-points; divide by 1e4 to get the rate. */
const CLOB_BUILDER_FEES_BPS_DIVISOR = 10_000;

export interface ClobBuilderFeeRates {
  /** Maker fee rate as a fraction (e.g. 0.001 = 10 bps = 0.1 %). */
  maker: number;
  /** Taker fee rate as a fraction. */
  taker: number;
}

interface BuilderFeesResponse {
  builder_maker_fee_rate_bps?: number;
  builder_taker_fee_rate_bps?: number;
}

/**
 * Fetch the builder maker/taker fee rates for a given builder code from the
 * CLOB's public `/fees/builder-fees/{code}` endpoint. Returned as fractions
 * (already divided by 10_000). Both the place-order pre-flight and the
 * trading-panel preview must source builder fees from this endpoint — the
 * order-creation path does the same internally, and `getClobMarketInfo` does
 * not include builder-specific fees.
 *
 * Returns `{ maker: 0, taker: 0 }` when the builder code is missing or the
 * bytes32 zero sentinel. Throws when a configured builder's payload is
 * malformed (non-finite or negative rates) — a builder that should be
 * attributed but whose rates are unreadable must not quote as fee-free, so
 * the error propagates to callers whose fee estimate then falls back to the
 * conservative reserve.
 */
export async function fetchClobBuilderFeeRates(
  builderCode: string | undefined,
  options?: ClobRequestOptions
): Promise<ClobBuilderFeeRates> {
  if (!builderCode || builderCode === CLOB_BUILDER_CODE_ZERO) {
    return { maker: 0, taker: 0 };
  }

  if (canUseUnifiedSdkForPublicRead(options)) {
    if (options?.unifiedClient?.fetchBuilderFeeRates) {
      const data = await options.unifiedClient.fetchBuilderFeeRates({
        builderCode,
      });
      return normalizeClobBuilderFeeRates(data);
    }

    const { fetchUnifiedClobBuilderFeeRates } = await import(
      "./polymarket-unified.ts"
    );
    return fetchUnifiedClobBuilderFeeRates(builderCode);
  }

  const data = await fetchClobJson<BuilderFeesResponse>(
    `fees/builder-fees/${encodeURIComponent(builderCode)}`,
    undefined,
    options
  );

  // Absent bps fields are the endpoint's spelling of zero; present fields
  // must be usable numbers — a negative bps here would flow into
  // `Decimal.max(0, ...)` downstream and launder the quote into free.
  return {
    maker:
      requireBuilderFeeRateNumber(
        data.builder_maker_fee_rate_bps ?? 0,
        "builder_maker_fee_rate_bps"
      ) / CLOB_BUILDER_FEES_BPS_DIVISOR,
    taker:
      requireBuilderFeeRateNumber(
        data.builder_taker_fee_rate_bps ?? 0,
        "builder_taker_fee_rate_bps"
      ) / CLOB_BUILDER_FEES_BPS_DIVISOR,
  };
}

function requireBuilderFeeRateNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `Malformed builder fee rate: ${field} must be a finite non-negative number`
    );
  }
  return value;
}

function normalizeClobBuilderFeeRates(raw: unknown): ClobBuilderFeeRates {
  if (!isRecord(raw)) {
    throw new Error("Malformed builder fee rates payload");
  }
  return {
    maker: requireBuilderFeeRateNumber(raw.maker, "maker"),
    taker: requireBuilderFeeRateNumber(raw.taker, "taker"),
  };
}
