import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  accountsAdded: [] as Array<(accounts: string[]) => void>,
  accountsRemoved: [] as Array<(accounts: string[]) => void>,
  reset: 0,
  connect: vi.fn(),
  permitted: vi.fn(),
}));

const restoration = vi.hoisted(() => ({ restore: vi.fn() }));
vi.mock("../../src/content/trading/wallet-restoration", () => ({
  restoreOnboardedWallet: restoration.restore,
  rememberWalletConnection: async () => {},
}));

vi.mock("../../src/content/trading/bridge", () => ({
  WalletBridge: {
    connect: bridge.connect,
    hasAccountPermission: bridge.permitted,
    onAccountsChanged: (listener: (accounts: string[]) => void) => {
      bridge.accountsAdded.push(listener);
      return () => bridge.accountsRemoved.push(listener);
    },
    resetAfterDisconnect: () => {
      bridge.reset += 1;
    },
  },
}));

type RuntimeListener = (message: unknown) => boolean;

const runtimeListeners = {
  added: [] as RuntimeListener[],
  removed: [] as RuntimeListener[],
};

beforeEach(() => {
  bridge.accountsAdded.length = 0;
  bridge.accountsRemoved.length = 0;
  bridge.reset = 0;
  restoration.restore.mockReset();
  bridge.connect.mockReset();
  bridge.permitted.mockReset().mockResolvedValue(false);
  vi.stubGlobal("window", {});
  runtimeListeners.added.length = 0;
  runtimeListeners.removed.length = 0;
  vi.stubGlobal("__DEV_MODE__", false);
  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: {
        addListener: (listener: RuntimeListener) =>
          runtimeListeners.added.push(listener),
        removeListener: (listener: RuntimeListener) =>
          runtimeListeners.removed.push(listener),
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  vi.unstubAllGlobals();
});

test("an active-account event does not log out a still-permitted trading account", async () => {
  const { TradingService } = await import(
    "../../src/content/trading/trading-service"
  );
  const address = `0x${"1".repeat(40)}`;
  TradingService.getContext().address = address;
  bridge.permitted.mockResolvedValue(true);
  await TradingService.handleExternalWalletAccountsChanged([
    `0x${"2".repeat(40)}`,
  ]);
  assert.equal(TradingService.getContext().address, address);
  assert.equal(bridge.reset, 0);
});

test("an account removal still disconnects when permission is revoked", async () => {
  const messages: string[] = [];
  Object.assign(chrome.runtime, {
    sendMessage: (
      msg: { type: string },
      callback: (result: unknown) => void
    ) => {
      messages.push(msg.type);
      callback({ ok: true, data: null });
    },
  });
  const { TradingService } = await import(
    "../../src/content/trading/trading-service"
  );
  TradingService.getContext().address = `0x${"1".repeat(40)}`;
  await TradingService.handleExternalWalletAccountsChanged([
    `0x${"2".repeat(40)}`,
  ]);
  assert.equal(TradingService.getContext().address, null);
  assert.deepEqual(messages, ["auth:logout"]);
});

test("failed restoration can retry when another trading panel opens", async () => {
  const { TradingService } = await import(
    "../../src/content/trading/trading-service"
  );
  restoration.restore.mockResolvedValue(null);
  await TradingService.restoreWallet();
  await TradingService.restoreWallet();
  assert.equal(restoration.restore.mock.calls.length, 2);
  assert.equal(TradingService.getContext().state, "disconnected");
});

test("concurrent panels share restoration and a manual connection supersedes it", async () => {
  const { TradingService } = await import(
    "../../src/content/trading/trading-service"
  );
  let finish!: (value: unknown) => void;
  restoration.restore.mockImplementation((_isCurrent, onStart) => {
    onStart();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const first = TradingService.restoreWallet();
  const second = TradingService.restoreWallet();
  assert.equal(first, second);
  assert.equal(TradingService.getContext().state, "restoring-session");
  bridge.connect.mockRejectedValue(new Error("User rejected"));
  await TradingService.connectWallet("manual-wallet");
  finish({
    address: "0x0000000000000000000000000000000000000001",
    walletUuid: "old-wallet",
  });
  await first;
  assert.equal(TradingService.getContext().address, null);
  assert.equal(TradingService.getContext().error, "User rejected");
  assert.equal(restoration.restore.mock.calls.length, 1);
});

test("Choose another wallet cancels restoration without adopting its late result", async () => {
  const { TradingService } = await import(
    "../../src/content/trading/trading-service"
  );
  let finish!: (value: unknown) => void;
  restoration.restore.mockImplementation((_isCurrent, onStart) => {
    onStart();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const result = TradingService.restoreWallet();
  TradingService.cancelWalletRestore();
  assert.equal(TradingService.getContext().state, "disconnected");
  finish({
    address: "0x0000000000000000000000000000000000000001",
    walletUuid: "old-wallet",
  });
  await result;
  assert.equal(TradingService.getContext().address, null);
});

test("a stalled restoration returns to wallet selection and permits retry", async () => {
  vi.useFakeTimers();
  const { TradingService } = await import(
    "../../src/content/trading/trading-service"
  );
  let finish!: (value: unknown) => void;
  restoration.restore.mockImplementation((_isCurrent, onStart) => {
    onStart();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const first = TradingService.restoreWallet();
  await vi.advanceTimersByTimeAsync(125_000);
  assert.equal(TradingService.getContext().state, "disconnected");
  restoration.restore.mockResolvedValue(null);
  await TradingService.restoreWallet();
  assert.equal(restoration.restore.mock.calls.length, 2);
  finish(null);
  await first;
  assert.equal(vi.getTimerCount(), 0);
});

test("trading service import is inert and its installer is idempotent and reversible", async () => {
  const { installTradingServiceListeners } = await import(
    "../../src/content/trading/trading-service"
  );

  assert.equal(bridge.accountsAdded.length, 0);
  assert.equal(runtimeListeners.added.length, 0);

  const dispose = installTradingServiceListeners();
  const duplicateDisposer = installTradingServiceListeners();

  assert.equal(dispose, duplicateDisposer);
  assert.equal(bridge.accountsAdded.length, 1);
  assert.equal(runtimeListeners.added.length, 1);
  assert.equal(runtimeListeners.added[0]({ type: "unrelated" }), false);
  assert.equal(
    runtimeListeners.added[0]({ type: "trading:session-disconnected" }),
    false
  );

  dispose();
  dispose();
  assert.deepEqual(bridge.accountsRemoved, bridge.accountsAdded);
  assert.deepEqual(runtimeListeners.removed, runtimeListeners.added);
});
