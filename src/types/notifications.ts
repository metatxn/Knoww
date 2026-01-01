/**
 * Polymarket CLOB Notification Types
 * Reference: https://docs.polymarket.com/developers/CLOB/clients/methods-l2#notifications
 */

/**
 * Notification type values from Polymarket API
 */
export enum NotificationType {
  /** User's order was canceled */
  ORDER_CANCELLATION = 1,
  /** User's order was filled (maker or taker) */
  ORDER_FILL = 2,
  /** Market was resolved */
  MARKET_RESOLVED = 4,
}

/**
 * Human-readable labels for notification types
 */
export const NotificationTypeLabels: Record<NotificationType, string> = {
  [NotificationType.ORDER_CANCELLATION]: "Order Canceled",
  [NotificationType.ORDER_FILL]: "Order Filled",
  [NotificationType.MARKET_RESOLVED]: "Market Resolved",
};

/**
 * Notification payload for Order Fill (type 2)
 */
export interface OrderFillPayload {
  order_id: string;
  market: string;
  asset_id: string;
  side: "BUY" | "SELL";
  size: string;
  price: string;
  outcome: string;
  trader_side: "TAKER" | "MAKER";
  transaction_hash?: string;
}

/**
 * Notification payload for Order Cancellation (type 1)
 */
export interface OrderCancellationPayload {
  order_id: string;
  market: string;
  asset_id: string;
  reason?: string;
}

/**
 * Notification payload for Market Resolved (type 4)
 */
export interface MarketResolvedPayload {
  market: string;
  condition_id: string;
  outcome: string;
  winning_outcome?: string;
}

/**
 * Union type for all notification payloads
 */
export type NotificationPayload =
  | OrderFillPayload
  | OrderCancellationPayload
  | MarketResolvedPayload
  | Record<string, unknown>;

/**
 * Notification object from Polymarket API
 */
export interface Notification {
  /** Unique notification ID */
  id: number;
  /** User's L2 credential apiKey or empty string for global notifications */
  owner: string;
  /** Type-specific payload data */
  payload: NotificationPayload;
  /** Unix timestamp */
  timestamp?: number;
  /** Notification type (see NotificationType enum) */
  type: NotificationType;
}

/**
 * Parameters for dropping (dismissing) notifications
 */
export interface DropNotificationParams {
  /** Array of notification IDs to mark as read */
  ids: string[];
}

/**
 * Filter options for notifications list
 */
export type NotificationFilter = "all" | NotificationType;
