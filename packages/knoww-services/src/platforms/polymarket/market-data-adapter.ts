import Decimal from "decimal.js";
import {
  buildCanonicalId,
  type CanonicalEvent,
  type CanonicalMarket,
  type CanonicalOrderbook,
  type CanonicalOrderbookLevel,
  type CanonicalPriceHistory,
  type CanonicalTag,
  type CanonicalTrade,
  type EventSort,
  type ListEventsInput,
  type ListTagsInput,
  type MarketCapabilities,
  type MarketDataAdapter,
  type MarketTradesInput,
  type OrderbookInput,
  type Page,
  PlatformError,
  type PlatformOperation,
  type PriceHistoryInput,
  type PriceHistoryInterval,
  type SearchMarketsInput,
} from "../../core";
import type { ServiceFetchOptions } from "../../fetch-options";
import type { PolymarketBaseUrls } from "./base-urls";
import { POLYMARKET_CAPABILITIES } from "./capabilities";
import {
  createPolymarketClient,
  type PolymarketClient,
  type PolymarketClientInit,
} from "./client";
import type { OrderbookLevel } from "./clob-orderbook";
import { isUpstreamError } from "./errors";
import { DEFAULT_SEARCH_LIMIT } from "./gamma-search";
import { type MapContext, mapGammaEvent, mapGammaMarket } from "./mappers";
import type { DataApiTrade } from "./public-data";

/**
 * Polymarket market-data adapter. Every method translates the canonical
 * input into the legacy client call, maps the response through ./mappers,
 * and converts client failures into PlatformError. The upstream calls and
 * their URLs are unchanged from the legacy modules.
 */

const PLATFORM = "polymarket" as const;
const DEFAULT_PAGE_LIMIT = 20;

const EVENT_SORTS: Record<EventSort, { order: string; ascending: boolean }> = {
  volume24h: { order: "volume24hr", ascending: false },
  volume: { order: "volume", ascending: false },
  liquidity: { order: "liquidity", ascending: false },
  endingSoon: { order: "endDate", ascending: true },
  newest: { order: "startDate", ascending: false },
};

/** Window length in seconds (null = since inception) and default fidelity in minutes. */
const PRICE_HISTORY_WINDOWS: Record<
  PriceHistoryInterval,
  { seconds: number | null; fidelity: number }
> = {
  "1h": { seconds: 3600, fidelity: 1 },
  "6h": { seconds: 21600, fidelity: 5 },
  "1d": { seconds: 86400, fidelity: 15 },
  "1w": { seconds: 604800, fidelity: 60 },
  "1m": { seconds: 2592000, fidelity: 180 },
  max: { seconds: null, fidelity: 1440 },
};
const DEFAULT_PRICE_HISTORY_INTERVAL: PriceHistoryInterval = "1d";

export interface PolymarketMarketDataAdapterInit extends PolymarketClientInit {
  /** Clock used for `fetchedAt` and price-history windows. */
  now?: () => Date;
  /**
   * Effective capabilities, normally the static declaration with the
   * registry's overrides applied. Reported by `capabilities()` and stamped on
   * every mapped event and market.
   */
  capabilities?: MarketCapabilities;
}

export interface PolymarketMarketDataAdapter extends MarketDataAdapter {
  readonly platform: typeof PLATFORM;
  readonly client: PolymarketClient;
  readonly baseUrls: PolymarketBaseUrls;
}

/** DOMException-safe: the abort reason may come from another realm. */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function toPlatformError(
  error: unknown,
  operation: PlatformOperation,
  options?: ServiceFetchOptions
): unknown {
  if (error instanceof PlatformError) {
    return error;
  }
  if (options?.signal?.aborted) {
    // Caller cancellation is not a platform failure; surface it untouched.
    return error;
  }
  if (isAbortError(error)) {
    return new PlatformError(`Polymarket ${operation} timed out`, {
      platform: PLATFORM,
      operation,
      kind: "timeout",
      cause: error,
    });
  }
  if (isUpstreamError(error)) {
    return new PlatformError(error.message, {
      platform: PLATFORM,
      operation,
      kind: "upstream",
      upstreamStatus: error.status,
      cause: error,
    });
  }
  return new PlatformError(
    error instanceof Error ? error.message : `Polymarket ${operation} failed`,
    { platform: PLATFORM, operation, kind: "upstream", cause: error }
  );
}

async function run<T>(
  operation: PlatformOperation,
  options: ServiceFetchOptions | undefined,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toPlatformError(error, operation, options);
  }
}

function invalidInput(
  operation: PlatformOperation,
  message: string
): PlatformError {
  return new PlatformError(message, {
    platform: PLATFORM,
    operation,
    kind: "invalid_input",
  });
}

function notFound(
  operation: PlatformOperation,
  message: string
): PlatformError {
  return new PlatformError(message, {
    platform: PLATFORM,
    operation,
    kind: "not_found",
  });
}

function requireId(
  value: string | undefined,
  name: string,
  operation: PlatformOperation
): string {
  if (value === undefined || value.trim() === "") {
    throw invalidInput(operation, `${name} is required`);
  }
  return value;
}

