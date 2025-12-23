"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type { OrderBookLevel } from "@/types/market";
import type {
  BookEvent,
  LastTradePriceEvent,
  PriceChangeEvent,
} from "@/types/websocket";

/**
 * Processed order book data with computed values
 */
export interface ProcessedOrderBook {
  /** Asset/token ID */
  assetId: string;
  /** Market condition ID */
  market: string;
  /** Bid levels (sorted descending by price) */
  bids: OrderBookLevel[];
  /** Ask levels (sorted ascending by price) */
  asks: OrderBookLevel[];
  /** Best bid price */
  bestBid: number | null;
  /** Best ask price */
  bestAsk: number | null;
  /** Spread (best ask - best bid) */
  spread: number | null;
  /** Midpoint price */
  midpoint: number | null;
  /** Total bid size */
  totalBidSize: number;
  /** Total ask size */
  totalAskSize: number;
  /** Last update timestamp */
  timestamp: string;
  /** Hash for change detection */
  hash: string;
  /** Data source (websocket or rest) */
  source: "websocket" | "rest";
}

/**
 * Last trade information
 */
export interface LastTrade {
  assetId: string;
  price: number;
  size: number;
  side: "BUY" | "SELL";
  timestamp: string;
}

/**
 * Order book store state
 */
interface OrderBookStoreState {
  /** Order books indexed by asset ID */
  orderBooks: Map<string, ProcessedOrderBook>;
  /** Last trades indexed by asset ID */
  lastTrades: Map<string, LastTrade>;
  /** Connection status */
  isConnected: boolean;
  /** Last error */
  lastError: Error | null;

  // Actions
  /** Process a full order book snapshot */
  handleBookEvent: (event: BookEvent) => void;
  /** Process incremental price changes */
  handlePriceChangeEvent: (event: PriceChangeEvent) => void;
  /** Process last trade price event */
  handleLastTradePriceEvent: (event: LastTradePriceEvent) => void;
  /** Set order book from REST API fallback */
  setOrderBookFromRest: (
    assetId: string,
    bids: OrderBookLevel[],
    asks: OrderBookLevel[]
  ) => void;
  /** Clear order book for an asset */
  clearOrderBook: (assetId: string) => void;
  /** Clear all order books */
  clearAllOrderBooks: () => void;
  /** Set connection status */
  setConnected: (connected: boolean) => void;
  /** Set last error */
  setError: (error: Error | null) => void;

  // Selectors
  /** Get order book for a specific asset */
  getOrderBook: (assetId: string) => ProcessedOrderBook | undefined;
  /** Get best bid for a specific asset */
  getBestBid: (assetId: string) => number | null;
  /** Get best ask for a specific asset */
  getBestAsk: (assetId: string) => number | null;
  /** Get spread for a specific asset */
  getSpread: (assetId: string) => number | null;
  /** Get last trade for a specific asset */
  getLastTrade: (assetId: string) => LastTrade | undefined;
}

/**
 * Process raw order book levels into sorted arrays with computed values
 */
function processOrderBook(
  assetId: string,
  market: string,
  rawBids: OrderBookLevel[],
  rawAsks: OrderBookLevel[],
  timestamp: string,
  hash: string,
  source: "websocket" | "rest"
): ProcessedOrderBook {
  // Sort bids descending by price
  const bids = [...rawBids].sort(
    (a, b) => Number.parseFloat(b.price) - Number.parseFloat(a.price)
  );

  // Sort asks ascending by price
  const asks = [...rawAsks].sort(
    (a, b) => Number.parseFloat(a.price) - Number.parseFloat(b.price)
  );

  // Calculate best prices
  const bestBid = bids.length > 0 ? Number.parseFloat(bids[0].price) : null;
  const bestAsk = asks.length > 0 ? Number.parseFloat(asks[0].price) : null;

  // Calculate spread and midpoint
  const spread =
    bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const midpoint =
    bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;

  // Calculate total sizes
  const totalBidSize = bids.reduce(
    (sum, level) => sum + Number.parseFloat(level.size),
    0
  );
  const totalAskSize = asks.reduce(
    (sum, level) => sum + Number.parseFloat(level.size),
    0
  );

  return {
    assetId,
    market,
    bids,
    asks,
    bestBid,
    bestAsk,
    spread,
    midpoint,
    totalBidSize,
    totalAskSize,
    timestamp,
    hash,
    source,
  };
}

