import { createLogger } from "@knoww/logger";
import { isPlatformError, type PlatformError } from "@knoww/services/core";
import type { McpScope } from "../auth/scopes";
import { currentPrincipal, currentRequestId } from "../context";

const log = createLogger("mcp.tools");

export type KnowwToolErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "PLATFORM_DISABLED";

const RETRYABLE_CODES: ReadonlySet<KnowwToolErrorCode> = new Set([
  "RATE_LIMITED",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_UNAVAILABLE",
]);

/**
 * Error surfaced to MCP clients. The message must always be safe to show a
 * caller: no upstream error text, connection strings, or internals.
 *
 * A plain `Error` tagged with `name: "KnowwToolError"`; narrow with
 * `isKnowwToolError`, never `instanceof`.
 */
export interface KnowwToolError extends Error {
  readonly name: "KnowwToolError";
  readonly code: KnowwToolErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
}

export function knowwToolError(
  code: KnowwToolErrorCode,
  message: string,
  options?: { retryAfterSeconds?: number }
): KnowwToolError {
  const error = new Error(message) as Error & {
    name: "KnowwToolError";
    code: KnowwToolErrorCode;
    retryable: boolean;
    retryAfterSeconds?: number;
  };
  error.name = "KnowwToolError";
  error.code = code;
  error.retryable = RETRYABLE_CODES.has(code);
  if (options?.retryAfterSeconds !== undefined) {
    error.retryAfterSeconds = options.retryAfterSeconds;
  }
  return error;
}

export function isKnowwToolError(value: unknown): value is KnowwToolError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    name?: unknown;
    code?: unknown;
    retryable?: unknown;
  };
  return (
    candidate.name === "KnowwToolError" &&
    typeof candidate.code === "string" &&
    typeof candidate.retryable === "boolean"
  );
}

/**
 * Defense in depth: every tool rechecks its scope at execution time. Reserved
 * scopes are accepted here so a tool can demand one before any grant issues
 * it; such a tool then fails closed with FORBIDDEN for every caller.
 */
export function requireToolScope(requiredScope: McpScope): void {
  const principal = currentPrincipal();
  if (!principal) {
    throw knowwToolError(
      "UNAUTHENTICATED",
      "Authenticate before calling this tool."
    );
  }
  if (!principal.scopes.includes(requiredScope)) {
    throw knowwToolError(
      "FORBIDDEN",
      `This tool requires the ${requiredScope} scope.`
    );
  }
}

/**
 * Normalizes any thrown value into a KnowwToolError. Unknown errors collapse
 * to a generic INTERNAL_ERROR so upstream messages never reach clients.
 */
export function toKnowwToolError(value: unknown): KnowwToolError {
  if (isKnowwToolError(value)) {
    return value;
  }
  if (isPlatformError(value)) {
    return fromPlatformError(value);
  }
  return knowwToolError("INTERNAL_ERROR", "Something went wrong.");
}

/**
 * Maps a knoww-services PlatformError by kind. Messages are fixed per code so
 * no upstream text leaks; only the platform id is interpolated.
 */
function fromPlatformError(error: PlatformError): KnowwToolError {
  switch (error.kind) {
    case "disabled":
      return knowwToolError(
        "PLATFORM_DISABLED",
        `Platform ${error.platform} is not enabled on this server.`
      );
    case "not_found":
      return knowwToolError("NOT_FOUND", "No record matches that identifier.");
    case "invalid_input":
    case "unsupported":
      return knowwToolError(
        "VALIDATION_ERROR",
        `${error.platform} rejected the request input.`
      );
    case "timeout":
      return knowwToolError(
        "UPSTREAM_TIMEOUT",
        `${error.platform} took too long to answer.`
      );
    case "unauthenticated":
      return knowwToolError(
        "UNAUTHENTICATED",
        "Authenticate before calling this tool."
      );
    case "ineligible":
      return knowwToolError(
        "FORBIDDEN",
        "This account is not eligible for that action."
      );
    case "draft_expired":
    case "draft_rejected":
      return knowwToolError("CONFLICT", "The order draft is no longer valid.");
    default:
      return error.upstreamStatus === 429
        ? knowwToolError(
            "RATE_LIMITED",
            `${error.platform} is rate limiting requests.`
          )
        : knowwToolError(
            "UPSTREAM_UNAVAILABLE",
            `${error.platform} is temporarily unavailable.`
          );
  }
}

function retryGuidance(error: KnowwToolError): string {
  if (!error.retryable) {
    return "Do not retry with the same input.";
  }
  if (error.retryAfterSeconds !== undefined) {
    return `Retry after ${error.retryAfterSeconds} seconds.`;
  }
  return "Safe to retry.";
}

// A type alias, not an interface: aliases get an implicit index signature, so
// this stays assignable to the SDK's CallToolResult ({ [x: string]: unknown }).
export type ToolErrorContent = {
  isError: true;
  content: [{ type: "text"; text: string }];
  _meta: {
    "app.knoww/error": {
      code: KnowwToolErrorCode;
      message: string;
      retryable: boolean;
      retryAfterSeconds?: number;
      requestId: string;
    };
  };
};

/** Renders an error as an MCP tool result with retry guidance for agents. */
export function toolErrorContent(error: KnowwToolError): ToolErrorContent {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `${error.code}: ${error.message} ${retryGuidance(error)}`,
      },
    ],
    _meta: {
      "app.knoww/error": {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        ...(error.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: error.retryAfterSeconds }
          : {}),
        requestId: currentRequestId(),
      },
    },
  };
}

/** Logs safe failure metadata and renders the client-facing tool error. */
export function toolFailureContent(
  toolName: string,
  value: unknown
): ToolErrorContent {
  const error = toKnowwToolError(value);
  log.error("tool.failed", {
    toolName,
    requestId: currentRequestId(),
    code: error.code,
    retryable: error.retryable,
  });
  return toolErrorContent(error);
}
