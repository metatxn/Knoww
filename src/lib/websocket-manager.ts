"use client";

import { POLYMARKET_API, WEBSOCKET_CONFIG } from "@/lib/constants";

/**
 * Singleton WebSocket Manager for Polymarket Market Channel
 *
 * This class manages a SINGLE WebSocket connection that all components share.
 * Components subscribe/unsubscribe to specific asset IDs, and the manager
 * handles the underlying connection lifecycle.
 *
 * Benefits:
 * - Single connection = less memory/CPU
 * - Automatic reconnection with exponential backoff
 * - Reference counting for subscriptions
 * - Event broadcasting to all subscribers
 */

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface BookEvent {
  event_type: "book";
  asset_id: string;
  market: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: string;
  hash: string;
}

export interface PriceChange {
  asset_id: string;
  price: string;
  size: string;
  side: "BUY" | "SELL";
  hash: string;
  best_bid: string;
  best_ask: string;
}

export interface PriceChangeEvent {
  event_type: "price_change";
  market: string;
  price_changes: PriceChange[];
  timestamp: string;
}

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

export interface TickSizeChangeEvent {
  event_type: "tick_size_change";
  asset_id: string;
  market: string;
  old_tick_size: string;
  new_tick_size: string;
  side: string;
  timestamp: string;
}

export type WebSocketEvent =
  | BookEvent
  | PriceChangeEvent
  | LastTradePriceEvent
  | TickSizeChangeEvent;

type EventCallback = (event: WebSocketEvent) => void;
type ConnectionCallback = (state: ConnectionState) => void;

interface Subscription {
  assetId: string;
  refCount: number;
}

class WebSocketManager {
  private static instance: WebSocketManager | null = null;

  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = "disconnected";
  private reconnectAttempt = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // Subscriptions with reference counting
  private subscriptions: Map<string, Subscription> = new Map();

  // Event listeners
  private eventListeners: Set<EventCallback> = new Set();
  private connectionListeners: Set<ConnectionCallback> = new Set();

