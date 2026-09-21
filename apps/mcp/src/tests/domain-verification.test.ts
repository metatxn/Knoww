import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../index";

const url = "https://mcp.knoww.app/.well-known/openai-apps-challenge";
const token = "openai-verification-test-token";

async function dispatch(
  value: string | undefined,
  init?: RequestInit,
  overrides: Partial<Env> = {}
) {
  const ctx = createExecutionContext();
  const testEnv = {
    ...env,
    ...overrides,
    OPENAI_APPS_VERIFICATION_TOKEN: value,
  };
  const response = await worker.fetch(new Request(url, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("OpenAI domain verification", () => {
  it("serves the exact token without OAuth or JSON wrapping", async () => {
    const response = await dispatch(token);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8"
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("www-authenticate")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe(token);
  });

  it.each(["", " ", " token", "token\n", "one\ntwo", "x".repeat(4097)])(
    "does not publish an invalid token (%#)",
    async (value) => {
      const response = await dispatch(value);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found.");
    }
  );

  it("returns 404 when no token is configured", async () => {
    const response = await dispatch(undefined);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found.");
  });

  it("rejects unsupported methods", async () => {
    const response = await dispatch(token, { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(await response.text()).toBe("");
  });

  it("retains hostname validation", async () => {
    const response = await dispatch(token, {
      headers: { host: "attacker.example" },
    });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(token);
  });

  it("retains the public edge rate limit", async () => {
    const response = await dispatch(token, undefined, {
      MCP_EDGE_RATE_LIMITER: { limit: async () => ({ success: false }) },
    });
    expect(response.status).toBe(429);
    expect(await response.text()).not.toContain(token);
  });
});
