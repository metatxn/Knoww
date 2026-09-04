import { getPlatformAdapter, type Polymarket } from "../registry";

/**
 * Legacy Polymarket profile API. Thin wrapper over the registry's Polymarket
 * adapter; see ../registry.ts.
 */
export { summarizeWalletPnl } from "../registry";

export type PnlPosition = Polymarket.PnlPosition;
export type WalletPositionsParams = Polymarket.WalletPositionsParams;
export type WalletActivityParams = Polymarket.WalletActivityParams;
export type ClosedPositionsParams = Polymarket.ClosedPositionsParams;

type Client = Polymarket.PolymarketClient;

const client = () => getPlatformAdapter("polymarket").client;

export const fetchPublicProfile: Client["fetchPublicProfile"] = (...args) =>
  client().fetchPublicProfile(...args);

export const fetchWalletPositions: Client["fetchWalletPositions"] = (...args) =>
  client().fetchWalletPositions(...args);

export const fetchWalletActivity: Client["fetchWalletActivity"] = (...args) =>
  client().fetchWalletActivity(...args);

export const fetchClosedPositions: Client["fetchClosedPositions"] = (...args) =>
  client().fetchClosedPositions(...args);

export const fetchWalletPortfolioValue: Client["fetchWalletPortfolioValue"] = (
  ...args
) => client().fetchWalletPortfolioValue(...args);

export const fetchWalletAllTimePnl: Client["fetchWalletAllTimePnl"] = (
  ...args
) => client().fetchWalletAllTimePnl(...args);
