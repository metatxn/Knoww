import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { workerConfigFromEnv } from "../config";
import worker from "../index";
import { type ReviewerEnv, verifyReviewerCode } from "./reviewer";
import { validateMcpAuthProps } from "./scopes";
import type { McpOAuthEnv } from "./types";

const ORIGIN = "https://mcp.knoww.app";
const REDIRECT = "https://reviewer.example/callback";
// Public test fixture, never a deployed credential.
const CODE = "ab".repeat(32);
const VERIFIER =
  "test-reviewer-pkce-verifier-0123456789abcdefghijklmnopqrstuvwxyz";

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

async function dispatch(
  path: string,
  testEnv: Env & ReviewerEnv,
  init?: RequestInit
) {
  const context = createExecutionContext();
  const response = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      ...init,
      headers: { host: "mcp.knoww.app", ...init?.headers },
    }),
    testEnv,
    context
  );
  await waitOnExecutionContext(context);
  return response;
}

async function begin(testEnv: Env, scope = "markets:read") {
  const registered = await dispatch("/oauth/register", testEnv, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Reviewer test",
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  expect(registered.status).toBe(201);
  const { client_id: clientId } = await registered.json<{
    client_id: string;
  }>();
  const challenge = btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(VERIFIER)
        )
      )
    )
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  const response = await dispatch(
    `/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT, response_type: "code", scope, state: "review-test", code_challenge: challenge, code_challenge_method: "S256", resource: workerConfigFromEnv(env).canonicalResource })}`,
    testEnv
  );
  const html = await response.text();
  return {
    response,
    html,
    clientId,
    transaction: html.match(/name="transaction" value="([^"]+)"/)?.[1] ?? "",
  };
}

function approve(
  transaction: string,
  code = CODE,
  origin = ORIGIN
): RequestInit {
  return {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      transaction,
      decision: "reviewer",
      reviewer_code: code,
    }),
  };
}

describe("Reviewer authorization", () => {
  async function enabled() {
    return {
      ...env,
      MCP_REVIEWER_CODE_SHA256: await hash(CODE),
    } as McpOAuthEnv;
  }

  it("is hidden and rejects login when unconfigured", async () => {
    const flow = await begin(env);
    expect(flow.html).not.toContain('name="reviewer_code"');
    const response = await dispatch(
      "/authorize",
      env,
      approve(flow.transaction)
    );
    expect(response.status).toBe(401);
  });

  it("offers reviewer sign-in, preserves PKCE, and issues a usable read-only token", async () => {
    const configured = await enabled();
    const flow = await begin(configured);
    expect(flow.html).toContain('name="reviewer_code"');
    expect(flow.html).toContain("Continue with Google");
    expect(flow.html).not.toContain(CODE);
    const approval = await dispatch(
      "/authorize",
      configured,
      approve(flow.transaction)
    );
    expect(approval.status).toBe(302);
    const redirect = new URL(approval.headers.get("location") ?? "");
    expect(redirect.origin + redirect.pathname).toBe(REDIRECT);
    expect(redirect.searchParams.get("state")).toBe("review-test");
    const code = redirect.searchParams.get("code") ?? "";
    const exchange = (verifier: string) =>
      dispatch("/oauth/token", configured, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: flow.clientId,
          redirect_uri: REDIRECT,
          code,
          code_verifier: verifier,
          resource: `${ORIGIN}/mcp`,
        }),
      });
    expect((await exchange("wrong-verifier".repeat(4))).status).toBe(400);
    const tokensResponse = await exchange(VERIFIER);
    expect(tokensResponse.status).toBe(200);
    const tokens = await tokensResponse.json<{
      access_token: string;
      refresh_token: string;
      scope: string;
    }>();
    expect(tokens.scope).toBe("markets:read");
    const mcpRequest = {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokens.access_token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "list_platforms", arguments: {} },
      }),
    };
    const result = await dispatch("/mcp", configured, mcpRequest);
    expect(result.status).toBe(200);
    expect(await result.text()).toContain("Enabled platforms:");
    const refresh = await dispatch("/oauth/token", configured, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: flow.clientId,
        refresh_token: tokens.refresh_token,
        resource: `${ORIGIN}/mcp`,
      }),
    });
    expect(refresh.status).toBe(200);
    const refreshed = await refresh.json<{ scope: string }>();
    expect(refreshed.scope).toBe("markets:read");
    expect((await dispatch("/mcp", env, mcpRequest)).status).toBe(401);
    expect(
      (
        await dispatch(
          "/mcp",
          { ...configured, MCP_REVIEWER_CODE_SHA256: "cd".repeat(32) },
          mcpRequest
        )
      ).status
    ).toBe(401);
    expect(
      (await dispatch("/authorize", configured, approve(flow.transaction)))
        .status
    ).toBe(401);
  });

  it("rejects wrong codes, cross-origin posts and replay after a failed attempt", async () => {
    const configured = await enabled();
    const flow = await begin(configured);
    expect(
      (
        await dispatch(
          "/authorize",
          configured,
          approve(flow.transaction, CODE, "https://evil.example")
        )
      ).status
    ).toBe(403);
    expect(
      (
        await dispatch(
          "/authorize",
          configured,
          approve(flow.transaction, "cd".repeat(32))
        )
      ).status
    ).toBe(401);
    expect(
      (await dispatch("/authorize", configured, approve(flow.transaction)))
        .status
    ).toBe(401);
  });

  it("rejects trading scopes and forged reviewer principals", async () => {
    const flow = await begin(await enabled(), "orders:create");
    expect(flow.response.status).toBe(302);
    expect(flow.response.headers.get("location")).toContain("invalid_scope");
    expect(
      validateMcpAuthProps({
        authMethod: "reviewer-code",
        principalId: "google-victim",
        reviewerCodeHash: await hash(CODE),
        scopes: ["markets:read"],
        plan: "free",
      })
    ).toBeNull();
    expect(
      validateMcpAuthProps({
        authMethod: "reviewer-code",
        principalId: "reviewer-demo",
        reviewerCodeHash: await hash(CODE),
        scopes: ["orders:create"],
        plan: "free",
      })
    ).toBeNull();
  });

  it("validates access code format and configuration", async () => {
    expect(await verifyReviewerCode(CODE, await enabled())).toBe(
      await hash(CODE)
    );
    expect(await verifyReviewerCode(CODE, {})).toBeNull();
    expect(await verifyReviewerCode("short", await enabled())).toBeNull();
    expect(
      await verifyReviewerCode(CODE, { MCP_REVIEWER_CODE_SHA256: "invalid" })
    ).toBeNull();
  });

  it("applies the existing authorization rate limiter to reviewer login", async () => {
    const configured = await enabled();
    const flow = await begin(configured);
    const limit = vi.fn(async () => ({ success: false }));
    const response = await dispatch(
      "/authorize",
      { ...configured, MCP_AUTH_RATE_LIMITER: { limit } },
      approve(flow.transaction)
    );
    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalled();
  });
});
