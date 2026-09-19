/**
 * Golden harness for the pUSD deposit. The modal moves pUSD from the
 * connected EOA into the trading wallet with a plain ERC-20 transfer, so
 * the seam is the transaction the wallet is asked to sign and the chain
 * reads that follow it. One fixture per wallet mode that has a trading
 * wallet of its own; in EOA mode the EOA is the trading wallet, so the
 * modal offers no wallet method and nothing is signed. Nothing here reaches
 * the network and the key has never held funds.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  type Address,
  createWalletClient,
  custom,
  decodeFunctionData,
  erc20Abi,
  type Hex,
  parseUnits,
  type WalletClient,
} from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DepositModal } from "@/components/deposit-modal";
import { PUSD_ADDRESS } from "@/constants/contracts";
import type { TokenBalance } from "@/hooks/use-wallet-tokens";
import { polygon } from "@/lib/chains";
import { clearAllCaches } from "@/lib/rpc";
import {
  goldenJson,
  goldenPath,
  installFetchCapture,
  pinEntropy,
  THROWAWAY_EOA,
} from "./trading-golden.support";
import {
  composeRoutes,
  createChain,
  createFakeProvider,
  harnessErrors,
  PERSONALITIES,
  rpcRoutes,
  toFixtureRequest,
  WALLETS,
  type WalletMode,
  type WalletRequest,
} from "./trading-hook-golden.support";

/** What the mocked wallet, token and bridge hooks hand the modal. */
const harness = vi.hoisted(() => ({
  eoa: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  tradingWallet: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  mode: "eoa" as WalletMode,
  walletClient: null as WalletClient | null,
  tokens: [] as TokenBalance[],
  refreshTokens: vi.fn(),
  refreshProxyWallet: vi.fn(),
  getSupportedAssets: vi.fn(async () => []),
  createDepositAddresses: vi.fn(async () => []),
  getDepositStatus: vi.fn(async () => []),
}));

vi.mock("@knoww/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: harness.eoa, isConnected: true }),
  useWalletClient: () => ({ data: harness.walletClient }),
}));

vi.mock("@/hooks/use-proxy-wallet", () => ({
  useProxyWallet: () => ({
    proxyAddress: harness.tradingWallet,
    isDeployed: true,
    usdcBalance: 0,
    walletMode: harness.mode,
    refresh: harness.refreshProxyWallet,
  }),
}));

vi.mock("@/hooks/use-wallet-tokens", () => ({
  useWalletTokens: () => ({
    tokens: harness.tokens,
    nativeBalance: null,
    totalUsdValue: harness.tokens.reduce((sum, t) => sum + t.usdValue, 0),
    isLoading: false,
    isPricesStale: false,
    error: null,
    refresh: harness.refreshTokens,
  }),
}));

vi.mock("@/hooks/use-bridge", () => ({
  fetchBridgeQuote: vi.fn(),
  useBridge: () => ({
    isLoading: false,
    error: null,
    supportedAssets: [],
    depositAddresses: [],
    proxyAddress: harness.tradingWallet,
    getSupportedAssets: harness.getSupportedAssets,
    createDepositAddresses: harness.createDepositAddresses,
    getChainMetadata: () => undefined,
    clearDepositAddresses: () => undefined,
    getQuote: async () => null,
    isLoadingQuote: false,
    quoteError: null,
    getDepositStatus: harness.getDepositStatus,
    isLoadingDepositStatus: false,
    depositStatusError: null,
    getWithdrawalAddresses: async () => [],
    isLoadingWithdrawal: false,
    withdrawalError: null,
  }),
}));

const DEPOSIT_AMOUNT = "12.5";
const PUSD_DECIMALS = 6;
const STEP_TIMEOUT = { timeout: 5_000 };

/** The EOA holds 25 pUSD; every mode deposits the same slice of it. */
function pusdInWallet(): TokenBalance {
  return {
    symbol: "pUSD",
    name: "Polymarket USD",
    address: PUSD_ADDRESS,
    decimals: PUSD_DECIMALS,
    balance: 25,
    balanceRaw: "25000000",
    usdValue: 25,
    depositSupported: true,
  };
}

