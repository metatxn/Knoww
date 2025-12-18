/**
 * Polymarket API and Service URLs
 *
 * Reference: https://docs.polymarket.com/developers
 */

/**
 * Chain ID for Polygon Mainnet
 */
export const POLYGON_CHAIN_ID = 137;

/**
 * CLOB (Central Limit Order Book) API
 * Used for order placement, order book data, and market information
 */
export const CLOB_API_URL = "https://clob.polymarket.com";

/**
 * Gamma API
 * Used for market metadata, events, and search
 */
export const GAMMA_API_URL = "https://gamma-api.polymarket.com";

/**
 * Data API
 * Used for historical data, trades, and analytics
 */
export const DATA_API_URL = "https://data-api.polymarket.com";

/**
 * User P&L API
 * Used for profit/loss calculations and history
 */
export const USER_PNL_API_URL = "https://user-pnl-api.polymarket.com";

/**
 * Relayer API (v2)
 * Used for gasless transactions (Safe deployment, approvals, etc.)
 */
export const RELAYER_API_URL = "https://relayer-v2.polymarket.com/";

/**
 * Strapi API
 * Used for content management (descriptions, FAQs, etc.)
 */
export const STRAPI_API_URL = "https://strapi-matic.poly.market";

/**
 * All API URLs grouped together
 */
export const API_URLS = {
  CLOB: CLOB_API_URL,
  GAMMA: GAMMA_API_URL,
  DATA: DATA_API_URL,
  USER_PNL: USER_PNL_API_URL,
  RELAYER: RELAYER_API_URL,
  STRAPI: STRAPI_API_URL,
} as const;

/**
 * EIP-712 Domain for CLOB Authentication
 */
export const CLOB_AUTH_DOMAIN = {
  name: "ClobAuthDomain",
  version: "1",
  chainId: POLYGON_CHAIN_ID,
} as const;

/**
 * EIP-712 Types for CLOB Authentication
 */
export const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
} as const;

/**
 * Message to sign for CLOB authentication
 */
export const CLOB_AUTH_MESSAGE =
  "This message attests that I control the given wallet";

/**
 * Signature types for CLOB client
 */
export const SIGNATURE_TYPES = {
  EOA: 0, // Externally Owned Account (regular wallet)
  POLY_PROXY: 1, // Polymarket Proxy Wallet
  POLY_GNOSIS_SAFE: 2, // Gnosis Safe (used for trading via proxy)
} as const;

