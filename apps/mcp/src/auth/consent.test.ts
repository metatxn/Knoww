import { env } from "cloudflare:workers";
import type {
  GrantSummary,
  OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { describe, expect, it, vi } from "vitest";
import { workerConfigFromEnv } from "../config";
import { createAuthorizationTransaction } from "./challenge-store";
import { createConsentHandler } from "./consent";
import { MARKETS_READ_SCOPE } from "./scopes";
import type { McpOAuthEnv } from "./types";

const REDIRECT_URI = "https://installation.example/oauth/callback";
const OTHER_REDIRECT_URI = "https://other-installation.example/oauth/callback";

const cases = [
  {
    name: "matching CIMD installation",
    clientId: "https://client.example/metadata",
    redirectUri: REDIRECT_URI,
    revoke: true,
  },
  {
    name: "another CIMD installation",
    clientId: "https://client.example/metadata",
    redirectUri: OTHER_REDIRECT_URI,
    revoke: false,
  },
  {
    name: "ambiguous CIMD grant",
    clientId: "https://client.example/metadata",
    redirectUri: undefined,
    revoke: false,
  },
  {
    name: "empty CIMD redirect",
    clientId: "https://client.example/metadata",
    redirectUri: "",
    revoke: false,
  },
  {
    name: "CIMD redirect with a different query",
    clientId: "https://client.example/metadata",
    redirectUri: `${REDIRECT_URI}?installation=other`,
    revoke: false,
  },
  {
    name: "CIMD redirect with a different path",
    clientId: "https://client.example/metadata",
    redirectUri: `${REDIRECT_URI}/`,
    revoke: false,
  },
  {
    name: "three-slash CIMD identifier with another installation",
    clientId: "https:///client.example/metadata",
    redirectUri: OTHER_REDIRECT_URI,
    revoke: false,
  },
  {
    name: "four-slash CIMD identifier without redirect metadata",
    clientId: "https:////client.example/metadata",
    redirectUri: undefined,
    revoke: false,
  },
  {
    name: "three-slash CIMD identifier with matching installation",
    clientId: "https:///client.example/metadata",
    redirectUri: REDIRECT_URI,
    revoke: true,
  },
  {
    name: "uppercase HTTPS CIMD identifier",
    clientId: "HTTPS://client.example/metadata",
    redirectUri: undefined,
    revoke: false,
  },
  {
    name: "root-path CIMD identifier",
    clientId: "https://client.example/",
    redirectUri: undefined,
    revoke: false,
  },
  {
    name: "non-CIMD grant without redirect metadata",
    clientId: "registered-client",
    redirectUri: undefined,
    revoke: true,
  },
  {
    name: "non-CIMD grant with another redirect",
    clientId: "registered-client",
    redirectUri: OTHER_REDIRECT_URI,
    revoke: true,
  },
  {
    name: "pathless HTTPS registered identifier",
    clientId: "https://client.example",
    redirectUri: undefined,
    revoke: true,
  },
  {
    name: "query-only HTTPS registered identifier",
    clientId: "https://client.example?document=/metadata",
    redirectUri: undefined,
    revoke: true,
  },
];

describe("Legacy consent grant cleanup", () => {
  it.each(cases)(
    "preserves the revocation boundary for $name",
    async ({ clientId, redirectUri, revoke }) => {
      const id = crypto.randomUUID().replaceAll("-", "");
      const browserSession = "a".repeat(64);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(browserSession)
      );
      const browserSessionHash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
      const oauthRequest = {
        clientId,
        redirectUri: REDIRECT_URI,
        responseType: "code",
        scope: [MARKETS_READ_SCOPE],
        resource: "https://mcp.knoww.app/mcp",
        state: "test-state",
        codeChallenge: "test-challenge",
        codeChallengeMethod: "S256",
      };
      await createAuthorizationTransaction(env.MCP_AUTH_CHALLENGES, {
        approved: true,
        browserSessionHash,
        id,
        clientName: "Test client",
        codeChallenge: "google-challenge",
        codeVerifier: "v".repeat(64),
        nonce: "test-nonce",
        expirationTime: new Date(Date.now() + 60_000).toISOString(),
        resource: oauthRequest.resource,
        scopes: [MARKETS_READ_SCOPE],
        oauthRequest,
      });
      const grant: GrantSummary = {
        id: "legacy-grant",
        userId: "google-test-subject",
        clientId,
        redirectUri,
        scope: [MARKETS_READ_SCOPE],
        metadata: {},
        createdAt: 1,
      };
      const listUserGrants = vi
        .fn()
        .mockResolvedValueOnce({
          items: [{ ...grant, id: "unrelated", clientId: "different-client" }],
          cursor: "next-page",
        })
        .mockResolvedValueOnce({ items: [grant] });
      const revokeGrant = vi.fn(async () => {});
      const provider = {
        completeAuthorization: vi.fn(async () => ({
          redirectTo: `${REDIRECT_URI}?code=test-code`,
        })),
        listUserGrants,
        revokeGrant,
      } as unknown as OAuthHelpers;
      const handler = createConsentHandler(
        workerConfigFromEnv(env),
        async () => ({ subject: "test-subject" })
      );
      if (!handler.fetch) throw new Error("Consent handler is missing fetch");
      const response = await handler.fetch(
        new Request(
          `https://mcp.knoww.app/auth/google/callback?code=test-code&state=${id}`,
          { headers: { cookie: `__Host-knoww-mcp-consent=${browserSession}` } }
        ),
        { ...env, OAUTH_PROVIDER: provider } as McpOAuthEnv,
        {} as ExecutionContext
      );
      expect(response.status).toBe(302);
      expect(listUserGrants).toHaveBeenNthCalledWith(2, "google-test-subject", {
        cursor: "next-page",
        limit: 50,
      });
      if (revoke) {
        expect(revokeGrant.mock.calls).toEqual([
          ["legacy-grant", "google-test-subject"],
        ]);
      } else {
        expect(revokeGrant).not.toHaveBeenCalled();
      }
    }
  );
});
