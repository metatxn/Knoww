import type { WalletClient } from "viem";
import { afterEach, expect, it, vi } from "vitest";
import { getDeployed, registerRelayerWallet } from "./relayer-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("does not call the credentialed relayer when no wallet has signed in", async () => {
  const upstreamFetch = vi.fn(async () => Response.json({ deployed: false }));
  vi.stubGlobal("fetch", upstreamFetch);

  await expect(
    getDeployed("0x0000000000000000000000000000000000000001")
  ).rejects.toThrow(/wallet/i);
  expect(upstreamFetch).not.toHaveBeenCalled();
});

it("signs a wallet challenge and attaches the relayer-only session", async () => {
  const address = "0x0000000000000000000000000000000000000002";
  const signMessage = vi.fn(async () => `0x${"a".repeat(130)}`);
  const unregister = registerRelayerWallet(
    { signMessage } as unknown as WalletClient,
    address
  );
  const requests: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    if (url === "/api/extension/session/challenge") {
      return Response.json({
        message: "Sign in to Knoww",
        challengeToken: "signed-challenge",
      });
    }
    if (url === "/api/extension/session/verify") {
      return Response.json({
        token: "signed-session",
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
    }
    return Response.json({ deployed: true });
  });

  try {
    await expect(getDeployed(address)).resolves.toBe(true);
    expect(signMessage).toHaveBeenCalledWith({
      account: address,
      message: "Sign in to Knoww",
    });
    expect(JSON.parse(String(requests[1]?.init.body))).toMatchObject({
      scope: "relayer:submit",
      walletAddress: address,
    });
    expect(requests[2]?.init.headers).toMatchObject({
      Authorization: "Bearer signed-session",
    });
    await getDeployed(address);
    expect(signMessage).toHaveBeenCalledOnce();
  } finally {
    unregister();
  }
});
