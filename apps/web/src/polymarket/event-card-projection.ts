import { extractCardOutcomes, extractTopMarkets } from "@/lib/event-card-model";
import { toSlimGammaEvent } from "@/lib/gamma-keyset";
import type { GammaEvent } from "@/types/gamma-api";

/** Compute display values before releasing the full upstream market array. */
export function toEventCard(event: GammaEvent) {
  const {
    markets: _markets,
    description: _description,
    ...metadata
  } = toSlimGammaEvent({ ...event, markets: [] }, false);
  return {
    ...metadata,
    marketCount: event.markets?.length ?? 0,
    cardTopMarkets: extractTopMarkets(event, 4),
    cardOutcomes: extractCardOutcomes(event),
  };
}

export type EventCardData = ReturnType<typeof toEventCard>;
