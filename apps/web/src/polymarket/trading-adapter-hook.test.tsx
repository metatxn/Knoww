/**
 * M3 chunk 4, hook level: `useTradingAdapter` hands the app the aggregator's
 * trading adapter bound to the connected wallet, and that adapter must sign
 * and post exactly what the pre-migration hook posted. Every `POST /order`
 * it sends is compared with the request pinned by the legacy hook fixtures
 * under apps/web/golden/trading/hook/, so the aggregator path is checked
 * against the recorded path without adding a fixture.
 *
 * Wallet plumbing is faked the same way as in trading-hook-golden.test.tsx:
 * wagmi hands the hook a viem wallet client over a local EIP-1193 provider
 * that signs with the throwaway key, the credential, proxy-wallet and
 * wallet-mode hooks return fixed values, and every HTTP call is answered
 * from recorded responses and captured.
 */

import { readFileSync } from "node:fs";
import {
  buildCanonicalId,
  type CanonicalOrderIntent,
  type WalletIdentity,
} from "@knoww/services/core";
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
  goldenPath,
  installFetchCapture,
  loadRecordedMarkets,
  pinEntropy,
  RECORDED_ORDER_ID,
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
    isConnected: true,
    isLoading: false,
    error: null,
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

vi.mock("@/hooks/use-trading-wallet-mode", () => ({
  useTradingWalletMode: () => ({ mode: harness.walletMode }),
}));

import { useTradingAdapter } from "@/hooks/use-trading-adapter";

const markets = loadRecordedMarkets();

const approvedRoutes = composeRoutes([
  clobRoutes(markets),
  clobAccountRoutes(PERSONALITIES.approved),
  rpcRoutes(PERSONALITIES.approved),
  relayerProxyRoutes(),
]);

type OrderShape = Pick<
  CanonicalOrderIntent,
  "side" | "orderType" | "timeInForce" | "price" | "quantity"
>;

/** The legacy hook's four recorded cases, as canonical intents. */
const ORDER_CASES: Record<string, OrderShape> = {
  "limit-buy-gtc": {
    side: "buy",
    orderType: "limit",
    timeInForce: "gtc",
    price: "0.5",
    quantity: { kind: "shares", value: "10" },
  },
  "market-buy-fak": {
    side: "buy",
    orderType: "market",
    timeInForce: "ioc",
    quantity: { kind: "notional", amount: { value: "25", unit: "USD" } },
  },
  "limit-sell-gtc": {
    side: "sell",
    orderType: "limit",
    timeInForce: "gtc",
    price: "0.62",
    quantity: { kind: "shares", value: "7.5" },
  },
  "market-sell-fok": {
    side: "sell",
    orderType: "market",
    timeInForce: "fok",
    price: "0.4",
    quantity: { kind: "shares", value: "12" },
  },
};

const ACCOUNT_TYPES = {
  eoa: "eoa",
  safe: "safe",
  deposit: "deposit_wallet",
} as const;

function expectedIdentity(mode: WalletMode): WalletIdentity {
  const base = {
    kind: "wallet",
    platform: "polymarket",
    address: THROWAWAY_EOA,
    accountType: ACCOUNT_TYPES[mode],
  } as const;
  return mode === "eoa" ? base : { ...base, tradingAddress: WALLETS[mode] };
}

function intentFor(
  market: RecordedMarket,
  order: OrderShape,
  identity: WalletIdentity
): CanonicalOrderIntent {
  return {
    schemaVersion: "1",
    platform: "polymarket",
    identity,
    marketId: buildCanonicalId("polymarket", market.conditionId),
    outcomeId: buildCanonicalId("polymarket", market.tokenId),
    ...order,
  };
}

interface FixtureRequest {
  method: string;
  url: string;
  [key: string]: unknown;
}

function postedOrder(
  requests: readonly FixtureRequest[]
): FixtureRequest | undefined {
  return requests.find(
    (request) => request.method === "POST" && request.url.endsWith("/order")
  );
}

