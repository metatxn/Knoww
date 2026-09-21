import {
  buildCanonicalId,
  CANONICAL_SCHEMA_VERSION,
  type CanonicalMarket,
  type CanonicalOutcome,
  type MarketStatus,
  type PlatformDetails,
} from "@knoww/services/core";
import {
  POLYMARKET_CAPABILITIES,
  POLYMARKET_PLATFORM,
} from "@knoww/services/platforms/polymarket";

/**
 * Platform details a Polymarket mount attaches to the trading quote. The
 * condition id is what the ticket splits, merges and signs against; neg-risk
 * picks the exchange contract.
 */
export interface PolymarketTradingDetails extends PlatformDetails {
  platform: "polymarket";
  conditionId: string;
  negRisk: boolean;
}

export function isPolymarketTradingDetails(
  details: PlatformDetails | undefined
): details is PolymarketTradingDetails {
  return (
    details?.platform === "polymarket" &&
    typeof details.conditionId === "string" &&
    typeof details.negRisk === "boolean"
  );
}

export interface TradingTargetOutcome {
  name: string;
  tokenId: string;
  price: number;
}

export interface TradingTargetInput {
  conditionId: string | undefined;
  title: string;
  image?: string | undefined;
  slug?: string | undefined;
  sourceEventId?: string | undefined;
  status?: MarketStatus;
  /** Outcomes in toggle order, priced with the live quotes the page holds. */
  outcomes: readonly TradingTargetOutcome[];
  selectedIndex: number;
  negRisk: boolean;
  /** Defaults to now; tests pin it. */
  fetchedAt?: string;
}

export interface TradingTarget {
  market: CanonicalMarket;
  outcome: CanonicalOutcome;
  platformDetails: PolymarketTradingDetails;
}

/**
 * Builds the canonical market a page hands to TradingForm from the legacy
 * Gamma-shaped records the pages still hold. Returns null without a condition
 * id (nothing to trade against) or without outcomes. Retires once the pages
 * read canonical markets end to end.
 */
export function toTradingTarget(
  input: TradingTargetInput
): TradingTarget | null {
  const { conditionId } = input;
  if (!conditionId || input.outcomes.length === 0) {
    return null;
  }
  const outcomes: CanonicalOutcome[] = input.outcomes.map((outcome) => ({
    id: buildCanonicalId(POLYMARKET_PLATFORM, outcome.tokenId),
    sourceOutcomeId: outcome.tokenId,
    label: outcome.name,
    price: String(outcome.price),
  }));
  const outcome = outcomes[input.selectedIndex] ?? outcomes[0];
  const platformDetails: PolymarketTradingDetails = {
    platform: "polymarket",
    conditionId,
    negRisk: input.negRisk,
  };
  const market: CanonicalMarket = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    id: buildCanonicalId(POLYMARKET_PLATFORM, conditionId),
    platform: POLYMARKET_PLATFORM,
    sourceMarketId: conditionId,
    sourceEventId: input.sourceEventId,
    slug: input.slug,
    title: input.title,
    image: input.image,
    status: input.status ?? "active",
    outcomes,
    capabilities: POLYMARKET_CAPABILITIES,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    platformDetails,
  };
  return { market, outcome, platformDetails };
}
