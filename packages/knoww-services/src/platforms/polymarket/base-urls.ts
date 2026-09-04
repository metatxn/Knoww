/**
 * Base URLs for Polymarket's three public APIs. The registry owns the values
 * it hands to the adapter; these defaults are the production hosts the legacy
 * `src/markets/*` modules always called.
 */
export interface PolymarketBaseUrls {
  /** Gamma: events, markets, tags, public search. */
  gamma: string;
  /** CLOB: orderbooks, price history, quotes. */
  clob: string;
  /** Data API: trades, holders, positions, leaderboard, profiles. */
  dataApi: string;
}

export const DEFAULT_POLYMARKET_BASE_URLS: PolymarketBaseUrls = Object.freeze({
  gamma: "https://gamma-api.polymarket.com",
  clob: "https://clob.polymarket.com",
  dataApi: "https://data-api.polymarket.com",
});