function resolveLimit(
  limit: number | undefined,
  fallback: number,
  operation: PlatformOperation
): number {
  if (limit === undefined) {
    return fallback;
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw invalidInput(operation, "limit must be a positive integer");
  }
  return limit;
}

/** Offset cursors are the adapter's own encoding: the next offset as a decimal string. */
function parseOffsetCursor(
  cursor: string | undefined,
  operation: PlatformOperation
): number {
  if (cursor === undefined) {
    return 0;
  }
  if (!/^\d+$/.test(cursor)) {
    throw invalidInput(operation, "cursor is not a valid offset cursor");
  }
  return Number(cursor);
}

function sortLevels(
  levels: OrderbookLevel[],
  direction: "asc" | "desc"
): CanonicalOrderbookLevel[] {
  const sign = direction === "asc" ? 1 : -1;
  return levels
    .map((level) => ({ price: level.price, size: level.size }))
    .sort((a, b) => sign * new Decimal(a.price).comparedTo(b.price));
}

function toCanonicalTrade(
  trade: DataApiTrade,
  fallbackConditionId: string
): CanonicalTrade {
  const item: CanonicalTrade = {
    marketId: buildCanonicalId(
      PLATFORM,
      trade.conditionId || fallbackConditionId
    ),
    outcomeId: buildCanonicalId(PLATFORM, trade.asset),
    platform: PLATFORM,
    side: trade.side === "BUY" ? "buy" : "sell",
    price: trade.price,
    size: trade.size,
    time: new Date(trade.timestamp * 1000).toISOString(),
    trader: trade.proxyWallet,
  };
  if (trade.transactionHash !== undefined) {
    item.id = trade.transactionHash;
  }
  return item;
}

