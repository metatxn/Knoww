import {
  type ApiKeyCreds,
  assertClobPostOrderSuccess,
  CLOB_ASSET_TYPES,
  CLOB_ORDER_TYPES,
  type ClobOrderType,
  syncClobBalanceAllowance,
  TRADING_SIDES,
  type TradingSide,
} from "@knoww/shared-types/polymarket";
import {
  adaptUnifiedSecureClientForLegacyClob,
  createUnifiedPolymarketSecureClient,
  type createUnifiedPolymarketViemSigner,
  fetchUnifiedClobBuilderFeeRates,
  type LegacyClobCompatibleClient,
  type UnifiedSdkTradingClient,
} from "@knoww/shared-types/polymarket-unified";
import {
  derivePolymarketDepositWallet,
  derivePolymarketSafe,
} from "@knoww/shared-types/relayer";
import {
  buildClobOrderPreflightPlan,
  type ClobOrderPreflightPlan,
} from "@knoww/shared-types/trading";
import Decimal from "decimal.js";
import { z } from "zod";
import {
  type AccountActivity,
  type AccountActivityKind,
  type AccountActivityPage,
  type AccountOrder,
  type AccountOrderPage,
  type AccountPosition,
  type AccountPositions,
  type AccountReadInput,
  assertDraftPlaceable,
  buildCanonicalId,
  type CanonicalOrderIntent,
  type ConnectionStatusInput,
  cancelOrderInputSchema,
  hashOrderIntent,
  isInvalidCanonicalIdError,
  isPlatformError,
  type MarketStatus,
  type OrderDraft,
  type OrderEligibility,
  type OrderResult,
  type OrderStatus,
  orderIntentSchema,
  orderNotional,
  type PlatformConnectionStatus,
  type PlatformError,
  type PlatformIdentity,
  type PlatformOperation,
  parseCanonicalId,
  placeDraftInputSchema,
  platformError,
  type TimeInForce,
  type TradingAdapter,
  type WalletAccountType,
} from "../../core";
import { type PolymarketClientInit, resolvePolymarketBaseUrls } from "./client";
import { type ClobMarketRecord, createClobMarket } from "./clob-market";
import { createClobOrderbook } from "./clob-orderbook";
import { createPolymarketClientContext } from "./context";
import { isUpstreamError } from "./errors";
import { createProfiles } from "./profiles";
import { createPublicData } from "./public-data";
import { POLYMARKET_REGION_POLICY } from "./region-policy";

/**
 * Polymarket behind the canonical `TradingAdapter`.
 *
 * The adapter wraps the `@knoww/shared-types` CLOB driver and walks the same
 * path the pre-migration web hook walked for an order: read the CLOB market,
 * build the preflight plan, sync the server-side balance cache, sign, resync,
 * post. That order matters: the golden fixtures under
 * apps/web/golden/trading pin the bytes each step produces.
 *
 * Signing happens in-process through the bound signer. The adapter never
 * holds a key, never derives credentials, and never sends an on-chain
 * transaction: approvals, pUSD wrapping, proxy-wallet deployment and the
 * relayer stay in the web app's on-chain port.
 */

const PLATFORM = "polymarket" as const;
const DEFAULT_DRAFT_TTL_MS = 30_000;
const MAX_STORED_DRAFTS = 256;
/** Rows per Data API page when the caller gives no `limit`. */
const DEFAULT_READ_LIMIT = 100;
/** Collateral (pUSD) raw units per dollar. */
const COLLATERAL_DECIMALS = 6;
/** Same ladder as the web hook: the CLOB cache lags the chain by seconds. */
const CLOB_BALANCE_SYNC_DELAYS_MS = [0, 250, 750, 1500, 2500] as const;
const SHARES_NOT_INDEXED_MESSAGE =
  "Polymarket has not indexed these shares for trading yet. Please try again in a few seconds.";

export type PolymarketTradingSigner = ReturnType<
  typeof createUnifiedPolymarketViemSigner
>;

export interface PolymarketTradingAdapterInit extends PolymarketClientInit {
  /**
   * Signs orders for `identity.address`. Without it the adapter answers
   * reads and previews but every write fails with `unauthenticated`.
   */
  signer?: PolymarketTradingSigner;
  /** L2 CLOB credentials for the signer's address. */
  credentials?: ApiKeyCreds;
  /** Builder code charged as the builder fee on fills. */
  builderCode?: string;
  now?: () => Date;
  /** How long a draft stays placeable. Default 30 seconds. */
  draftTtlMs?: number;
  /** Test seam for the balance-sync ladder. */
  sleep?: (ms: number) => Promise<void>;
}

export interface PolymarketTradingAdapter extends TradingAdapter {
  readonly platform: typeof PLATFORM;
}

type EvmAddress = `0x${string}`;

const SIGNATURE_TYPES: Record<WalletAccountType, 0 | 2 | 3> = {
  eoa: 0,
  safe: 2,
  deposit_wallet: 3,
};

interface TradingAccount {
  address: EvmAddress;
  tradingAddress: EvmAddress;
  accountType: WalletAccountType;
  signatureType: 0 | 2 | 3;
}

