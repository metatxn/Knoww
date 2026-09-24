import { derivePolymarketSafe } from "@knoww/shared-types/relayer";
import { NextRequest } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, expect, it, vi } from "vitest";
import {
  issueExtensionSessionToken,
  verifyExtensionSessionToken,
} from "@/lib/auth/extension-session";
import { POST as requestChallenge } from "../../../extension/session/challenge/route";
import { POST as verifyChallenge } from "../../../extension/session/verify/route";
import { GET, POST } from "./route";

vi.mock("@/lib/api-rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

function submitRequest(
  token?: string,
  from = "0x0000000000000000000000000000000000000002"
): NextRequest {
  return new NextRequest("https://knoww.app/api/polymarket/relayer/submit", {
    method: "POST",
    headers: {
      origin: "https://knoww.app",
      "sec-fetch-site": "same-origin",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ type: "SAFE", from, transactions: [] }),
  });
}

it("denies forged first-party headers and accepts a signed relayer session", async () => {
  process.env.EXTENSION_SESSION_SECRET = "test-relayer-session-secret";
  process.env.POLY_RELAYER_API_KEY = "test-relayer-key";
  process.env.POLY_RELAYER_API_KEY_ADDRESS =
    "0x0000000000000000000000000000000000000001";
  const upstreamFetch = vi.fn(async () =>
    Response.json({ transactionID: "tx-1" })
  );
  vi.stubGlobal("fetch", upstreamFetch);

  const forged = await POST(submitRequest(), {
    params: Promise.resolve({ path: ["submit"] }),
  });
  expect(forged.status).toBe(401);
  expect(upstreamFetch).not.toHaveBeenCalled();

  const { token } = await issueExtensionSessionToken({
    address: "0x0000000000000000000000000000000000000002",
    chainId: 137,
    scope: ["relayer:submit"],
  });
  const authorized = await POST(submitRequest(token), {
    params: Promise.resolve({ path: ["submit"] }),
  });
  expect(authorized.status).toBe(200);
  expect(upstreamFetch).toHaveBeenCalledOnce();
});

it("rejects a relayer submit for a wallet other than the signed caller", async () => {
  process.env.EXTENSION_SESSION_SECRET = "test-relayer-session-secret";
  process.env.POLY_RELAYER_API_KEY = "test-relayer-key";
  process.env.POLY_RELAYER_API_KEY_ADDRESS =
    "0x0000000000000000000000000000000000000001";
  const upstreamFetch = vi.fn(async () =>
    Response.json({ transactionID: "tx-1" })
  );
  vi.stubGlobal("fetch", upstreamFetch);
  const { token } = await issueExtensionSessionToken({
    address: "0x0000000000000000000000000000000000000002",
    chainId: 137,
    scope: ["relayer:submit"],
  });

  const response = await POST(
    submitRequest(token, "0x0000000000000000000000000000000000000003"),
    { params: Promise.resolve({ path: ["submit"] }) }
  );
  expect(response.status).toBe(403);
  expect(upstreamFetch).not.toHaveBeenCalled();
});

it("limits wallet lookups to the signed owner and their trading wallet", async () => {
  process.env.EXTENSION_SESSION_SECRET = "test-relayer-session-secret";
  process.env.POLY_RELAYER_API_KEY = "test-relayer-key";
  process.env.POLY_RELAYER_API_KEY_ADDRESS =
    "0x0000000000000000000000000000000000000001";
  const upstreamFetch = vi.fn(async () => Response.json({ deployed: true }));
  vi.stubGlobal("fetch", upstreamFetch);
  const owner = "0x0000000000000000000000000000000000000002";
  const { token } = await issueExtensionSessionToken({
    address: owner,
    chainId: 137,
    scope: ["relayer:submit"],
  });

  const otherWallet = await GET(
    new NextRequest(
      "https://knoww.app/api/polymarket/relayer/deployed?address=0x0000000000000000000000000000000000000003",
      { headers: { authorization: `Bearer ${token}` } }
    ),
    { params: Promise.resolve({ path: ["deployed"] }) }
  );
  expect(otherWallet.status).toBe(403);
  expect(upstreamFetch).not.toHaveBeenCalled();

  const ownSafe = await GET(
    new NextRequest(
      `https://knoww.app/api/polymarket/relayer/deployed?address=${derivePolymarketSafe(owner)}`,
      { headers: { authorization: `Bearer ${token}` } }
    ),
    { params: Promise.resolve({ path: ["deployed"] }) }
  );
  expect(ownSafe.status).toBe(200);
  expect(upstreamFetch).toHaveBeenCalledOnce();
});

it("a web relayer sign-in does not revoke the extension session for the same wallet", async () => {
  process.env.EXTENSION_SESSION_SECRET = "test-relayer-session-secret";
  const address = "0x0000000000000000000000000000000000000003";
  const extension = await issueExtensionSessionToken({
    address,
    chainId: 137,
  });
  await issueExtensionSessionToken({
    address,
    chainId: 137,
    scope: ["relayer:submit"],
  });

  expect(await verifyExtensionSessionToken(extension.token)).not.toBeNull();
});

it("issues only relayer scope after a real wallet signature", async () => {
  process.env.EXTENSION_SESSION_SECRET = "test-relayer-session-secret";
  const account = privateKeyToAccount(`0x${"1".repeat(64)}`);
  const challengeResponse = await requestChallenge(
    new NextRequest("https://knoww.app/api/extension/session/challenge", {
      method: "POST",
      body: JSON.stringify({ walletAddress: account.address, chainId: 137 }),
    })
  );
  expect(challengeResponse.status).toBe(200);
  const challenge = (await challengeResponse.json()) as {
    challengeToken: string;
    message: string;
  };
  const signature = await account.signMessage({ message: challenge.message });
  const verifiedResponse = await verifyChallenge(
    new NextRequest("https://knoww.app/api/extension/session/verify", {
      method: "POST",
      body: JSON.stringify({
        walletAddress: account.address,
        chainId: 137,
        challengeToken: challenge.challengeToken,
        message: challenge.message,
        signature,
        scope: "relayer:submit",
      }),
    })
  );
  expect(verifiedResponse.status).toBe(200);
  const verified = (await verifiedResponse.json()) as { token: string };
  const claims = await verifyExtensionSessionToken(verified.token);
  expect(claims?.scope).toEqual(["relayer:submit"]);
});
