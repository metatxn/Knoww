import type {
  CanonicalMarket,
  CanonicalOutcome,
  PlatformDetails,
} from "@knoww/services/core";
import type { OutcomeData } from "@/types/market";

/** Position of `outcome` in the market's toggle list, -1 when absent. */
export function findOutcomeIndex(
  market: CanonicalMarket,
  outcome: CanonicalOutcome
): number {
  return market.outcomes.findIndex((candidate) => candidate.id === outcome.id);
}

/** The ticket's legacy outcome shape for one canonical outcome. */
export function toOutcomeData(outcome: CanonicalOutcome): OutcomeData {
  const price = outcome.price === undefined ? 0 : Number(outcome.price);
  return {
    name: outcome.label,
    tokenId: outcome.sourceOutcomeId,
    price,
    probability: Math.round(price * 100),
  };
}

/**
 * Neg-risk decides which exchange contract signs a Polymarket order, so the
 * ticket's order path needs it before the CLOB hooks move behind the trading
 * adapter. This is the one platform-shaped read left in the generic form.
 */
export function readNegRisk(details: PlatformDetails | undefined): boolean {
  return details?.platform === "polymarket" && details.negRisk === true;
}
