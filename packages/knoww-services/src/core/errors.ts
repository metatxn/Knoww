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
  | "resolveAdapter";

export type PlatformErrorKind =
  | "upstream"
  | "not_found"
  | "invalid_input"
  | "disabled"
  | "unsupported"
  | "timeout";

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