/**
 * Apply incremental price change to an order book
 */
function applyPriceChange(
  orderBook: ProcessedOrderBook,
  price: string,
  size: string,
  side: "BUY" | "SELL",
  bestBid: string,
  bestAsk: string,
  timestamp: string
): ProcessedOrderBook {
  const levels = side === "BUY" ? [...orderBook.bids] : [...orderBook.asks];

  // Find existing level
  const existingIndex = levels.findIndex((l) => l.price === price);
  const sizeNum = Number.parseFloat(size);

  if (sizeNum === 0) {
    // Remove level if size is 0
    if (existingIndex !== -1) {
      levels.splice(existingIndex, 1);
    }
  } else if (existingIndex !== -1) {
    // Update existing level
    levels[existingIndex] = { price, size };
  } else {
    // Add new level
    levels.push({ price, size });
  }

  // Re-sort
  if (side === "BUY") {
    levels.sort(
      (a, b) => Number.parseFloat(b.price) - Number.parseFloat(a.price)
    );
  } else {
    levels.sort(
      (a, b) => Number.parseFloat(a.price) - Number.parseFloat(b.price)
    );
  }

  // Update the order book
  const newBids = side === "BUY" ? levels : orderBook.bids;
  const newAsks = side === "SELL" ? levels : orderBook.asks;

  const newBestBid = Number.parseFloat(bestBid);
  const newBestAsk = Number.parseFloat(bestAsk);
  const newSpread = newBestAsk - newBestBid;
  const newMidpoint = (newBestBid + newBestAsk) / 2;

  return {
    ...orderBook,
    bids: newBids,
    asks: newAsks,
    bestBid: newBestBid,
    bestAsk: newBestAsk,
    spread: newSpread,
    midpoint: newMidpoint,
    totalBidSize: newBids.reduce(
      (sum, l) => sum + Number.parseFloat(l.size),
      0
    ),
    totalAskSize: newAsks.reduce(
      (sum, l) => sum + Number.parseFloat(l.size),
      0
    ),
    timestamp,
    source: "websocket",
  };
}

/**
 * Zustand store for order book state management
 *
 * Features:
 * - Stores order books for multiple assets
 * - Handles full snapshots and incremental updates
 * - Provides computed values (spread, midpoint, totals)
 * - Tracks last trades
 * - Supports REST API fallback
 */
