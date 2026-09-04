import {
  getPlatformAdapter,
  POLYMARKET_BASE_URLS,
  type Polymarket,
} from "../registry";

/**
 * Legacy Polymarket public-data API. Thin wrapper over the registry's
 * Polymarket adapter; see ../registry.ts.
 */
export const GAMMA_API_BASE = POLYMARKET_BASE_URLS.gamma;
export const DATA_API_BASE = POLYMARKET_BASE_URLS.dataApi;
export const CLOB_API_BASE = POLYMARKET_BASE_URLS.clob;

export type EventPageParams = Polymarket.EventPageParams;
export type MarketTradesParams = Polymarket.MarketTradesParams;

type Client = Polymarket.PolymarketClient;

const client = () => getPlatformAdapter("polymarket").client;

export const fetchEventPage: Client["fetchEventPage"] = (...args) =>
  client().fetchEventPage(...args);

export const fetchMarketTrades: Client["fetchMarketTrades"] = (...args) =>
  client().fetchMarketTrades(...args);

export const fetchMarketQuotes: Client["fetchMarketQuotes"] = (...args) =>
  client().fetchMarketQuotes(...args);

export const fetchMarketHolders: Client["fetchMarketHolders"] = (...args) =>
  client().fetchMarketHolders(...args);

export const fetchOpenInterest: Client["fetchOpenInterest"] = (...args) =>
  client().fetchOpenInterest(...args);

export const fetchEventLiveVolume: Client["fetchEventLiveVolume"] = (...args) =>
  client().fetchEventLiveVolume(...args);

export const fetchTraderLeaderboard: Client["fetchTraderLeaderboard"] = (
  ...args
) => client().fetchTraderLeaderboard(...args);

export const fetchTags: Client["fetchTags"] = (...args) =>
  client().fetchTags(...args);

export const fetchSportsMetadata: Client["fetchSportsMetadata"] = (...args) =>
  client().fetchSportsMetadata(...args);

export const fetchSportsMarketTypes: Client["fetchSportsMarketTypes"] = (
  ...args
) => client().fetchSportsMarketTypes(...args);

export const fetchSportsTeams: Client["fetchSportsTeams"] = (...args) =>
  client().fetchSportsTeams(...args);

export const fetchMarketPageByTagSlug: Client["fetchMarketPageByTagSlug"] = (
  ...args
) => client().fetchMarketPageByTagSlug(...args);
