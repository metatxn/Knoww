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

/**
 * A plain `Error` tagged with `name: "PlatformError"`. The codebase declares
 * no classes, so callers narrow with `isPlatformError` instead of
 * `instanceof`, which also holds across package copies and realms.
 */
export interface PlatformError extends Error {
  readonly name: "PlatformError";
  readonly platform: PlatformId;
  readonly operation: PlatformOperation;
  readonly kind: PlatformErrorKind;
  readonly upstreamStatus?: number;
  readonly cause?: unknown;
}

export function platformError(
  message: string,
  init: PlatformErrorInit
): PlatformError {
  const error = new Error(message) as Error & {
    name: "PlatformError";
    platform: PlatformId;
    operation: PlatformOperation;
    kind: PlatformErrorKind;
    upstreamStatus?: number;
    cause?: unknown;
  };
  error.name = "PlatformError";
  error.platform = init.platform;
  error.operation = init.operation;
  error.kind = init.kind ?? "upstream";
  if (init.upstreamStatus !== undefined) {
    error.upstreamStatus = init.upstreamStatus;
  }
  if (init.cause !== undefined) error.cause = init.cause;
  return error;
}

export function isPlatformError(value: unknown): value is PlatformError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    name?: unknown;
    platform?: unknown;
    operation?: unknown;
    kind?: unknown;
  };
  return (
    candidate.name === "PlatformError" &&
    typeof candidate.platform === "string" &&
    typeof candidate.operation === "string" &&
    typeof candidate.kind === "string"
  );
}
