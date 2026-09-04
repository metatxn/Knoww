import { getPlatformAdapter, type Polymarket } from "../registry";

/**
 * Legacy Polymarket price-history API. Thin wrapper over the registry's
 * Polymarket adapter; see ../registry.ts.
 */
export type PriceHistoryPoint = Polymarket.PriceHistoryPoint;
export type PriceHistoryParams = Polymarket.PriceHistoryParams;

type Client = Polymarket.PolymarketClient;

const client = () => getPlatformAdapter("polymarket").client;

export const fetchPriceHistoryByTokenId: Client["fetchPriceHistoryByTokenId"] =
  (...args) => client().fetchPriceHistoryByTokenId(...args);
