import {
  getPlatformAdapter,
  POLYMARKET_BASE_URLS,
  type Polymarket,
} from "../registry";

/**
 * Legacy Polymarket orderbook API. Thin wrapper over the registry's
 * Polymarket adapter; see ../registry.ts.
 */
export const CLOB_API_BASE = POLYMARKET_BASE_URLS.clob;

export type OrderbookLevel = Polymarket.OrderbookLevel;
export type OrderbookSnapshot = Polymarket.OrderbookSnapshot;

type Client = Polymarket.PolymarketClient;

const client = () => getPlatformAdapter("polymarket").client;

export const fetchOrderbookByTokenId: Client["fetchOrderbookByTokenId"] = (
  ...args
) => client().fetchOrderbookByTokenId(...args);
