/**
 * Market and Order Book types for Polymarket CLOB
 */

/**
 * Order book level representing a price point with size
 */
export interface OrderBookLevel {
  price: string;
  size: string;
}

/**
 * Order book data structure
 */
export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

/**
 * Trading side for orders
 */
export type TradingSide = "BUY" | "SELL";

/**
 * Order type selection
 */
export type OrderTypeSelection = "LIMIT" | "MARKET";

/**
 * Outcome data for the trading form
 */
export interface OutcomeData {
  name: string;
  tokenId: string;
  price: number; // Current price (0-1)
  probability: number; // Current probability (0-100)
}
