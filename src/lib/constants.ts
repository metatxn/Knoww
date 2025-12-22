/**
 * API Endpoints and Configuration Constants
 */

// Polymarket API Endpoints
export const POLYMARKET_API = {
  GAMMA: {
    BASE: "https://gamma-api.polymarket.com",
    TEAMS: "https://gamma-api.polymarket.com/teams",
    SPORTS: "https://gamma-api.polymarket.com/sports",
    MARKETS: "https://gamma-api.polymarket.com/markets",
    EVENTS: "https://gamma-api.polymarket.com/events",
    EVENTS_PAGINATION: "https://gamma-api.polymarket.com/events/pagination",
  },
  CLOB: {
    BASE: "https://clob.polymarket.com",
  },
  DATA: {
    BASE: "https://data-api.polymarket.com",
    HOLDERS: "https://data-api.polymarket.com/holders",
  },
  WSS: {
    /** WebSocket endpoint for market data (order books, price changes, trades) */
    MARKET: "wss://ws-subscriptions-clob.polymarket.com/ws/market",
    /** WebSocket endpoint for user-specific data (requires authentication) */
    USER: "wss://ws-subscriptions-clob.polymarket.com/ws/user",
  },
} as const;

// WebSocket configuration
export const WEBSOCKET_CONFIG = {
  /** Initial reconnection delay in milliseconds */
  RECONNECT_DELAY_MS: 1000,
  /** Maximum reconnection delay in milliseconds */
  MAX_RECONNECT_DELAY_MS: 30000,
  /** Reconnection backoff multiplier */
  RECONNECT_BACKOFF: 2,
  /** Maximum number of markets to subscribe per connection */
  MAX_SUBSCRIPTIONS_PER_CONNECTION: 50,
  /** Heartbeat interval in milliseconds */
  HEARTBEAT_INTERVAL_MS: 30000,
  /** Connection timeout in milliseconds */
  CONNECTION_TIMEOUT_MS: 10000,
} as const;

// Default pagination values
export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  DEFAULT_OFFSET: 0,
} as const;

// Cache durations (in seconds)
export const CACHE_DURATION = {
  SPORTS_LIST: 3600, // 1 hour - sports rarely change
  LEAGUES: 3600, // 1 hour - leagues rarely change
  TEAMS: 1800, // 30 minutes - teams update occasionally
  MARKETS: 60, // 1 minute - markets update frequently
  EVENTS: 60, // 1 minute - events update frequently
  PRICES: 10, // 10 seconds - prices change rapidly
} as const;

// API response limits
export const API_LIMITS = {
  SPORTS: {
    MIN_LIMIT: 1,
    MAX_LIMIT: 100,
    DEFAULT_LIMIT: 100,
  },
  TEAMS: {
    MIN_LIMIT: 1,
    MAX_LIMIT: 100,
    DEFAULT_LIMIT: 100,
  },
  MARKETS: {
    MIN_LIMIT: 1,
    MAX_LIMIT: 100,
    DEFAULT_LIMIT: 50,
  },
  EVENTS: {
    MIN_LIMIT: 1,
    MAX_LIMIT: 100,
    DEFAULT_LIMIT: 50,
  },
} as const;

// Polymarket chain configuration
export const POLYMARKET_CHAIN = {
  POLYGON_MAINNET: {
    CHAIN_ID: 137,
    NAME: "Polygon Mainnet",
    CURRENCY: "POL",
    RPC_URL: "https://polygon-rpc.com",
    BLOCK_EXPLORER: "https://polygonscan.com",
  },
  POLYGON_AMOY: {
    CHAIN_ID: 80002,
    NAME: "Polygon Amoy Testnet",
    CURRENCY: "POL",
    RPC_URL: "https://rpc-amoy.polygon.technology/",
    BLOCK_EXPLORER: "https://amoy.polygonscan.com",
  },
} as const;

// Order configuration
export const ORDER_CONFIG = {
  MIN_PRICE: 0.01,
  MAX_PRICE: 0.99,
  MIN_SIZE: 1,
  DEFAULT_EXPIRATION_SECONDS: 300, // 5 minutes
} as const;

// Error messages
export const ERROR_MESSAGES = {
  SPORT_NOT_FOUND: "Sport not found",
  TEAM_NOT_FOUND: "Team not found",
  MARKET_NOT_FOUND: "Market not found",
  EVENT_NOT_FOUND: "Event not found",
  INVALID_TAG_ID: "Invalid tag ID provided",
  GAMMA_API_ERROR: "Gamma API error",
  CLOB_API_ERROR: "CLOB API error",
  INVALID_CREDENTIALS:
    "API Credentials are needed to interact with this endpoint!",
  UNKNOWN_ERROR: "Unknown error occurred",
} as const;

// API version
export const API_VERSION = "1.0.0" as const;