export const useOrderBookStore = create<OrderBookStoreState>()(
  subscribeWithSelector((set, get) => ({
    orderBooks: new Map<string, ProcessedOrderBook>(),
    lastTrades: new Map<string, LastTrade>(),
    isConnected: false,
    lastError: null,

    handleBookEvent: (event: BookEvent) => {
      const processed = processOrderBook(
        event.asset_id,
        event.market,
        event.bids,
        event.asks,
        event.timestamp,
        event.hash,
        "websocket"
      );

      set((state) => {
        const newOrderBooks = new Map(state.orderBooks);
        newOrderBooks.set(event.asset_id, processed);
        return { orderBooks: newOrderBooks };
      });
    },

    handlePriceChangeEvent: (event: PriceChangeEvent) => {
      set((state) => {
        const newOrderBooks = new Map(state.orderBooks);

        for (const change of event.price_changes) {
          const existing = newOrderBooks.get(change.asset_id);
          if (existing) {
            const updated = applyPriceChange(
              existing,
              change.price,
              change.size,
              change.side,
              change.best_bid,
              change.best_ask,
              event.timestamp
            );
            newOrderBooks.set(change.asset_id, updated);
          }
        }

        return { orderBooks: newOrderBooks };
      });
    },

    handleLastTradePriceEvent: (event: LastTradePriceEvent) => {
      const lastTrade: LastTrade = {
        assetId: event.asset_id,
        price: Number.parseFloat(event.price),
        size: Number.parseFloat(event.size),
        side: event.side,
        timestamp: event.timestamp,
      };

      set((state) => {
        const newLastTrades = new Map(state.lastTrades);
        newLastTrades.set(event.asset_id, lastTrade);
        return { lastTrades: newLastTrades };
      });
    },

    setOrderBookFromRest: (
      assetId: string,
      bids: OrderBookLevel[],
      asks: OrderBookLevel[]
    ) => {
      const processed = processOrderBook(
        assetId,
        "",
        bids,
        asks,
        Date.now().toString(),
        "",
        "rest"
      );

      set((state) => {
        const newOrderBooks = new Map(state.orderBooks);
        newOrderBooks.set(assetId, processed);
        return { orderBooks: newOrderBooks };
      });
    },

    clearOrderBook: (assetId: string) => {
      set((state) => {
        const newOrderBooks = new Map(state.orderBooks);
        newOrderBooks.delete(assetId);
        const newLastTrades = new Map(state.lastTrades);
        newLastTrades.delete(assetId);
        return { orderBooks: newOrderBooks, lastTrades: newLastTrades };
      });
    },

    clearAllOrderBooks: () => {
      set({
        orderBooks: new Map<string, ProcessedOrderBook>(),
        lastTrades: new Map<string, LastTrade>(),
      });
    },

    setConnected: (connected: boolean) => {
      set({ isConnected: connected });
    },

    setError: (error: Error | null) => {
      set({ lastError: error });
    },

    // Selectors
    getOrderBook: (assetId: string) => {
      return get().orderBooks.get(assetId);
    },

    getBestBid: (assetId: string) => {
      return get().orderBooks.get(assetId)?.bestBid ?? null;
    },

    getBestAsk: (assetId: string) => {
      return get().orderBooks.get(assetId)?.bestAsk ?? null;
    },

    getSpread: (assetId: string) => {
      return get().orderBooks.get(assetId)?.spread ?? null;
    },

    getLastTrade: (assetId: string) => {
      return get().lastTrades.get(assetId);
    },
  }))
);

/**
 * Hook to get order book for a specific asset with automatic updates
 */
export function useOrderBook(assetId: string | undefined) {
  return useOrderBookStore((state: OrderBookStoreState) =>
    assetId ? state.orderBooks.get(assetId) : undefined
  );
}

/**
 * Hook to get best prices for a specific asset
 * Uses useShallow to prevent infinite re-renders from object creation
 */
export function useBestPrices(assetId: string | undefined) {
  return useOrderBookStore(
    useShallow((state: OrderBookStoreState) => {
      if (!assetId) return { bestBid: null, bestAsk: null, spread: null };
      const orderBook = state.orderBooks.get(assetId);
      return {
        bestBid: orderBook?.bestBid ?? null,
        bestAsk: orderBook?.bestAsk ?? null,
        spread: orderBook?.spread ?? null,
      };
    })
  );
}

/**
 * Hook to get last trade for a specific asset
 */
export function useLastTrade(assetId: string | undefined) {
  return useOrderBookStore((state: OrderBookStoreState) =>
    assetId ? state.lastTrades.get(assetId) : undefined
  );
}

/**
 * Hook to get connection status
 * Uses useShallow to prevent infinite re-renders from object creation
 */
export function useOrderBookConnectionStatus() {
  return useOrderBookStore(
    useShallow((state: OrderBookStoreState) => ({
      isConnected: state.isConnected,
      lastError: state.lastError,
    }))
  );
}
