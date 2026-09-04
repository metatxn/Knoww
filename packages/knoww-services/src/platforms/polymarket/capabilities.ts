import type { MarketCapabilities } from "../../core/capabilities";

/**
 * Static declaration for M1. The trading flags flip to true when the trading
 * adapter lands in M3; the registry applies env overrides on top.
 */
export const POLYMARKET_CAPABILITIES: MarketCapabilities = Object.freeze({
  marketData: true,
  orderbook: true,
  priceHistory: true,
  publicTrades: true,
  accountPositions: false,
  accountOrders: false,
  createOrder: false,
  cancelOrder: false,
  redeem: false,
  withdrawals: false,
});
