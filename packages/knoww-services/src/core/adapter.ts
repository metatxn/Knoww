import type { ServiceFetchOptions } from "../fetch-options";
import type { MarketCapabilities } from "./capabilities";
import type { PlatformId } from "./ids";
import type {
  CanonicalEvent,
  CanonicalMarket,
  CanonicalOrderbook,
  CanonicalPriceHistory,
  CanonicalTag,
  CanonicalTrade,
  Page,
} from "./types";

/**
 * Adapter contracts. One market-data adapter per platform in M1; the trading
 * adapter lands in M3. Every method returns canonical types and throws
 * PlatformError (see ./errors.ts). Adapters take their fetch implementation
 * at construction; the per-call options carry cancellation and cache hints.
 */
export interface SearchMarketsInput {
  query: string;
  limit?: number;
  cursor?: string;
}

export type EventSort =
  | "volume24h"
  | "volume"
  | "liquidity"
  | "newest"
  | "endingSoon";

export type EventStatusFilter = "active" | "closed" | "all";

export interface ListEventsInput {
  /** Knoww taxonomy slug or native platform slug (pass-through). */
  tag?: string;
  sort?: EventSort;
  cursor?: string;
  limit?: number;
  /** Only events with a live underlying (sports). */
  live?: boolean;
  status?: EventStatusFilter;
}

export interface ListTagsInput {
  limit?: number;
  cursor?: string;
}

export interface OrderbookInput {
  sourceMarketId: string;
  /** Required on platforms that book each outcome separately (Polymarket). */
  sourceOutcomeId?: string;
}

export type PriceHistoryInterval = "1h" | "6h" | "1d" | "1w" | "1m" | "max";

export interface PriceHistoryInput {
  sourceMarketId: string;
  sourceOutcomeId: string;
  interval?: PriceHistoryInterval;
  fidelityMinutes?: number;
}

export interface MarketTradesInput {
  sourceMarketId: string;
  limit?: number;
  cursor?: string;
}

export interface MarketDataAdapter {
  readonly platform: PlatformId;
  /** Static declaration; the registry applies capability overrides. */
  capabilities(): MarketCapabilities;
  /** Search returns the events whose markets match, each with its markets. */
  searchMarkets(
    input: SearchMarketsInput,
    options?: ServiceFetchOptions
  ): Promise<Page<CanonicalEvent>>;
  listEvents(
    input: ListEventsInput,
    options?: ServiceFetchOptions
  ): Promise<Page<CanonicalEvent>>;
  getEvent(
    sourceEventId: string,
    options?: ServiceFetchOptions
  ): Promise<CanonicalEvent>;
  getEventBySlug(
    slug: string,
    options?: ServiceFetchOptions
  ): Promise<CanonicalEvent>;
  getMarket(
    sourceMarketId: string,
    options?: ServiceFetchOptions
  ): Promise<CanonicalMarket>;
  listTags(
    input?: ListTagsInput,
    options?: ServiceFetchOptions
  ): Promise<Page<CanonicalTag>>;
  getOrderbook(
    input: OrderbookInput,
    options?: ServiceFetchOptions
  ): Promise<CanonicalOrderbook>;
  getPriceHistory(
    input: PriceHistoryInput,
    options?: ServiceFetchOptions
  ): Promise<CanonicalPriceHistory>;
  getMarketTrades(
    input: MarketTradesInput,
    options?: ServiceFetchOptions
  ): Promise<Page<CanonicalTrade>>;
}

/**
 * Trading contract placeholder. Methods (connectionStatus, account reads,
 * previewOrder, placeOrder, cancelOrder) are specified in M3; the registry
 * already returns `null` for discovery-only platforms.
 */
export interface TradingAdapter {
  readonly platform: PlatformId;
}
