/**
 * Polymarket platform folder. Importable as `@knoww/services/platforms/polymarket`
 * only from the escape-hatch folders named in the ADR
 * (docs/decisions/2026-09-03-aggregator-platform-adapters.md); everything else
 * goes through the registry.
 */
export {
  DEFAULT_POLYMARKET_BASE_URLS,
  type PolymarketBaseUrls,
} from "./base-urls";
export { POLYMARKET_CAPABILITIES } from "./capabilities";
export {
  createPolymarketClient,
  type PolymarketClient,
  type PolymarketClientInit,
  resolvePolymarketBaseUrls,
} from "./client";
export {
  type ClobMarketRecord,
  createClobMarket,
  type PolymarketClobMarket,
} from "./clob-market";
export {
  createClobOrderbook,
  type OrderbookLevel,
  type OrderbookSnapshot,
  type PolymarketClobOrderbook,
} from "./clob-orderbook";
export {
  createClobPriceHistory,
  type PolymarketClobPriceHistory,
  type PriceHistoryParams,
  type PriceHistoryPoint,
} from "./clob-price-history";
export {
  createPolymarketClientContext,
  type PolymarketClientContext,
  type PolymarketClientContextInit,
} from "./context";
export {
  createGammaDetail,
  type GammaMarketDetail,
  gammaMarketDetailSchema,
  type MarketIdentifier,
  type PolymarketGammaDetail,
} from "./gamma-detail";
export {
  type ChildEventsResult,
  createGammaEvents,
  type EventIdentifier,
  type GammaEventDetail,
  gammaEventDetailSchema,
  type PolymarketGammaEvents,
} from "./gamma-events";
export {
  buildEmptySearchResponse,
  createGammaSearch,
  DEFAULT_SEARCH_LIMIT,
  type ExactTopOutcome,
  getExactTopOutcome,
  getTopOutcome,
  MAX_SEARCH_LIMIT,
  type Market,
  mergeEvents,
  type PolymarketGammaSearch,
  type PublicSearchResult,
  type SearchEvent,
  type SearchFetchOptions,
  type SearchResponseData,
  type TagEventsResult,
  type TopOutcome,
} from "./gamma-search";
export {
  type GammaEventLike,
  type GammaEventRefLike,
  type GammaMarketLike,
  type GammaTagLike,
  isPolymarketEventDetails,
  isPolymarketMarketDetails,
  type MapContext,
  type MapGammaMarketParent,
  mapGammaEvent,
  mapGammaMarket,
  POLYMARKET_PLATFORM,
  type PolymarketEventDetails,
  type PolymarketMarketDetails,
  toDecimalString,
} from "./mappers";
export {
  createPolymarketMarketDataAdapter,
  type PolymarketMarketDataAdapter,
  type PolymarketMarketDataAdapterInit,
} from "./market-data-adapter";
export {
  type ClosedPositionsParams,
  createProfiles,
  type PnlPosition,
  type PolymarketProfiles,
  type ProfilesDependencies,
  summarizeWalletPnl,
  type WalletActivityParams,
  type WalletPositionsParams,
} from "./profiles";
export {
  createPublicData,
  type DataApiLeaderboardEntry,
  type DataApiLeaderboardRecord,
  type DataApiTrade,
  type EventPageParams,
  type GammaKeysetEvent,
  type GammaTag,
  type GammaTagRecord,
  type MarketTradesParams,
  type PolymarketPublicData,
  type TraderLeaderboardParams,
} from "./public-data";
export { POLYMARKET_REGION_POLICY } from "./region-policy";
export { type GammaStatusFlags, mapPolymarketStatus } from "./status";
export {
  createPolymarketTradingAdapter,
  type PolymarketTradingAdapter,
  type PolymarketTradingAdapterInit,
  type PolymarketTradingSigner,
} from "./trading-adapter";
