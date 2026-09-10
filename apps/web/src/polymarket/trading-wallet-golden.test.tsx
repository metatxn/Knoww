/**
 * M3 golden harness, wallet level: `useRelayerClient().approveUsdcForTrading`
 * and `deploySafe` end to end.
 *
 * These are the two flows the order harness mocks away: setting the trading
 * approvals (an EOA sends them itself, a Safe or deposit wallet batches them
 * through the relayer) and creating the trading wallet. The hook runs
 * against the real shared-types relayer driver; only wagmi, the wallet mode
 * and HTTP are faked, the same way as in trading-hook-golden.test.tsx. The
 * fixtures under apps/web/golden/trading/approvals/ and wallet-create/ pin
 * the deployment check the hook makes on mount, every request, every wallet
 * prompt and the result, and must stay byte-identical once trading sits
 * behind the aggregator.
 */

import type { ClobOrderApprovalRequirement } from "@knoww/shared-types/approvals";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createWalletClient, custom } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CTF_ADDRESS } from "@/constants/contracts";
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
  type Personality,
  relayerProxyRoutes,
  rpcRoutes,
  toFixtureRequest,
  WALLETS,
  type WalletMode,
  type WalletRequest,
} from "./trading-hook-golden.support";

/** Mutable state the module mocks read at render time. */
const harness = vi.hoisted(() => ({
  eoa: "" as string,
  /** What wagmi's `useWalletClient` hands the hook: a viem wallet client. */
  walletClient: null as unknown,
  walletMode: "eoa" as "eoa" | "safe" | "deposit",
}));

