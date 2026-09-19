import {
  normalizePriceHistoryPoint,
  priceHistoryRequests,
} from "@knoww/shared-types/clob";
import { z } from "zod";
import {
  type ServiceFetchOptions,
  withUpstreamTimeout,
} from "../../fetch-options";
import type { PolymarketClientContext } from "./context";
import { createDataApi } from "./data-api";
import { isUpstreamPublicDataError, upstreamPriceHistoryError } from "./errors";

/** App-facing points remain epoch seconds and decimal strings. */
export interface PriceHistoryPoint {
  t: number;
  p: string;
}
export interface PriceHistoryParams {
  startTs: number;
  endTs: number;
  fidelity: number;
}

export function createClobPriceHistory(ctx: PolymarketClientContext) {
  const dataApi = createDataApi(ctx);
  async function fetchPriceHistoryByTokenId(
    tokenId: string,
    params: PriceHistoryParams,
    options?: ServiceFetchOptions
  ): Promise<PriceHistoryPoint[]> {
    try {
      return await withUpstreamTimeout(
        ctx.fetchOptions(options),
        8500,
        async (fetchImpl, signal) => {
          const points = new Map<number, PriceHistoryPoint>();
          for (const request of priceHistoryRequests(tokenId, params)) {
            let cursor: string | undefined;
            const seen = new Set<string>();
            for (let pages = 0; ; pages++) {
              if (pages >= 1000)
                throw new Error("Price history pagination exceeded limit");
              const page = await dataApi.page(
                "prices-history",
                {
                  token_id: tokenId,
                  start: request.start,
                  end: request.end,
                  interval: request.interval,
                  bucket_seconds: request.bucketSeconds,
                  cursor,
                  limit: 10000,
                },
                z.unknown(),
                { ...options, fetchImpl, signal }
              );
              for (const raw of page.items) {
                const point = normalizePriceHistoryPoint(raw);
                if (
                  request.start !== undefined &&
                  (point.t < request.start ||
                    (request.end !== undefined && point.t > request.end))
                )
                  throw new Error(
                    "Price history point outside requested window"
                  );
                if (point.t >= params.startTs && point.t <= params.endTs)
                  points.set(point.t, point);
              }
              if (!page.nextCursor) break;
              if (seen.has(page.nextCursor))
                throw new Error("Price history repeated pagination cursor");
              seen.add(page.nextCursor);
              cursor = page.nextCursor;
            }
          }
          return [...points.values()].sort((a, b) => a.t - b.t);
        }
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw upstreamPriceHistoryError(
        "Data API price history lookup failed",
        isUpstreamPublicDataError(error) ? error.status : undefined
      );
    }
  }
  return { fetchPriceHistoryByTokenId };
}
export type PolymarketClobPriceHistory = ReturnType<
  typeof createClobPriceHistory
>;
