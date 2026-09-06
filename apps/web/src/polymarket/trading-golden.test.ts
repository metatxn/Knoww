/**
 * M3 golden harness, library level: signed CLOB orders and auth headers.
 *
 * Drives the real Polymarket trading driver (`@knoww/shared-types` over
 * `@polymarket/client`) exactly as the app does, for every account type the
 * app can trade from, and pins the bytes that would reach Polymarket: the
 * signed order bodies, the L2 auth headers and the L1 auth headers. The
 * fixtures under apps/web/golden/trading/ were recorded on the pre-migration
 * code and must stay byte-identical once trading sits behind the aggregator.
 *
 * Nothing here reaches the network. The key is Hardhat's public account #1.
 */
import {
  buildClobAuthViemTypedData,
  buildClobL1Headers,
} from "@knoww/shared-types/polymarket";
import {
  adaptUnifiedSecureClientForLegacyClob,
  createUnifiedPolymarketSecureClient,
  createUnifiedPolymarketViemSigner,
  type UnifiedSdkTradingClient,
} from "@knoww/shared-types/polymarket-unified";
import {
  derivePolymarketDepositWallet,
  derivePolymarketSafe,
} from "@knoww/shared-types/relayer";
import { type Address, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CapturedRequest,
  clobRoutes,
  FAKE_CLOB_CREDENTIALS,
  FIXED_NOW_SECONDS,
  goldenJson,
  goldenPath,
  installFetchCapture,
  loadRecordedMarkets,
  pinEntropy,
  THROWAWAY_EOA,
  THROWAWAY_PRIVATE_KEY,
} from "./trading-golden.support";

const account = privateKeyToAccount(THROWAWAY_PRIVATE_KEY);
const markets = loadRecordedMarkets();

/**
 * Every account type the app trades from. The signature type is what the
 * CLOB expects for that wallet kind (0 EOA, 2 Gnosis Safe, 3 ERC-1271
 * deposit wallet), so the harness fails loudly if the SDK ever resolves a
 * wallet differently.
 */
const ACCOUNT_MODES = {
  eoa: { wallet: THROWAWAY_EOA as Address, signatureType: 0 },
  safe: { wallet: derivePolymarketSafe(THROWAWAY_EOA), signatureType: 2 },
  deposit: {
    wallet: derivePolymarketDepositWallet(THROWAWAY_EOA),
    signatureType: 3,
  },
} as const;

async function openLegacyClient(wallet: Address) {
  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http("http://127.0.0.1:1"),
  });
  const signer = createUnifiedPolymarketViemSigner(walletClient);
  const { client } = await createUnifiedPolymarketSecureClient({
    signer,
    wallet,
    credentials: FAKE_CLOB_CREDENTIALS,
  });
  // The read-only client narrows the same way (src/polymarket/read-only-client.ts).
  return adaptUnifiedSecureClientForLegacyClob(
    client as unknown as UnifiedSdkTradingClient,
    { builderCode: undefined }
  );
}

type LegacyClient = Awaited<ReturnType<typeof openLegacyClient>>;

interface OrderCase {
  label: string;
  orderType: "GTC" | "GTD" | "FAK" | "FOK";
  build: (client: LegacyClient, tokenId: string) => Promise<unknown>;
}

const ORDER_CASES: readonly OrderCase[] = [
  {
    label: "limit-buy-gtc",
    orderType: "GTC",
    build: (client, tokenId) =>
      client.createOrder({
        tokenId,
        side: "BUY",
        price: 0.5,
        size: 10,
        expiration: 0,
      }),
  },
  {
    label: "limit-sell-gtd",
    orderType: "GTD",
    build: (client, tokenId) =>
      client.createOrder({
        tokenId,
        side: "SELL",
        price: 0.62,
        size: 7.5,
        expiration: FIXED_NOW_SECONDS + 86_400,
      }),
  },
  {
    // No price bound, so the SDK walks the recorded book for the price.
    label: "market-buy-fak-book-walk",
    orderType: "FAK",
    build: (client, tokenId) =>
      client.createMarketOrder({
        tokenId,
        side: "BUY",
        amount: 25,
        orderType: "FAK",
      }),
  },
  {
    label: "market-sell-fok-min-price",
    orderType: "FOK",
    build: (client, tokenId) =>
      client.createMarketOrder({
        tokenId,
        side: "SELL",
        amount: 12,
        orderType: "FOK",
        price: 0.4,
      }),
  },
];

function postedOrderBody(requests: CapturedRequest[]) {
  const post = requests.find(
    (request) => request.method === "POST" && request.url.endsWith("/order")
  );
  return (post?.body as { order?: Record<string, unknown> } | null)?.order;
}

describe("M3 golden: signed CLOB orders", () => {
  beforeEach(() => {
    pinEntropy();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("derives the same Safe and deposit wallet as the SDK does", () => {
    expect(ACCOUNT_MODES.safe.wallet).toBe(
      "0x8ac5D4Bd2752AFc9F5CA531f19D617647216B893"
    );
    expect(ACCOUNT_MODES.deposit.wallet).toBe(
      "0x4Fe2CC4925607a473264FA89e7138075695A5F8e"
    );
  });

  for (const [mode, { wallet, signatureType }] of Object.entries(
    ACCOUNT_MODES
  )) {
    for (const market of Object.values(markets)) {
      it(`${mode} account on the ${market.kind} market`, async () => {
        const calls = installFetchCapture(clobRoutes(markets));
        const client = await openLegacyClient(wallet);
        const setup = calls.splice(0);

        const cases: Record<string, unknown> = {};
        for (const orderCase of ORDER_CASES) {
          const order = await orderCase.build(client, market.tokenId);
          const posted = await client.postOrder(order, orderCase.orderType);
          const requests = calls.splice(0);
          expect(postedOrderBody(requests)?.signatureType).toBe(signatureType);
          cases[orderCase.label] = { requests, posted };
        }

        await expect(
          goldenJson({ mode, market: market.kind, wallet, setup, cases })
        ).toMatchFileSnapshot(
          goldenPath("orders", `${mode}.${market.kind}.json`)
        );
      });
    }
  }
});

describe("M3 golden: CLOB L1 auth", () => {
  it("pins the auth typed data, its signature and the L1 headers", async () => {
    const auth = buildClobAuthViemTypedData({
      address: THROWAWAY_EOA,
      timestamp: FIXED_NOW_SECONDS,
      nonce: 0,
    });
    const signature = await account.signTypedData(auth.typedData);
    const headers = buildClobL1Headers({
      address: THROWAWAY_EOA,
      signature,
      timestamp: auth.timestamp,
      nonce: auth.nonce,
    });

    await expect(
      goldenJson({ typedData: auth.typedData, signature, headers })
    ).toMatchFileSnapshot(goldenPath("auth", "clob-l1.json"));
  });
});