/** The transcript the legacy hook fixture recorded for one scenario and case. */
function recordedHookRequests(
  label: string,
  caseLabel: string
): FixtureRequest[] {
  const fixture = JSON.parse(
    readFileSync(goldenPath("hook", `${label}.json`), "utf8")
  ) as { cases: Record<string, { requests: FixtureRequest[] }> };
  return fixture.cases[caseLabel].requests;
}

/** The request the legacy hook fixture pinned for one scenario and case. */
function pinnedOrder(label: string, caseLabel: string): FixtureRequest {
  const posted = postedOrder(recordedHookRequests(label, caseLabel));
  if (!posted) {
    throw new Error(
      `hook fixture ${label} has no POST /order for ${caseLabel}`
    );
  }
  return posted;
}

/**
 * The CLOB balance-cache refreshes a transcript issued before it posted the
 * order, deduplicated and sorted. The legacy hook refreshed the collateral
 * and conditional caches right before every POST /order so the V2 server
 * validated against fresh balances; the adapter path must keep doing so, or
 * orders fail with a misleading 400.
 */
function balanceRefreshUrls(requests: readonly FixtureRequest[]): string[] {
  const urls = new Set<string>();
  for (const request of requests) {
    if (request.method === "POST" && request.url.endsWith("/order")) break;
    if (
      request.method === "GET" &&
      request.url.includes("/balance-allowance/update?")
    ) {
      urls.add(request.url);
    }
  }
  return [...urls].sort();
}

/** The balance refreshes the legacy hook fixture issued before its POST. */
function pinnedBalanceRefreshes(label: string, caseLabel: string): string[] {
  return balanceRefreshUrls(recordedHookRequests(label, caseLabel));
}

function mountWallet(mode: WalletMode): WalletRequest[] {
  const walletLog: WalletRequest[] = [];
  harness.walletClient = createWalletClient({
    account: THROWAWAY_EOA,
    chain: polygon,
    transport: custom(createFakeProvider(walletLog)),
  });
  harness.proxyAddress = WALLETS[mode];
  harness.walletMode = mode;
  return walletLog;
}