export function createPolymarketMarketDataAdapter(
  init: PolymarketMarketDataAdapterInit = {}
): PolymarketMarketDataAdapter {
  const client = createPolymarketClient(init);
  const now = init.now ?? (() => new Date());
  const effectiveCapabilities = init.capabilities ?? POLYMARKET_CAPABILITIES;

  function mapContext(): MapContext {
    return {
      fetchedAt: now().toISOString(),
      capabilities: effectiveCapabilities,
    };
  }

  function capabilities(): MarketCapabilities {
    return effectiveCapabilities;
  }

  async function searchMarkets(
    input: SearchMarketsInput,
    options?: ServiceFetchOptions
  ): Promise<Page<CanonicalEvent>> {
    const operation = "searchMarkets";
    if (input.cursor !== undefined) {
      throw invalidInput(operation, "search does not support cursors");
    }
    const limit = resolveLimit(input.limit, DEFAULT_SEARCH_LIMIT, operation);
    return run(operation, options, async () => {
      const result = await client.fetchPublicSearchEvents(input.query, limit, {
        ...options,
        fullMarketRecords: true,
      });
      const ctx = mapContext();
      return { items: result.events.map((event) => mapGammaEvent(event, ctx)) };
    });
  }

  async function listEvents(
    input: ListEventsInput,
    options?: ServiceFetchOptions
  ): Promise<Page<CanonicalEvent>> {
    const operation = "listEvents";
    const limit = resolveLimit(input.limit, DEFAULT_PAGE_LIMIT, operation);
    const status = input.status ?? "active";
    const sort = input.sort === undefined ? undefined : EVENT_SORTS[input.sort];
    return run(operation, options, async () => {
      const page = await client.fetchEventPage(
        {
          limit,
          cursor: input.cursor,
          closed: status === "all" ? undefined : status === "closed",
          live: input.live,
          tagSlug: input.tag,
          order: sort?.order,
          ascending: sort?.ascending,
        },
        options
      );
      const ctx = mapContext();
      return {
        items: page.rawEvents.map((event) => mapGammaEvent(event, ctx)),
        nextCursor: page.nextCursor ?? undefined,
        totalResults: page.totalResults,
      };
    });
  }

  async function getEvent(
    sourceEventId: string,
    options?: ServiceFetchOptions
  ): Promise<CanonicalEvent> {
    const operation = "getEvent";
    const id = requireId(sourceEventId, "sourceEventId", operation);
    return run(operation, options, async () => {
      const event = await client.fetchEventRecordByIdentifier(
        { kind: "id", value: id },
        options
      );
      if (!event) {
        throw notFound(operation, `Polymarket event ${id} was not found`);
      }
      return mapGammaEvent(event, mapContext());
    });
  }

  async function getEventBySlug(
    slug: string,
    options?: ServiceFetchOptions
  ): Promise<CanonicalEvent> {
    const operation = "getEventBySlug";
    const value = requireId(slug, "slug", operation);
    return run(operation, options, async () => {
      const event = await client.fetchEventRecordByIdentifier(
        { kind: "slug", value },
        options
      );
      if (!event) {
        throw notFound(operation, `Polymarket event ${value} was not found`);
      }
      return mapGammaEvent(event, mapContext());
    });
  }

  async function getMarket(
    sourceMarketId: string,
    options?: ServiceFetchOptions
  ): Promise<CanonicalMarket> {
    const operation = "getMarket";
    const conditionId = requireId(sourceMarketId, "sourceMarketId", operation);
    return run(operation, options, async () => {
      const market = await client.fetchMarketByIdentifier(
        { kind: "conditionId", value: conditionId },
        options
      );
      if (!market) {
        throw notFound(
          operation,
          `Polymarket market ${conditionId} was not found`
        );
      }
      const mapped = mapGammaMarket(market, mapContext());
      if (!mapped) {
        throw new PlatformError(
          "Gamma returned a market without a condition id",
          { platform: PLATFORM, operation, kind: "upstream" }
        );
      }
      return mapped;
    });
  }

  async function listTags(
    input: ListTagsInput = {},
    options?: ServiceFetchOptions
  ): Promise<Page<CanonicalTag>> {
    const operation = "listTags";
    const limit = resolveLimit(input.limit, DEFAULT_PAGE_LIMIT, operation);
    const offset = parseOffsetCursor(input.cursor, operation);
    return run(operation, options, async () => {
      const tags = await client.fetchTags({ limit, offset }, options);
      const items: CanonicalTag[] = tags.map((tag) => ({
        platform: PLATFORM,
        slug: tag.slug,
        label: tag.label,
        kind: "native",
        sourceTagId: tag.id,
      }));
      return tags.length >= limit
        ? { items, nextCursor: String(offset + limit) }
        : { items };
    });
  }

  async function getOrderbook(
    input: OrderbookInput,
    options?: ServiceFetchOptions
  ): Promise<CanonicalOrderbook> {
    const operation = "getOrderbook";
    const conditionId = requireId(
      input.sourceMarketId,
      "sourceMarketId",
      operation
    );
    const tokenId = requireId(
      input.sourceOutcomeId,
      "sourceOutcomeId",
      operation
    );
    return run(operation, options, async () => {
      const snapshot = await client.fetchOrderbookByTokenId(tokenId, options);
      if (!snapshot) {
        throw notFound(operation, `No Polymarket book for token ${tokenId}`);
      }
      return {
        marketId: buildCanonicalId(PLATFORM, conditionId),
        outcomeId: buildCanonicalId(PLATFORM, tokenId),
        platform: PLATFORM,
        bids: sortLevels(snapshot.bids, "desc"),
        asks: sortLevels(snapshot.asks, "asc"),
        fetchedAt: now().toISOString(),
      };
    });
  }

  async function getPriceHistory(
    input: PriceHistoryInput,
    options?: ServiceFetchOptions
  ): Promise<CanonicalPriceHistory> {
    const operation = "getPriceHistory";
    const conditionId = requireId(
      input.sourceMarketId,
      "sourceMarketId",
      operation
    );
    const tokenId = requireId(
      input.sourceOutcomeId,
      "sourceOutcomeId",
      operation
    );
    if (
      input.fidelityMinutes !== undefined &&
      (!Number.isInteger(input.fidelityMinutes) || input.fidelityMinutes < 1)
    ) {
      throw invalidInput(
        operation,
        "fidelityMinutes must be a positive integer"
      );
    }
    const window =
      PRICE_HISTORY_WINDOWS[input.interval ?? DEFAULT_PRICE_HISTORY_INTERVAL];
    return run(operation, options, async () => {
      const at = now();
      const endTs = Math.floor(at.getTime() / 1000);
      const startTs = window.seconds === null ? 0 : endTs - window.seconds;
      const fidelity = input.fidelityMinutes ?? window.fidelity;
      const points = await client.fetchPriceHistoryByTokenId(
        tokenId,
        { startTs, endTs, fidelity },
        options
      );
      return {
        marketId: buildCanonicalId(PLATFORM, conditionId),
        outcomeId: buildCanonicalId(PLATFORM, tokenId),
        platform: PLATFORM,
        points: points.map((point) => ({
          time: new Date(point.t * 1000).toISOString(),
          price: point.p,
        })),
        fetchedAt: at.toISOString(),
      };
    });
  }

  async function getMarketTrades(
    input: MarketTradesInput,
    options?: ServiceFetchOptions
  ): Promise<Page<CanonicalTrade>> {
    const operation = "getMarketTrades";
    const conditionId = requireId(
      input.sourceMarketId,
      "sourceMarketId",
      operation
    );
    const limit = resolveLimit(input.limit, DEFAULT_PAGE_LIMIT, operation);
    const offset = parseOffsetCursor(input.cursor, operation);
    return run(operation, options, async () => {
      const trades = await client.fetchMarketTrades(
        { conditionIds: [conditionId], limit, offset },
        options
      );
      const items = trades.map((trade) => toCanonicalTrade(trade, conditionId));
      return trades.length >= limit
        ? { items, nextCursor: String(offset + limit) }
        : { items };
    });
  }

  return {
    platform: PLATFORM,
    client,
    baseUrls: client.baseUrls,
    capabilities,
    searchMarkets,
    listEvents,
    getEvent,
    getEventBySlug,
    getMarket,
    listTags,
    getOrderbook,
    getPriceHistory,
    getMarketTrades,
  };
}
