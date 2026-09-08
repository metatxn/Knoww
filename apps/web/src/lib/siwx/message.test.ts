import { parseSiweMessage } from "viem/siwe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSiwxMessage, createSiwxChallenge } from "./message";

const address = "0x1111111111111111111111111111111111111111";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("ALLOWED_ORIGIN", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("extension sign-in origin", () => {
  it("uses Phantom's authority-only header and keeps the scheme in the URI", () => {
    expect(
      buildSiwxMessage({
        address,
        chainId: 137,
        nonce: "12345678abcdefgh",
        issuedAt: "2026-09-08T08:00:00.000Z",
        expirationTime: "2026-09-08T08:05:00.000Z",
      })
    ).toBe(`localhost:8000 wants you to sign in with your Ethereum account:
${address}

Sign in to Knoww

URI: http://localhost:8000
Version: 1
Chain ID: 137
Nonce: 12345678abcdefgh
Issued At: 2026-09-08T08:00:00.000Z
Expiration Time: 2026-09-08T08:05:00.000Z`);
  });

  it("defaults to the port used by local onboarding", () => {
    const { message } = createSiwxChallenge({ address, chainId: 137 });
    expect(parseSiweMessage(message)).toMatchObject({
      domain: "localhost:8000",
      uri: "http://localhost:8000",
    });
  });

  it.each(["https://knoww.app", "http://localhost:8787"])(
    "uses the local request origin despite a configured URL of %s",
    (configuredUrl) => {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", configuredUrl);
      const { message } = createSiwxChallenge({
        address,
        chainId: 137,
        requestUrl: "http://localhost:8000/api/extension/session/challenge",
      });
      expect(parseSiweMessage(message)).toMatchObject({
        domain: "localhost:8000",
        uri: "http://localhost:8000",
        address,
        chainId: 137,
      });
    }
  );

  it.each([
    "https://x.com/api/extension/session/challenge",
    "http://localhost:8000.attacker.example/",
    "http://localhost:8000@attacker.example/",
    "invalid-url",
  ])("does not trust an arbitrary request URL: %s", (requestUrl) => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://knoww.app");
    const { message } = createSiwxChallenge({
      address,
      chainId: 137,
      requestUrl,
    });
    expect(parseSiweMessage(message)).toMatchObject({
      domain: "knoww.app",
      uri: "https://knoww.app",
    });
  });

  it("keeps the configured domain in production even for a local request URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://knoww.app");
    const { message } = createSiwxChallenge({
      address,
      chainId: 137,
      requestUrl: "http://localhost:8000/api/extension/session/challenge",
    });
    expect(parseSiweMessage(message)).toMatchObject({
      domain: "knoww.app",
      uri: "https://knoww.app",
    });
  });
});
