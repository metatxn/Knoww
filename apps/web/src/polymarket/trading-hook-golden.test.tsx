/**
 * M3 golden harness, hook level: `usePlaceOrder().createOrder` end to end.
 *
 * The hook runs against the real shared-types trading driver and the real
 * Polymarket SDK. Only the wallet plumbing is faked: wagmi hands the hook a
 * local EIP-1193 provider that signs with the throwaway key, the credential
 * and proxy-wallet hooks return fixed values, and every HTTP call (CLOB,
 * relayer, the app's RPC and relayer proxies) is answered from recorded
 * responses and captured.
 *
 * The fixtures under apps/web/golden/trading/hook/ are the legacy hook's
 * recording and stay byte-identical. The hook now previews and places
 * through the platform adapter, which reads the market and book before it
 * signs, so the full transcript is no longer the contract. What must not
 * change is what leaves the browser: every wallet prompt, the signed
 * `POST /order` (headers included), the balance refreshes the CLOB needs
 * before it, every relayer transaction, every on-chain read and every
 * approval. Each case asserts those against the fixture. The relayer's
 * deployment check is a read the adapter caches per wallet, so it is
 * asserted once per scenario rather than once per order.
 *
 * The app proxy prefix is normalised (`/api/polymarket/x` records as
 * `/api/x`) because the M3 route move was expected.
 */

import { readFileSync } from "node:fs";
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
  createChain,
  createFakeProvider,
  harnessErrors,
  PERSONALITIES,
  RPC_PATH,
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

// The trading identity derives the wallet mode from chain state on mount;
// the fixture's mode is the answer.
vi.mock("@/hooks/use-trading-wallet-mode", () => ({
  useTradingWalletMode: () => ({ mode: harness.walletMode }),
}));

vi.mock("@/hooks/use-relayer-client", () => ({
  useRelayerClient: () => ({
    approveUsdcForTrading: harness.approveUsdcForTrading,
  }),
}));

import { usePlaceOrder } from "@/hooks/use-place-order";

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

/** A request in fixture form, as `toFixtureRequest` records it. */
interface FixtureRequest {
  method: string;
  url: string;
  headers?: unknown;
  body?: unknown;
  decoded?: unknown;
}

interface FixtureCase {
  params: OrderParams;
  requests: FixtureRequest[];
  wallet: WalletRequest[];
  approvals: unknown[][];
  result: { success: boolean; order: { orderId?: string } };
}

interface HookFixture {
  cases: Record<string, FixtureCase>;
}

function loadFixture(label: string): HookFixture {
  return JSON.parse(
    readFileSync(goldenPath("hook", `${label}.json`), "utf8")
  ) as HookFixture;
}

const CLOB_ORDER_URL = "https://clob.polymarket.com/order";

function isOrderPost(request: FixtureRequest): boolean {
  return request.method === "POST" && request.url === CLOB_ORDER_URL;
}

/** The signed order as it leaves the browser: body and L2 auth headers. */
function postedOrder(requests: readonly FixtureRequest[]): FixtureRequest {
  const posts = requests.filter(isOrderPost);
  expect(posts, "exactly one POST /order").toHaveLength(1);
  return posts[0];
}

/**
 * The balance-allowance refreshes the CLOB needs before it will accept the
 * order (see the balance-refresh parity note in the adapter golden test).
 * Distinct and sorted: how many times and in what order is not the contract.
 */
function refreshesBeforeOrder(requests: readonly FixtureRequest[]): string[] {
  const orderAt = requests.findIndex(isOrderPost);
  const urls = requests
    .slice(0, orderAt)
    .filter((request) => request.url.includes("/balance-allowance/update"))
    .map((request) => request.url);
  return [...new Set(urls)].sort();
}

function isRelayerCall(request: FixtureRequest): boolean {
  return (
    request.url.startsWith("/api/relayer/") ||
    request.url.includes("relayer-v2.polymarket.com")
  );
}

function isDeploymentCheck(request: FixtureRequest): boolean {
  return request.method === "GET" && request.url.includes("/deployed?");
}

