import { isUpstreamPublicDataError } from "@knoww/services/platforms/polymarket";
import type { ServerContext } from "@modelcontextprotocol/server";
import { MARKETS_READ_SCOPE, type McpScope } from "../auth/scopes";
import {
  isKnowwToolError,
  type KnowwToolError,
  knowwToolError,
  requireToolScope,
  toKnowwToolError,
  toolFailureContent,
} from "../errors/tool-error";
import { requireToolQuota } from "../quota";
import { isAbortLike } from "./gamma";

export const WALLET_ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
export const CONDITION_ID_PATTERN = /^0x[0-9a-f]{64}$/;
export const TOKEN_ID_PATTERN = /^[0-9]{1,80}$/;

export function cleanQuotedText(
  value: string | undefined,
  maxLength = 2000
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function mapPublicDataError(error: unknown): KnowwToolError {
  if (isKnowwToolError(error)) return error;
  if (isUpstreamPublicDataError(error)) {
    if (error.status === 429) {
      return knowwToolError(
        "RATE_LIMITED",
        "Polymarket rate limited this request."
      );
    }
    return knowwToolError(
      "UPSTREAM_UNAVAILABLE",
      "Polymarket could not serve this public data request."
    );
  }
  if (isAbortLike(error)) {
    return knowwToolError(
      "UPSTREAM_TIMEOUT",
      "Polymarket took too long to answer."
    );
  }
  return toKnowwToolError(error);
}

/**
 * Runs one tool call behind the scope check, the per-tool quota and the error
 * mapping every tool shares. Thrown values become failure content; nothing
 * upstream reaches the client unmapped.
 */
export async function executeToolCall<T>(
  toolName: string,
  requiredScope: McpScope,
  operation: () => Promise<T>
): Promise<T | ReturnType<typeof toolFailureContent>> {
  try {
    requireToolScope(requiredScope);
    await requireToolQuota(toolName);
    return await operation();
  } catch (error) {
    return toolFailureContent(toolName, mapPublicDataError(error));
  }
}

export function executePublicRead<T>(
  toolName: string,
  _context: ServerContext,
  operation: () => Promise<T>
): Promise<T | ReturnType<typeof toolFailureContent>> {
  return executeToolCall(toolName, MARKETS_READ_SCOPE, operation);
}
