import { z } from "zod";
import {
  type ServiceFetchOptions,
  withUpstreamTimeout,
} from "../../fetch-options";
import { decimalValueSchema } from "../../validation";
import type { PolymarketClientContext } from "./context";
import { camelCaseDataRow, createDataApi } from "./data-api";
import { upstreamPublicDataError } from "./errors";
import { gammaMarketDetailSchema } from "./gamma-detail";
// Type only: the shape of a Gamma event record the mappers accept.
import type { GammaEventLike } from "./mappers";

/**
 * Gamma, CLOB and Data API v2 public reads with validated platform payloads.
 * The context supplies base URLs, fetch, cache hints, and cancellation.
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

function optionalDecimal(schema = decimalStringSchema) {
  return schema.nullish().transform((value) => value ?? undefined);
}

const tagSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    label: z.string().trim().min(1),
    slug: z.string().trim().min(1),
  })
  .loose();

const eventSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    slug: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    active: z.boolean().optional(),
    closed: z.boolean().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    volume: optionalDecimal(nonNegativeDecimalStringSchema),
    liquidity: optionalDecimal(nonNegativeDecimalStringSchema),
    markets: z.array(gammaMarketDetailSchema).default([]),
    tags: z.array(tagSchema).default([]),
  })
  .loose();

const eventPageSchema = z.object({
  events: z.array(eventSchema),
  next_cursor: z.string().nullish(),
  // Informational only, so a bad value must not fail the whole page.
  total_results: z.number().nullish().catch(undefined),
});

const marketPageSchema = z.object({
  markets: z.array(gammaMarketDetailSchema),
  next_cursor: z.string().nullish(),
});

const tradeSchema = z
  .object({
    proxyWallet: z.string(),
    side: z.enum(["BUY", "SELL"]),
    asset: z.string(),
    conditionId: z.string(),
    size: nonNegativeDecimalStringSchema,
    price: probabilityStringSchema,
    timestamp: z.number().int().nonnegative(),
    title: z.string().optional(),
    slug: z.string().optional(),
    eventSlug: z.string().optional(),
    outcome: z.string().optional(),
    outcomeIndex: z.number().int().nonnegative().optional(),
    transactionHash: z.string().optional(),
  })
  .loose();

const holderSchema = z
  .object({
    proxyWallet: z.string(),
    asset: z.string(),
    amount: nonNegativeDecimalStringSchema,
    outcomeIndex: z.number().int().nonnegative().optional(),
  })
  .loose();

const holderGroupSchema = z
  .object({
    token: z.string(),
    holders: z.array(holderSchema),
  })
  .loose();

const leaderboardEntrySchema = z
  .object({
    rank: z.union([z.string(), z.number()]).transform(String),
    proxyWallet: z.string(),
    userName: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    vol: nonNegativeDecimalStringSchema,
    pnl: decimalStringSchema,
    verifiedBadge: z.boolean().optional(),
  })
  .loose()
  .transform(({ vol, ...entry }) => ({ ...entry, volume: vol }));

const sportsMetadataSchema = z
  .object({
    sport: z.string(),
    image: z.string().optional(),
    resolution: z.string().optional(),
    ordering: z.string().optional(),
    tags: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => (value === undefined ? undefined : String(value))),
    series: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => (value === undefined ? undefined : String(value))),
  })
  .loose();

const sportsMarketTypesSchema = z.union([
  z.array(z.string()),
  z
    .object({ marketTypes: z.array(z.string()) })
    .transform((value) => value.marketTypes),
]);

const teamSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    name: z.string(),
    league: z.string().optional(),
    abbreviation: z.string().optional(),
  })
  .loose();

export interface TraderLeaderboardParams {
  category: string;
  timePeriod: string;
  orderBy: string;
  limit: number;
  offset: number;
  walletAddress?: string;
  userName?: string;
}

export type GammaTag = z.infer<typeof tagSchema>;
/** A tag as Gamma sends it, before the schema's transforms. */
export type GammaTagRecord = z.input<typeof tagSchema>;
export type GammaKeysetEvent = z.infer<typeof eventSchema>;
export type DataApiTrade = z.infer<typeof tradeSchema>;
export type DataApiLeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
/** A leaderboard row as the Data API sends it, before the schema's transforms. */
export type DataApiLeaderboardRecord = z.input<typeof leaderboardEntrySchema>;

