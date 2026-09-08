import { NextRequest } from "next/server";
import { parseSiweMessage } from "viem/siwe";
import { afterEach, expect, it, vi } from "vitest";

const { issueChallenge, rateLimit } = vi.hoisted(() => ({
  issueChallenge: vi.fn(async () => ({
    token: "test-challenge",
    claims: { exp: Date.now() + 300_000 },
  })),
  rateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/auth/extension-session", () => ({
  issueExtensionChallengeToken: issueChallenge,
}));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: rateLimit }));

import { POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it.each([
  ["development", "http://localhost:8000", "localhost:8000"],
  ["production", "https://knoww.app", "knoww.app"],
])(
  "binds the %s challenge to the expected origin",
  async (mode, origin, domain) => {
    vi.stubEnv("NODE_ENV", mode);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://knoww.app");
    const walletAddress = "0x1111111111111111111111111111111111111111";
    const request = new NextRequest(
      `${origin}/api/extension/session/challenge`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://attacker.example",
          "X-Forwarded-Host": "attacker.example",
        },
        body: JSON.stringify({
          walletAddress,
          chainId: 137,
          origin: "https://attacker.example",
        }),
      }
    );
    const response = await POST(request);
    expect(response.status).toBe(200);
    const challenge = (await response.json()) as { message: string };
    expect(challenge.message.split("\n")[0]).toBe(
      `${domain} wants you to sign in with your Ethereum account:`
    );
    expect(parseSiweMessage(challenge.message)).toMatchObject({
      domain,
      uri: origin,
    });
    expect(issueChallenge).toHaveBeenCalledWith({
      address: walletAddress,
      chainId: 137,
      message: challenge.message,
    });
    expect(rateLimit).toHaveBeenCalledWith(request, {
      uniqueTokenPerInterval: 30,
    });
  }
);
