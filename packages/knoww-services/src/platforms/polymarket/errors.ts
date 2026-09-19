/**
 * Upstream failures raised by the Polymarket client, one name per API family
 * so a caller can tell a Gamma miss from a CLOB miss without parsing messages.
 *
 * They are plain `Error` objects tagged with a `name` and the upstream HTTP
 * `status`. The codebase declares no classes, so callers narrow with the
 * guards below instead of `instanceof`.
 */
export const UPSTREAM_ERROR_NAMES = [
  "UpstreamSearchError",
  "UpstreamMarketError",
  "UpstreamEventError",
  "UpstreamOrderbookError",
  "UpstreamPriceHistoryError",
  "UpstreamPublicDataError",
] as const;

export type UpstreamErrorName = (typeof UPSTREAM_ERROR_NAMES)[number];

export interface UpstreamError extends Error {
  readonly name: UpstreamErrorName;
  /** HTTP status of the upstream answer; absent when no usable response came back. */
  readonly status?: number;
}

function createUpstreamError(
  name: UpstreamErrorName,
  message: string,
  status?: number
): UpstreamError {
  const error = new Error(message) as Error & {
    name: UpstreamErrorName;
    status?: number;
  };
  error.name = name;
  if (status !== undefined) error.status = status;
  return error;
}

/** True for any of the six upstream errors, whichever realm raised it. */
export function isUpstreamError(error: unknown): error is UpstreamError {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; message?: unknown };
  return (
    typeof candidate.message === "string" &&
    typeof candidate.name === "string" &&
    (UPSTREAM_ERROR_NAMES as readonly string[]).includes(candidate.name)
  );
}

export function upstreamSearchError(
  message: string,
  status?: number
): UpstreamError {
  return createUpstreamError("UpstreamSearchError", message, status);
}

export function isUpstreamSearchError(error: unknown): error is UpstreamError {
  return isUpstreamError(error) && error.name === "UpstreamSearchError";
}

export function upstreamMarketError(
  message: string,
  status?: number
): UpstreamError {
  return createUpstreamError("UpstreamMarketError", message, status);
}

export function isUpstreamMarketError(error: unknown): error is UpstreamError {
  return isUpstreamError(error) && error.name === "UpstreamMarketError";
}

export function upstreamEventError(
  message: string,
  status?: number
): UpstreamError {
  return createUpstreamError("UpstreamEventError", message, status);
}

export function isUpstreamEventError(error: unknown): error is UpstreamError {
  return isUpstreamError(error) && error.name === "UpstreamEventError";
}

export function upstreamOrderbookError(
  message: string,
  status?: number
): UpstreamError {
  return createUpstreamError("UpstreamOrderbookError", message, status);
}

export function isUpstreamOrderbookError(
  error: unknown
): error is UpstreamError {
  return isUpstreamError(error) && error.name === "UpstreamOrderbookError";
}

export function upstreamPriceHistoryError(
  message: string,
  status?: number
): UpstreamError {
  return createUpstreamError("UpstreamPriceHistoryError", message, status);
}

export function isUpstreamPriceHistoryError(
  error: unknown
): error is UpstreamError {
  return isUpstreamError(error) && error.name === "UpstreamPriceHistoryError";
}

export function upstreamPublicDataError(
  message: string,
  status?: number
): UpstreamError {
  return createUpstreamError("UpstreamPublicDataError", message, status);
}

export function isUpstreamPublicDataError(
  error: unknown
): error is UpstreamError {
  return isUpstreamError(error) && error.name === "UpstreamPublicDataError";
}