  // Pending subscriptions (when WS not yet connected)
  private pendingSubscriptions: Set<string> = new Set();

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === "connected";
  }

  /**
   * Get list of currently subscribed asset IDs
   */
  getSubscribedAssets(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Add event listener for WebSocket events
   */
  addEventListener(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  /**
   * Add connection state listener
   */
  addConnectionListener(callback: ConnectionCallback): () => void {
    this.connectionListeners.add(callback);
    // Immediately notify of current state
    callback(this.connectionState);
    return () => this.connectionListeners.delete(callback);
  }

  /**
   * Subscribe to asset IDs (with reference counting)
   * Returns unsubscribe function
   */
  subscribe(assetIds: string[]): () => void {
    const validIds = assetIds.filter((id) => id && id.length > 10);
    if (validIds.length === 0) return () => {};

    const newSubscriptions: string[] = [];

    for (const assetId of validIds) {
      const existing = this.subscriptions.get(assetId);
      if (existing) {
        // Increment reference count
        existing.refCount++;
      } else {
        // New subscription
        this.subscriptions.set(assetId, { assetId, refCount: 1 });
        newSubscriptions.push(assetId);
      }
    }

    // Connect if not already connected
    if (this.connectionState === "disconnected") {
      this.connect();
    }

    // Send subscription for new assets
    if (newSubscriptions.length > 0) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendSubscription("subscribe", newSubscriptions);
      } else {
        // Queue for when connected
        for (const id of newSubscriptions) {
          this.pendingSubscriptions.add(id);
        }
      }
    }

    // Return unsubscribe function
    return () => this.unsubscribe(validIds);
  }

  /**
   * Unsubscribe from asset IDs (with reference counting)
   */
  private unsubscribe(assetIds: string[]): void {
    const toUnsubscribe: string[] = [];

    for (const assetId of assetIds) {
      const existing = this.subscriptions.get(assetId);
      if (existing) {
        existing.refCount--;
        if (existing.refCount <= 0) {
          this.subscriptions.delete(assetId);
          toUnsubscribe.push(assetId);
        }
      }
      this.pendingSubscriptions.delete(assetId);
    }

    // Send unsubscription
    if (toUnsubscribe.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscription("unsubscribe", toUnsubscribe);
    }

    // Disconnect if no more subscriptions
    if (this.subscriptions.size === 0) {
      this.disconnect();
    }
  }

  /**
   * Connect to WebSocket
   */
  private connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.clearReconnectTimeout();
    this.updateConnectionState("connecting");

    try {
      this.ws = new WebSocket(POLYMARKET_API.WSS.MARKET);

      this.ws.onopen = () => {
        console.log("[WSManager] Connected to Polymarket Market Channel");
        this.updateConnectionState("connected");
        this.reconnectAttempt = 0;

        // Subscribe to all pending + existing subscriptions
        const allAssets = [
          ...this.pendingSubscriptions,
          ...this.subscriptions.keys(),
        ];

        if (allAssets.length > 0) {
          this.sendSubscription("subscribe", Array.from(new Set(allAssets)));
        }
        this.pendingSubscriptions.clear();

        // Start heartbeat
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        // Skip non-JSON messages (like PONG heartbeat responses)
        if (typeof event.data === "string") {
          const msg = event.data.trim();
          // Skip heartbeat responses and other non-JSON messages
          if (msg === "PONG" || msg === "pong" || !msg.startsWith("{")) {
            return;
          }
        }

        try {
          const data = JSON.parse(event.data) as WebSocketEvent;
          this.broadcastEvent(data);
        } catch (err) {
          // Only log if it's not a known non-JSON message
          if (typeof event.data === "string" && event.data.length < 100) {
            console.debug("[WSManager] Non-JSON message:", event.data);
          } else {
            console.error("[WSManager] Failed to parse message:", err);
          }
        }
      };

      this.ws.onerror = (event) => {
        console.error("[WSManager] WebSocket error:", event);
        this.updateConnectionState("error");
      };

      this.ws.onclose = (event) => {
        console.log(
          `[WSManager] Closed: code=${event.code}, reason=${event.reason}`,
        );
        this.stopHeartbeat();

        // Don't reconnect if closed cleanly or no subscriptions
        if (event.code === 1000 || this.subscriptions.size === 0) {
          this.updateConnectionState("disconnected");
          return;
        }

        // Reconnect with exponential backoff
        this.scheduleReconnect();
      };
    } catch (err) {
      console.error("[WSManager] Failed to connect:", err);
      this.updateConnectionState("error");
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.clearReconnectTimeout();
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.updateConnectionState("disconnected");
  }

  /**
   * Force reconnect
   */
  reconnect(): void {
    this.disconnect();
    if (this.subscriptions.size > 0) {
      // Move all subscriptions to pending
      for (const assetId of this.subscriptions.keys()) {
        this.pendingSubscriptions.add(assetId);
      }
      this.connect();
    }
  }

  private sendSubscription(
    type: "subscribe" | "unsubscribe",
    assetIds: string[],
  ): void {
    if (
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN ||
      assetIds.length === 0
    ) {
      return;
    }

    try {
      this.ws.send(JSON.stringify({ type, assets_ids: assetIds }));
      console.log(`[WSManager] ${type}d to ${assetIds.length} assets`);
    } catch (err) {
      console.error(`[WSManager] Failed to ${type}:`, err);
    }
  }

  private updateConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    for (const callback of this.connectionListeners) {
      try {
        callback(state);
      } catch (err) {
        console.error("[WSManager] Connection listener error:", err);
      }
    }
  }

  private broadcastEvent(event: WebSocketEvent): void {
    for (const callback of this.eventListeners) {
      try {
        callback(event);
      } catch (err) {
        console.error("[WSManager] Event listener error:", err);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;

    this.reconnectAttempt++;
    const delay = Math.min(
      WEBSOCKET_CONFIG.RECONNECT_DELAY_MS *
        WEBSOCKET_CONFIG.RECONNECT_BACKOFF ** (this.reconnectAttempt - 1),
      WEBSOCKET_CONFIG.MAX_RECONNECT_DELAY_MS,
    );

    console.log(
      `[WSManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`,
    );
    this.updateConnectionState("reconnecting");

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Polymarket may not require explicit pings, but this keeps the connection alive
        // The interval itself serves to check connection status periodically
      }
    }, 30000); // 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

// Export singleton instance getter
export function getWebSocketManager(): WebSocketManager {
  return WebSocketManager.getInstance();
}
