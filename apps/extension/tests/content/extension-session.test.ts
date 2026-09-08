/// <reference path="../../src/env.d.ts" />

import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChainId: vi.fn(),
  signMessage: vi.fn(),
  getSelectedWalletUuid: vi.fn(() => "phantom-page-id"),
  getDiscoveredWallets: vi.fn(() => [
    { uuid: "phantom-page-id", rdns: "app.phantom", name: "Phantom" },
  ]),
}));

vi.mock("../../src/content/trading/bridge", () => ({
  WalletBridge: {
    getChainId: mocks.getChainId,
    signMessage: mocks.signMessage,
    getSelectedWalletUuid: mocks.getSelectedWalletUuid,
    getDiscoveredWallets: mocks.getDiscoveredWallets,
  },
}));

type SendMessageCallback = (response: unknown) => void;

beforeEach(() => {
  mocks.getSelectedWalletUuid.mockReturnValue("phantom-page-id");
  mocks.getDiscoveredWallets.mockReturnValue([
    { uuid: "phantom-page-id", rdns: "app.phantom", name: "Phantom" },
  ]);
});

function installChromeRuntimeHarness(
  sessionAddress: string,
  origin = "https://knoww.app",
  signInAddress?: string
) {
  mocks.getChainId.mockResolvedValue("0x89");
  mocks.signMessage.mockResolvedValue(`0x${"1".repeat(130)}`);
  const messages: Array<{ body?: unknown; type?: string; url?: string }> = [];
  const runtime = {
    lastError: undefined as { message?: string } | undefined,
    sendMessage(
      message: { body?: unknown; type?: string; url?: string },
      callback: SendMessageCallback
    ) {
      runtime.lastError = undefined;
      messages.push(message);

      if (message.type === "auth:get-session-info") {
        callback({
          ok: true,
          data: { loggedIn: true, address: sessionAddress },
        });
        return;
      }

      if (message.type === "auth:clear-token") {
        callback({ ok: true, data: null });
        return;
      }

      if (message.type === "auth:set-token") {
        callback({ ok: true, data: null });
        return;
      }

      if (message.type === "auth:open-sign-in") {
        sessionAddress = signInAddress ?? "";
        callback({
          ok: true,
          data: { loggedIn: true, address: signInAddress },
        });
        return;
      }

      if (
        message.type === "fetch-json" &&
        message.url === "https://knoww.app/api/extension/session/challenge"
      ) {
        callback({
          ok: true,
          status: 200,
          data: {
            challengeToken: "challenge-token",
            message: "Sign in to Knoww",
          },
        });
        return;
      }

      if (
        message.type === "fetch-json" &&
        message.url === "https://knoww.app/api/extension/session/verify"
      ) {
        callback({
          ok: true,
          status: 200,
          data: {
            success: true,
            token: "new-session-token",
          },
        });
        return;
      }

      callback({ ok: false, error: `Unexpected message: ${message.type}` });
    },
  };

  (globalThis as { chrome?: unknown }).chrome = { runtime };
  (globalThis as { window?: unknown }).window = { location: { origin } };

  return { messages };
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  delete (globalThis as { chrome?: unknown }).chrome;
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { __DEV_MODE__?: unknown }).__DEV_MODE__;
});

test("signs in on Knoww with the selected wallet when API keys are requested on x.com", async () => {
  const address = "0x2222222222222222222222222222222222222222";
  const harness = installChromeRuntimeHarness("", "https://x.com", address);
  (globalThis as { __DEV_MODE__?: boolean }).__DEV_MODE__ = false;
  const { ExtensionSession } = await import(
    "../../src/content/trading/extension-session"
  );
  await ExtensionSession.ensureAuthorized(address);
  assert.deepEqual(harness.messages.at(-1), {
    type: "auth:open-sign-in",
    address,
    wallet: { rdns: "app.phantom", name: "Phantom" },
  });
  assert.equal(mocks.signMessage.mock.calls.length, 0);
  assert.equal(
    harness.messages.some((message) => message.type === "fetch-json"),
    false
  );
});

test.each([
  { uuid: "metamask", rdns: "io.metamask", name: "MetaMask" },
  { uuid: "coinbase", rdns: "com.coinbase.wallet", name: "Coinbase Wallet" },
  { uuid: "rabby", rdns: "io.rabby", name: "Rabby" },
])(
  "signs directly on x.com for $name even when Phantom is also installed",
  async (wallet) => {
    const address = "0x2222222222222222222222222222222222222222";
    const harness = installChromeRuntimeHarness("", "https://x.com", address);
    mocks.getSelectedWalletUuid.mockReturnValue(wallet.uuid);
    mocks.getDiscoveredWallets.mockReturnValue([
      { uuid: "phantom-page-id", rdns: "app.phantom", name: "Phantom" },
      wallet,
    ]);
    (globalThis as { __DEV_MODE__?: boolean }).__DEV_MODE__ = false;
    const { ExtensionSession } = await import(
      "../../src/content/trading/extension-session"
    );
    await ExtensionSession.ensureAuthorized(address);
    assert.equal(
      harness.messages.some((message) => message.type === "auth:open-sign-in"),
      false
    );
    assert.deepEqual(mocks.signMessage.mock.calls, [
      [address, "Sign in to Knoww"],
    ]);
    assert.equal(harness.messages.at(-1)?.type, "auth:set-token");
  }
);

