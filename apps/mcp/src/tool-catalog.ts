/**
 * Polymarket-only tools keep their pre-aggregator names as permanent aliases.
 * Keys are the canonical names; values are the legacy names that stay
 * registered with an "Alias of <canonical>." description prefix.
 */
export const POLYMARKET_TOOL_ALIASES = {
  polymarket_get_market_quotes: "get_market_quotes",
  polymarket_get_market_holders: "get_market_holders",
  polymarket_get_open_interest: "get_open_interest",
  polymarket_get_event_live_volume: "get_event_live_volume",
  polymarket_get_trader_leaderboard: "get_trader_leaderboard",
  polymarket_list_sports_markets: "list_sports_markets",
  polymarket_get_public_profile: "get_public_profile",
  polymarket_get_wallet_positions: "get_wallet_positions",
  polymarket_get_wallet_activity: "get_wallet_activity",
  polymarket_get_closed_positions: "get_closed_positions",
  polymarket_get_wallet_pnl: "get_wallet_pnl",
  polymarket_get_wallet_portfolio_value: "get_wallet_portfolio_value",
} as const;

export type PolymarketToolName = keyof typeof POLYMARKET_TOOL_ALIASES;

/** Every advertised tool in registration order; each alias follows its canonical name. */
export const KNOWW_MCP_TOOL_NAMES = [
  "search_markets",
  "get_market",
  "get_event",
  "get_orderbook",
  "get_price_history",
  "list_events",
  "get_market_trades",
  "polymarket_get_market_quotes",
  "get_market_quotes",
  "polymarket_get_market_holders",
  "get_market_holders",
  "polymarket_get_open_interest",
  "get_open_interest",
  "polymarket_get_event_live_volume",
  "get_event_live_volume",
  "polymarket_get_trader_leaderboard",
  "get_trader_leaderboard",
  "list_tags",
  "polymarket_list_sports_markets",
  "list_sports_markets",
  "polymarket_get_public_profile",
  "get_public_profile",
  "polymarket_get_wallet_positions",
  "get_wallet_positions",
  "polymarket_get_wallet_activity",
  "get_wallet_activity",
  "polymarket_get_closed_positions",
  "get_closed_positions",
  "polymarket_get_wallet_pnl",
  "get_wallet_pnl",
  "polymarket_get_wallet_portfolio_value",
  "get_wallet_portfolio_value",
  "list_platforms",
] as const;

const toolNameSet = new Set<string>(KNOWW_MCP_TOOL_NAMES);

export function knownMcpToolName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return toolNameSet.has(value) ? value : "other";
}

export function aliasDescription(
  canonicalName: string,
  description: string
): string {
  return `Alias of ${canonicalName}. ${description}`;
}

/**
 * Registers a Polymarket-only tool twice: under its canonical name and under
 * its legacy alias. The caller's `register` closure keeps the SDK's own
 * `registerTool` typing, so handlers stay contextually typed.
 */
export function registerWithLegacyAlias(
  canonicalName: PolymarketToolName,
  description: string,
  register: (name: string, description: string) => void
): void {
  register(canonicalName, description);
  register(
    POLYMARKET_TOOL_ALIASES[canonicalName],
    aliasDescription(canonicalName, description)
  );
}
