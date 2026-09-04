import type { MarketCapabilities } from "../../core/capabilities";

/**
 * Static declaration. Reads and the CLOB order lifecycle sit behind the
 * trading adapter (M3); redeem and withdrawals are still web-side on-chain
 * flows. The registry applies env overrides on top.
 */
export const POLYMARKET_CAPABILITIES: MarketCapabilities = Object.freeze({
  marketData: true,
  orderbook: true,
  priceHistory: true,
  publicTrades: true,
  accountPositions: true,
  accountOrders: true,
  createOrder: true,
  cancelOrder: true,
  redeem: false,
  withdrawals: false,
});
