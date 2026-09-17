import Decimal from "decimal.js";
import { z } from "zod";
import {
  type ServiceFetchOptions,
  withUpstreamTimeout,
} from "../../fetch-options";
import { decimalValueSchema } from "../../validation";
import type { PolymarketClientContext } from "./context";
import { camelCaseDataRow, createDataApi } from "./data-api";
import { upstreamPublicDataError } from "./errors";
import type { PolymarketPublicData } from "./public-data";

/**
 * Gamma profiles and Data API v2 wallet reads, normalized for existing callers.
 * The context supplies fetch and base URLs; leaderboard reads are injected.
 */

const PUBLIC_DATA_TIMEOUT_MS = 8500;
const decimalStringSchema = decimalValueSchema().transform(String);
const nonNegativeDecimalStringSchema = decimalValueSchema({
  min: "0",
}).transform(String);
const probabilityStringSchema = decimalValueSchema({
  min: "0",
  max: "1",
}).transform(String);

const profileSchema = z
  .object({
    createdAt: z.string().optional(),
    proxyWallet: z.string(),
    displayUsernamePublic: z.boolean().optional(),
    pseudonym: z.string().optional(),
    name: z.string().optional(),
    bio: z.string().optional(),
    profileImage: z.string().optional(),
    verifiedBadge: z.boolean().optional(),
  })
  .passthrough();

const positionSchema = z
  .object({
    proxyWallet: z.string(),
    asset: z.string(),
    conditionId: z.string(),
    size: nonNegativeDecimalStringSchema,
    avgPrice: probabilityStringSchema,
    initialValue: nonNegativeDecimalStringSchema,
    grossInitialValue: nonNegativeDecimalStringSchema
      .nullish()
      .transform((v) => v ?? undefined),
    entryFeesUsdc: nonNegativeDecimalStringSchema
      .nullish()
      .transform((v) => v ?? undefined),
    currentValue: nonNegativeDecimalStringSchema,
    cashPnl: decimalStringSchema,
    percentPnl: decimalStringSchema,
    totalBought: nonNegativeDecimalStringSchema,
    realizedPnl: decimalStringSchema,
    percentRealizedPnl: decimalStringSchema,
    curPrice: probabilityStringSchema,
    redeemable: z.boolean(),
    mergeable: z.boolean(),
    title: z.string().optional(),
    slug: z.string().optional(),
    eventSlug: z.string().optional(),
    outcome: z.string().optional(),
    outcomeIndex: z.number().int().nonnegative().optional(),
    oppositeOutcome: z.string().optional(),
    oppositeAsset: z.string().optional(),
    endDate: z.string().optional(),
    negativeRisk: z.boolean().optional(),
  })
  .passthrough();

const activitySchema = z
  .object({
    proxyWallet: z.string(),
    timestamp: z.number().int().nonnegative(),
    conditionId: z.string().optional(),
    type: z.string(),
    size: nonNegativeDecimalStringSchema.optional(),
    usdcSize: nonNegativeDecimalStringSchema.optional(),
    transactionHash: z.string().optional(),
    price: probabilityStringSchema.optional(),
    asset: z.string().optional(),
    side: z.enum(["BUY", "SELL"]).optional(),
    outcomeIndex: z.number().int().nonnegative().optional(),
    title: z.string().optional(),
    slug: z.string().optional(),
    eventSlug: z.string().optional(),
    outcome: z.string().optional(),
  })
  .passthrough();

