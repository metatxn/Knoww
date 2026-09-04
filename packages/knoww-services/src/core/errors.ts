import type { PlatformId } from "./ids";

/**
 * Every adapter method throws PlatformError. Callers get the platform, the
 * operation and (for upstream failures) the upstream HTTP status without
 * having to know which vendor API sits behind the adapter.
 */
export type PlatformOperation =
  | "searchMarkets"
  | "listEvents"
  | "getEvent"
  | "getEventBySlug"
  | "getMarket"
  | "getOrderbook"
  | "getPriceHistory"
  | "getMarketTrades"
  | "listTags"
  | "resolveAdapter"
  | "connectionStatus"
  | "getAccountPositions"
  | "getAccountActivity"
  | "getAccountOrders"
  | "previewOrder"
  | "placeOrder"
  | "cancelOrder";

export type PlatformErrorKind =
  | "upstream"
  | "not_found"
  | "invalid_input"
  | "disabled"
  | "unsupported"
  | "timeout"
  /** The draft's short expiration passed before `placeOrder`. */
  | "draft_expired"
  /**
   * The market changed between preview and place (status, price bounds,
   * outcome, minimum size, tick size, fees, eligibility or policy).
   */
  | "draft_rejected"
  /** No signer or credentials are bound for the identity, or they belong to another address. */
  | "unauthenticated"
  /** The identity may not trade here (region, capability or platform policy). */
  | "ineligible";

export interface PlatformErrorInit {
  platform: PlatformId;
  operation: PlatformOperation;
  kind?: PlatformErrorKind;
  upstreamStatus?: number;
  cause?: unknown;
}

export class PlatformError extends Error {
  readonly platform: PlatformId;
  readonly operation: PlatformOperation;
  readonly kind: PlatformErrorKind;
  readonly upstreamStatus?: number;
  readonly cause?: unknown;

  constructor(message: string, init: PlatformErrorInit) {
    super(message);
    this.name = "PlatformError";
    this.platform = init.platform;
    this.operation = init.operation;
    this.kind = init.kind ?? "upstream";
    this.upstreamStatus = init.upstreamStatus;
    this.cause = init.cause;
  }
}

export function isPlatformError(value: unknown): value is PlatformError {
  return value instanceof PlatformError;
}
