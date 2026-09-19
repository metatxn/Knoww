import { z } from "zod";
import {
  type ServiceFetchOptions,
  withUpstreamTimeout,
} from "../../fetch-options";
import type { PolymarketClientContext } from "./context";
import { upstreamPublicDataError } from "./errors";

const paginationSchema = z.object({
  next_cursor: z.string().min(1).nullable(),
  has_more: z.boolean().optional(),
});

function wait(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Data API transport. Retries only reads and keeps one deadline across pages. */
export function createDataApi(ctx: PolymarketClientContext) {
  async function read(
    url: URL,
    fetchImpl: typeof fetch,
    signal: AbortSignal
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal,
      });
      if ((response.status === 429 || response.status === 503) && attempt < 2) {
        const header = response.headers.get("Retry-After");
        const seconds = header === null ? NaN : Number(header);
        const delay = Number.isFinite(seconds)
          ? seconds * 1000
          : header
            ? Date.parse(header) - Date.now()
            : 250 * 2 ** attempt;
        await response.body?.cancel();
        await wait(
          Math.min(
            2147483647,
            Math.max(0, Number.isFinite(delay) ? delay : 250)
          ),
          signal
        );
        continue;
      }
      if (!response.ok)
        throw upstreamPublicDataError(
          `Data API request failed with ${response.status}`,
          response.status
        );
      try {
        return await response.json();
      } catch {
        signal.throwIfAborted();
        throw upstreamPublicDataError("Data API returned malformed JSON");
      }
    }
  }
  function url(
    path: string,
    params: Record<string, string | number | boolean | undefined>
  ) {
    const result = new URL(`/v2/${path}`, ctx.baseUrls.dataApi);
    for (const [key, value] of Object.entries(params))
      if (value !== undefined) result.searchParams.set(key, String(value));
    return result;
  }
  async function value<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined>,
    schema: z.ZodType<T>,
    options?: ServiceFetchOptions
  ): Promise<T> {
    return withUpstreamTimeout(
      ctx.fetchOptions(options),
      8500,
      async (fetchImpl, signal) => {
        const parsed = z
          .object({ data: schema })
          .safeParse(await read(url(path, params), fetchImpl, signal));
        if (!parsed.success)
          throw upstreamPublicDataError(
            "Data API returned an invalid response"
          );
        return parsed.data.data;
      }
    );
  }
  async function page<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined>,
    schema: z.ZodType<T>,
    options?: ServiceFetchOptions
  ) {
    return withUpstreamTimeout(
      ctx.fetchOptions(options),
      8500,
      async (fetchImpl, signal) => {
        const parsed = z
          .object({ data: z.array(schema), pagination: paginationSchema })
          .safeParse(await read(url(path, params), fetchImpl, signal));
        if (
          !parsed.success ||
          (parsed.data.pagination.has_more === true &&
            !parsed.data.pagination.next_cursor)
        )
          throw upstreamPublicDataError("Data API returned an invalid page");
        return {
          items: parsed.data.data,
          nextCursor: parsed.data.pagination.next_cursor,
        };
      }
    );
  }
  /** Offset is a compatibility input only; never send it to v2. */
  async function rows<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined>,
    schema: z.ZodType<T>,
    slice: { limit: number; offset?: number; filter?: (row: T) => boolean },
    options?: ServiceFetchOptions
  ): Promise<T[]> {
    const { limit, offset = 0, filter } = slice;
    if (
      !Number.isSafeInteger(limit) ||
      limit < 0 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 10000
    )
      throw upstreamPublicDataError("Invalid Data API page bounds");
    if (!limit) return [];
    return withUpstreamTimeout(
      ctx.fetchOptions(options),
      8500,
      async (fetchImpl, signal) => {
        const items: T[] = [];
        let skipped = 0;
        let cursor: string | undefined;
        const seen = new Set<string>();
        for (let count = 0; count < 256; count++) {
          const result = await page(
            path,
            { ...params, limit: Math.min(limit + offset, 1000), cursor },
            schema,
            { ...options, fetchImpl, signal }
          );
          for (const row of result.items) {
            if (filter && !filter(row)) continue;
            if (skipped++ < offset) continue;
            items.push(row);
            if (items.length === limit) return items;
          }
          if (!result.nextCursor) return items;
          if (seen.has(result.nextCursor))
            throw upstreamPublicDataError(
              "Data API repeated a pagination cursor"
            );
          seen.add(result.nextCursor);
          cursor = result.nextCursor;
        }
        throw upstreamPublicDataError("Data API pagination exceeded its limit");
      }
    );
  }
  return { value, page, rows };
}

/** Preserve metadata names used by existing Polymarket callers. */
export function camelCaseDataRow(raw: unknown): Record<string, unknown> {
  const row = z.record(z.string(), z.unknown()).parse(raw);
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ])
  );
}
