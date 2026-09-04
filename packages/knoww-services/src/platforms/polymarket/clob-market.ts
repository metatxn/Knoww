import { z } from "zod";
import { UpstreamMarketError } from "../../errors";
import {
  type ServiceFetchOptions,
  withUpstreamTimeout,
} from "../../fetch-options";
import type { PolymarketClientContext } from "./context";

/**
 * The CLOB's own view of a market (`GET /markets/<conditionId>`): the fields
 * an order has to respect before it is signed. Gamma describes the same
 * market for discovery; the CLOB record is the one the matching engine
 * enforces, so trading reads it and nothing else.
 */

const CLOB_MARKET_UPSTREAM_TIMEOUT_MS = 8500;

const decimalLikeSchema = z.union([z.number().finite(), z.string().min(1)]);

const clobMarketTokenSchema = z
  .object({
    token_id: z.string().min(1),
    outcome: z.string().optional(),
    price: z.number().optional(),
    winner: z.boolean().optional(),
  })
  .passthrough();

const clobMarketSchema = z
  .object({
    condition_id: z.string().min(1),
    question_id: z.string().optional(),
    active: z.boolean().optional(),
    closed: z.boolean().optional(),
    archived: z.boolean().optional(),
    accepting_orders: z.boolean().optional(),
    enable_order_book: z.boolean().optional(),
    minimum_order_size: decimalLikeSchema.optional(),
    minimum_tick_size: decimalLikeSchema.optional(),
    neg_risk: z.boolean().optional(),
    end_date_iso: z.string().nullable().optional(),
    tokens: z.array(clobMarketTokenSchema),
  })
  .passthrough();

export type ClobMarketRecord = z.infer<typeof clobMarketSchema>;

export function createClobMarket(ctx: PolymarketClientContext) {
  async function fetchClobMarket(
    conditionId: string,
    options?: ServiceFetchOptions
  ): Promise<ClobMarketRecord | null> {
    return withUpstreamTimeout(
      ctx.fetchOptions(options),
      CLOB_MARKET_UPSTREAM_TIMEOUT_MS,
      async (fetchImpl, signal) => {
        const response = await fetchImpl(
          `${ctx.baseUrls.clob}/markets/${encodeURIComponent(conditionId)}`,
          {
            headers: { Accept: "application/json" },
            cache: "no-store",
            signal,
          }
        );

        if (response.status === 404) {
          return null;
        }
        if (!response.ok) {
          throw new UpstreamMarketError(
            `CLOB market lookup failed with ${response.status}`,
            response.status
          );
        }

        const payload: unknown = await response.json();
        const parsed = clobMarketSchema.safeParse(payload);
        if (!parsed.success) {
          throw new UpstreamMarketError(
            "CLOB market returned a malformed payload"
          );
        }
        if (
          parsed.data.condition_id.toLowerCase() !== conditionId.toLowerCase()
        ) {
          throw new UpstreamMarketError(
            "CLOB market returned a different condition"
          );
        }
        return parsed.data;
      }
    );
  }

  return { fetchClobMarket };
}

export type PolymarketClobMarket = ReturnType<typeof createClobMarket>;