/** Mounts the modal on the method list against the fake wallet for `mode`. */
function mountModal(mode: WalletMode) {
  const walletLog: WalletRequest[] = [];
  const chain = createChain(walletLog);
  harness.mode = mode;
  harness.eoa = THROWAWAY_EOA;
  harness.tradingWallet = WALLETS[mode];
  harness.tokens = [pusdInWallet()];
  harness.walletClient = createWalletClient({
    account: THROWAWAY_EOA,
    chain: polygon,
    transport: custom(
      createFakeProvider(walletLog, {
        eth_sendTransaction: chain.sendTransaction,
      })
    ),
  });
  const calls = installFetchCapture(
    composeRoutes([rpcRoutes(PERSONALITIES.approved, chain.rpc)]),
    window.location.origin
  );
  const onDepositComplete = vi.fn();

  render(
    <DepositModal
      open
      onOpenChange={vi.fn()}
      onDepositComplete={onDepositComplete}
    />
  );

  return { walletLog, calls, onDepositComplete };
}

/** Walks the modal from the method list to "Deposit Complete". */
async function depositThroughModal(mode: WalletMode) {
  const { walletLog, calls, onDepositComplete } = mountModal(mode);

  fireEvent.click(await screen.findByRole("button", { name: /Wallet · 0x/ }));
  fireEvent.click(
    await screen.findByRole("button", { name: /pUSD/ }, STEP_TIMEOUT)
  );
  fireEvent.change(
    await screen.findByPlaceholderText("0.00", undefined, STEP_TIMEOUT),
    { target: { value: DEPOSIT_AMOUNT } }
  );
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /Confirm Deposit/ }, STEP_TIMEOUT)
  );
  await waitFor(() => expect(onDepositComplete).toHaveBeenCalledTimes(1), {
    timeout: 20_000,
  });

  return { walletLog, calls };
}

describe("pUSD deposit golden", () => {
  beforeEach(() => {
    pinEntropy();
    clearAllCaches();
    harnessErrors.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("offers no wallet method in EOA mode because the EOA is the trading wallet", async () => {
    const { walletLog } = mountModal("eoa");

    await screen.findByRole("button", { name: /Transfer Crypto/ });
    expect(screen.queryByRole("button", { name: /Wallet · 0x/ })).toBeNull();
    expect(walletLog.filter((r) => r.method === "eth_sendTransaction")).toEqual(
      []
    );
    expect(harnessErrors).toEqual([]);
  });

  for (const mode of ["safe", "deposit"] as const) {
    it(`moves pUSD from the EOA into the ${mode} trading wallet`, async () => {
      const { walletLog, calls } = await depositThroughModal(mode);

      expect(harnessErrors).toEqual([]);
      const sent = walletLog.filter((r) => r.method === "eth_sendTransaction");
      expect(sent).toHaveLength(1);
      const [tx] = sent[0].params as [{ to: Address; data: Hex }];
      expect(tx.to.toLowerCase()).toBe(PUSD_ADDRESS.toLowerCase());

      const transfer = decodeFunctionData({ abi: erc20Abi, data: tx.data });
      expect(transfer.functionName).toBe("transfer");
      const [recipient, amountRaw] = transfer.args as [Address, bigint];
      expect(recipient.toLowerCase()).toBe(WALLETS[mode].toLowerCase());
      expect(amountRaw).toBe(parseUnits(DEPOSIT_AMOUNT, PUSD_DECIMALS));

      expect(harness.refreshProxyWallet).toHaveBeenCalled();
      expect(harness.refreshTokens).toHaveBeenCalled();

      await expect(
        goldenJson({
          mode,
          eoa: THROWAWAY_EOA,
          tradingWallet: WALLETS[mode],
          amount: DEPOSIT_AMOUNT,
          transfer: { token: tx.to, recipient, amountRaw },
          wallet: walletLog,
          requests: calls.map(toFixtureRequest),
        })
      ).toMatchFileSnapshot(goldenPath("deposit", `${mode}.json`));
    }, 30_000);
  }
});