describe("useTradingAdapter", () => {
  beforeAll(() => {
    // The builder code is a deployment setting; the fixtures pin the bare flow.
    delete process.env.NEXT_PUBLIC_POLY_BUILDER_CODE;
  });

  beforeEach(() => {
    pinEntropy();
    harness.eoa = THROWAWAY_EOA;
    harness.credentials = { ...FAKE_CLOB_CREDENTIALS };
    harnessErrors.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  for (const mode of ["eoa", "safe", "deposit"] as const) {
    for (const market of Object.values(markets)) {
      const label = `${mode}.${market.kind}`;
      it(`${label}: posts the orders the legacy hook posted`, async () => {
        mountWallet(mode);
        const calls = installFetchCapture(
          approvedRoutes,
          window.location.origin
        );

        const { result } = renderHook(() => useTradingAdapter("polymarket"));
        const identity = result.current.identity;
        expect(identity).toEqual(expectedIdentity(mode));
        expect(result.current.isReady).toBe(true);
        if (!identity) throw new Error("unreachable");

        for (const [caseLabel, order] of Object.entries(ORDER_CASES)) {
          let outcome: unknown;
          await act(async () => {
            const adapter = await result.current.getAdapter();
            const draft = await adapter.previewOrder(
              intentFor(market, order, identity)
            );
            outcome = await adapter.placeOrder({
              draftId: draft.draftId,
              idempotencyKey: `hook-${label}-${caseLabel}`,
            });
          });
          expect(harnessErrors, `${caseLabel} harness faults`).toEqual([]);
          expect(outcome, `${caseLabel} outcome`).toMatchObject({
            platform: "polymarket",
            orderId: RECORDED_ORDER_ID,
          });
          const transcript = calls
            .splice(0)
            .map(toFixtureRequest) as FixtureRequest[];
          expect(postedOrder(transcript), `${caseLabel} posted order`).toEqual(
            pinnedOrder(label, caseLabel)
          );
          expect(
            balanceRefreshUrls(transcript),
            `${caseLabel} balance refresh before POST /order`
          ).toEqual(pinnedBalanceRefreshes(label, caseLabel));
        }
      }, 30_000);
    }
  }

  it("is not ready and refuses an adapter without credentials", async () => {
    mountWallet("eoa");
    harness.credentials = null;
    installFetchCapture(approvedRoutes, window.location.origin);

    const { result } = renderHook(() => useTradingAdapter("polymarket"));
    expect(result.current.identity).toEqual(expectedIdentity("eoa"));
    expect(result.current.isReady).toBe(false);
    await expect(result.current.getAdapter()).rejects.toThrow(/credentials/i);
  });

  it.each([false, true])(
    "keeps reads passive when the wallet would reject a chain switch: %s",
    async (rejectSwitch) => {
      mountWallet("eoa");
      const provider = createFakeProvider([]);
      const requests: string[] = [];
      let chainId = "0x1";
      harness.walletClient = createWalletClient({
        account: THROWAWAY_EOA,
        chain: polygon,
        transport: custom({
          async request(args) {
            requests.push(args.method);
            if (args.method === "eth_chainId") return chainId;
            if (args.method === "wallet_switchEthereumChain") {
              if (rejectSwitch) throw new Error("User rejected chain switch");
              chainId = "0x89";
              return null;
            }
            return provider.request(args);
          },
        }),
      });
      const calls = installFetchCapture(approvedRoutes, window.location.origin);
      const { result } = renderHook(() => useTradingAdapter("polymarket"));
      const adapter = await result.current.getAdapter();
      const identity = expectedIdentity("eoa");

      await adapter.getAccountOrders({ identity });
      await adapter.getAccountOrders({ identity });
      expect(requests).toEqual([]);

      const draft = await adapter.previewOrder(
        intentFor(markets.plain, ORDER_CASES["limit-buy-gtc"], identity)
      );
      expect(requests).toEqual([]);
      const placement = adapter.placeOrder({
        draftId: draft.draftId,
        idempotencyKey: "switch-on-placement",
      });
      if (rejectSwitch) {
        await expect(placement).rejects.toThrow();
        expect(
          postedOrder(calls.map(toFixtureRequest) as FixtureRequest[])
        ).toBeUndefined();
      } else {
        await expect(placement).resolves.toMatchObject({
          orderId: RECORDED_ORDER_ID,
        });
        expect(requests.indexOf("wallet_switchEthereumChain")).toBeLessThan(
          requests.indexOf("eth_signTypedData_v4")
        );
      }
      expect(requests).toContain("wallet_switchEthereumChain");
    }
  );

  it("is not ready and refuses an adapter without a wallet", async () => {
    harness.eoa = "";
    harness.walletClient = null;
    harness.proxyAddress = "";
    harness.walletMode = "eoa";
    installFetchCapture(approvedRoutes, window.location.origin);

    const { result } = renderHook(() => useTradingAdapter("polymarket"));
    expect(result.current.identity).toBeNull();
    expect(result.current.isReady).toBe(false);
    await expect(result.current.getAdapter()).rejects.toThrow(/wallet/i);
  });

  it("uses the connected address for passive reads when the client has no account", async () => {
    mountWallet("eoa");
    const request = vi.fn(async () => {
      throw new Error("Passive read requested the wallet");
    });
    harness.walletClient = createWalletClient({
      chain: polygon,
      transport: custom({ request }),
    });
    installFetchCapture(approvedRoutes, window.location.origin);
    const { result } = renderHook(() => useTradingAdapter("polymarket"));

    const adapter = await result.current.getAdapter();
    await expect(
      adapter.getAccountOrders({ identity: expectedIdentity("eoa") })
    ).resolves.toBeDefined();
    expect(request).not.toHaveBeenCalled();
  });
});
