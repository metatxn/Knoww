"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { POLYMARKET_API, WEBSOCKET_CONFIG } from "@/lib/constants";

/**
 * WebSocket event types from Polymarket Market Channel
 * @see https://docs.polymarket.com/developers/CLOB/websocket/market-channel
 */
export type WebSocketEventType =
  | "book"
  | "price_change"
  | "last_trade_price"
  | "tick_size_change";

/**
 * Order book level (bid or ask)
 */
export interface OrderBookLevel {
  price: string;
  size: string;
}

/**
 * Full order book snapshot event
 * Emitted on subscribe and after trades
 */
export interface BookEvent {
  event_type: "book";
  asset_id: string;
  market: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: string;
  hash: string;
}

/**
 * Price change entry for incremental updates
 */
export interface PriceChange {
  asset_id: string;
  price: string;
  size: string;
  side: "BUY" | "SELL";
  hash: string;
  best_bid: string;
  best_ask: string;
}

/**
 * Price change event (incremental update)
 * Emitted when orders are placed or cancelled
 */
export interface PriceChangeEvent {
  event_type: "price_change";
  market: string;
  price_changes: PriceChange[];
  timestamp: string;
}

/**
 * Last trade price event
 * Emitted when a trade is executed
 */
export interface LastTradePriceEvent {
  event_type: "last_trade_price";
  asset_id: string;
  market: string;
  price: string;
  size: string;
  side: "BUY" | "SELL";
  fee_rate_bps: string;
  timestamp: string;
}

/**
 * Tick size change event
 * Emitted when market tick size changes (price > 0.96 or < 0.04)
 */
export interface TickSizeChangeEvent {
  event_type: "tick_size_change";
  asset_id: string;
  market: string;
  old_tick_size: string;
  new_tick_size: string;
  side: string;
  timestamp: string;
}

/**
 * Union type for all WebSocket events
 */
export type WebSocketEvent =
  | BookEvent
  | PriceChangeEvent
  | LastTradePriceEvent
  | TickSizeChangeEvent;

/**
 * WebSocket connection state
 */
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/**
 * Subscription message format
 */
interface SubscriptionMessage {
  type: "subscribe" | "unsubscribe";
  assets_ids: string[];
}

/**
 * Options for the useMarketWebSocket hook
 */
export interface UseMarketWebSocketOptions {
  /** Token IDs to subscribe to */
  assetIds: string[];
  /** Whether to auto-connect on mount */
  autoConnect?: boolean;
  /** Callback for book events */
  onBook?: (event: BookEvent) => void;
  /** Callback for price change events */
  onPriceChange?: (event: PriceChangeEvent) => void;
  /** Callback for last trade price events */
  onLastTradePrice?: (event: LastTradePriceEvent) => void;
  /** Callback for tick size change events */
  onTickSizeChange?: (event: TickSizeChangeEvent) => void;
  /** Callback for connection state changes */
  onConnectionStateChange?: (state: ConnectionState) => void;
  /** Callback for errors */
  onError?: (error: Error) => void;
}

/**
 * Return type for the useMarketWebSocket hook
 */
export interface UseMarketWebSocketReturn {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Whether the WebSocket is connected */
  isConnected: boolean;
  /** Subscribe to additional asset IDs */
  subscribe: (assetIds: string[]) => void;
  /** Unsubscribe from asset IDs */
  unsubscribe: (assetIds: string[]) => void;
  /** Manually connect to WebSocket */
  connect: () => void;
  /** Manually disconnect from WebSocket */
  disconnect: () => void;
  /** Current subscribed asset IDs */
  subscribedAssets: Set<string>;
  /** Last error that occurred */
  lastError: Error | null;
}

/**
 * Hook for managing WebSocket connection to Polymarket Market Channel
 *
 * Features:
 * - Automatic connection management
 * - Subscription to multiple asset IDs (token IDs)
 * - Automatic reconnection with exponential backoff
 * - Event parsing and callbacks
 * - React Query cache integration
 *
 * @see https://docs.polymarket.com/developers/CLOB/websocket/market-channel
 */
