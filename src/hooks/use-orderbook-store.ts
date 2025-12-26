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
 * Stale data threshold in milliseconds (60 seconds)
 */
const STALE_THRESHOLD_MS = 60000;

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
  /** When the data was received locally (for staleness detection) */
  receivedAt: number;
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
 * Pending price change for assets that haven't received initial snapshot
 */
interface PendingChange {
  event: PriceChangeEvent;
  receivedAt: number;
}

/**
 * Order book store state
 */
interface OrderBookStoreState {
  /** Order books indexed by asset ID */
  orderBooks: Map<string, ProcessedOrderBook>;
  /** Last trades indexed by asset ID */
  lastTrades: Map<string, LastTrade>;
  /** Pending price changes for assets without initial snapshot */
  pendingChanges: Map<string, PendingChange[]>;
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
  /** Check if order book data is stale */
  isStale: (assetId: string) => boolean;
}

/**
 * Binary search to find insertion index for a price level
 * Returns the index where the new level should be inserted to maintain sort order
 */
function binarySearchInsertIndex(
  levels: OrderBookLevel[],
  price: number,
  ascending: boolean
): number {
  let left = 0;
  let right = levels.length;

  while (left < right) {
    const mid = (left + right) >>> 1;
    const midPrice = Number.parseFloat(levels[mid].price);

    if (ascending ? midPrice < price : midPrice > price) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
}

/**
 * Insert a level into a sorted array using binary search
 * More efficient than full re-sort for incremental updates (O(n) vs O(n log n))
 */
function insertLevelSorted(
  levels: OrderBookLevel[],
  newLevel: OrderBookLevel,
  ascending: boolean
): OrderBookLevel[] {
  const price = Number.parseFloat(newLevel.price);
  const insertIndex = binarySearchInsertIndex(levels, price, ascending);

  const result = [...levels];
  result.splice(insertIndex, 0, newLevel);
  return result;
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
    receivedAt: Date.now(),
  };
}

/**
 * Apply incremental price change to an order book
 * Uses binary insertion for new levels (O(n) instead of O(n log n) for full re-sort)
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
  let levels = side === "BUY" ? [...orderBook.bids] : [...orderBook.asks];
  const ascending = side === "SELL"; // asks are ascending, bids are descending

  // Find existing level using binary search for better performance
  const priceNum = Number.parseFloat(price);
  const existingIndex = levels.findIndex((l) => l.price === price);
  const sizeNum = Number.parseFloat(size);

  if (sizeNum === 0) {
    // Remove level if size is 0
    if (existingIndex !== -1) {
      levels.splice(existingIndex, 1);
    }
  } else if (existingIndex !== -1) {
    // Update existing level (no re-sort needed, price hasn't changed)
    levels[existingIndex] = { price, size };
  } else {
    // Add new level using binary insertion (more efficient than push + sort)
    levels = insertLevelSorted(levels, { price, size }, ascending);
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
    receivedAt: Date.now(),
  };
}

/**
 * Apply any pending price changes to a newly received order book
 */
