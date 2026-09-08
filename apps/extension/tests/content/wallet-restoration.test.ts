import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  rememberWalletConnection,
  restoreOnboardedWallet,
  WALLET_PREFERENCE_STORAGE_KEY,
} from "../../src/content/trading/wallet-restoration";
import { ONBOARDING_STORAGE_KEY } from "../../src/onboarding-state";

const mocks = vi.hoisted(() => ({
  wallets: [] as Array<{ uuid: string; name: string; rdns: string }>,
  selected: "metamask-onboarding",
  getInfo: vi.fn(),
  getWalletAccounts: vi.fn(),
  selectWallet: vi.fn(),
  listeners: new Set<() => void>(),
}));

vi.mock("../../src/content/trading/bridge", () => ({
  WALLETCONNECT_WALLET_UUID: "mobile",
  WalletBridge: {
    getDiscoveredWallets: () => mocks.wallets,
    getSelectedWalletUuid: () => mocks.selected,
    getWalletAccounts: mocks.getWalletAccounts,
    selectWallet: mocks.selectWallet,
    onWalletsChanged: (listener: () => void) => {
      mocks.listeners.add(listener);
      return () => mocks.listeners.delete(listener);
    },
  },
}));
vi.mock("../../src/content/trading/extension-session", () => ({
  ExtensionSession: { getInfo: mocks.getInfo },
}));

const ADDRESS = "0x0000000000000000000000000000000000000001";
const OTHER_ADDRESS = "0x0000000000000000000000000000000000000002";
const METAMASK = {
  uuid: "metamask-new-tab",
  name: "MetaMask",
  rdns: "io.metamask",
};
const COINBASE = {
  uuid: "coinbase-new-tab",
  name: "Coinbase Wallet",
  rdns: "com.coinbase.wallet",
};
let stored: Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.wallets = [COINBASE, METAMASK];
  mocks.selected = METAMASK.uuid;
  mocks.getInfo.mockResolvedValue({ loggedIn: true, address: ADDRESS });
  mocks.getWalletAccounts.mockImplementation(async (uuid: string) =>
    uuid === METAMASK.uuid ? [ADDRESS] : []
  );
  stored = {
    [ONBOARDING_STORAGE_KEY]: { completedAt: "2026-09-08T06:00:00.000Z" },
    [WALLET_PREFERENCE_STORAGE_KEY]: {
      address: ADDRESS,
      rdns: METAMASK.rdns,
      name: METAMASK.name,
    },
  };
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async () => stored,
        set: async (value: object) => Object.assign(stored, value),
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.listeners.clear();
});