/** The CLOB facts a draft was previewed against; place re-checks them. */
interface MarketSnapshot {
  conditionId: string;
  tokenId: string;
  status: MarketStatus;
  tickSize?: string;
  minSize?: string;
  negRisk: boolean;
}

interface OpenOrdersRequest {
  market?: string;
  cursor?: string;
}

interface OpenOrdersPage {
  items?: unknown[];
  data?: unknown[];
  nextCursor?: string | null;
}

/**
 * The slice of the unified SDK client the order reads need. The legacy
 * adapter's `getOpenOrders` drops the `market` field, so the reads go to the
 * SDK paginator directly.
 */
interface OpenOrdersClient {
  listOpenOrders?(
    request?: OpenOrdersRequest
  ): AsyncIterable<OpenOrdersPage> & { firstPage?(): Promise<OpenOrdersPage> };
}

interface BoundClients {
  legacy: LegacyClobCompatibleClient;
  orders: OpenOrdersClient;
}

const numericText = z
  .union([z.string(), z.number()])
  .transform((value) => new Decimal(value).toString());

const timestampText = z.union([z.string(), z.number()]);

/**
 * An open order as the unified SDK maps it: camelCase, `createdAt` as an
 * ISO string, the token under both `assetId` and `tokenId`.
 */
const openOrderSchema = z
  .object({
    id: z.string(),
    conditionId: z.string(),
    assetId: z.string().optional(),
    tokenId: z.string().optional(),
    side: z.string(),
    price: numericText,
    originalSize: numericText,
    sizeMatched: numericText,
    status: z.string(),
    orderType: z.string(),
    createdAt: timestampText,
    expiresAt: timestampText.optional(),
    expiration: timestampText.optional(),
    owner: z.string().optional(),
    makerAddress: z.string().optional(),
    outcome: z.string().optional(),
  })
  .passthrough();