export function useMarketWebSocket(
  options: UseMarketWebSocketOptions,
): UseMarketWebSocketReturn {
  const {
    assetIds,
    autoConnect = true,
    onBook,
    onPriceChange,
    onLastTradePrice,
    onTickSizeChange,
    onConnectionStateChange,
    onError,
  } = options;

  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const subscribedAssetsRef = useRef<Set<string>>(new Set());
  const pendingSubscriptionsRef = useRef<string[]>([]);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [lastError, setLastError] = useState<Error | null>(null);

  // Update connection state and notify callback
  const updateConnectionState = useCallback(
    (state: ConnectionState) => {
      setConnectionState(state);
      onConnectionStateChange?.(state);
    },
    [onConnectionStateChange],
  );

  // Handle incoming WebSocket messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as WebSocketEvent;

        switch (data.event_type) {
          case "book": {
            const bookEvent = data as BookEvent;
            onBook?.(bookEvent);

            // Update React Query cache with the new order book
            queryClient.setQueryData(
              ["orderBook", bookEvent.asset_id],
              (oldData: unknown) => ({
                success: true,
                tokenID: bookEvent.asset_id,
                orderBook: {
                  market: bookEvent.market,
                  asset_id: bookEvent.asset_id,
                  timestamp: bookEvent.timestamp,
                  hash: bookEvent.hash,
                  bids: bookEvent.bids,
                  asks: bookEvent.asks,
                },
                _source: "websocket",
                _oldData: oldData,
              }),
            );
            break;
          }

          case "price_change": {
            const priceChangeEvent = data as PriceChangeEvent;
            onPriceChange?.(priceChangeEvent);

            // Update React Query cache for each affected asset
            for (const change of priceChangeEvent.price_changes) {
              queryClient.setQueryData(
                ["orderBook", change.asset_id],
                (
                  oldData: {
                    orderBook?: {
                      bids?: OrderBookLevel[];
                      asks?: OrderBookLevel[];
                    };
                  } | null,
                ) => {
                  if (!oldData?.orderBook) return oldData;

                  const { orderBook } = oldData;
                  const side = change.side === "BUY" ? "bids" : "asks";
                  const levels = [...(orderBook[side] || [])];

                  // Find and update the price level
                  const existingIndex = levels.findIndex(
                    (l) => l.price === change.price,
                  );

                  if (change.size === "0") {
                    // Remove the level if size is 0
                    if (existingIndex !== -1) {
                      levels.splice(existingIndex, 1);
                    }
                  } else if (existingIndex !== -1) {
                    // Update existing level
                    levels[existingIndex] = {
                      price: change.price,
                      size: change.size,
                    };
                  } else {
                    // Add new level
                    levels.push({ price: change.price, size: change.size });
                  }

                  // Sort levels (bids descending, asks ascending)
                  levels.sort((a, b) => {
                    const priceA = Number.parseFloat(a.price);
                    const priceB = Number.parseFloat(b.price);
                    return side === "bids" ? priceB - priceA : priceA - priceB;
                  });

                  return {
                    ...oldData,
                    orderBook: {
                      ...orderBook,
                      [side]: levels,
                    },
                    _source: "websocket_update",
                    _lastUpdate: priceChangeEvent.timestamp,
                  };
                },
              );

              // Also update best bid/ask in a separate query for quick access
              queryClient.setQueryData(["bestPrices", change.asset_id], () => ({
                bestBid: change.best_bid,
                bestAsk: change.best_ask,
                timestamp: priceChangeEvent.timestamp,
              }));
            }
            break;
          }

          case "last_trade_price": {
            const tradeEvent = data as LastTradePriceEvent;
            onLastTradePrice?.(tradeEvent);

            // Update last trade price in cache
            queryClient.setQueryData(
              ["lastTrade", tradeEvent.asset_id],
              () => ({
                price: tradeEvent.price,
                size: tradeEvent.size,
                side: tradeEvent.side,
                timestamp: tradeEvent.timestamp,
              }),
            );
            break;
          }

          case "tick_size_change": {
            const tickEvent = data as TickSizeChangeEvent;
            onTickSizeChange?.(tickEvent);

            // Update tick size in cache
            queryClient.setQueryData(["tickSize", tickEvent.asset_id], () => ({
              tickSize: tickEvent.new_tick_size,
              oldTickSize: tickEvent.old_tick_size,
              timestamp: tickEvent.timestamp,
            }));
            break;
          }
        }
      } catch (err) {
        console.error("[WebSocket] Failed to parse message:", err);
        const error =
          err instanceof Error ? err : new Error("Failed to parse message");
        setLastError(error);
        onError?.(error);
      }
    },
    [
      queryClient,
      onBook,
      onPriceChange,
      onLastTradePrice,
      onTickSizeChange,
      onError,
    ],
  );

  // Send subscription message
  const sendSubscription = useCallback(
    (type: "subscribe" | "unsubscribe", assetIds: string[]) => {
      if (
        !wsRef.current ||
        wsRef.current.readyState !== WebSocket.OPEN ||
        assetIds.length === 0
      ) {
        return false;
      }

      const message: SubscriptionMessage = {
        type,
        assets_ids: assetIds,
      };

      try {
        wsRef.current.send(JSON.stringify(message));
        return true;
      } catch (err) {
        console.error(`[WebSocket] Failed to ${type}:`, err);
        return false;
      }
    },
    [],
  );

  // Connect to WebSocket
  const connect = useCallback(() => {
    // Don't connect if already connected or connecting
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    updateConnectionState("connecting");

    try {
      const ws = new WebSocket(POLYMARKET_API.WSS.MARKET);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WebSocket] Connected to Polymarket Market Channel");
        updateConnectionState("connected");
        reconnectAttemptRef.current = 0;
        setLastError(null);

        // Subscribe to pending assets
        const assetsToSubscribe = [
          ...subscribedAssetsRef.current,
          ...pendingSubscriptionsRef.current,
        ];
        if (assetsToSubscribe.length > 0) {
          sendSubscription("subscribe", assetsToSubscribe);
          for (const id of assetsToSubscribe) {
            subscribedAssetsRef.current.add(id);
          }
          pendingSubscriptionsRef.current = [];
        }
      };

      ws.onmessage = handleMessage;

      ws.onerror = (event) => {
        console.error("[WebSocket] Error:", event);
        const error = new Error("WebSocket connection error");
        setLastError(error);
        onError?.(error);
      };

      ws.onclose = (event) => {
        console.log(
          `[WebSocket] Closed: code=${event.code}, reason=${event.reason}`,
        );

        // Don't reconnect if closed cleanly (code 1000) or if we're disconnecting intentionally
        if (event.code === 1000) {
          updateConnectionState("disconnected");
          return;
        }

        // Attempt reconnection with exponential backoff
        updateConnectionState("reconnecting");
        const delay = Math.min(
          WEBSOCKET_CONFIG.RECONNECT_DELAY_MS *
            WEBSOCKET_CONFIG.RECONNECT_BACKOFF ** reconnectAttemptRef.current,
          WEBSOCKET_CONFIG.MAX_RECONNECT_DELAY_MS,
        );

        console.log(
          `[WebSocket] Reconnecting in ${delay}ms (attempt ${
            reconnectAttemptRef.current + 1
          })`,
        );

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptRef.current++;
          connect();
        }, delay);
      };
    } catch (err) {
      console.error("[WebSocket] Failed to create connection:", err);
      const error =
        err instanceof Error ? err : new Error("Failed to create connection");
      setLastError(error);
      updateConnectionState("error");
      onError?.(error);
    }
  }, [handleMessage, onError, sendSubscription, updateConnectionState]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnecting");
      wsRef.current = null;
    }

    subscribedAssetsRef.current.clear();
    pendingSubscriptionsRef.current = [];
    updateConnectionState("disconnected");
  }, [updateConnectionState]);

  // Subscribe to asset IDs
  const subscribe = useCallback(
    (newAssetIds: string[]) => {
      const validIds = newAssetIds.filter(
        (id) => id && id.length > 10 && !subscribedAssetsRef.current.has(id),
      );

      if (validIds.length === 0) return;

      if (connectionState === "connected") {
        if (sendSubscription("subscribe", validIds)) {
          for (const id of validIds) {
            subscribedAssetsRef.current.add(id);
          }
        }
      } else {
        // Queue for subscription when connected
        pendingSubscriptionsRef.current.push(...validIds);
      }
    },
    [connectionState, sendSubscription],
  );

  // Unsubscribe from asset IDs
  const unsubscribe = useCallback(
    (assetIdsToRemove: string[]) => {
      const validIds = assetIdsToRemove.filter((id) =>
        subscribedAssetsRef.current.has(id),
      );

      if (validIds.length === 0) return;

      if (connectionState === "connected") {
        sendSubscription("unsubscribe", validIds);
      }

      for (const id of validIds) {
        subscribedAssetsRef.current.delete(id);
      }

      // Also remove from pending
      pendingSubscriptionsRef.current = pendingSubscriptionsRef.current.filter(
        (id) => !assetIdsToRemove.includes(id),
      );
    },
    [connectionState, sendSubscription],
  );

  // Auto-connect and subscribe on mount
  useEffect(() => {
    if (autoConnect && assetIds.length > 0) {
      // Filter valid asset IDs (CLOB token IDs are long numeric strings)
      const validAssetIds = assetIds.filter((id) => id && id.length > 10);

      if (validAssetIds.length > 0) {
        pendingSubscriptionsRef.current = validAssetIds;
        connect();
      }
    }

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle asset ID changes
  useEffect(() => {
    if (connectionState !== "connected") return;

    const validAssetIds = assetIds.filter((id) => id && id.length > 10);
    const currentSubscriptions = subscribedAssetsRef.current;

    // Find new assets to subscribe
    const toSubscribe = validAssetIds.filter(
      (id) => !currentSubscriptions.has(id),
    );

    // Find assets to unsubscribe
    const toUnsubscribe = [...currentSubscriptions].filter(
      (id) => !validAssetIds.includes(id),
    );

    if (toSubscribe.length > 0) {
      subscribe(toSubscribe);
    }

    if (toUnsubscribe.length > 0) {
      unsubscribe(toUnsubscribe);
    }
  }, [assetIds, connectionState, subscribe, unsubscribe]);

  return {
    connectionState,
    isConnected: connectionState === "connected",
    subscribe,
    unsubscribe,
    connect,
    disconnect,
    subscribedAssets: subscribedAssetsRef.current,
    lastError,
  };
}

/**
 * Simplified hook for subscribing to a single market's order book
 */
export function useMarketOrderBookSubscription(tokenId: string | undefined) {
  const [orderBook, setOrderBook] = useState<BookEvent | null>(null);
  const [lastTrade, setLastTrade] = useState<LastTradePriceEvent | null>(null);
  const [bestPrices, setBestPrices] = useState<{
    bestBid: string;
    bestAsk: string;
  } | null>(null);

  const assetIds = tokenId && tokenId.length > 10 ? [tokenId] : [];

  const { connectionState, isConnected } = useMarketWebSocket({
    assetIds,
    autoConnect: assetIds.length > 0,
    onBook: (event) => {
      if (event.asset_id === tokenId) {
        setOrderBook(event);
        // Extract best prices from the book
        const bestBid = event.bids[0]?.price || "0";
        const bestAsk = event.asks[0]?.price || "1";
        setBestPrices({ bestBid, bestAsk });
      }
    },
    onPriceChange: (event) => {
      for (const change of event.price_changes) {
        if (change.asset_id === tokenId) {
          setBestPrices({
            bestBid: change.best_bid,
            bestAsk: change.best_ask,
          });
        }
      }
    },
    onLastTradePrice: (event) => {
      if (event.asset_id === tokenId) {
        setLastTrade(event);
      }
    },
  });

  return {
    orderBook,
    lastTrade,
    bestPrices,
    connectionState,
    isConnected,
  };
}
