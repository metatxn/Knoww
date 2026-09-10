import {
  DEFAULT_POLYMARKET_BASE_URLS,
  type PolymarketBaseUrls,
} from "./base-urls";
import { createClobOrderbook } from "./clob-orderbook";
import { createClobPriceHistory } from "./clob-price-history";
import { createPolymarketClientContext } from "./context";
import { createGammaDetail } from "./gamma-detail";
import { createGammaEvents } from "./gamma-events";
import { createGammaSearch } from "./gamma-search";
import { createProfiles } from "./profiles";
import { createPublicData } from "./public-data";

/**
 * One Polymarket client per base-URL set. The registry builds the production
 * client; tests build their own with a recording `fetchImpl` and, when a
 * probe needs it, alternative base URLs.
 */
export interface PolymarketClientInit {
  baseUrls?: Partial<PolymarketBaseUrls>;
  fetchImpl?: typeof fetch;
}

export function resolvePolymarketBaseUrls(
  overrides?: Partial<PolymarketBaseUrls>
): PolymarketBaseUrls {
  return Object.freeze({
    gamma: overrides?.gamma ?? DEFAULT_POLYMARKET_BASE_URLS.gamma,
    clob: overrides?.clob ?? DEFAULT_POLYMARKET_BASE_URLS.clob,
    dataApi: overrides?.dataApi ?? DEFAULT_POLYMARKET_BASE_URLS.dataApi,
  });
}

export function createPolymarketClient(init: PolymarketClientInit = {}) {
  const baseUrls = resolvePolymarketBaseUrls(init.baseUrls);
  const ctx = createPolymarketClientContext({
    baseUrls,
    fetchImpl: init.fetchImpl,
  });
  const publicData = createPublicData(ctx);
  return {
    baseUrls,
    ...createGammaSearch(ctx),
    ...createGammaDetail(ctx),
    ...createGammaEvents(ctx),
    ...createClobOrderbook(ctx),
    ...createClobPriceHistory(ctx),
    ...publicData,
    ...createProfiles(ctx, publicData),
  };
}

export type PolymarketClient = ReturnType<typeof createPolymarketClient>;