test("recognizes legacy Phantom without an rdns identity", async () => {
  const address = "0x2222222222222222222222222222222222222222";
  const harness = installChromeRuntimeHarness("", "https://x.com", address);
  mocks.getDiscoveredWallets.mockReturnValue([
    { uuid: "phantom-page-id", rdns: "", name: "Phantom" },
  ]);
  (globalThis as { __DEV_MODE__?: boolean }).__DEV_MODE__ = false;
  const { ExtensionSession } = await import(
    "../../src/content/trading/extension-session"
  );
  await ExtensionSession.ensureAuthorized(address);
  assert.equal(harness.messages.at(-1)?.type, "auth:open-sign-in");
  assert.equal(mocks.signMessage.mock.calls.length, 0);
});

test.each(["https://knoww.app", "walletconnect"])(
  "keeps direct signing for %s",
  async (mode) => {
    const address = "0x2222222222222222222222222222222222222222";
    const harness = installChromeRuntimeHarness(
      "",
      mode === "walletconnect" ? "https://x.com" : mode,
      address
    );
    if (mode === "walletconnect")
      mocks.getSelectedWalletUuid.mockReturnValue(
        "__knoww_walletconnect_mobile__"
      );
    (globalThis as { __DEV_MODE__?: boolean }).__DEV_MODE__ = false;
    const { ExtensionSession } = await import(
      "../../src/content/trading/extension-session"
    );
    await ExtensionSession.ensureAuthorized(address);
    assert.equal(
      harness.messages.some((message) => message.type === "auth:open-sign-in"),
      false
    );
    assert.equal(mocks.signMessage.mock.calls.length, 1);
  }
);

test("does not open sign-in again for an existing matching session on x.com", async () => {
  const address = "0x2222222222222222222222222222222222222222";
  const harness = installChromeRuntimeHarness(address, "https://x.com");
  (globalThis as { __DEV_MODE__?: boolean }).__DEV_MODE__ = false;
  const { ExtensionSession } = await import(
    "../../src/content/trading/extension-session"
  );
  await ExtensionSession.ensureAuthorized(address);
  assert.deepEqual(
    harness.messages.map((message) => message.type),
    ["auth:get-session-info"]
  );
});

test("reuses the completed Knoww sign-in for subsequent trading actions", async () => {
  const address = "0x2222222222222222222222222222222222222222";
  const harness = installChromeRuntimeHarness("", "https://x.com", address);
  (globalThis as { __DEV_MODE__?: boolean }).__DEV_MODE__ = false;
  const { ExtensionSession } = await import(
    "../../src/content/trading/extension-session"
  );
  await ExtensionSession.ensureAuthorized(address);
  await ExtensionSession.ensureAuthorized(address);
  await ExtensionSession.ensureAuthorized(address);
  assert.equal(
    harness.messages.filter((message) => message.type === "auth:open-sign-in")
      .length,
    1
  );
  assert.equal(mocks.signMessage.mock.calls.length, 0);
});

test("does not resume an action if the sign-in tab authenticated another account", async () => {
  installChromeRuntimeHarness(
    "",
    "https://x.com",
    "0x1111111111111111111111111111111111111111"
  );
  (globalThis as { __DEV_MODE__?: boolean }).__DEV_MODE__ = false;
  const { ExtensionSession } = await import(
    "../../src/content/trading/extension-session"
  );
  await assert.rejects(
    ExtensionSession.ensureAuthorized(
      "0x2222222222222222222222222222222222222222"
    ),
    /requested wallet/i
  );
});

test("reauthorizes when the stored extension session belongs to a different address", async () => {
  const existingAddress = "0x1111111111111111111111111111111111111111";
  const requestedAddress = "0x2222222222222222222222222222222222222222";
  const harness = installChromeRuntimeHarness(existingAddress);
  (globalThis as { __DEV_MODE__?: boolean }).__DEV_MODE__ = false;
  mocks.getChainId.mockResolvedValue("0x89");
  mocks.signMessage.mockResolvedValue(`0x${"1".repeat(130)}`);
  const { ExtensionSession } = await import(
    "../../src/content/trading/extension-session"
  );

  await ExtensionSession.ensureAuthorized(requestedAddress);

  assert.deepEqual(
    harness.messages.map((message) => message.type),
    [
      "auth:get-session-info",
      "auth:clear-token",
      "fetch-json",
      "fetch-json",
      "auth:set-token",
    ]
  );
  assert.deepEqual(mocks.signMessage.mock.calls[0], [
    requestedAddress,
    "Sign in to Knoww",
  ]);
});

test("coalesces concurrent authorization requests for the same wallet", async () => {
  const existingAddress = "0x1111111111111111111111111111111111111111";
  const requestedAddress = "0x2222222222222222222222222222222222222222";
  const harness = installChromeRuntimeHarness(existingAddress);
  (globalThis as { __DEV_MODE__?: boolean }).__DEV_MODE__ = false;
  mocks.getChainId.mockResolvedValue("0x89");
  mocks.signMessage.mockResolvedValue(`0x${"1".repeat(130)}`);
  const { ExtensionSession } = await import(
    "../../src/content/trading/extension-session"
  );

  await Promise.all(
    Array.from({ length: 4 }, () =>
      ExtensionSession.ensureAuthorized(requestedAddress)
    )
  );

  assert.equal(mocks.signMessage.mock.calls.length, 1);
  assert.equal(
    harness.messages.filter(
      (message) =>
        message.type === "fetch-json" &&
        message.url?.endsWith("/api/extension/session/challenge")
    ).length,
    1
  );
  assert.equal(
    harness.messages.filter(
      (message) =>
        message.type === "fetch-json" &&
        message.url?.endsWith("/api/extension/session/verify")
    ).length,
    1
  );
});
