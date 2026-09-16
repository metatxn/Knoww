import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  type AuthorizationTransaction,
  consumeAuthorizationTransaction,
  createAuthorizationTransaction,
  getOAuthUserId,
} from "./challenge-store";

const transaction: AuthorizationTransaction = {
  codeChallenge: "google-code-challenge",
  codeVerifier: "v".repeat(64),
  id: "0123456789abcdef0123456789abcdef",
  clientName: "Test Agent",
  expirationTime: "2099-01-01T00:05:00.000Z",
  nonce: "google-nonce",
  resource: "https://mcp.knoww.app/mcp",
  scopes: ["markets:read"],
  oauthRequest: {
    clientId: "test-client",
    codeChallenge: "challenge",
    codeChallengeMethod: "S256",
    issuer: "https://mcp.knoww.app",
    redirectUri: "https://client.example/callback",
    resource: "https://mcp.knoww.app/mcp",
    responseType: "code",
    scope: ["markets:read"],
    state: "state-1",
  },
};

describe("OAuth authorization transaction store", () => {
  it("allows an authorization transaction to be consumed exactly once", async () => {
    await createAuthorizationTransaction(env.MCP_AUTH_CHALLENGES, transaction);

    await expect(
      consumeAuthorizationTransaction(env.MCP_AUTH_CHALLENGES, transaction.id)
    ).resolves.toEqual(transaction);
    await expect(
      consumeAuthorizationTransaction(env.MCP_AUTH_CHALLENGES, transaction.id)
    ).resolves.toBeNull();
  });

  it("does not return an expired authorization transaction", async () => {
    const expired = {
      ...transaction,
      id: "fedcba9876543210fedcba9876543210",
      expirationTime: "2020-01-01T00:00:00.000Z",
    };
    await createAuthorizationTransaction(env.MCP_AUTH_CHALLENGES, expired);

    await expect(
      consumeAuthorizationTransaction(env.MCP_AUTH_CHALLENGES, expired.id)
    ).resolves.toBeNull();
  });
});

describe("Opaque OAuth identity store", () => {
  it("keeps IDs stable across concurrent authorizations and separates users and clients", async () => {
    const ids = await Promise.all(
      Array.from({ length: 8 }, () =>
        getOAuthUserId(env.MCP_AUTH_CHALLENGES, "test-subject", "client-a")
      )
    );
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toMatch(/^mcp_[0-9a-f]{64}$/);
    expect(ids[0]).not.toContain("test-subject");
    expect(
      await getOAuthUserId(env.MCP_AUTH_CHALLENGES, "test-subject", "client-a")
    ).toBe(ids[0]);
    expect(
      await getOAuthUserId(env.MCP_AUTH_CHALLENGES, "test-subject", "client-b")
    ).not.toBe(ids[0]);
    expect(
      await getOAuthUserId(
        env.MCP_AUTH_CHALLENGES,
        "another-subject",
        "client-a"
      )
    ).not.toBe(ids[0]);
  });
});
