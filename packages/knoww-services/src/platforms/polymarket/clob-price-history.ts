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

export interface BoundedPriceHistory {
  points: PriceHistoryPoint[];
  observedPoints: number;
  downsampled: boolean;
  truncated: boolean;
}

const MAX_BOUNDED_POINTS = 1000;
const MAX_BOUNDED_PAGES = 8;

function sampleEvenly(points: PriceHistoryPoint[]): PriceHistoryPoint[] {
  if (points.length <= MAX_BOUNDED_POINTS) return points;
  const lastIndex = points.length - 1;
  return Array.from({ length: MAX_BOUNDED_POINTS }, (_, index) => {
    return points[Math.round((index * lastIndex) / (MAX_BOUNDED_POINTS - 1))];
  });
}

function createBoundedCollector(params: PriceHistoryParams) {
  const retained = new Map<number, PriceHistoryPoint>();
  let observedPoints = 0;
  let bucketSeconds = 1;
  let downsampled = false;
  let firstPoint: PriceHistoryPoint | undefined;
  let lastPoint: PriceHistoryPoint | undefined;

  const retain = (point: PriceHistoryPoint) => {
    const bucket = Math.floor(point.t / bucketSeconds);
    const existing = retained.get(bucket);
    if (existing === undefined || point.t === existing.t) {
      retained.set(bucket, point);
      return;
    }
    downsampled = true;
    if (point.t < existing.t) retained.set(bucket, point);
  };

  const increaseBucketWidth = () => {
    // Buckets are aligned to epoch seconds and retain their earliest point.
    // Merging them is deterministic regardless of page or sample order.
    bucketSeconds *= 2;
    const points = [...retained.values()];
    retained.clear();
    for (const point of points) retain(point);
    downsampled = true;
  };

  return {
    add(point: PriceHistoryPoint) {
      observedPoints++;
      if (point.t < params.startTs || point.t > params.endTs) return;

      if (firstPoint === undefined || point.t <= firstPoint.t) {
        firstPoint = point;
      }
      if (lastPoint === undefined || point.t >= lastPoint.t) {
        lastPoint = point;
      }
      retain(point);
      while (retained.size > MAX_BOUNDED_POINTS * 2) {
        increaseBucketWidth();
      }
    },
    result(truncated: boolean): BoundedPriceHistory {
      const pointsByTimestamp = new Map<number, PriceHistoryPoint>();
      for (const point of retained.values())
        pointsByTimestamp.set(point.t, point);
      if (firstPoint) pointsByTimestamp.set(firstPoint.t, firstPoint);
      if (lastPoint) pointsByTimestamp.set(lastPoint.t, lastPoint);
      const sorted = [...pointsByTimestamp.values()].sort((a, b) => a.t - b.t);
      const needsFinalSample = sorted.length > MAX_BOUNDED_POINTS;
      return {
        points: needsFinalSample ? sampleEvenly(sorted) : sorted,
        observedPoints,
        downsampled: downsampled || needsFinalSample,
        truncated,
      };
    },
  };
}

export function createClobPriceHistory(ctx: PolymarketClientContext) {
  const dataApi = createDataApi(ctx);
  async function readPriceHistory(
    tokenId: string,
    params: PriceHistoryParams,
    options: ServiceFetchOptions | undefined,
    onPoint: (point: PriceHistoryPoint) => void,
    maxPages?: number
  ): Promise<boolean> {
    return withUpstreamTimeout(
      ctx.fetchOptions(options),
      8500,
      async (fetchImpl, signal) => {
        let totalPages = 0;
        for (const request of priceHistoryRequests(tokenId, params)) {
          let cursor: string | undefined;
          const seen = new Set<string>();
          for (let pages = 0; ; pages++) {
            if (pages >= 1000)
              throw new Error("Price history pagination exceeded limit");
            if (maxPages !== undefined && totalPages >= maxPages) return true;
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
            totalPages++;
            for (const raw of page.items) {
              const point = normalizePriceHistoryPoint(raw);
              // Bucketed responses can include the adjacent boundary bucket.
              // Keep valid points in the caller's exact requested window.
              if (point.t >= params.startTs && point.t <= params.endTs) {
                onPoint(point);
              }
            }
            if (!page.nextCursor) break;
            if (seen.has(page.nextCursor))
              throw new Error("Price history repeated pagination cursor");
            seen.add(page.nextCursor);
            cursor = page.nextCursor;
          }
        }
        return false;
      }
    );
  }

  async function mapHistoryErrors<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw upstreamPriceHistoryError(
        "Data API price history lookup failed",
        isUpstreamPublicDataError(error) ? error.status : undefined
      );
    }
  }

  async function fetchPriceHistoryByTokenId(
    tokenId: string,
    params: PriceHistoryParams,
    options?: ServiceFetchOptions
  ): Promise<PriceHistoryPoint[]> {
    return mapHistoryErrors(async () => {
      const points = new Map<number, PriceHistoryPoint>();
      await readPriceHistory(tokenId, params, options, (point) =>
        points.set(point.t, point)
      );
      return [...points.values()].sort((a, b) => a.t - b.t);
    });
  }

  async function fetchBoundedPriceHistoryByTokenId(
    tokenId: string,
    params: PriceHistoryParams,
    options?: ServiceFetchOptions
  ): Promise<BoundedPriceHistory> {
    return mapHistoryErrors(async () => {
      const collector = createBoundedCollector(params);
      const truncated = await readPriceHistory(
        tokenId,
        params,
        options,
        collector.add,
        MAX_BOUNDED_PAGES
      );
      return collector.result(truncated);
    });
  }

  return {
    fetchBoundedPriceHistoryByTokenId,
    fetchPriceHistoryByTokenId,
  };
}
export type PolymarketClobPriceHistory = ReturnType<
  typeof createClobPriceHistory
>;
