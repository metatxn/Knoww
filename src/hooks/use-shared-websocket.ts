"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOrderBookStore } from "@/hooks/use-orderbook-store";
import {
  type BookEvent,
  type ConnectionState,
  getWebSocketManager,
  type LastTradePriceEvent,
  type PriceChangeEvent,
  type TickSizeChangeEvent,
  type WebSocketEvent,
} from "@/lib/websocket-manager";

export type {
  BookEvent,
  PriceChangeEvent,
  LastTradePriceEvent,
  TickSizeChangeEvent,
};
export type { ConnectionState };

/**
 * Options for useSharedWebSocket hook
 */
export interface UseSharedWebSocketOptions {
  /** Asset IDs to subscribe to */
  assetIds: string[];
  /** Callback for book events */
  onBook?: (event: BookEvent) => void;
  /** Callback for price change events */
  onPriceChange?: (event: PriceChangeEvent) => void;
  /** Callback for last trade price events */
  onLastTradePrice?: (event: LastTradePriceEvent) => void;
  /** Callback for tick size change events */
  onTickSizeChange?: (event: TickSizeChangeEvent) => void;
}

/**
 * Hook that uses the singleton WebSocket manager
 *
 * Unlike useMarketWebSocket, this hook:
 * - Does NOT create its own WebSocket connection
 * - Uses a shared singleton connection
 * - Reference-counted subscriptions (auto cleanup)
 * - Much more memory/CPU efficient
 */
export function useSharedWebSocket(options: UseSharedWebSocketOptions) {
  const {
    assetIds,
    onBook,
    onPriceChange,
    onLastTradePrice,
    onTickSizeChange,
  } = options;

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const callbacksRef = useRef({
    onBook,
    onPriceChange,
    onLastTradePrice,
    onTickSizeChange,
  });

  // Keep callbacks up to date
  useEffect(() => {
    callbacksRef.current = {
      onBook,
      onPriceChange,
      onLastTradePrice,
      onTickSizeChange,
    };
  }, [onBook, onPriceChange, onLastTradePrice, onTickSizeChange]);

  // Subscribe to connection state changes
  useEffect(() => {
    const manager = getWebSocketManager();

    const unsubscribe = manager.addConnectionListener((state) => {
      setConnectionState(state);
    });

    return unsubscribe;
  }, []);

  // Subscribe to events and filter by our asset IDs
  useEffect(() => {
    const manager = getWebSocketManager();
    const assetIdSet = new Set(assetIds.filter((id) => id && id.length > 10));

    if (assetIdSet.size === 0) return;

    const handleEvent = (event: WebSocketEvent) => {
      const { onBook, onPriceChange, onLastTradePrice, onTickSizeChange } =
        callbacksRef.current;

      switch (event.event_type) {
        case "book":
          if (assetIdSet.has(event.asset_id)) {
            onBook?.(event);
          }
          break;
        case "price_change": {
          // Price change can affect multiple assets
          const relevantChanges = event.price_changes.filter((c) =>
            assetIdSet.has(c.asset_id)
          );
          if (relevantChanges.length > 0) {
            onPriceChange?.({ ...event, price_changes: relevantChanges });
          }
          break;
        }
        case "last_trade_price":
          if (assetIdSet.has(event.asset_id)) {
            onLastTradePrice?.(event);
          }
          break;
        case "tick_size_change":
          if (assetIdSet.has(event.asset_id)) {
            onTickSizeChange?.(event);
          }
          break;
      }
    };

    // Add event listener
    const removeEventListener = manager.addEventListener(handleEvent);

    // Subscribe to assets
    const unsubscribe = manager.subscribe(Array.from(assetIdSet));

    return () => {
      removeEventListener();
      unsubscribe();
    };
  }, [assetIds]);

  return {
    connectionState,
    isConnected: connectionState === "connected",
    reconnect: useCallback(() => {
      getWebSocketManager().reconnect();
    }, []),
  };
}

/**
 * Hook that connects to WebSocket and automatically updates the order book store
 * This is the recommended way to use WebSocket for order books
 */
export function useOrderBookWebSocket(assetIds: string[]) {
  const { handleBookEvent, handlePriceChangeEvent, handleLastTradePriceEvent } =
    useOrderBookStore();

  const { connectionState, isConnected, reconnect } = useSharedWebSocket({
    assetIds,
    onBook: handleBookEvent,
    onPriceChange: handlePriceChangeEvent,
    onLastTradePrice: handleLastTradePriceEvent,
  });

  return { connectionState, isConnected, reconnect };
}