type PublicFetchOptions = ServiceFetchOptions;

function addIfDefined(
  params: URLSearchParams,
  name: string,
  value: string | number | boolean | undefined
) {
  if (value !== undefined) params.set(name, String(value));
}

export interface EventPageParams {
  limit: number;
  cursor?: string;
  closed?: boolean;
  archived?: boolean;
  live?: boolean;
  tagSlug?: string;
  seriesIds?: number[];
  /** Gamma's `active` filter; the sports series lists pair it with `seriesIds`. */
  active?: boolean;
  /** Gamma's `volume_min` floor, sent verbatim. */
  volumeMin?: string;
  /** Gamma's `liquidity_min` floor, sent verbatim. */
  liquidityMin?: string;
  startDateMin?: string;
  startDateMax?: string;
  endDateMin?: string;
  endDateMax?: string;
  order?: string;
  ascending?: boolean;
}

export interface MarketTradesParams {
  conditionIds?: string[];
  eventIds?: number[];
  walletAddress?: string;
  side?: "BUY" | "SELL";
  startTimestamp?: number;
  endTimestamp?: number;
  limit: number;
  offset: number;
}

export function createPublicData(ctx: PolymarketClientContext) {
  const { gamma: GAMMA_API_BASE, clob: CLOB_API_BASE } = ctx.baseUrls;

  const dataApi = createDataApi(ctx);

  /**
   * Fetches and validates a JSON payload. Returns the parsed data next to the
   * payload as received, for callers that must hand upstream records on
   * untransformed.
   */
  async function fetchValidated<Output>(
    url: URL,
    schema: z.ZodType<Output>,
    options?: PublicFetchOptions,
    init?: RequestInit
  ): Promise<{ payload: unknown; data: Output }> {
    return withUpstreamTimeout(
      ctx.fetchOptions(options),
      PUBLIC_DATA_TIMEOUT_MS,
      async (fetchImpl, signal) => {
        const response = await fetchImpl(url, {
          ...init,
          headers: {
            Accept: "application/json",
            ...init?.headers,
          },
          cache: "no-store",
          signal,
        });
        if (!response.ok) {
          throw upstreamPublicDataError(
            `Public data request failed with ${response.status}`,
            response.status
          );
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw upstreamPublicDataError(
            "Public data request returned malformed JSON"
          );
        }
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          throw upstreamPublicDataError(
            "Public data request returned an invalid response"
          );
        }
        return { payload, data: parsed.data };
      }
    );
  }

  async function fetchJson(
    url: URL,
    schema: z.ZodType,
    options?: PublicFetchOptions,
    init?: RequestInit
  ): Promise<unknown> {
    const { data } = await fetchValidated(url, schema, options, init);
    return data;
  }

  async function fetchEventPage(
    input: EventPageParams,
    options?: PublicFetchOptions
  ) {
    const url = new URL("/events/keyset", GAMMA_API_BASE);
    addIfDefined(url.searchParams, "limit", input.limit);
    addIfDefined(url.searchParams, "after_cursor", input.cursor);
    addIfDefined(url.searchParams, "closed", input.closed);
    addIfDefined(url.searchParams, "archived", input.archived);
    addIfDefined(url.searchParams, "live", input.live);
    addIfDefined(url.searchParams, "tag_slug", input.tagSlug);
    addIfDefined(url.searchParams, "series_id", input.seriesIds?.join(","));
    addIfDefined(url.searchParams, "active", input.active);
    addIfDefined(url.searchParams, "volume_min", input.volumeMin);
    addIfDefined(url.searchParams, "liquidity_min", input.liquidityMin);
    addIfDefined(url.searchParams, "start_date_min", input.startDateMin);
    addIfDefined(url.searchParams, "start_date_max", input.startDateMax);
    addIfDefined(url.searchParams, "end_date_min", input.endDateMin);
    addIfDefined(url.searchParams, "end_date_max", input.endDateMax);
    addIfDefined(url.searchParams, "order", input.order);
    addIfDefined(url.searchParams, "ascending", input.ascending);
    const { payload, data } = await fetchValidated(
      url,
      eventPageSchema,
      options
    );
    // The schema validated the shape and its transforms only stringify ids
    // and amounts, so the untouched records already satisfy GammaEventLike.
    const rawEvents = (payload as { events: GammaEventLike[] }).events;
    return {
      events: data.events,
      /** The same events as Gamma sent them, index-aligned with `events`. */
      rawEvents,
      nextCursor: data.next_cursor ?? null,
      totalResults: data.total_results ?? undefined,
    };
  }

  async function fetchMarketTrades(
    input: MarketTradesParams,
    options?: PublicFetchOptions
  ) {
    return dataApi.rows(
      "trades",
      {
        condition: input.conditionIds?.join(","),
        event_id: input.eventIds?.join(","),
        user: input.walletAddress,
        side: input.side,
        start: input.startTimestamp,
        end: input.endTimestamp,
      },
      z.preprocess((raw) => {
        const row = camelCaseDataRow(raw);
        return { ...row, asset: row.tokenId };
      }, tradeSchema),
      input,
      options
    );
  }

  const quoteMapSchema = z.record(
    z.string(),
    z
      .object({
        BUY: probabilityStringSchema.optional(),
        SELL: probabilityStringSchema.optional(),
      })
      .loose()
  );
  const decimalMapSchema = z.record(z.string(), nonNegativeDecimalStringSchema);
  const lastTradeSchema = z.array(
    z
      .object({
        token_id: z.string(),
        price: probabilityStringSchema,
        side: z.enum(["BUY", "SELL"]),
      })
      .loose()
  );

  async function fetchMarketQuotes(
    tokenIds: string[],
    options?: PublicFetchOptions
  ) {
    const tokens = tokenIds.map((tokenId) => ({ token_id: tokenId }));
    const priceRequests = tokenIds.flatMap((tokenId) => [
      { token_id: tokenId, side: "BUY" },
      { token_id: tokenId, side: "SELL" },
    ]);
    const post = (body: unknown): RequestInit => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const [prices, midpoints, spreads, lastTrades] = await Promise.all([
      fetchJson(
        new URL("/prices", CLOB_API_BASE),
        quoteMapSchema,
        options,
        post(priceRequests)
      ),
      fetchJson(
        new URL("/midpoints", CLOB_API_BASE),
        decimalMapSchema,
        options,
        post(tokens)
      ),
      fetchJson(
        new URL("/spreads", CLOB_API_BASE),
        decimalMapSchema,
        options,
        post(tokens)
      ),
      fetchJson(
        new URL("/last-trades-prices", CLOB_API_BASE),
        lastTradeSchema,
        options,
        post(tokens)
      ),
    ]);
    const priceMap = prices as z.infer<typeof quoteMapSchema>;
    const midpointMap = midpoints as z.infer<typeof decimalMapSchema>;
    const spreadMap = spreads as z.infer<typeof decimalMapSchema>;
    const lastTradeMap = new Map(
      (lastTrades as z.infer<typeof lastTradeSchema>).map((entry) => [
        entry.token_id,
        entry,
      ])
    );
    return tokenIds.map((tokenId) => ({
      tokenId,
      buyPrice: priceMap[tokenId]?.BUY,
      sellPrice: priceMap[tokenId]?.SELL,
      midpoint: midpointMap[tokenId],
      spread: spreadMap[tokenId],
      lastTradePrice: lastTradeMap.get(tokenId)?.price,
      lastTradeSide: lastTradeMap.get(tokenId)?.side,
    }));
  }

  async function fetchMarketHolders(
    input: { conditionIds: string[]; limit: number; minBalance?: number },
    options?: PublicFetchOptions
  ) {
    const schema = z.preprocess((raw) => {
      const row = camelCaseDataRow(raw);
      return {
        token: row.tokenId,
        holders: Array.isArray(row.holders)
          ? row.holders.map((entry) => {
              const holder = camelCaseDataRow(entry);
              return { ...holder, asset: holder.tokenId };
            })
          : row.holders,
      };
    }, holderGroupSchema);
    // v2 sizes each page per outcome token, so one page already holds top N.
    const page = await dataApi.page(
      "holders",
      {
        condition: input.conditionIds.join(","),
        limit: input.limit,
        min_balance: input.minBalance,
      },
      schema,
      options
    );
    return page.items;
  }

  async function fetchOpenInterest(
    conditionIds: string[],
    options?: PublicFetchOptions
  ) {
    return dataApi.value(
      "oi",
      { condition: conditionIds.join(",") },
      z.array(
        z
          .object({
            condition_id: z.string(),
            value: nonNegativeDecimalStringSchema,
          })
          .transform(({ condition_id, value }) => ({
            conditionId: condition_id,
            value,
          }))
      ),
      options
    );
  }
  async function fetchEventLiveVolume(
    eventId: number,
    options?: PublicFetchOptions
  ) {
    const row = await dataApi.value(
      "live-volume",
      { event_id: eventId },
      z.object({
        taker_volume_total: nonNegativeDecimalStringSchema,
        conditions: z.array(
          z.object({
            condition_id: z.string(),
            taker_volume: nonNegativeDecimalStringSchema,
          })
        ),
      }),
      options
    );
    return {
      eventId,
      total: row.taker_volume_total,
      markets: row.conditions.map((market) => ({
        conditionId: market.condition_id,
        value: market.taker_volume,
      })),
    };
  }
  async function fetchTraderLeaderboardPage(
    input: TraderLeaderboardParams,
    options?: PublicFetchOptions
  ) {
    const params = {
      category: input.category,
      time_period: input.timePeriod,
      sort_by: input.orderBy === "VOL" ? "VOLUME" : input.orderBy,
    };
    const mapRow = (raw: unknown) => {
      const { userId, volume, verified, ...row } = camelCaseDataRow(raw);
      return {
        ...row,
        proxyWallet: userId,
        vol: volume,
        verifiedBadge: verified,
      };
    };
    let rawEntries: DataApiLeaderboardRecord[];
    if (input.walletAddress) {
      const standing = await dataApi.value(
        "leaderboard",
        {
          category: input.category,
          time_period: input.timePeriod,
          user: input.walletAddress,
        },
        z.record(z.string(), z.unknown()).nullable(),
        options
      );
      if (!standing || input.offset > 0 || input.limit === 0) rawEntries = [];
      else {
        const row = mapRow(standing);
        const rank =
          input.orderBy === "VOL" ? standing.rank_volume : standing.rank_pnl;
        // Empty rank means unranked; do not invent rank zero.
        rawEntries = [{ ...row, rank: rank ?? "" } as DataApiLeaderboardRecord];
      }
    } else {
      rawEntries = await dataApi.rows(
        "leaderboard",
        params,
        z.record(z.string(), z.unknown()).transform((raw, ctx) => {
          const row = mapRow(raw);
          const parsed = leaderboardEntrySchema.safeParse(row);
          if (!parsed.success) {
            ctx.addIssue({
              code: "custom",
              message: "Invalid leaderboard row",
            });
            return z.NEVER;
          }
          return row as DataApiLeaderboardRecord;
        }),
        {
          limit: input.limit,
          offset: input.offset,
          ...(input.userName
            ? {
                filter: (row: DataApiLeaderboardRecord) =>
                  String(row.userName ?? "")
                    .toLowerCase()
                    .includes((input.userName ?? "").toLowerCase()),
              }
            : {}),
        },
        options
      );
    }
    const parsed = z.array(leaderboardEntrySchema).safeParse(rawEntries);
    if (!parsed.success)
      throw upstreamPublicDataError("Data API returned an invalid leaderboard");
    return { entries: parsed.data, rawEntries };
  }
  async function fetchTraderLeaderboard(
    input: TraderLeaderboardParams,
    options?: PublicFetchOptions
  ) {
    return (await fetchTraderLeaderboardPage(input, options)).entries;
  }

  /**
   * One Gamma tag looked up by slug, with the record as Gamma sent it. A
   * missing tag surfaces as the upstream 404 (`UpstreamPublicDataError`).
   */
  async function fetchTagBySlug(slug: string, options?: PublicFetchOptions) {
    const url = new URL(
      `/tags/slug/${encodeURIComponent(slug)}`,
      ctx.baseUrls.gamma
    );
    const { payload, data } = await fetchValidated(url, tagSchema, options);
    return {
      tag: data,
      /** The tag as Gamma sent it. */
      rawTag: payload as GammaTagRecord,
    };
  }

  async function fetchTags(
    input: { limit: number; offset: number },
    options?: PublicFetchOptions
  ) {
    const url = new URL("/tags", GAMMA_API_BASE);
    url.searchParams.set("limit", String(input.limit));
    url.searchParams.set("offset", String(input.offset));
    return (await fetchJson(url, z.array(tagSchema), options)) as z.infer<
      typeof tagSchema
    >[];
  }

  async function fetchSportsMetadata(options?: PublicFetchOptions) {
    return (await fetchJson(
      new URL("/sports", GAMMA_API_BASE),
      z.array(sportsMetadataSchema),
      options
    )) as z.infer<typeof sportsMetadataSchema>[];
  }

  async function fetchSportsMarketTypes(options?: PublicFetchOptions) {
    return (await fetchJson(
      new URL("/sports/market-types", GAMMA_API_BASE),
      sportsMarketTypesSchema,
      options
    )) as string[];
  }

  async function fetchSportsTeams(
    input: { league?: string; limit: number; offset: number },
    options?: PublicFetchOptions
  ) {
    const url = new URL("/teams", GAMMA_API_BASE);
    addIfDefined(url.searchParams, "league", input.league);
    url.searchParams.set("limit", String(input.limit));
    url.searchParams.set("offset", String(input.offset));
    return (await fetchJson(url, z.array(teamSchema), options)) as z.infer<
      typeof teamSchema
    >[];
  }

  async function fetchMarketPageByTagSlug(
    input: { tagSlug: string; limit: number; cursor?: string },
    options?: PublicFetchOptions
  ) {
    const tag = (await fetchJson(
      new URL(
        `/tags/slug/${encodeURIComponent(input.tagSlug)}`,
        GAMMA_API_BASE
      ),
      tagSchema,
      options
    )) as z.infer<typeof tagSchema>;
    const url = new URL("/markets/keyset", GAMMA_API_BASE);
    url.searchParams.set("tag_id", tag.id);
    url.searchParams.set("limit", String(Math.min(input.limit, 100)));
    addIfDefined(url.searchParams, "after_cursor", input.cursor);
    const page = (await fetchJson(url, marketPageSchema, options)) as z.infer<
      typeof marketPageSchema
    >;
    return { tag, markets: page.markets, nextCursor: page.next_cursor ?? null };
  }

  return {
    fetchEventPage,
    fetchMarketTrades,
    fetchMarketQuotes,
    fetchMarketHolders,
    fetchOpenInterest,
    fetchEventLiveVolume,
    fetchTraderLeaderboard,
    fetchTraderLeaderboardPage,
    fetchTags,
    fetchTagBySlug,
    fetchSportsMetadata,
    fetchSportsMarketTypes,
    fetchSportsTeams,
    fetchMarketPageByTagSlug,
  };
}

export type PolymarketPublicData = ReturnType<typeof createPublicData>;