const cancelResponseSchema = z
  .object({
    canceled: z.array(z.string()).default([]),
    not_canceled: z.record(z.string(), z.string()).optional(),
    notCanceled: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

const TIME_IN_FORCE_OF_CLOB: Record<string, TimeInForce> = {
  GTC: "gtc",
  GTD: "gtd",
  FOK: "fok",
  FAK: "ioc",
};

const ACTIVITY_KINDS: Record<string, AccountActivityKind> = {
  TRADE: "trade",
  SPLIT: "split",
  MERGE: "merge",
  REDEEM: "redeem",
};

interface StoredDraft {
  draft: OrderDraft;
  market: MarketSnapshot;
  plan: ClobOrderPreflightPlan;
  account: TradingAccount;
}

/** The unified SDK answers `orderId`; the raw CLOB answers `orderID`. */
const postOrderResponseSchema = z
  .object({
    orderId: z.string().optional(),
    orderID: z.string().optional(),
    status: z.string().optional(),
    transactionsHashes: z.array(z.string()).optional(),
  })
  .passthrough();

const balanceAllowanceSchema = z
  .object({
    balance: z.union([z.string(), z.number(), z.bigint()]).optional(),
  })
  .passthrough();

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function toPlatformError(error: unknown, operation: PlatformOperation) {
  if (isPlatformError(error)) {
    return error;
  }
  if (isInvalidCanonicalIdError(error)) {
    return platformError(error.message, {
      platform: PLATFORM,
      operation,
      kind: "invalid_input",
      cause: error,
    });
  }
  if (isAbortError(error)) {
    return platformError(`Polymarket ${operation} timed out`, {
      platform: PLATFORM,
      operation,
      kind: "timeout",
      cause: error,
    });
  }
  if (isUpstreamError(error)) {
    return platformError(error.message, {
      platform: PLATFORM,
      operation,
      kind: "upstream",
      upstreamStatus: error.status,
      cause: error,
    });
  }
  return platformError(
    error instanceof Error ? error.message : `Polymarket ${operation} failed`,
    { platform: PLATFORM, operation, kind: "upstream", cause: error }
  );
}

async function run<T>(
  operation: PlatformOperation,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toPlatformError(error, operation);
  }
}

function fail(
  operation: PlatformOperation,
  kind: PlatformError["kind"],
  message: string
): PlatformError {
  return platformError(message, { platform: PLATFORM, operation, kind });
}

function decimalText(value: string | number): string;
function decimalText(value: string | number | undefined): string | undefined;
function decimalText(value: string | number | undefined): string | undefined {
  return value === undefined ? undefined : new Decimal(value).toFixed();
}

function rawToDollars(raw: bigint): string {
  return new Decimal(raw.toString())
    .div(new Decimal(10).pow(COLLATERAL_DECIMALS))
    .toFixed();
}

function toRawUnits(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return BigInt(0);
}

function tradingSide(intent: CanonicalOrderIntent): TradingSide {
  return intent.side === "buy" ? TRADING_SIDES.BUY : TRADING_SIDES.SELL;
}

/** limit+gtc → GTC, limit+gtd → GTD, market+fok → FOK, market+ioc → FAK. */
function clobOrderType(intent: CanonicalOrderIntent): ClobOrderType {
  if (intent.orderType === "limit") {
    return intent.timeInForce === "gtd"
      ? CLOB_ORDER_TYPES.GTD
      : CLOB_ORDER_TYPES.GTC;
  }
  return intent.timeInForce === "fok"
    ? CLOB_ORDER_TYPES.FOK
    : CLOB_ORDER_TYPES.FAK;
}

function sharesOf(intent: CanonicalOrderIntent): string | undefined {
  return intent.quantity.kind === "shares" ? intent.quantity.value : undefined;
}

function notionalOf(intent: CanonicalOrderIntent): string | undefined {
  return intent.quantity.kind === "notional"
    ? intent.quantity.amount.value
    : undefined;
}

function marketStatusOf(record: ClobMarketRecord): MarketStatus {
  if (record.tokens.some((token) => token.winner === true)) {
    return "resolved";
  }
  if (record.closed === true || record.archived === true) {
    return "closed";
  }
  if (record.active === false) {
    return "unopened";
  }
  if (record.accepting_orders === false || record.enable_order_book === false) {
    return "paused";
  }
  if (record.active === true && record.accepting_orders === true) {
    return "active";
  }
  return "unknown";
}

function snapshotOf(record: ClobMarketRecord, tokenId: string): MarketSnapshot {
  return {
    conditionId: record.condition_id,
    tokenId,
    status: marketStatusOf(record),
    tickSize: decimalText(record.minimum_tick_size),
    minSize: decimalText(record.minimum_order_size),
    negRisk: record.neg_risk === true,
  };
}

function eligibilityOf(
  intent: CanonicalOrderIntent,
  market: MarketSnapshot
): OrderEligibility {
  const reasons: string[] = [];
  if (market.status !== "active") {
    reasons.push("market_not_active");
  }
  if (
    intent.price !== undefined &&
    market.tickSize !== undefined &&
    !new Decimal(intent.price).mod(market.tickSize).isZero()
  ) {
    reasons.push("off_tick");
  }
  const shares = sharesOf(intent);
  if (
    shares !== undefined &&
    market.minSize !== undefined &&
    new Decimal(shares).lt(market.minSize)
  ) {
    reasons.push("below_min_size");
  }
  return { eligible: reasons.length === 0, reasons };
}

/** What the CLOB may have changed under a draft between preview and place. */
function draftDrift(before: MarketSnapshot, after: MarketSnapshot): string[] {
  const drift: string[] = [];
  if (before.status !== after.status) drift.push("status");
  if (before.tickSize !== after.tickSize) drift.push("tickSize");
  if (before.minSize !== after.minSize) drift.push("minSize");
  if (before.negRisk !== after.negRisk) drift.push("negRisk");
  return drift;
}

function orderStatusOf(posted: string | undefined): OrderStatus {
  switch (posted) {
    case "matched":
      return "filled";
    case "delayed":
      return "pending";
    default:
      return "open";
  }
}

function openOrderStatusOf(status: string, sizeMatched: string): OrderStatus {
  switch (status.toUpperCase()) {
    case "MATCHED":
      return "filled";
    case "CANCELED":
    case "CANCELLED":
      return "cancelled";
    case "DELAYED":
      return "pending";
    default:
      return new Decimal(sizeMatched).gt(0) ? "partially_filled" : "open";
  }
}

/** Seconds or an ISO string to ISO; zero and blanks mean "none". */
function isoTimeOf(value: string | number | undefined): string | undefined {
  if (value === undefined || value === "" || value === 0 || value === "0") {
    return undefined;
  }
  const date =
    typeof value === "number" || /^\d+$/.test(value)
      ? new Date(Number(value) * 1000)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function accountOrderOf(raw: unknown): AccountOrder {
  const order = openOrderSchema.parse(raw);
  const tokenId = order.assetId ?? order.tokenId;
  if (!tokenId) {
    throw new Error(`Polymarket open order ${order.id} names no token`);
  }
  const clobOrderType = order.orderType.toUpperCase();
  const createdAt = isoTimeOf(order.createdAt);
  if (!createdAt) {
    throw new Error(`Polymarket open order ${order.id} has no creation time`);
  }
  const expiresAt = isoTimeOf(order.expiresAt ?? order.expiration);
  return {
    orderId: order.id,
    platform: PLATFORM,
    marketId: buildCanonicalId(PLATFORM, order.conditionId),
    outcomeId: buildCanonicalId(PLATFORM, tokenId),
    side: order.side.toUpperCase() === "SELL" ? "sell" : "buy",
    orderType:
      clobOrderType === "FOK" || clobOrderType === "FAK" ? "market" : "limit",
    timeInForce: TIME_IN_FORCE_OF_CLOB[clobOrderType] ?? "gtc",
    price: order.price,
    quantity: { kind: "shares", value: order.originalSize },
    filled: order.sizeMatched,
    status: openOrderStatusOf(order.status, order.sizeMatched),
    createdAt,
    ...(expiresAt ? { expiresAt } : {}),
    platformDetails: {
      platform: PLATFORM,
      outcome: order.outcome,
      owner: order.owner,
      makerAddress: order.makerAddress,
      clobStatus: order.status,
      clobOrderType: order.orderType,
    },
  };
}

type DataApiPosition = Awaited<
  ReturnType<ReturnType<typeof createProfiles>["fetchWalletPositions"]>
>[number];
type DataApiActivity = Awaited<
  ReturnType<ReturnType<typeof createProfiles>["fetchWalletActivity"]>
>[number];

function accountPositionOf(row: DataApiPosition): AccountPosition {
  return {
    platform: PLATFORM,
    marketId: buildCanonicalId(PLATFORM, row.conditionId),
    outcomeId: buildCanonicalId(PLATFORM, row.asset),
    size: decimalText(row.size),
    averagePrice: decimalText(row.avgPrice),
    currentPrice: decimalText(row.curPrice),
    value: { value: decimalText(row.currentValue), unit: "USD" },
    unrealizedPnl: { value: decimalText(row.cashPnl), unit: "USD" },
    platformDetails: {
      platform: PLATFORM,
      title: row.title,
      outcome: row.outcome,
      outcomeIndex: row.outcomeIndex,
      redeemable: row.redeemable,
      mergeable: row.mergeable,
      negRisk: row.negativeRisk,
      endDate: row.endDate,
      slug: row.slug,
      eventSlug: row.eventSlug,
    },
  };
}

function accountActivityOf(row: DataApiActivity): AccountActivity {
  const side = row.side?.toUpperCase();
  return {
    id: [row.transactionHash, row.timestamp, row.asset, row.side]
      .filter((part) => part !== undefined && part !== "")
      .join(":"),
    platform: PLATFORM,
    kind: ACTIVITY_KINDS[row.type.toUpperCase()] ?? "other",
    time: new Date(row.timestamp * 1000).toISOString(),
    marketId: row.conditionId
      ? buildCanonicalId(PLATFORM, row.conditionId)
      : undefined,
    outcomeId: row.asset ? buildCanonicalId(PLATFORM, row.asset) : undefined,
    side: side === "BUY" ? "buy" : side === "SELL" ? "sell" : undefined,
    price: row.price === undefined ? undefined : decimalText(row.price),
    size: row.size === undefined ? undefined : decimalText(row.size),
    amount:
      row.usdcSize === undefined
        ? undefined
        : { value: decimalText(row.usdcSize), unit: "USD" },
    platformDetails: {
      platform: PLATFORM,
      type: row.type,
      transactionHash: row.transactionHash,
      title: row.title,
      outcome: row.outcome,
      outcomeIndex: row.outcomeIndex,
      slug: row.slug,
      eventSlug: row.eventSlug,
    },
  };
}

async function firstPageOf(
  paginator: AsyncIterable<OpenOrdersPage> & {
    firstPage?(): Promise<OpenOrdersPage>;
  }
): Promise<OpenOrdersPage> {
  if (paginator.firstPage) return paginator.firstPage();
  const first = await paginator[Symbol.asyncIterator]().next();
  return first.done ? {} : first.value;
}

export function createPolymarketTradingAdapter(
  init: PolymarketTradingAdapterInit = {}
): PolymarketTradingAdapter {
  const now = init.now ?? (() => new Date());
  const sleep =
    init.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const draftTtlMs = init.draftTtlMs ?? DEFAULT_DRAFT_TTL_MS;
  const baseUrls = resolvePolymarketBaseUrls(init.baseUrls);
  const ctx = createPolymarketClientContext({
    baseUrls,
    fetchImpl: init.fetchImpl,
  });
  const clobMarket = createClobMarket(ctx);
  const clobOrderbook = createClobOrderbook(ctx);
  const profiles = createProfiles(ctx, createPublicData(ctx));

  const clients = new Map<string, Promise<BoundClients>>();
  /**
   * Read-only clients for passive polling. The SDK asks the signer for a
   * fresh L1 signature when the bound credentials are rejected; a background
   * list must never open a wallet prompt, so these clients refuse that and
   * surface the shim's fresh-authentication error instead.
   */
  const readClients = new Map<string, Promise<OpenOrdersClient>>();
  const drafts = new Map<string, StoredDraft>();
  /** One result per idempotency key, failures included. */
  const placements = new Map<string, Promise<OrderResult>>();
  const cancellations = new Map<string, Promise<OrderResult>>();

  function resolveTradingAccount(
    identity: PlatformIdentity,
    operation: PlatformOperation
  ): TradingAccount {
    if (identity.platform !== PLATFORM) {
      throw fail(
        operation,
        "invalid_input",
        `Identity is for ${identity.platform}, not Polymarket`
      );
    }
    if (identity.kind !== "wallet") {
      throw fail(
        operation,
        "unsupported",
        "Polymarket trades from a wallet identity"
      );
    }
    const address = identity.address as EvmAddress;
    const explicit = identity.tradingAddress as EvmAddress | undefined;
    const derived: EvmAddress =
      identity.accountType === "safe"
        ? derivePolymarketSafe(address)
        : identity.accountType === "deposit_wallet"
          ? derivePolymarketDepositWallet(address)
          : address;
    return {
      address,
      tradingAddress: explicit ?? derived,
      accountType: identity.accountType,
      signatureType: SIGNATURE_TYPES[identity.accountType],
    };
  }

  async function assertSignerFor(
    account: TradingAccount,
    operation: PlatformOperation
  ): Promise<PolymarketTradingSigner> {
    const { signer, credentials } = init;
    if (!signer) {
      throw fail(operation, "unauthenticated", "No signer is bound");
    }
    if (!credentials) {
      throw fail(
        operation,
        "unauthenticated",
        "No Polymarket API credentials are bound"
      );
    }
    const signerAddress = await signer.getAddress();
    if (signerAddress.toLowerCase() !== account.address.toLowerCase()) {
      throw fail(
        operation,
        "unauthenticated",
        "The bound signer does not control identity.address"
      );
    }
    return signer;
  }

  async function boundClients(
    account: TradingAccount,
    operation: PlatformOperation
  ): Promise<BoundClients> {
    const signer = await assertSignerFor(account, operation);
    const key = account.tradingAddress.toLowerCase();
    let pending = clients.get(key);
    if (!pending) {
      pending = createUnifiedPolymarketSecureClient({
        signer,
        wallet: account.tradingAddress,
        credentials: init.credentials,
      }).then(({ client }) => ({
        legacy: adaptUnifiedSecureClientForLegacyClob(
          client as unknown as UnifiedSdkTradingClient,
          { builderCode: init.builderCode }
        ),
        orders: client as unknown as OpenOrdersClient,
      }));
      clients.set(key, pending);
      pending.catch(() => {
        if (clients.get(key) === pending) clients.delete(key);
      });
    }
    return pending;
  }

  async function readOnlyOrdersClient(
    account: TradingAccount,
    operation: PlatformOperation
  ): Promise<OpenOrdersClient> {
    const signer = await assertSignerFor(account, operation);
    const key = account.tradingAddress.toLowerCase();
    let pending = readClients.get(key);
    if (!pending) {
      pending = createUnifiedPolymarketSecureClient({
        signer,
        wallet: account.tradingAddress,
        credentials: init.credentials,
        allowFreshAuthentication: false,
      }).then(({ client }) => client as unknown as OpenOrdersClient);
      readClients.set(key, pending);
      pending.catch(() => {
        if (readClients.get(key) === pending) readClients.delete(key);
      });
    }
    return pending;
  }

  async function signedClient(
    account: TradingAccount,
    operation: PlatformOperation
  ): Promise<LegacyClobCompatibleClient> {
    return (await boundClients(account, operation)).legacy;
  }

  function hasSigner(): boolean {
    return Boolean(init.signer && init.credentials);
  }

  async function loadMarket(
    conditionId: string,
    tokenId: string,
    operation: PlatformOperation
  ): Promise<MarketSnapshot> {
    const record = await clobMarket.fetchClobMarket(conditionId);
    if (!record) {
      throw fail(
        operation,
        "not_found",
        `Polymarket market ${conditionId} was not found`
      );
    }
    if (!record.tokens.some((token) => token.token_id === tokenId)) {
      throw fail(
        operation,
        "not_found",
        `Outcome ${tokenId} is not on market ${conditionId}`
      );
    }
    return snapshotOf(record, tokenId);
  }

  async function preflight(
    intent: CanonicalOrderIntent,
    market: MarketSnapshot,
    client: LegacyClobCompatibleClient | null
  ): Promise<ClobOrderPreflightPlan> {
    const shares = sharesOf(intent);
    const notional = notionalOf(intent);
    return buildClobOrderPreflightPlan({
      side: tradingSide(intent),
      orderType: clobOrderType(intent),
      amount: notional === undefined ? undefined : Number(notional),
      size: shares === undefined ? 0 : Number(shares),
      price: intent.price === undefined ? 0 : Number(intent.price),
      conditionId: market.conditionId,
      marketInfoClient: client ?? undefined,
      builderCode: init.builderCode,
      getBuilderFeeRates: init.builderCode
        ? (code) => fetchUnifiedClobBuilderFeeRates(code)
        : undefined,
      getOpenOrders: client ? () => client.getOpenOrders() : undefined,
    });
  }

  /** Best price on the side a market order would take, from the live book. */
  async function topOfBook(
    intent: CanonicalOrderIntent,
    tokenId: string
  ): Promise<string | undefined> {
    const book = await clobOrderbook.fetchOrderbookByTokenId(tokenId);
    if (!book) return undefined;
    const levels = intent.side === "buy" ? book.asks : book.bids;
    if (levels.length === 0) return undefined;
    const prices = levels.map((level) => new Decimal(level.price));
    const best =
      intent.side === "buy" ? Decimal.min(...prices) : Decimal.max(...prices);
    return best.toFixed();
  }

  async function quoteFor(
    intent: CanonicalOrderIntent,
    market: MarketSnapshot,
    plan: ClobOrderPreflightPlan
  ): Promise<OrderDraft["quote"]> {
    const expectedPrice =
      intent.price ??
      (sharesOf(intent) !== undefined
        ? await topOfBook(intent, market.tokenId)
        : undefined);
    const notional =
      notionalOf(intent) ??
      (expectedPrice === undefined
        ? undefined
        : orderNotional(intent, expectedPrice));
    if (notional === undefined) {
      throw fail(
        "previewOrder",
        "upstream",
        "Polymarket has no resting liquidity to price this order against"
      );
    }
    const fee = rawToDollars(plan.buy?.estimatedFeeRaw ?? BigInt(0));
    return {
      ...(expectedPrice !== undefined ? { expectedPrice } : {}),
      notional: { value: notional, unit: "USD" },
      fees: {
        platform: { value: fee, unit: "USD" },
        total: { value: fee, unit: "USD" },
      },
    };
  }

  function rememberDraft(stored: StoredDraft): void {
    const nowMs = now().getTime();
    for (const [draftId, entry] of drafts) {
      if (Date.parse(entry.draft.expiresAt) <= nowMs) {
        drafts.delete(draftId);
      }
    }
    while (drafts.size >= MAX_STORED_DRAFTS) {
      const oldest = drafts.keys().next().value;
      if (oldest === undefined) break;
      drafts.delete(oldest);
    }
    drafts.set(stored.draft.draftId, stored);
  }

  async function previewOrder(
    input: CanonicalOrderIntent
  ): Promise<OrderDraft> {
    return run("previewOrder", async () => {
      const parsed = orderIntentSchema.safeParse(input);
      if (!parsed.success) {
        throw fail("previewOrder", "invalid_input", parsed.error.message);
      }
      const intent = parsed.data;
      if (intent.platform !== PLATFORM) {
        throw fail(
          "previewOrder",
          "invalid_input",
          `Intent is for ${intent.platform}, not Polymarket`
        );
      }
      const { sourceId: conditionId } = parseCanonicalId(intent.marketId);
      const { sourceId: tokenId } = parseCanonicalId(intent.outcomeId);
      const account = resolveTradingAccount(intent.identity, "previewOrder");
      const client = hasSigner()
        ? await signedClient(account, "previewOrder")
        : null;

      const market = await loadMarket(conditionId, tokenId, "previewOrder");
      const plan = await preflight(intent, market, client);
      const quote = await quoteFor(intent, market, plan);
      const createdAt = now();
      const draft: OrderDraft = {
        schemaVersion: intent.schemaVersion,
        draftId: crypto.randomUUID(),
        platform: PLATFORM,
        intent,
        sourceMarketId: conditionId,
        sourceOutcomeId: tokenId,
        marketStatus: market.status,
        ...(market.tickSize !== undefined ? { tickSize: market.tickSize } : {}),
        ...(market.minSize !== undefined ? { minSize: market.minSize } : {}),
        quote,
        eligibility: eligibilityOf(intent, market),
        draftHash: await hashOrderIntent(intent),
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + draftTtlMs).toISOString(),
        platformDetails: {
          platform: PLATFORM,
          conditionId,
          tokenId,
          negRisk: market.negRisk,
          tradingAddress: account.tradingAddress,
          signatureType: account.signatureType,
          clobOrderType: clobOrderType(intent),
          ...(plan.buy
            ? {
                requiredCollateralRaw:
                  plan.buy.requiredCollateralRaw.toString(),
                reservedCollateralRaw: plan.buy.reservedPusdRaw.toString(),
                // The on-chain port wraps collateral from the notional and
                // the fee separately, and a fee it could not estimate is
                // unknown rather than zero (the quote collapses it to $0).
                requiredNotionalRaw: plan.buy.requiredPusdRaw.toString(),
                estimatedFeeRaw:
                  plan.buy.estimatedFeeRaw === null
                    ? null
                    : plan.buy.estimatedFeeRaw.toString(),
              }
            : {}),
          ...(plan.sell
            ? {
                requiredConditionalRaw:
                  plan.sell.requiredConditionalRaw.toString(),
              }
            : {}),
        },
      };
      rememberDraft({ draft, market, plan, account });
      return draft;
    });
  }

  /**
   * The hook's ladder: ask the CLOB to refresh its balance cache, and for a
   * SELL keep asking until it reports enough shares. BUY failures are not
   * fatal because postOrder surfaces any real problem.
   */
  async function syncBalanceAllowance(
    client: LegacyClobCompatibleClient,
    tokenId: string,
    requiredConditionalRaw: bigint | null
  ): Promise<void> {
    const requireSellBalance = requiredConditionalRaw !== null;
    let lastSyncError: unknown;

    for (const delayMs of CLOB_BALANCE_SYNC_DELAYS_MS) {
      if (delayMs > 0) await sleep(delayMs);
      try {
        await syncClobBalanceAllowance(client, {
          tokenId,
          includeCollateral: !requireSellBalance,
        });
        if (!requireSellBalance) return;

        const balanceAllowance = balanceAllowanceSchema.safeParse(
          await client.getBalanceAllowance({
            assetType: CLOB_ASSET_TYPES.CONDITIONAL,
            tokenId,
          })
        );
        lastSyncError = undefined;
        const clobBalanceRaw = toRawUnits(
          balanceAllowance.success ? balanceAllowance.data.balance : undefined
        );
        if (clobBalanceRaw >= requiredConditionalRaw) return;
      } catch (error) {
        if (!requireSellBalance) return;
        lastSyncError = error;
      }
    }

    if (lastSyncError) throw lastSyncError;
    throw new Error(SHARES_NOT_INDEXED_MESSAGE);
  }

  async function signOrder(
    client: LegacyClobCompatibleClient,
    intent: CanonicalOrderIntent,
    tokenId: string
  ): Promise<unknown> {
    const side = tradingSide(intent);
    const shares = sharesOf(intent);
    if (intent.orderType === "limit") {
      if (intent.price === undefined || shares === undefined) {
        throw fail(
          "placeOrder",
          "invalid_input",
          "Limit orders need a price and a share quantity"
        );
      }
      const expiration =
        intent.timeInForce === "gtd" && intent.expiresAt !== undefined
          ? Math.floor(Date.parse(intent.expiresAt) / 1000)
          : 0;
      return client.createOrder({
        tokenId,
        price: Number(intent.price),
        size: Number(shares),
        side,
        expiration,
      });
    }

    const amount = intent.side === "sell" ? shares : notionalOf(intent);
    if (amount === undefined) {
      throw fail(
        "placeOrder",
        "invalid_input",
        intent.side === "sell"
          ? "Market sells need a share quantity"
          : "Market buys need a notional amount"
      );
    }
    const price = intent.price === undefined ? 0 : Number(intent.price);
    return client.createMarketOrder({
      tokenId,
      amount: Number(amount),
      side,
      orderType: clobOrderType(intent),
      ...(price > 0 ? { price } : {}),
    });
  }

  async function submitDraft(
    draftId: string,
    idempotencyKey: string
  ): Promise<OrderResult> {
    const stored = drafts.get(draftId);
    if (!stored) {
      throw fail(
        "placeOrder",
        "not_found",
        `Draft ${draftId} is unknown or has expired`
      );
    }
    assertDraftPlaceable(stored.draft, now());
    const { intent } = stored.draft;
    const { conditionId, tokenId } = stored.market;
    const client = await signedClient(stored.account, "placeOrder");

    const fresh = await loadMarket(conditionId, tokenId, "placeOrder");
    const drift = draftDrift(stored.market, fresh);
    if (drift.length > 0) {
      drafts.delete(draftId);
      throw fail(
        "placeOrder",
        "draft_rejected",
        `Polymarket changed the market since preview: ${drift.join(", ")}`
      );
    }

    await syncBalanceAllowance(
      client,
      tokenId,
      intent.side === "sell"
        ? (stored.plan.sell?.requiredConditionalRaw ?? null)
        : null
    );
    const order = await signOrder(client, intent, tokenId);
    // Resync once more after signing, best-effort like the hook.
    await syncBalanceAllowance(client, tokenId, null);
    const response = await client.postOrder(order, clobOrderType(intent));
    assertClobPostOrderSuccess(response);
    drafts.delete(draftId);

    const posted = postOrderResponseSchema.safeParse(response);
    const orderId = posted.success
      ? (posted.data.orderId ?? posted.data.orderID)
      : undefined;
    const hashes = posted.success ? (posted.data.transactionsHashes ?? []) : [];
    return {
      platform: PLATFORM,
      status: orderStatusOf(posted.success ? posted.data.status : undefined),
      ...(orderId !== undefined ? { orderId } : {}),
      idempotencyKey,
      ...(hashes.length > 0
        ? { platformDetails: { platform: PLATFORM, transactionHashes: hashes } }
        : {}),
    };
  }

  async function placeOrder(input: unknown): Promise<OrderResult> {
    const parsed = placeDraftInputSchema.safeParse(input);
    if (!parsed.success) {
      throw fail("placeOrder", "invalid_input", parsed.error.message);
    }
    const { draftId, idempotencyKey } = parsed.data;
    const existing = placements.get(idempotencyKey);
    if (existing) return existing;
    const pending = run("placeOrder", () =>
      submitDraft(draftId, idempotencyKey)
    );
    placements.set(idempotencyKey, pending);
    return pending;
  }

  /**
   * `canTrade` mirrors `connected`: proxy deployment, token approvals and
   * on-chain balances are the on-chain port's concern in the web app, which
   * reads `platformDetails.tradingAddress` for them.
   */
  async function connectionStatus(
    input: ConnectionStatusInput
  ): Promise<PlatformConnectionStatus> {
    return run("connectionStatus", async () => {
      const { identity } = input;
      if (identity.platform !== PLATFORM) {
        throw fail(
          "connectionStatus",
          "invalid_input",
          `Identity is for ${identity.platform}, not Polymarket`
        );
      }
      if (identity.kind !== "wallet") {
        return {
          platform: PLATFORM,
          identity,
          connected: false,
          canTrade: false,
          reasons: ["unsupported_identity"],
        };
      }
      const account = resolveTradingAccount(identity, "connectionStatus");
      const reasons: string[] = [];
      if (!init.signer) reasons.push("no_signer");
      if (!init.credentials) reasons.push("no_credentials");
      if (init.signer) {
        const signerAddress = await init.signer.getAddress();
        if (signerAddress.toLowerCase() !== account.address.toLowerCase()) {
          reasons.push("signer_mismatch");
        }
      }
      const connected = reasons.length === 0;
      return {
        platform: PLATFORM,
        identity,
        connected,
        canTrade: connected,
        reasons,
        platformDetails: {
          platform: PLATFORM,
          tradingAddress: account.tradingAddress,
          signatureType: account.signatureType,
        },
      };
    });
  }

  function sourceIdOf(canonicalId: string, operation: PlatformOperation) {
    const { platform, sourceId } = parseCanonicalId(canonicalId);
    if (platform !== PLATFORM) {
      throw fail(
        operation,
        "invalid_input",
        `${canonicalId} is not a Polymarket id`
      );
    }
    return sourceId;
  }

  /** Data API reads page by offset; the cursor is the next offset. */
  function offsetPageOf(input: AccountReadInput, operation: PlatformOperation) {
    const limit = input.limit ?? DEFAULT_READ_LIMIT;
    const offset = input.cursor === undefined ? 0 : Number(input.cursor);
    if (!Number.isInteger(offset) || offset < 0) {
      throw fail(operation, "invalid_input", "cursor must be a row offset");
    }
    return { limit, offset };
  }

  function nextOffsetCursor(
    offset: number,
    limit: number,
    count: number
  ): string | undefined {
    return count >= limit ? String(offset + count) : undefined;
  }

  async function getAccountPositions(
    input: AccountReadInput
  ): Promise<AccountPositions> {
    return run("getAccountPositions", async () => {
      const operation = "getAccountPositions";
      const account = resolveTradingAccount(input.identity, operation);
      const { limit, offset } = offsetPageOf(input, operation);
      const rows = await profiles.fetchWalletPositions({
        walletAddress: account.tradingAddress,
        ...(input.marketId
          ? { conditionIds: [sourceIdOf(input.marketId, operation)] }
          : {}),
        limit,
        offset,
      });
      return {
        platform: PLATFORM,
        identity: input.identity,
        items: rows.map(accountPositionOf),
        fetchedAt: now().toISOString(),
      };
    });
  }

  async function getAccountActivity(
    input: AccountReadInput
  ): Promise<AccountActivityPage> {
    return run("getAccountActivity", async () => {
      const operation = "getAccountActivity";
      const account = resolveTradingAccount(input.identity, operation);
      const { limit, offset } = offsetPageOf(input, operation);
      const rows = await profiles.fetchWalletActivity({
        walletAddress: account.tradingAddress,
        ...(input.marketId
          ? { conditionIds: [sourceIdOf(input.marketId, operation)] }
          : {}),
        limit,
        offset,
      });
      const nextCursor = nextOffsetCursor(offset, limit, rows.length);
      return {
        items: rows.map(accountActivityOf),
        ...(nextCursor ? { nextCursor } : {}),
      };
    });
  }

  /**
   * The CLOB pages open orders at its own size; `limit` is not applied.
   * Reads never prompt the wallet: rejected credentials fail with the shim's
   * fresh-authentication error in `cause`, and the caller decides whether to
   * drop them.
   */
  async function getAccountOrders(
    input: AccountReadInput
  ): Promise<AccountOrderPage> {
    return run("getAccountOrders", async () => {
      const operation = "getAccountOrders";
      const account = resolveTradingAccount(input.identity, operation);
      const orders = await readOnlyOrdersClient(account, operation);
      if (!orders.listOpenOrders) {
        throw fail(
          operation,
          "unsupported",
          "The Polymarket client cannot list open orders"
        );
      }
      const page = await firstPageOf(
        orders.listOpenOrders({
          ...(input.marketId
            ? { market: sourceIdOf(input.marketId, operation) }
            : {}),
          ...(input.cursor ? { cursor: input.cursor } : {}),
        })
      );
      const rows = page.items ?? page.data ?? [];
      return {
        items: rows.map(accountOrderOf),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    });
  }

  async function cancelOrder(input: unknown): Promise<OrderResult> {
    const parsed = cancelOrderInputSchema.safeParse(input);
    if (!parsed.success) {
      throw fail("cancelOrder", "invalid_input", parsed.error.message);
    }
    const { identity, orderId, idempotencyKey } = parsed.data;
    const existing = cancellations.get(idempotencyKey);
    if (existing) return existing;
    const pending = run("cancelOrder", async () => {
      const account = resolveTradingAccount(identity, "cancelOrder");
      const { legacy } = await boundClients(account, "cancelOrder");
      const answer = cancelResponseSchema.parse(
        await legacy.cancelOrder({ orderId })
      );
      if (answer.canceled.includes(orderId)) {
        return {
          platform: PLATFORM,
          status: "cancelled" as const,
          orderId,
          idempotencyKey,
        };
      }
      const reason =
        answer.not_canceled?.[orderId] ??
        answer.notCanceled?.[orderId] ??
        "the CLOB did not confirm the cancel";
      throw fail(
        "cancelOrder",
        "upstream",
        `Polymarket did not cancel ${orderId}: ${reason}`
      );
    });
    cancellations.set(idempotencyKey, pending);
    return pending;
  }

  return {
    platform: PLATFORM,
    regionPolicy: () => POLYMARKET_REGION_POLICY,
    connectionStatus,
    getAccountPositions,
    getAccountActivity,
    getAccountOrders,
    previewOrder,
    placeOrder,
    cancelOrder,
  };
}
