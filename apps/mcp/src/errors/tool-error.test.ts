import { platformError } from "@knoww/services/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestContext } from "../context";
import {
  knowwToolError,
  toKnowwToolError,
  toolErrorContent,
  toolFailureContent,
} from "./tool-error";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("KnowwToolError", () => {
  it("marks RATE_LIMITED, UPSTREAM_TIMEOUT, and UPSTREAM_UNAVAILABLE as retryable", () => {
    expect(knowwToolError("RATE_LIMITED", "Too many requests.").retryable).toBe(
      true
    );
    expect(
      knowwToolError("UPSTREAM_TIMEOUT", "Upstream timed out.").retryable
    ).toBe(true);
    expect(
      knowwToolError("UPSTREAM_UNAVAILABLE", "Upstream is down.").retryable
    ).toBe(true);
  });

  it("marks all other codes as not retryable", () => {
    for (const code of [
      "VALIDATION_ERROR",
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "NOT_FOUND",
      "CONFLICT",
      "INTERNAL_ERROR",
      "PLATFORM_DISABLED",
    ] as const) {
      expect(knowwToolError(code, "message").retryable).toBe(false);
    }
  });

  it("carries retryAfterSeconds when provided", () => {
    const error = knowwToolError("RATE_LIMITED", "Too many requests.", {
      retryAfterSeconds: 30,
    });
    expect(error.retryAfterSeconds).toBe(30);
  });
});

describe("toKnowwToolError", () => {
  it("returns a KnowwToolError unchanged", () => {
    const original = knowwToolError("NOT_FOUND", "Market not found.");
    expect(toKnowwToolError(original)).toBe(original);
  });

  it("wraps an unknown Error as INTERNAL_ERROR without leaking its message", () => {
    const wrapped = toKnowwToolError(
      new Error("connect ECONNREFUSED 10.0.0.5:5432")
    );
    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.retryable).toBe(false);
    expect(wrapped.message).not.toContain("ECONNREFUSED");
    expect(wrapped.message).not.toContain("10.0.0.5");
  });

  it("wraps a thrown non-Error value as INTERNAL_ERROR without leaking it", () => {
    const wrapped = toKnowwToolError("sk-secret-token-value");
    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.message).not.toContain("sk-secret-token-value");
  });
});

describe("toolErrorContent", () => {
  it("renders a non-retryable error as one text block with code and guidance", () => {
    const result = toolErrorContent(
      knowwToolError("NOT_FOUND", "Market not found.")
    );
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text: "NOT_FOUND: Market not found. Do not retry with the same input.",
    });
  });

  it("renders a retryable error with plain retry guidance", () => {
    const result = toolErrorContent(
      knowwToolError("UPSTREAM_TIMEOUT", "Upstream timed out.")
    );
    expect(result.content[0].text).toBe(
      "UPSTREAM_TIMEOUT: Upstream timed out. Safe to retry."
    );
  });

  it("surfaces retryAfterSeconds in the retry guidance", () => {
    const result = requestContext.run({ requestId: "request-123" }, () =>
      toolErrorContent(
        knowwToolError("RATE_LIMITED", "Too many requests.", {
          retryAfterSeconds: 30,
        })
      )
    );
    expect(result.content[0].text).toBe(
      "RATE_LIMITED: Too many requests. Retry after 30 seconds."
    );
    expect(result).toMatchObject({
      _meta: {
        "app.knoww/error": {
          code: "RATE_LIMITED",
          message: "Too many requests.",
          retryable: true,
          retryAfterSeconds: 30,
          requestId: "request-123",
        },
      },
    });
  });
});

describe("toolFailureContent", () => {
  it("logs safe structured failure fields without leaking the thrown error", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = requestContext.run({ requestId: "request-123" }, () =>
      toolFailureContent(
        "get_market",
        new Error("connect ECONNREFUSED secret.internal:5432")
      )
    );

    expect(result.content[0].text).toContain("INTERNAL_ERROR");
    const rendered = JSON.stringify(log.mock.calls);
    expect(rendered).toContain("tool.failed");
    expect(rendered).toContain("get_market");
    expect(rendered).toContain("request-123");
    expect(rendered).toContain("INTERNAL_ERROR");
    expect(rendered).not.toContain("ECONNREFUSED");
    expect(rendered).not.toContain("secret.internal");
  });
});

describe("toKnowwToolError from PlatformError", () => {
  it("maps a disabled platform to PLATFORM_DISABLED and names the platform", () => {
    const error = toKnowwToolError(
      platformError("kalshi adapter is off", {
        platform: "kalshi",
        operation: "searchMarkets",
        kind: "disabled",
      })
    );

    expect(error.code).toBe("PLATFORM_DISABLED");
    expect(error.message).toBe(
      "Platform kalshi is not enabled on this server."
    );
    expect(error.retryable).toBe(false);
  });

  it("maps not_found to NOT_FOUND", () => {
    const error = toKnowwToolError(
      platformError("No market for that id", {
        platform: "polymarket",
        operation: "getMarket",
        kind: "not_found",
      })
    );

    expect(error.code).toBe("NOT_FOUND");
    expect(error.retryable).toBe(false);
  });

  it("maps an upstream 429 to a retryable RATE_LIMITED", () => {
    const error = toKnowwToolError(
      platformError("Gamma returned 429", {
        platform: "polymarket",
        operation: "searchMarkets",
        upstreamStatus: 429,
      })
    );

    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryable).toBe(true);
  });

  it("maps a timeout to a retryable UPSTREAM_TIMEOUT", () => {
    const error = toKnowwToolError(
      platformError("CLOB timed out", {
        platform: "polymarket",
        operation: "getOrderbook",
        kind: "timeout",
      })
    );

    expect(error.code).toBe("UPSTREAM_TIMEOUT");
    expect(error.retryable).toBe(true);
  });
});