describe("wallet restoration after onboarding", () => {
  it.each([undefined, {}, { welcomeCompletedAt: "2026-09-08T06:00:00.000Z" }])(
    "keeps the wallet picker for users without completed onboarding: %j",
    async (progress) => {
      stored[ONBOARDING_STORAGE_KEY] = progress;
      expect(await restoreOnboardedWallet(() => true)).toBeNull();
      expect(mocks.getWalletAccounts).not.toHaveBeenCalled();
      expect(mocks.selectWallet).not.toHaveBeenCalled();
    }
  );

  it("remembers the provider identity and account without a page-local UUID", async () => {
    await rememberWalletConnection(ADDRESS);
    expect(stored[WALLET_PREFERENCE_STORAGE_KEY]).toEqual({
      address: ADDRESS,
      rdns: METAMASK.rdns,
      name: METAMASK.name,
    });
  });

  it("restores MetaMask even when Coinbase is discovered first and UUIDs changed", async () => {
    expect(await restoreOnboardedWallet(() => true)).toEqual({
      address: ADDRESS,
      walletUuid: METAMASK.uuid,
    });
    expect(mocks.selectWallet).toHaveBeenCalledWith(METAMASK.uuid);
    expect(mocks.getWalletAccounts).not.toHaveBeenCalledWith(
      COINBASE.uuid,
      true
    );
  });

  it("requests account access from only the remembered wallet on a new site", async () => {
    mocks.getWalletAccounts.mockImplementation(async (uuid, requestAccess) =>
      uuid === METAMASK.uuid && requestAccess ? [ADDRESS] : []
    );
    expect(await restoreOnboardedWallet(() => true)).not.toBeNull();
    expect(mocks.getWalletAccounts.mock.calls).toEqual([
      [METAMASK.uuid, false],
      [METAMASK.uuid, true],
    ]);
  });

  it("waits for the saved provider even if another wallet announced first", async () => {
    mocks.wallets = [COINBASE];
    const result = restoreOnboardedWallet(() => true);
    await vi.advanceTimersByTimeAsync(500);
    mocks.wallets.push(METAMASK);
    for (const listener of mocks.listeners) listener();
    expect(await result).not.toBeNull();
    expect(mocks.listeners.size).toBe(0);
  });

  it("keeps all options available when the saved provider is missing", async () => {
    mocks.wallets = [COINBASE];
    const result = restoreOnboardedWallet(() => true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBeNull();
    expect(mocks.selectWallet).not.toHaveBeenCalled();
    expect(mocks.getWalletAccounts).not.toHaveBeenCalled();
  });

  it("does not restore a different active account from the saved provider", async () => {
    mocks.getWalletAccounts.mockResolvedValue([OTHER_ADDRESS, ADDRESS]);
    expect(await restoreOnboardedWallet(() => true)).toBeNull();
    expect(mocks.selectWallet).not.toHaveBeenCalled();
  });

  it("rejects a different account returned by the permission prompt", async () => {
    mocks.getWalletAccounts
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([OTHER_ADDRESS]);
    expect(await restoreOnboardedWallet(() => true)).toBeNull();
    expect(mocks.selectWallet).not.toHaveBeenCalled();
  });

  it("keeps the picker when multiple providers claim the saved identity", async () => {
    mocks.wallets.push({ ...METAMASK, uuid: "another-metamask" });
    expect(await restoreOnboardedWallet(() => true)).toBeNull();
    expect(mocks.getWalletAccounts).not.toHaveBeenCalled();
  });

  it("restores a saved mobile session without starting another pairing", async () => {
    stored[WALLET_PREFERENCE_STORAGE_KEY] = {
      address: ADDRESS,
      rdns: "walletconnect",
      name: "Mobile Wallet",
    };
    mocks.getWalletAccounts.mockImplementation(async (uuid) =>
      uuid === "mobile" ? [ADDRESS] : []
    );
    expect(await restoreOnboardedWallet(() => true)).toEqual({
      address: ADDRESS,
      walletUuid: "mobile",
    });
    expect(mocks.getWalletAccounts.mock.calls).toEqual([["mobile", false]]);
  });

  it("preserves wallet selection after a rejected permission prompt", async () => {
    mocks.getWalletAccounts
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("User rejected"));
    expect(await restoreOnboardedWallet(() => true)).toBeNull();
    expect(mocks.selectWallet).not.toHaveBeenCalled();
  });

  it("does not reconnect after logout", async () => {
    mocks.getInfo.mockResolvedValue({ loggedIn: false, address: null });
    expect(await restoreOnboardedWallet(() => true)).toBeNull();
    expect(mocks.getWalletAccounts).not.toHaveBeenCalled();
  });

  it("does not replace a manual selection with a late restoration response", async () => {
    let current = true;
    let finish!: (accounts: string[]) => void;
    mocks.getWalletAccounts.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const result = restoreOnboardedWallet(() => current);
    await vi.advanceTimersByTimeAsync(0);
    current = false;
    finish([ADDRESS]);
    expect(await result).toBeNull();
    expect(mocks.selectWallet).not.toHaveBeenCalled();
  });

  it("checks that the authenticated account has not changed during restoration", async () => {
    mocks.getInfo
      .mockResolvedValueOnce({ loggedIn: true, address: ADDRESS })
      .mockResolvedValueOnce({ loggedIn: true, address: OTHER_ADDRESS });
    expect(await restoreOnboardedWallet(() => true)).toBeNull();
    expect(mocks.selectWallet).not.toHaveBeenCalled();
  });

  it("recovers users who completed onboarding before provider preferences were saved", async () => {
    delete stored[WALLET_PREFERENCE_STORAGE_KEY];
    expect(await restoreOnboardedWallet(() => true)).toEqual({
      address: ADDRESS,
      walletUuid: METAMASK.uuid,
    });
    expect(
      mocks.getWalletAccounts.mock.calls.every(
        ([, requestAccess]) => requestAccess === false
      )
    ).toBe(true);
  });
});
