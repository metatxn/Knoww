/**
 * What a platform can do. Adapters declare these statically; the registry
 * applies KNOWW_PLATFORM_CAPABILITY_OVERRIDES on top (see ./enablement.ts).
 * The web app reads the result to decide which controls to render.
 */
export interface MarketCapabilities {
  marketData: boolean;
  orderbook: boolean;
  priceHistory: boolean;
  publicTrades: boolean;
  accountPositions: boolean;
  accountOrders: boolean;
  createOrder: boolean;
  cancelOrder: boolean;
  redeem: boolean;
  withdrawals: boolean;
}

export type MarketCapability = keyof MarketCapabilities;

export const MARKET_CAPABILITY_KEYS = [
  "marketData",
  "orderbook",
  "priceHistory",
  "publicTrades",
  "accountPositions",
  "accountOrders",
  "createOrder",
  "cancelOrder",
  "redeem",
  "withdrawals",
] as const satisfies readonly MarketCapability[];

export function isMarketCapability(value: string): value is MarketCapability {
  return (MARKET_CAPABILITY_KEYS as readonly string[]).includes(value);
}
