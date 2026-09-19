import type { ServiceFetchOptions } from "../../fetch-options";
import type { PolymarketBaseUrls } from "./base-urls";

/**
 * Shared by every Polymarket client module. `fetchOptions` folds the
 * construction-time fetch implementation into the per-call options right
 * before the upstream call; a per-call `fetchImpl` always wins.
 */
export interface PolymarketClientContext {
  readonly baseUrls: PolymarketBaseUrls;
  fetchOptions<T extends ServiceFetchOptions | undefined>(options: T): T;
}

export interface PolymarketClientContextInit {
  baseUrls: PolymarketBaseUrls;
  fetchImpl?: typeof fetch;
}

export function createPolymarketClientContext(
  init: PolymarketClientContextInit
): PolymarketClientContext {
  const { baseUrls, fetchImpl } = init;
  return {
    baseUrls,
    fetchOptions(options) {
      if (!fetchImpl || options?.fetchImpl) {
        return options;
      }
      return { ...options, fetchImpl };
    },
  };
}
