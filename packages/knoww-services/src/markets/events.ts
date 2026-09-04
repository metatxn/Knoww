import { getPlatformAdapter, type Polymarket } from "../registry";

/**
 * Legacy Polymarket event API. Thin wrapper over the registry's Polymarket
 * adapter; see ../registry.ts.
 */
export type ChildEventsResult = Polymarket.ChildEventsResult;
export type EventIdentifier = Polymarket.EventIdentifier;
export type GammaEventDetail = Polymarket.GammaEventDetail;

type Client = Polymarket.PolymarketClient;

const client = () => getPlatformAdapter("polymarket").client;

export const fetchEventByIdentifier: Client["fetchEventByIdentifier"] = (
  ...args
) => client().fetchEventByIdentifier(...args);

export const fetchChildEvents: Client["fetchChildEvents"] = (...args) =>
  client().fetchChildEvents(...args);

export const fetchOpenMarketsByEventSlug: Client["fetchOpenMarketsByEventSlug"] =
  (...args) => client().fetchOpenMarketsByEventSlug(...args);
