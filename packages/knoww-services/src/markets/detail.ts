import { getPlatformAdapter, type Polymarket } from "../registry";

/**
 * Legacy Polymarket market-detail API. Thin wrapper over the registry's
 * Polymarket adapter; see ../registry.ts.
 */
export type MarketIdentifier = Polymarket.MarketIdentifier;
export type GammaMarketDetail = Polymarket.GammaMarketDetail;

type Client = Polymarket.PolymarketClient;

const client = () => getPlatformAdapter("polymarket").client;

export const fetchMarketByIdentifier: Client["fetchMarketByIdentifier"] = (
  ...args
) => client().fetchMarketByIdentifier(...args);
