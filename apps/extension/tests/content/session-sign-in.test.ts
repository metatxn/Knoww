import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  wallets: vi.fn(),
  access: vi.fn(),
  authorize: vi.fn(),
  chain: vi.fn(),
  switchChain: vi.fn(),
}));
vi.mock("../../src/content/trading/bridge", () => ({
  WalletBridge: {
    getDiscoveredWallets: mocks.wallets,
    ensureAccountAccess: mocks.access,
    getChainId: mocks.chain,
    switchChain: mocks.switchChain,
    onWalletsChanged: () => () => {},
  },
}));
vi.mock("../../src/content/trading/extension-session", () => ({
  ExtensionSession: { ensureAuthorized: mocks.authorize },
}));

import { signInWithSelectedWallet } from "../../src/content/trading/session-sign-in";

const address = `0x${"1".repeat(40)}`;
const request = { address, wallet: { rdns: "app.phantom", name: "Phantom" } };
const phantom = {
  uuid: "new-tab-phantom",
  rdns: "app.phantom",
  name: "Phantom",
};
beforeEach(() => {
  vi.useFakeTimers();
  mocks.wallets.mockReturnValue([
    { uuid: "coinbase", rdns: "com.coinbase", name: "Coinbase Wallet" },
    phantom,
  ]);
  mocks.access.mockResolvedValue(true);
  mocks.chain.mockResolvedValue("0x89");
  mocks.authorize.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("checks the exact requested account on the selected provider before signing", async () => {
  const current = () => true;
  await signInWithSelectedWallet(request, current);
  expect(mocks.access).toHaveBeenCalledWith(
    "new-tab-phantom",
    address,
    current
  );
  expect(mocks.authorize).toHaveBeenCalledWith(address);
});
it("does not sign if permission is granted only for another account", async () => {
  mocks.access.mockResolvedValue(false);
  await expect(signInWithSelectedWallet(request, () => true)).rejects.toThrow(
    "account shown above"
  );
  expect(mocks.authorize).not.toHaveBeenCalled();
});
it("does not retry when the user rejects account access", async () => {
  mocks.access.mockRejectedValueOnce(new Error("User rejected the request"));
  await expect(signInWithSelectedWallet(request, () => true)).rejects.toThrow(
    "User rejected"
  );
  expect(mocks.access).toHaveBeenCalledTimes(1);
  expect(mocks.authorize).not.toHaveBeenCalled();
});
it("does not select a provider when its identity is ambiguous", async () => {
  mocks.wallets.mockReturnValue([phantom, { ...phantom, uuid: "duplicate" }]);
  await expect(signInWithSelectedWallet(request, () => true)).rejects.toThrow(
    "Could not identify"
  );
  expect(mocks.access).not.toHaveBeenCalled();
});
it("reports an unavailable wallet after bounded discovery", async () => {
  mocks.wallets.mockReturnValue([]);
  const result = expect(
    signInWithSelectedWallet(request, () => true)
  ).rejects.toThrow("Could not identify");
  await vi.advanceTimersByTimeAsync(2000);
  await result;
  expect(mocks.access).not.toHaveBeenCalled();
});
it("checks cancellation after account access", async () => {
  let active = true;
  mocks.access.mockImplementationOnce(async () => {
    active = false;
    return true;
  });
  await expect(signInWithSelectedWallet(request, () => active)).rejects.toThrow(
    "cancelled"
  );
  expect(mocks.authorize).not.toHaveBeenCalled();
});
it("switches to Polygon before requesting authentication", async () => {
  mocks.chain.mockResolvedValue("0x1");
  await signInWithSelectedWallet(request, () => true);
  expect(mocks.switchChain).toHaveBeenCalledWith("0x89");
  expect(mocks.switchChain.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.authorize.mock.invocationCallOrder[0]
  );
});
