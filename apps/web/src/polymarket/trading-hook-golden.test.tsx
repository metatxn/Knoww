/**
 * M3 golden harness, hook level: `useClobClient().createOrder` end to end.
 *
 * The hook runs against the real shared-types trading driver and the real
 * Polymarket SDK. Only the wallet plumbing is faked: wagmi hands the hook a
 * local EIP-1193 provider that signs with the throwaway key, the credential
 * and proxy-wallet hooks return fixed values, and every HTTP call (CLOB,
 * relayer, the app's RPC and relayer proxies) is answered from recorded
 * responses and captured. The fixtures under apps/web/golden/trading/hook/
 * pin every request, every wallet prompt and every approval the hook makes,
 * and must stay byte-identical once trading sits behind the aggregator.
 *
 * The app proxy prefix is normalised (`/api/polymarket/x` records as
 * `/api/x`) because the M3 route move is expected; everything else must
 * not change.
 */

import { act, renderHook } from "@testing-library/react";
import { createWalletClient, custom } from "viem";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { polygon } from "@/lib/chains";
import {
  clobRoutes,
  FAKE_CLOB_CREDENTIALS,
  goldenJson,
  goldenPath,
  installFetchCapture,
  loadRecordedMarkets,
  pinEntropy,
  type RecordedMarket,
  THROWAWAY_EOA,
} from "./trading-golden.support";
import {
  clobAccountRoutes,
  composeRoutes,
  createFakeProvider,
  harnessErrors,
  PERSONALITIES,
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
  proxyAddress: "" as string,
  walletMode: "eoa" as "eoa" | "safe" | "deposit",
  credentials: null as null | {
    apiKey: string;
    apiSecret: string;
    apiPassphrase: string;
  },
  approveUsdcForTrading: vi.fn(async () => ({ success: true })),
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

vi.mock("@/hooks/use-clob-credentials", () => ({
  useClobCredentials: () => ({
    credentials: harness.credentials,
    hasCredentials: harness.credentials !== null,
    deriveCredentials: async () => harness.credentials,
    clearCredentials: () => {},
  }),
}));

vi.mock("@/hooks/use-proxy-wallet", () => ({
  useProxyWallet: () => ({
    proxyAddress: harness.proxyAddress,
    isDeployed: true,
    isEoaMode: harness.walletMode === "eoa",
    walletMode: harness.walletMode,
    usdcBalance: 0,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/use-relayer-client", () => ({
  useRelayerClient: () => ({
    approveUsdcForTrading: harness.approveUsdcForTrading,
  }),
}));

import { useClobClient } from "@/hooks/use-clob-client";

const markets = loadRecordedMarkets();

function routes(
  personality: (typeof PERSONALITIES)[keyof typeof PERSONALITIES]
) {
  return composeRoutes([
    clobRoutes(markets),
    clobAccountRoutes(personality),
    rpcRoutes(personality),
    relayerProxyRoutes(),
  ]);
}

interface OrderParams {
  tokenId: string;
  conditionId: string;
  price: number;
  size: number;
  amount?: number;
  side: "BUY" | "SELL";
  orderType: "GTC" | "FOK" | "FAK";
  negRisk?: boolean;
}

function orderCases(market: RecordedMarket): Record<string, OrderParams> {
  const base = {
    tokenId: market.tokenId,
    conditionId: market.conditionId,
    negRisk: market.kind === "negrisk",
  };
  return {
    "limit-buy-gtc": {
      ...base,
      side: "BUY",
      orderType: "GTC",
      price: 0.5,
      size: 10,
    },
    "market-buy-fak": {
      ...base,
      side: "BUY",
      orderType: "FAK",
      price: 0,
      size: 0,
      amount: 25,
    },
    "limit-sell-gtc": {
      ...base,
      side: "SELL",
      orderType: "GTC",
      price: 0.62,
      size: 7.5,
    },
    "market-sell-fok": {
      ...base,
      side: "SELL",
      orderType: "FOK",
      price: 0.4,
      size: 12,
    },
  };
}

interface Scenario {
  label: string;
  mode: WalletMode;
  market: RecordedMarket;
  personality: keyof typeof PERSONALITIES;
  cases: readonly string[];
}

const SCENARIOS: Scenario[] = [
  ...(["eoa", "safe", "deposit"] as const).flatMap((mode) =>
    Object.values(markets).map(
      (market): Scenario => ({
        label: `${mode}.${market.kind}`,
        mode,
        market,
        personality: "approved",
        cases: [
          "limit-buy-gtc",
          "market-buy-fak",
          "limit-sell-gtc",
          "market-sell-fok",
        ],
      })
    )
  ),
  {
    label: "unapproved.safe.negrisk",
    mode: "safe",
    market: markets.negrisk,
    personality: "unapproved",
    cases: ["limit-buy-gtc", "limit-sell-gtc"],
  },
  {
    label: "wrap.safe.plain",
    mode: "safe",
    market: markets.plain,
    personality: "wrap",
    cases: ["limit-buy-gtc"],
  },
  {
    label: "wrap.deposit.plain",
    mode: "deposit",
    market: markets.plain,
    personality: "wrap",
    cases: ["limit-buy-gtc"],
  },
];

describe("M3 golden: useClobClient.createOrder", () => {
  beforeAll(() => {
    // The builder code is a deployment setting; the fixtures pin the bare flow.
    delete process.env.NEXT_PUBLIC_POLY_BUILDER_CODE;
  });

  beforeEach(() => {
    pinEntropy();
    harness.eoa = THROWAWAY_EOA;
    harness.credentials = { ...FAKE_CLOB_CREDENTIALS };
    harness.approveUsdcForTrading.mockClear();
    harnessErrors.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  for (const scenario of SCENARIOS) {
    it(`${scenario.label}: ${scenario.cases.join(", ")}`, async () => {
      const personality = PERSONALITIES[scenario.personality];
      const walletLog: WalletRequest[] = [];
      // wagmi's wallet client is a viem wallet client over the connector's
      // provider with a JSON-RPC account, so signing goes through the fake.
      harness.walletClient = createWalletClient({
        account: THROWAWAY_EOA,
        chain: polygon,
        transport: custom(createFakeProvider(walletLog)),
      });
      harness.proxyAddress = WALLETS[scenario.mode];
      harness.walletMode = scenario.mode;

      // Same base the app's relayer proxy client uses, so every app-local
      // request records under one host.
      const calls = installFetchCapture(
        routes(personality),
        window.location.origin
      );
      const { result } = renderHook(() => useClobClient());
      expect(result.current.canTrade).toBe(true);

      const cases: Record<string, unknown> = {};
      for (const label of scenario.cases) {
        const params = orderCases(scenario.market)[label];
        let outcome: unknown;
        await act(async () => {
          outcome = await result.current.createOrder(params);
        });
        expect(harnessErrors, `${label} harness faults`).toEqual([]);
        expect(outcome, `${label} outcome`).toMatchObject({ success: true });
        cases[label] = {
          params,
          requests: calls.splice(0).map(toFixtureRequest),
          wallet: walletLog.splice(0),
          approvals: harness.approveUsdcForTrading.mock.calls.splice(0),
          result: outcome,
        };
      }

      await expect(
        goldenJson({
          mode: scenario.mode,
          market: scenario.market.kind,
          wallet: WALLETS[scenario.mode],
          personality: scenario.personality,
          cases,
        })
      ).toMatchFileSnapshot(goldenPath("hook", `${scenario.label}.json`));
    }, 30_000);
  }
});
