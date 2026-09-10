import { isPolymarketFreshAuthenticationRequiredError } from "@knoww/shared-types/polymarket-unified";

/** Walks `cause` links, since the adapter rethrows with the original inside. */
export function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  while (current !== undefined && current !== null && chain.length < 8) {
    chain.push(current);
    current = current instanceof Error ? current.cause : undefined;
  }
  return chain;
}

/** True when the CLOB rejected the stored credentials and a passive read stopped short of a wallet prompt. */
export function isFreshAuthenticationRequired(error: unknown): boolean {
  return errorChain(error).some(isPolymarketFreshAuthenticationRequiredError);
}

/**
 * A CLOB read that failed the way an empty or stale account fails: nothing
 * on file for the wallet, or credentials the venue no longer accepts. The
 * hooks log these at debug level instead of error.
 */
export function isExpectedClobReadFailure(error: unknown): boolean {
  return errorChain(error).some(isExpectedClobReadMessage);
}

function isExpectedClobReadMessage(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();
  return (
    lower.includes("not found") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("404")
  );
}