vi.mock("@knoww/logger", () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

vi.mock("wagmi", () => ({
  useConnection: () => ({ address: harness.eoa, isConnected: true }),
  useWalletClient: () => ({ data: harness.walletClient }),
}));

vi.mock("@/hooks/use-trading-wallet-mode", () => ({
  useTradingWalletMode: () => ({
    mode: harness.walletMode,
    setMode: () => {},
    isEoaMode: harness.walletMode === "eoa",
    isSafeMode: harness.walletMode === "safe",
    isDepositMode: harness.walletMode === "deposit",
    hasLegacySafe: false,
    isCheckingLegacySafe: false,
    legacySafeAddress: null,
  }),
}));

import { useRelayerClient } from "@/hooks/use-relayer-client";

const WALLET_PERSONALITIES = {
  ...PERSONALITIES,
  /** Only pUSD is approved for the CTF: the batch must fill in the rest. */
  partial: {
    ...PERSONALITIES.unapproved,
    approvedSpenders: [CTF_ADDRESS],
  },
  /** A trading wallet that does not exist on chain yet. */
  undeployed: {
    ...PERSONALITIES.unapproved,
    deployed: false,
  },
} satisfies Record<string, Personality>;

interface ScenarioBase {
  label: string;
  mode: WalletMode;
  personality: keyof typeof WALLET_PERSONALITIES;
  /** What the relayer's `/deployed` preflight answers. */
  relayerDeployed?: boolean;
}

interface ApprovalScenario extends ScenarioBase {
  family: "approvals";
  amount?: string;
  scope?: ClobOrderApprovalRequirement;
  expectSuccess: boolean;
}

interface CreateScenario extends ScenarioBase {
  family: "wallet-create";
}

type Scenario = ApprovalScenario | CreateScenario;

const SCENARIOS: Scenario[] = [
  {
    family: "approvals",
    label: "eoa.unapproved",
    mode: "eoa",
    personality: "unapproved",
    expectSuccess: true,
  },
  {
    family: "approvals",
    label: "eoa.approved",
    mode: "eoa",
    personality: "approved",
    expectSuccess: true,
  },
  {
    family: "approvals",
    label: "safe.unapproved",
    mode: "safe",
    personality: "unapproved",
    expectSuccess: true,
  },
  {
    family: "approvals",
    label: "safe.approved",
    mode: "safe",
    personality: "approved",
    expectSuccess: true,
  },
  {
    family: "approvals",
    label: "safe.partial.amount-100",
    mode: "safe",
    personality: "partial",
    amount: "100",
    expectSuccess: true,
  },
  {
    family: "approvals",
    label: "safe.unapproved.scope-sell-negrisk",
    mode: "safe",
    personality: "unapproved",
    scope: { side: "SELL", negRisk: true },
    expectSuccess: true,
  },
  {
    family: "approvals",
    label: "deposit.unapproved",
    mode: "deposit",
    personality: "unapproved",
    expectSuccess: true,
  },
  {
    family: "approvals",
    label: "safe.undeployed",
    mode: "safe",
    personality: "undeployed",
    relayerDeployed: false,
    expectSuccess: false,
  },
  {
    family: "wallet-create",
    label: "eoa",
    mode: "eoa",
    personality: "approved",
  },
  {
    family: "wallet-create",
    label: "safe.create",
    mode: "safe",
    personality: "undeployed",
    relayerDeployed: false,
  },
  {
    family: "wallet-create",
    label: "deposit.create",
    mode: "deposit",
    personality: "undeployed",
    relayerDeployed: false,
  },
  {
    family: "wallet-create",
    label: "deposit.already-deployed",
    mode: "deposit",
    personality: "approved",
    relayerDeployed: true,
  },
];

describe("M3 golden: useRelayerClient approvals and wallet creation", () => {
  beforeEach(() => {
    pinEntropy();
    clearAllCaches();
    harness.eoa = THROWAWAY_EOA;
    harnessErrors.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  for (const scenario of SCENARIOS) {
    it(`${scenario.family} ${scenario.label}`, async () => {
      const personality = WALLET_PERSONALITIES[scenario.personality];
      const relayerDeployed = scenario.relayerDeployed ?? true;
      const walletLog: WalletRequest[] = [];
      const chain = createChain(walletLog);
      harness.walletClient = createWalletClient({
        account: THROWAWAY_EOA,
        chain: polygon,
        transport: custom(
          createFakeProvider(walletLog, {
            eth_sendTransaction: chain.sendTransaction,
          })
        ),
      });
      harness.walletMode = scenario.mode;

      const calls = installFetchCapture(
        composeRoutes([
          rpcRoutes(personality, chain.rpc),
          relayerProxyRoutes({ deployed: relayerDeployed }),
        ]),
        window.location.origin
      );

      // Mount: the hook checks whether the trading wallet exists on chain.
      const { result } = renderHook(() => useRelayerClient());
      await waitFor(() => expect(result.current.isInitialized).toBe(true));
      expect(harnessErrors, "mount harness faults").toEqual([]);
      const mount = {
        requests: calls.splice(0).map(toFixtureRequest),
        state: {
          proxyAddress: result.current.proxyAddress,
          hasDeployedSafe: result.current.hasDeployedSafe,
          walletMode: result.current.walletMode,
          error: result.current.error,
        },
      };

      let outcome: unknown;
      let args: unknown;
      if (scenario.family === "approvals") {
        args = { amount: scenario.amount, scope: scenario.scope };
        await act(async () => {
          outcome = await result.current.approveUsdcForTrading(
            scenario.amount,
            scenario.scope ? { approvalScope: scenario.scope } : {}
          );
        });
        expect(harnessErrors, "action harness faults").toEqual([]);
        expect(outcome).toMatchObject({ success: scenario.expectSuccess });
      } else {
        await act(async () => {
          outcome = await result.current.deploySafe();
        });
        expect(harnessErrors, "action harness faults").toEqual([]);
        expect(outcome).toMatchObject({ success: true });
      }

      await expect(
        goldenJson({
          family: scenario.family,
          mode: scenario.mode,
          wallet: WALLETS[scenario.mode],
          personality: scenario.personality,
          relayerDeployed,
          mount,
          action: {
            args,
            requests: calls.splice(0).map(toFixtureRequest),
            wallet: walletLog.splice(0),
            result: outcome,
          },
        })
      ).toMatchFileSnapshot(
        goldenPath(scenario.family, `${scenario.label}.json`)
      );
    }, 30_000);
  }
});
