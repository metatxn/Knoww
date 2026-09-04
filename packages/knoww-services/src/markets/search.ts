import {
  getPlatformAdapter,
  POLYMARKET_BASE_URLS,
  type Polymarket,
} from "../registry";

/**
 * Legacy Polymarket search API. Thin wrapper over the registry's Polymarket
 * adapter so existing callers keep their imports and behavior; new code goes
 * through the registry (see docs/decisions/2026-09-03-aggregator-platform-adapters.md).
 */
export {
  buildEmptySearchResponse,
  DEFAULT_SEARCH_LIMIT,
  getExactTopOutcome,
  getTopOutcome,
  MAX_SEARCH_LIMIT,
  mergeEvents,
} from "../registry";

export const GAMMA_API_BASE = POLYMARKET_BASE_URLS.gamma;

export type TopOutcome = Polymarket.TopOutcome;
export type ExactTopOutcome = Polymarket.ExactTopOutcome;
export type Market = Polymarket.Market;
export type SearchEvent = Polymarket.SearchEvent;
export type SearchResponseData = Polymarket.SearchResponseData;
export type TagEventsResult = Polymarket.TagEventsResult;
export type SearchFetchOptions = Polymarket.SearchFetchOptions;

type Client = Polymarket.PolymarketClient;

const client = () => getPlatformAdapter("polymarket").client;

export const fetchPublicSearchEvents: Client["fetchPublicSearchEvents"] = (
  ...args
) => client().fetchPublicSearchEvents(...args);

export const fetchTagEvents: Client["fetchTagEvents"] = (...args) =>
  client().fetchTagEvents(...args);

export const fetchAggregatedSearchData: Client["fetchAggregatedSearchData"] = (
  ...args
) => client().fetchAggregatedSearchData(...args);