const closedPositionSchema = z
  .object({
    proxyWallet: z.string(),
    asset: z.string(),
    conditionId: z.string(),
    avgPrice: probabilityStringSchema,
    totalBought: nonNegativeDecimalStringSchema,
    realizedPnl: decimalStringSchema,
    curPrice: probabilityStringSchema,
    timestamp: z.number().int().nonnegative(),
    title: z.string().optional(),
    slug: z.string().optional(),
    eventSlug: z.string().optional(),
    outcome: z.string().optional(),
    outcomeIndex: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export interface WalletPositionsParams {
  walletAddress: string;
  conditionIds?: string[];
  eventIds?: number[];
  sizeThreshold?: string;
  includeArchived?: boolean;
  redeemable?: boolean;
  mergeable?: boolean;
  title?: string;
  limit: number;
  offset: number;
  sortBy?: string;
  sortDirection?: "ASC" | "DESC";
}

export interface WalletActivityParams {
  walletAddress: string;
  conditionIds?: string[];
  eventIds?: number[];
  types?: string[];
  startTimestamp?: number;
  endTimestamp?: number;
  limit: number;
  offset: number;
  sortDirection?: "ASC" | "DESC";
}

export interface ClosedPositionsParams {
  walletAddress: string;
  conditionIds?: string[];
  eventIds?: number[];
  limit: number;
  offset: number;
  sortBy?: string;
  sortDirection?: "ASC" | "DESC";
}

export interface PnlPosition {
  [key: string]: unknown;
  initialValue: string | number;
  currentValue: string | number;
  cashPnl: string | number;
  realizedPnl: string | number;
}

export function summarizeWalletPnl(positions: PnlPosition[]) {
  let initialValue = new Decimal(0);
  let currentValue = new Decimal(0);
  let cashPnl = new Decimal(0);
  let realizedPnl = new Decimal(0);
  let winningPositions = 0;
  let losingPositions = 0;

  for (const position of positions) {
    initialValue = initialValue.plus(position.initialValue);
    currentValue = currentValue.plus(position.currentValue);
    cashPnl = cashPnl.plus(position.cashPnl);
    realizedPnl = realizedPnl.plus(position.realizedPnl);
    const totalPositionPnl = new Decimal(position.cashPnl).plus(
      position.realizedPnl
    );
    if (totalPositionPnl.isPositive()) winningPositions += 1;
    if (totalPositionPnl.isNegative()) losingPositions += 1;
  }

  const totalPnl = cashPnl.plus(realizedPnl);
  const roiPercent = initialValue.isZero()
    ? new Decimal(0)
    : totalPnl.div(initialValue).mul(100);

  return {
    positionCount: positions.length,
    initialValue: initialValue.toString(),
    currentValue: currentValue.toString(),
    cashPnl: cashPnl.toString(),
    realizedPnl: realizedPnl.toString(),
    totalPnl: totalPnl.toString(),
    roiPercent: roiPercent.toString(),
    winningPositions,
    losingPositions,
  };
}

export type ProfilesDependencies = Pick<
  PolymarketPublicData,
  "fetchTraderLeaderboard"
>;

export function createProfiles(
  ctx: PolymarketClientContext,
  deps: ProfilesDependencies
) {
  const { gamma: GAMMA_API_BASE } = ctx.baseUrls;
  const dataApi = createDataApi(ctx);

  async function fetchJson<T>(
    url: URL,
    schema: z.ZodType<T>,
    options?: ServiceFetchOptions,
    allowNotFound = false
  ): Promise<T | null> {
    return withUpstreamTimeout(
      ctx.fetchOptions(options),
      PUBLIC_DATA_TIMEOUT_MS,
      async (fetchImpl, signal) => {
        const response = await fetchImpl(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal,
        });
        if (allowNotFound && response.status === 404) return null;
        if (!response.ok) {
          throw upstreamPublicDataError(
            `Public profile request failed with ${response.status}`,
            response.status
          );
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw upstreamPublicDataError(
            "Public profile request returned malformed JSON"
          );
        }
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          throw upstreamPublicDataError(
            "Public profile request returned an invalid response"
          );
        }
        return parsed.data;
      }
    );
  }

  async function fetchPublicProfile(
    walletAddress: string,
    options?: ServiceFetchOptions
  ) {
    const url = new URL("/public-profile", GAMMA_API_BASE);
    url.searchParams.set("address", walletAddress);
    return fetchJson(url, profileSchema, options, true);
  }

  const mapPosition = (raw: unknown) => {
    const row = camelCaseDataRow(raw);
    return {
      ...row,
      asset: row.tokenId,
      size: row.currentSize,
      initialValue: row.entryCostUsdc,
      grossInitialValue: row.totalCostUsdc,
      curPrice: row.currentPrice,
      totalBought: row.totalSize,
      cashPnl: row.unrealizedPnl,
      oppositeAsset: row.oppositeTokenId,
      timestamp: row.lastEventAt,
    };
  };
  const v2Position = z.preprocess(mapPosition, positionSchema);
  const v2ClosedPosition = z.preprocess(mapPosition, closedPositionSchema);
  const v2Activity = z.preprocess((raw) => {
    const row = camelCaseDataRow(raw);
    return {
      ...row,
      asset: row.tokenId,
      side: row.side === "" ? undefined : row.side,
    };
  }, activitySchema);
  const positionSort = (sort?: string) => {
    const value =
      {
        CURRENT: "CURRENT_VALUE",
        SIZE: "TOKENS",
        CASHPNL: "UNREALIZED_PNL",
        REALIZEDPNL: "REALIZED_PNL",
      }[sort ?? ""] ?? sort;
    if (
      value !== undefined &&
      ![
        "CURRENT_VALUE",
        "TOKENS",
        "UNREALIZED_PNL",
        "REALIZED_PNL",
        "TOTAL_PNL",
        "TIMESTAMP",
      ].includes(value)
    )
      throw upstreamPublicDataError("Unsupported position sort", 400);
    return value;
  };
  async function fetchWalletPositions(
    input: WalletPositionsParams,
    options?: ServiceFetchOptions
  ) {
    return dataApi.rows(
      "positions",
      {
        user: input.walletAddress,
        condition: input.conditionIds?.join(","),
        event_id: input.eventIds?.join(","),
        filter_type: "TOKENS",
        filter_amount: input.sizeThreshold,
        include_archived: input.includeArchived,
        status: input.redeemable === true ? "REDEEMABLE" : "OPEN",
        title: input.title,
        sort_by: positionSort(input.sortBy),
        sort_direction: input.sortDirection,
      },
      v2Position,
      {
        limit: input.limit,
        offset: input.offset,
        filter: (row) =>
          (input.redeemable === undefined ||
            row.redeemable === input.redeemable) &&
          (input.mergeable === undefined || row.mergeable === input.mergeable),
      },
      options
    );
  }
  async function fetchWalletActivity(
    input: WalletActivityParams,
    options?: ServiceFetchOptions
  ) {
    return dataApi.rows(
      "activity",
      {
        user: input.walletAddress,
        condition: input.conditionIds?.join(","),
        event_id: input.eventIds?.join(","),
        type: input.types?.join(","),
        start: input.startTimestamp,
        end: input.endTimestamp,
        sort_direction: input.sortDirection,
      },
      v2Activity,
      input,
      options
    );
  }
  async function fetchClosedPositions(
    input: ClosedPositionsParams,
    options?: ServiceFetchOptions
  ) {
    return dataApi.rows(
      "positions",
      {
        user: input.walletAddress,
        condition: input.conditionIds?.join(","),
        event_id: input.eventIds?.join(","),
        status: "CLOSED",
        sort_by: positionSort(input.sortBy),
        sort_direction: input.sortDirection,
      },
      v2ClosedPosition,
      input,
      options
    );
  }
  async function fetchWalletPortfolioValue(
    walletAddress: string,
    options?: ServiceFetchOptions
  ) {
    const row = await dataApi.value(
      "value",
      { user: walletAddress },
      z.object({ value: nonNegativeDecimalStringSchema }).nullable(),
      options
    );
    return { walletAddress, value: row?.value ?? "0" };
  }

  async function fetchWalletAllTimePnl(
    walletAddress: string,
    options?: ServiceFetchOptions
  ) {
    const rows = await deps.fetchTraderLeaderboard(
      {
        category: "OVERALL",
        timePeriod: "ALL",
        orderBy: "PNL",
        walletAddress,
        limit: 1,
        offset: 0,
      },
      options
    );
    const row = rows.find(
      (entry) => entry.proxyWallet.toLowerCase() === walletAddress.toLowerCase()
    );
    if (!row) return null;
    return {
      walletAddress,
      rank: row.rank,
      totalPnl: row.pnl,
      volume: row.volume,
    };
  }

  return {
    fetchPublicProfile,
    fetchWalletPositions,
    fetchWalletActivity,
    fetchClosedPositions,
    fetchWalletPortfolioValue,
    fetchWalletAllTimePnl,
  };
}

export type PolymarketProfiles = ReturnType<typeof createProfiles>;