/**
 * Every relayer transaction, through the app proxy or direct, in order:
 * the nonce, the submit and the receipt poll of a wrap or an approval.
 */
function relayerTransactions(requests: readonly FixtureRequest[]) {
  return requests
    .filter((request) => isRelayerCall(request) && !isDeploymentCheck(request))
    .map(({ method, url, body }) => ({ method, url, body }));
}

/** The distinct deployment reads: which wallets were checked, not how often. */
function deploymentChecks(requests: readonly FixtureRequest[]): string[] {
  const urls = requests.filter(isDeploymentCheck).map((request) => request.url);
  return [...new Set(urls)].sort();
}

/**
 * The distinct on-chain reads, decoded where the harness knows the ABI.
 * Encoded the way the fixture was written, so live bigints match recorded.
 */
function chainReads(requests: readonly FixtureRequest[]): string[] {
  const reads = requests
    .filter((request) => request.url.startsWith(RPC_PATH))
    .map((request) =>
      goldenJson(
        request.decoded ?? (request.body as { method?: string })?.method
      )
    );
  return [...new Set(reads)].sort();
}

describe("M3 golden: usePlaceOrder.createOrder", () => {
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(
    (["eoa", "safe", "deposit"] as const).flatMap((mode) =>
      [false, true].map((balancesUpdated) => ({ mode, balancesUpdated }))
    )
  )(
    "$mode wraps once across draft refresh, balances updated: $balancesUpdated",
    async ({ mode, balancesUpdated }) => {
      vi.useFakeTimers({ toFake: ["Date"] });
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
      harness.proxyAddress = WALLETS[mode];
      harness.walletMode = mode;
      let wrapConfirmed = false;
      const staleRpc = rpcRoutes(PERSONALITIES.wrap, chain.rpc);
      const currentRpc = rpcRoutes(PERSONALITIES.approved, chain.rpc);
      const baseRoutes = composeRoutes([
        clobRoutes(markets),
        clobAccountRoutes(PERSONALITIES.wrap),
        (request, url) =>
          (wrapConfirmed && balancesUpdated ? currentRpc : staleRpc)(
            request,
            url
          ),
        relayerProxyRoutes(),
      ]);
      const calls = installFetchCapture((request, url) => {
        const response = baseRoutes(request, url);
        if (
          url.pathname.endsWith("/relayer/transaction") ||
          (url.pathname === RPC_PATH &&
            (request.body as { method?: string })?.method ===
              "eth_getTransactionReceipt")
        ) {
          // Confirm after expiry; the balance endpoint may still lag behind.
          vi.setSystemTime(Date.now() + 60_000);
          wrapConfirmed = true;
        }
        return response;
      }, window.location.origin);
      const { result } = renderHook(() => usePlaceOrder());

      if (balancesUpdated) {
        await act(async () => {
          await expect(
            result.current.createOrder(
              orderCases(markets.plain)["limit-buy-gtc"]
            )
          ).resolves.toMatchObject({ success: true });
        });
      } else {
        await expect(
          act(async () => {
            await result.current.createOrder(
              orderCases(markets.plain)["limit-buy-gtc"]
            );
          })
        ).rejects.toThrow(
          "Collateral balance is still insufficient after wrapping"
        );
      }

      expect(harnessErrors).toEqual([]);
      expect(
        walletLog.filter((entry) => entry.method === "eth_sendTransaction")
      ).toHaveLength(mode === "eoa" ? 2 : 0);
      const transcript = calls.map(
        toFixtureRequest
      ) as unknown as FixtureRequest[];
      expect(
        transcript.filter((request) => request.url === "/api/relayer/submit")
      ).toHaveLength(mode === "eoa" ? 0 : 1);
      expect(transcript.filter(isOrderPost)).toHaveLength(
        balancesUpdated ? 1 : 0
      );
    }
  );

  it.each(["eoa", "safe", "deposit"] as const)(
    "switches to Polygon before %s wraps collateral from another chain",
    async (mode) => {
      const walletLog: WalletRequest[] = [];
      const chain = createChain(walletLog);
      let chainId = "0x1";
      const provider = createFakeProvider(walletLog, {
        eth_chainId: () => chainId,
        wallet_switchEthereumChain: (params) => {
          chainId = "0x89";
          walletLog.push({ method: "wallet_switchEthereumChain", params });
          return null;
        },
        eth_sendTransaction: chain.sendTransaction,
      });
      harness.walletClient = createWalletClient({
        account: THROWAWAY_EOA,
        chain: polygon,
        transport: custom({
          async request(args) {
            if (args.method === "eth_signTypedData_v4" && chainId !== "0x89") {
              throw Object.assign(
                new Error("Typed-data chain does not match wallet chain"),
                { code: 4001 }
              );
            }
            return provider.request(args);
          },
        }),
      });
      harness.proxyAddress = WALLETS[mode];
      harness.walletMode = mode;
      const calls = installFetchCapture(
        composeRoutes([
          clobRoutes(markets),
          clobAccountRoutes(PERSONALITIES.wrap),
          rpcRoutes(PERSONALITIES.wrap, chain.rpc),
          relayerProxyRoutes(),
        ]),
        window.location.origin
      );
      const { result } = renderHook(() => usePlaceOrder());

      await act(async () => {
        await expect(
          result.current.createOrder(orderCases(markets.plain)["limit-buy-gtc"])
        ).resolves.toMatchObject({ success: true });
      });

      expect(harnessErrors).toEqual([]);
      const methods = walletLog.map((entry) => entry.method);
      expect(methods[0]).toBe("wallet_switchEthereumChain");
      expect(
        methods.filter((method) => method === "eth_sendTransaction")
      ).toHaveLength(mode === "eoa" ? 2 : 0);
      expect(
        postedOrder(calls.map(toFixtureRequest) as unknown as FixtureRequest[])
      ).toBeDefined();
    }
  );

  for (const scenario of SCENARIOS) {
    it(`${scenario.label}: ${scenario.cases.join(", ")}`, async () => {
      const fixture = loadFixture(scenario.label);
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
      const { result } = renderHook(() => usePlaceOrder());
      expect(result.current.canTrade).toBe(true);
      const scenarioRequests: FixtureRequest[] = [];

      for (const label of scenario.cases) {
        const params = orderCases(scenario.market)[label];
        const recorded = fixture.cases[label];
        expect(recorded, `${label} is in the fixture`).toBeDefined();
        expect(recorded.params, `${label} fixture params`).toEqual(params);

        let outcome: unknown = null;
        await act(async () => {
          outcome = await result.current.createOrder(params);
        });
        expect(harnessErrors, `${label} harness faults`).toEqual([]);
        expect(outcome, `${label} outcome`).toMatchObject({
          success: true,
          order: { orderId: recorded.result.order.orderId },
        });

        const requests = calls
          .splice(0)
          .map(toFixtureRequest) as unknown as FixtureRequest[];
        scenarioRequests.push(...requests);
        const wallet = walletLog.splice(0);
        // Through the fixture's encoder: a skipped argument records as null.
        const approvals = JSON.parse(
          goldenJson(harness.approveUsdcForTrading.mock.calls.splice(0))
        ) as unknown[][];

        expect(wallet, `${label} wallet prompts`).toEqual(recorded.wallet);
        expect(postedOrder(requests), `${label} POST /order`).toEqual(
          postedOrder(recorded.requests)
        );
        expect(
          refreshesBeforeOrder(requests),
          `${label} balance refreshes before POST /order`
        ).toEqual(refreshesBeforeOrder(recorded.requests));
        expect(
          relayerTransactions(requests),
          `${label} relayer transactions`
        ).toEqual(relayerTransactions(recorded.requests));
        expect(chainReads(requests), `${label} on-chain reads`).toEqual(
          chainReads(recorded.requests)
        );
        expect(approvals, `${label} approvals`).toEqual(recorded.approvals);
      }

      expect(deploymentChecks(scenarioRequests), "deployment checks").toEqual(
        deploymentChecks(
          scenario.cases.flatMap((label) => fixture.cases[label].requests)
        )
      );
    }, 30_000);
  }
});