function applyPendingChanges(
  orderBook: ProcessedOrderBook,
  pendingChanges: PendingChange[]
): ProcessedOrderBook {
  let result = orderBook;

  // Sort pending changes by received time to apply in order
  const sortedChanges = [...pendingChanges].sort(
    (a, b) => a.receivedAt - b.receivedAt
  );

  for (const pending of sortedChanges) {
    for (const change of pending.event.price_changes) {
      if (change.asset_id === orderBook.assetId) {
        result = applyPriceChange(
          result,
          change.price,
          change.size,
          change.side,
          change.best_bid,
          change.best_ask,
          pending.event.timestamp
        );
      }
    }
  }

  return result;
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
 * - Queues incremental updates that arrive before initial snapshot
 * - Detects stale data
 */
export const useOrderBookStore = create<OrderBookStoreState>()(
  subscribeWithSelector((set, get) => ({
    orderBooks: new Map<string, ProcessedOrderBook>(),
    lastTrades: new Map<string, LastTrade>(),
    pendingChanges: new Map<string, PendingChange[]>(),
    isConnected: false,
    lastError: null,

    handleBookEvent: (event: BookEvent) => {
      set((state) => {
        let processed = processOrderBook(
          event.asset_id,
          event.market,
          event.bids,
          event.asks,
          event.timestamp,
          event.hash,
          "websocket"
        );

        // Apply any pending changes that arrived before this snapshot
        const pending = state.pendingChanges.get(event.asset_id);
        if (pending && pending.length > 0) {
          processed = applyPendingChanges(processed, pending);
        }

        const newOrderBooks = new Map(state.orderBooks);
        newOrderBooks.set(event.asset_id, processed);

        // Clear pending changes for this asset
        const newPendingChanges = new Map(state.pendingChanges);
        newPendingChanges.delete(event.asset_id);

        return {
          orderBooks: newOrderBooks,
          pendingChanges: newPendingChanges,
        };
      });
    },

    handlePriceChangeEvent: (event: PriceChangeEvent) => {
      set((state) => {
        const newOrderBooks = new Map(state.orderBooks);
        const newPendingChanges = new Map(state.pendingChanges);

        for (const change of event.price_changes) {
          const existing = newOrderBooks.get(change.asset_id);
          if (existing) {
            // Apply immediately if we have the order book
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
          } else {
            // Queue for later if we don't have the initial snapshot yet
            const pending = newPendingChanges.get(change.asset_id) || [];
            // Avoid duplicate events and limit queue size
            if (pending.length < 100) {
              pending.push({
                event: {
                  ...event,
                  price_changes: [change], // Only store the relevant change
                },
                receivedAt: Date.now(),
              });
              newPendingChanges.set(change.asset_id, pending);
            }
          }
        }

        return {
          orderBooks: newOrderBooks,
          pendingChanges: newPendingChanges,
        };
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
      set((state) => {
        let processed = processOrderBook(
          assetId,
          "",
          bids,
          asks,
          Date.now().toString(),
          "",
          "rest"
        );

        // Apply any pending changes that arrived before this REST data
        const pending = state.pendingChanges.get(assetId);
        if (pending && pending.length > 0) {
          processed = applyPendingChanges(processed, pending);
        }

        const newOrderBooks = new Map(state.orderBooks);
        newOrderBooks.set(assetId, processed);

        // Clear pending changes for this asset
        const newPendingChanges = new Map(state.pendingChanges);
        newPendingChanges.delete(assetId);

        return {
          orderBooks: newOrderBooks,
          pendingChanges: newPendingChanges,
        };
      });
    },

    clearOrderBook: (assetId: string) => {
      set((state) => {
        const newOrderBooks = new Map(state.orderBooks);
        newOrderBooks.delete(assetId);
        const newLastTrades = new Map(state.lastTrades);
        newLastTrades.delete(assetId);
        const newPendingChanges = new Map(state.pendingChanges);
        newPendingChanges.delete(assetId);
        return {
          orderBooks: newOrderBooks,
          lastTrades: newLastTrades,
          pendingChanges: newPendingChanges,
        };
      });
    },

    clearAllOrderBooks: () => {
      set({
        orderBooks: new Map<string, ProcessedOrderBook>(),
        lastTrades: new Map<string, LastTrade>(),
        pendingChanges: new Map<string, PendingChange[]>(),
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

    isStale: (assetId: string) => {
      const orderBook = get().orderBooks.get(assetId);
      if (!orderBook) return true;
      const age = Date.now() - orderBook.receivedAt;
      return age > STALE_THRESHOLD_MS;
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

/**
 * Hook to check if order book data is stale
 */
export function useOrderBookStale(assetId: string | undefined) {
  return useOrderBookStore((state: OrderBookStoreState) => {
    if (!assetId) return true;
    const orderBook = state.orderBooks.get(assetId);
    if (!orderBook) return true;
    const age = Date.now() - orderBook.receivedAt;
    return age > STALE_THRESHOLD_MS;
  });
}

/**
 * Hook to get order book with staleness info
 */
export function useOrderBookWithStatus(assetId: string | undefined) {
  return useOrderBookStore(
    useShallow((state: OrderBookStoreState) => {
      if (!assetId) {
        return { orderBook: undefined, isStale: true, source: undefined };
      }
      const orderBook = state.orderBooks.get(assetId);
      if (!orderBook) {
        return { orderBook: undefined, isStale: true, source: undefined };
      }
      const age = Date.now() - orderBook.receivedAt;
      return {
        orderBook,
        isStale: age > STALE_THRESHOLD_MS,
        source: orderBook.source,
      };
    })
  );
}
