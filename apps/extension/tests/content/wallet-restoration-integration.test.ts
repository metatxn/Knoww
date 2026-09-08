// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ONBOARDING_STORAGE_KEY } from "../../src/onboarding-state";

const session = vi.hoisted(() => ({
  address: "0x0000000000000000000000000000000000000001",
}));
vi.mock("../../src/content/trading/extension-session", () => ({
  ExtensionSession: {
    getInfo: async () => ({ loggedIn: true, address: session.address }),
  },
}));
vi.mock("../../src/content/trading/walletconnect-bridge", () => ({
  WalletConnectBridge: {
    getAccounts: async () => [],
    getState: () => ({ status: "idle" }),
  },
}));

let stored: Record<string, unknown>;
let disposeBridge: () => void;
let listeners: Array<[string, EventListenerOrEventListenerObject]>;
const coinbase = vi.fn();
const metamask = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  stored = {
    [ONBOARDING_STORAGE_KEY]: { completedAt: "2026-09-08T06:00:00.000Z" },
  };
  document.body.innerHTML =
    '<script id="knoww-page-bridge" data-knoww-nonce="test-nonce"></script>';
  window.__KNOWW_BRIDGE_NONCE__ = "test-nonce";
  delete window.__KNOWW_BRIDGE__;
  listeners = [];
  const addListener = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation(
    (type, listener, options) => {
      listeners.push([type, listener]);
      addListener(type, listener, options);
    }
  );
  vi.spyOn(window, "postMessage").mockImplementation((data) => {
    Promise.resolve().then(() =>
      window.dispatchEvent(
        new MessageEvent("message", { data, source: window })
      )
    );
  });
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async () => stored,
        set: async (data: object) => Object.assign(stored, data),
      },
    },
  });
  coinbase.mockResolvedValue([]);
  metamask.mockResolvedValue([session.address]);
});

afterEach(() => {
  disposeBridge?.();
  for (const [type, listener] of listeners)
    window.removeEventListener(type, listener);
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function mount() {
  await import("../../src/page-bridge");
  const { WalletBridge } = await import("../../src/content/trading/bridge");
  const restoration = await import(
    "../../src/content/trading/wallet-restoration"
  );
  disposeBridge = WalletBridge.init();
  for (const [uuid, name, rdns, request] of [
    ["coinbase-new", "Coinbase Wallet", "com.coinbase.wallet", coinbase],
    ["metamask-new", "MetaMask", "io.metamask", metamask],
  ] as const) {
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: { info: { uuid, name, rdns, icon: "" }, provider: { request } },
      })
    );
  }
  await vi.advanceTimersByTimeAsync(0);
  stored[restoration.WALLET_PREFERENCE_STORAGE_KEY] = {
    address: session.address,
    name: "MetaMask",
    rdns: "io.metamask",
  };
  return { WalletBridge, ...restoration };
}

it("restores the onboarding provider through the real page and content bridges", async () => {
  const { restoreOnboardedWallet, WalletBridge } = await mount();
  const restored = await restoreOnboardedWallet(() => true);
  expect(restored).toEqual({
    address: session.address,
    walletUuid: "metamask-new",
  });
  expect(WalletBridge.getSelectedWalletUuid()).toBe("metamask-new");
  expect(await WalletBridge.getAccounts()).toEqual([session.address]);
  expect(coinbase).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps every discovered wallet available to an existing user without onboarding", async () => {
  const { restoreOnboardedWallet, WalletBridge } = await mount();
  delete stored[ONBOARDING_STORAGE_KEY];
  expect(await restoreOnboardedWallet(() => true)).toBeNull();
  expect(
    WalletBridge.getDiscoveredWallets().map((wallet) => wallet.name)
  ).toEqual(["Coinbase Wallet", "MetaMask"]);
  expect(WalletBridge.getSelectedWalletUuid()).toBeUndefined();
  expect(coinbase).not.toHaveBeenCalled();
  expect(metamask).not.toHaveBeenCalled();
  expect(await WalletBridge.connect("coinbase-new")).toEqual([]);
  expect(coinbase).toHaveBeenCalledWith({
    method: "eth_requestAccounts",
    params: undefined,
  });
});

it("requests site permission from MetaMask and preserves the saved account", async () => {
  const { restoreOnboardedWallet, WalletBridge } = await mount();
  metamask.mockImplementation(async ({ method }) =>
    method === "eth_accounts" ? [] : [session.address]
  );
  expect(await restoreOnboardedWallet(() => true)).not.toBeNull();
  expect(metamask.mock.calls.map(([request]) => request.method)).toEqual([
    "eth_accounts",
    "eth_requestAccounts",
  ]);
  expect(coinbase).not.toHaveBeenCalled();
  expect(WalletBridge.getSelectedWalletUuid()).toBe("metamask-new");
});

it("releases pending requests after a stalled provider lookup", async () => {
  const { WalletBridge } = await mount();
  metamask.mockImplementation(() => new Promise(() => {}));
  const result = WalletBridge.getWalletAccounts("metamask-new", false);
  const assertion = expect(result).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(3000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});
